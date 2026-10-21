// Backtest: did simple price signals predict the next 4 weeks?
// Each product/week is one observation. Signal uses only data up to that week.
import { readFileSync } from "node:fs";

const { products } = JSON.parse(readFileSync(new URL("./pulse-1y-weekly.json", import.meta.url)));
const FWD = 4;
const pct = (a, b) => (b / a - 1) * 100;
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

// Remove pre-release zeros and placeholder flat runs (same price 4+ weeks in a row at the start).
function clean(series) {
  let i = series.findIndex(v => v > 0);
  let run = 1;
  for (let j = i + 1; j < series.length && series[j] === series[i]; j++) run++;
  if (run >= 4) i = i + run - 1; // start from the last placeholder value (the first real move follows)
  return { start: i, values: series.slice(i) };
}

const obs = [];
for (const [key, raw] of Object.entries(products)) {
  const [name, kind] = key.split("|");
  const { values: v } = clean(raw);
  for (let t = 4; t + FWD < v.length; t++) {
    const r1 = pct(v[t - 1], v[t]);
    const r4 = pct(v[t - 4], v[t]);
    const mean12 = v.slice(Math.max(0, t - 11), t + 1).reduce((a, b) => a + b, 0) / Math.min(12, t + 1);
    const vsMean = pct(mean12, v[t]);
    const fwd = pct(v[t], v[t + FWD]);
    obs.push({ name, kind, t, age: t, r1, r4, vsMean, fwd });
  }
}

function summarise(label, rows) {
  if (!rows.length) return { label, n: 0 };
  const f = rows.map(r => r.fwd);
  return {
    label, n: rows.length,
    avgNext4w: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1),
    medianNext4w: +median(f).toFixed(1),
    pctUp: Math.round(f.filter(x => x > 0).length / f.length * 100),
    pctDown10: Math.round(f.filter(x => x < -10).length / f.length * 100),
  };
}

const sig = {
  "All observations (baseline)": () => true,
  "Bullish: up >10% over 4w and up this week": o => o.r4 > 10 && o.r1 > 0,
  "Bearish: down >10% over 4w and down this week": o => o.r4 < -10 && o.r1 < 0,
  "Spike: up >15% in one week": o => o.r1 > 15,
  "Crash: down >15% in one week": o => o.r1 < -15,
  "Dip: >10% below 12w average, not falling this week": o => o.vsMean < -10 && o.r1 >= 0,
  "Stretched: >15% above 12w average": o => o.vsMean > 15,
  "Neutral: none of the above": o => !(o.r4 > 10 && o.r1 > 0) && !(o.r4 < -10 && o.r1 < 0) && Math.abs(o.r1) <= 15 && Math.abs(o.vsMean) <= 10,
};

const out = {};
for (const kind of ["all", "sealed", "raw", "slab"]) {
  const rows = kind === "all" ? obs : obs.filter(o => o.kind === kind);
  out[kind] = Object.entries(sig).map(([label, fn]) => summarise(label, rows.filter(fn)));
}

// New releases: first 16 weeks of real trading on products that launched inside the window.
const launched = Object.entries(products).filter(([, s]) => clean(s).start > 0).map(([k]) => k.split("|")[0]);
const early = obs.filter(o => launched.includes(o.name) && o.age < 16);
out.newReleases = { products: launched, ...summarise("First 16 weeks after release", early) };

// Peak-to-now drawdown for each product, for context.
out.drawdowns = Object.entries(products).map(([k, s]) => {
  const v = clean(s).values; const peak = Math.max(...v);
  return { product: k.split("|")[0], peak: Math.round(peak), now: Math.round(v[v.length - 1]), fromPeak: +pct(peak, v[v.length - 1]).toFixed(0) };
}).sort((a, b) => a.fromPeak - b.fromPeak);

console.log(JSON.stringify(out, null, 1));
