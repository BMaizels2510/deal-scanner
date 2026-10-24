// Money maths, market sentiment and the buy-confidence score.
// Weights by product type come from the Oct 2026 backtest (research/backtest.mjs):
//   sealed: momentum persisted; raw: falling cards kept falling, drift is down; slabs: momentum predicted nothing;
//   new releases: singles fell hard in their first months.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

export function config(env = {}) {
  return {
    minPct: num(env.MIN_PCT, 8),
    instantPct: num(env.INSTANT_PCT, 15),
    instantNet: num(env.INSTANT_NET, 20),
    feeMode: env.FEE_MODE || "included",
    newReleaseDays: num(env.NEW_RELEASE_DAYS, 120),
    sellFeePct: num(env.SELL_FEE_PCT, 12.8),
    sellFeeFixed: num(env.SELL_FEE_FIXED, 0.3),
    sellPostage: { raw: num(env.SELL_POST_RAW, 2.5), slab: num(env.SELL_POST_SLAB, 4.5), sealed: num(env.SELL_POST_SEALED, 5) },
    maniaMarkupPct: num(env.MANIA_MARKUP_PCT, 5),
    gradingCost: num(env.GRADING_COST, 25),
    // Raw card condition. Pulse's own LP / MP / HP prices are used when it has them; these shares of NM are the fallback.
    cond: { NM: 1, LP: num(env.COND_LP, 0.7), MP: num(env.COND_MP, 0.5), HP: num(env.COND_HP, 0.35) },
    condDmgOfHp: num(env.COND_DMG_OF_HP, 0.6),   // Pulse has no damaged price: damaged = this share of the HP price
    condUnknown: env.COND_UNKNOWN || "LP",       // how to price a raw card whose condition isn't stated anywhere
  };
}

// eBay UK Buyer Protection fee, charged on UK private-seller listings.
export function bpFee(p) {
  let f = 0.10 + Math.min(p, 20) * 0.07;
  if (p > 20) f += (Math.min(p, 300) - 20) * 0.04;
  if (p > 300) f += (Math.min(p, 4000) - 300) * 0.02;
  return Math.round(f * 100) / 100;
}

export function calcDeal({ price, post, market, accountType, feeMode = "included" }) {
  const fee = accountType === "INDIVIDUAL" ? bpFee(price) : 0;
  const total = price + (post || 0) + (feeMode === "add" ? fee : 0);
  const net = market - total;
  return { fee, feeIncluded: feeMode !== "add", total, net, pct: (net / market) * 100 };
}

// What you'd actually clear: resell on eBay at market after fees and postage, or pass to Mania at your markup.
export function exitRoutes(kind, market, total, cfg) {
  const resale = market * (1 - cfg.sellFeePct / 100) - cfg.sellFeeFixed - (cfg.sellPostage[kind] ?? 3);
  return { resaleNet: resale - total, maniaNet: total * (cfg.maniaMarkupPct / 100) };
}

// Raw card -> expected value if graded. Non-10 outcomes valued at 90% of raw (conservative).
// PSA 10 rates come from population reports, which flatter the odds (people submit their best copies).
export function gradingPlay(raw, psa10, total, cfg) {
  if (!raw?.p10 || !psa10?.market) return null;
  const ratio = psa10.market / raw.market;
  if (ratio > 15) return { suspect: true };
  const ev = raw.p10 * psa10.market + (1 - raw.p10) * raw.market * 0.9 - cfg.gradingCost;
  const gain = ev - total;
  return { ev, gain, p10: raw.p10, psa10: psa10.market, worth: gain >= Math.max(30, total * 0.2) };
}

export function daysSince(dateStr, now = new Date()) {
  if (!dateStr) return null;
  return Math.floor((now - new Date(dateStr + "T00:00:00Z")) / 86400000);
}

// What a raw card in this condition is worth, as a share of its NM price.
// Uses Pulse's own price for that condition (p.c_lp / c_mp / c_hp) when it has one.
export function conditionFactor(p, code, cfg) {
  if (!code || code === "NM" || !p.market) return { factor: 1, priced: "pulse" };
  const pulse = { LP: p.c_lp ?? p.lp, MP: p.c_mp, HP: p.c_hp };
  const ratio = (code === "DMG" ? pulse.HP : pulse[code]) / p.market;
  if (Number.isFinite(ratio) && ratio > 0) {
    const f = Math.min(1, ratio) * (code === "DMG" ? cfg.condDmgOfHp : 1);
    return { factor: f, priced: code === "DMG" ? "estimate" : "pulse" };
  }
  return { factor: code === "DMG" ? cfg.cond.HP * cfg.condDmgOfHp : (cfg.cond[code] ?? 1), priced: "estimate" };
}

// Sentiment label for a product, independent of any listing.
export function sentiment(p, m, cfg, now = new Date()) {
  const t7 = m.t7 ?? 0, t30 = m.t30 ?? 0, src = m.src ?? 0, s7 = m.s7 ?? 0;
  const age = daysSince(p.released, now);
  const newRelease = p.kind !== "sealed" && age != null && age < cfg.newReleaseDays;
  const bullish = t30 > 10 && t7 > 0;
  const bearish = t30 < -10 && t7 < 0;
  const hot = src >= 30 && s7 >= 3 && t7 >= -2;   // selling noticeably faster than its 30-day pace, price holding
  let label = "Neutral";
  if (newRelease) label = "New release";
  else if (bearish) label = "Bearish";
  else if (hot) label = "Hot";
  else if (bullish) label = "Bullish";
  return { label, newRelease, bullish, bearish, hot, age };
}

const median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// The live ladder: every current UK listing of this exact product (price + postage), excluding the deal itself.
// For a raw card, cond limits the ladder to listings in the same condition (plus ones that don't say).
export function ladderStats(entries, market, ownId, cond = null) {
  if (!entries) return null;
  const others = entries.filter(e => e.id !== ownId && (!cond || !e.cond || e.cond === cond)).map(e => e.total).sort((a, b) => a - b);
  return {
    active: others.length,
    lowest: others[0] ?? null,
    median: median(others),
    belowMarket: others.filter(x => x < market).length,
    atOrBelowMarket: others.filter(x => x <= market).length,
    prices: others.slice(0, 12),
  };
}

// Our own sold record: listings that dropped off a product's ladder (likely sales), oldest first.
export function soldTrend(sales, now = new Date()) {
  if (!sales || !sales.length) return { count: 0, count7: 0, count30: 0 };
  const t = s => Date.parse(s.gone_at);
  const recent = sales.filter(s => now - t(s) <= 30 * 86400000);
  const count7 = sales.filter(s => now - t(s) <= 7 * 86400000).length;
  const prices = recent.map(s => s.price);
  let change = null;
  if (prices.length >= 4) {
    const half = Math.floor(prices.length / 2);
    const a = median(prices.slice(0, half)), b = median(prices.slice(prices.length - half));
    change = (b / a - 1) * 100;
  }
  return { count: sales.length, count7, count30: recent.length, median: median(prices), change, prices: prices.slice(-12) };
}

// How long a resale at Pulse market should take: sales per day vs listings queued at or below market.
export function holdEstimate(m, ladder, sold) {
  const s7 = m.s7 ?? 0, s30 = m.s30 ?? 0;
  let perDay = s7 > 0 ? 0.6 * (s7 / 7) + 0.4 * (s30 / 30) : s30 / 30;
  if (sold && sold.count7) perDay = Math.max(perDay, sold.count7 / 7);
  const queue = ladder ? ladder.atOrBelowMarket : 0;
  const days = perDay > 0 ? (queue + 1) / perDay : Infinity;
  const cls = days <= 7 ? "Quick flip" : days <= 30 ? "Normal" : days <= 90 ? "Long hold" : "Very long hold";
  return { perDay, queue, days, cls, knownQueue: !!ladder };
}

// eBay is the market. Our own sold record sets the price once it has enough recent sales (default 4 in 30 days);
// until then Pulse, the quick comp most buyers use, stands in. Returns the reference price and where it came from.
export function chooseMarket(pulse, sold, minSales = 4) {
  if (sold && sold.count30 >= minSales && sold.median) {
    const gap = (sold.median / pulse - 1) * 100;
    return { market: sold.median, source: "eBay sold", pulse, ebay: sold.median, gap, n: sold.count30 };
  }
  return { market: pulse, source: "Pulse", pulse, ebay: sold?.median ?? null, gap: null, n: sold?.count30 ?? 0 };
}

// own: { points, change30 } from our own snapshots when there's enough history.
// condition (raw cards): { code: "NM"|"LP"|"MP"|"DMG", src: "listing"|"title"|null, factor, label }
export function scoreDeal({ p, m, pct, cfg, index, own, priceSuspect, certStatus, ladder, sold, hold, total, ref, condition, now = new Date() }) {
  const s = sentiment(p, m, cfg, now);
  const f = [];
  const mom = clamp(0.6 * (m.t7 ?? 0) + 0.4 * (m.src ?? 0), -30, 30);
  let sc = 50;

  if (p.kind === "sealed") {
    sc += mom * 0.8;
    if (s.bullish) { sc += 8; f.push(["g", "Sealed uptrend (holds)"]); }
    if (s.bearish) { sc -= 12; f.push(["b", "Sealed downtrend (holds)"]); }
  } else if (p.kind === "raw") {
    sc += mom * 0.4;
    if (s.bullish) { sc += 3; f.push(["g", "Rising"]); }
    if (s.bearish) { sc -= 20; f.push(["b", "Falling raw: tends to keep falling"]); }
    if (p.vintage && condition?.src !== "listing") { sc -= 8; f.push(["w", "Vintage raw: check condition"]); }
    if (condition) {
      const adj = condition.factor < 1 ? `: ${condition.priced === "pulse" ? "Pulse " + condition.code + " price" : "estimated"}, ${Math.round(condition.factor * 100)}% of NM` : "";
      if (!condition.src) { sc -= 5; f.push(["b", `Condition not stated: priced as ${condition.label} (${Math.round(condition.factor * 100)}% of NM)`]); }
      if (condition.code === "DMG") { sc -= 10; f.push(["b", "Damaged: no Pulse price, value is an estimate"]); }
      else f.push([condition.code === "NM" ? "g" : "w", `Condition ${condition.label} (${condition.src === "listing" ? "seller's condition field" : condition.src === "description" ? "from description" : "from title"})${adj}`]);
      const d = condition.desc;
      if (d) {
        if (condition.src === "description" && condition.stated) { sc -= 8; f.push(["b", `Seller says ${condition.stated}, description says ${condition.code}: ${d.defects.join(", ")}`]); }
        else if (d.defects.length) f.push(["w", `Description mentions: ${d.defects.join(", ")}`]);
        else if (d.positive.length && condition.code === "NM") { sc += 3; f.push(["g", `Description: ${d.positive.slice(0, 2).join(", ")}`]); }
        if (d.hedge) { sc -= 5; f.push(["b", "Seller asks you to judge condition from the photos"]); }
        if (d.offCentre) f.push(["w", "Described as off-centre"]);
      }
    }
  } else {
    sc += mom * 0.15;
    if (s.bearish) { sc -= 3; f.push(["w", "Slab price falling"]); }
  }
  if (s.newRelease) { sc -= p.kind === "raw" ? 25 : 15; f.push(["b", `New release (${s.age} days): expect drops`]); }
  if (s.hot) { sc += 6; f.push(["g", `Selling fast: +${Math.round(m.src)}% pace`]); }
  else if (!s.bullish && !s.bearish) f.push(["w", mom > 3 ? "Momentum up" : mom < -3 ? "Momentum down" : "Momentum flat"]);

  // How reliable the Pulse price is: more sales behind it, more trust.
  const s30 = m.s30 ?? 0, s7 = m.s7 ?? 0;
  if (s30 >= 20) { sc += 5; f.push(["g", `${s30} sales/30d`]); }
  else if (s30 >= 8) { f.push(["w", `${s30} sales/30d`]); }
  else if (s30 >= 3) { sc -= 5; f.push(["w", `Thin: ${s30} sales/30d`]); }
  else { sc -= 10; f.push(["b", `Very thin: ${s30} sales/30d`]); }

  // Sales stalling: this week's pace well under the 30-day pace, and the price not rising.
  if (s30 >= 4 && s7 < (s30 / 30) * 7 * 0.6 && (m.t7 ?? 0) <= 0) { sc -= 10; f.push(["b", `Sales stalling: ${s7} this week vs ~${Math.round(s30 / 30 * 7)} usual`]); }

  // Time to sell at Pulse market, given the queue of listings ahead of you.
  if (hold) {
    const d = (hold.days === Infinity ? "no recent sales" : hold.days < 1.5 ? "~1 day" : `~${Math.round(hold.days)} days`) + (hold.knownQueue ? "" : ", listings not checked");
    const map = { "Quick flip": [10, "g"], "Normal": [0, "w"], "Long hold": [-10, "w"], "Very long hold": [-20, "b"] };
    let [pts, tone] = map[hold.cls];
    if (!hold.knownQueue && pts > 0) { pts = 0; tone = "w"; }   // no credit for speed until the queue ahead is known
    sc += pts; f.push([tone, `${hold.cls}: ${d} to sell`]);
  }

  // The ladder: are other sellers already under Pulse? Is this the cheapest by a margin?
  if (ladder && ladder.active) {
    if (ladder.belowMarket >= 3 && ladder.median != null && ladder.median < m.market * 0.95) {
      sc -= 8; f.push(["b", `${ladder.belowMarket} other listings under Pulse: market may be softer`]);
    }
    if (total != null && ladder.lowest != null && total < ladder.lowest * 0.9) {
      sc += 5; f.push(["g", `Cheapest by ${Math.round((1 - total / ladder.lowest) * 100)}%`]);
    }
  }

  // Where the market price came from.
  if (ref && ref.source === "eBay sold") {
    f.push(["g", `Priced on ${ref.n} eBay sales`]);
    if (Math.abs(ref.gap) > 10) { sc -= 4; f.push(["w", `Pulse ${ref.gap > 0 ? "below" : "above"} eBay sold by ${Math.abs(Math.round(ref.gap))}%`]); }
  } else if (ref) f.push(["w", "Priced on Pulse until eBay sales build up"]);

  // Our own sold record, once there's enough of it.
  if (sold && sold.change != null) {
    if (sold.change >= 5) { sc += 5; f.push(["g", `Sold prices rising: ${sold.change > 0 ? "+" : ""}${Math.round(sold.change)}%`]); }
    else if (sold.change <= -5) { sc -= 8; f.push(["b", `Sold prices falling: ${Math.round(sold.change)}%`]); }
    else f.push(["w", `Sold prices steady (${sold.count30} seen)`]);
  }

  if (index && index.n >= 5) {
    if (index.t30 < -10) { sc -= 5; f.push(["b", `Category down ${Math.round(index.t30)}% (30d)`]); }
    else if (index.t30 > 10) { sc += 3; f.push(["g", `Category up ${Math.round(index.t30)}% (30d)`]); }
  }
  if (own && own.points >= 4 && own.change30 != null) {
    f.push([own.change30 >= 0 ? "g" : "w", `Own history: ${own.change30 >= 0 ? "+" : ""}${own.change30.toFixed(0)}% over ${own.days}d`]);
  }
  if (priceSuspect) { sc -= 30; f.push(["b", "Price data looks wrong: check comps"]); }
  if (certStatus === "verified") { sc += 3; f.push(["g", "PSA cert verified"]); }
  else if (certStatus === "no cert") { sc -= 3; f.push(["w", "No cert number in listing"]); }

  sc += clamp(pct * 0.6, 0, 15);
  if (certStatus === "mismatch") { sc = 0; f.push(["b", "PSA cert doesn't match listing"]); }
  const conf = Math.round(clamp(sc, 0, 100));
  let label = s.label;
  if (certStatus === "mismatch") label = "Check cert";
  else if (priceSuspect) label = "Check price";
  else if (label === "Neutral" && pct > 0) label = "Opportunity";
  return { conf, factors: f, label, sentiment: s };
}

// Median of 7d / 30d change for a list of market rows.
export function indexOf(rows) {
  return { t7: median(rows.map(r => r.t7)), t30: median(rows.map(r => r.t30)), n: rows.length };
}
