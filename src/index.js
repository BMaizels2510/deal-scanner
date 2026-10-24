// Mania Deal Scanner — Cloudflare Worker entry point.
//   Every 5 minutes (cron): scan eBay, flag under-market listings, alert instantly, track supply and deal speed,
//   store the daily market index, send the evening digest.
//   GET /                         the report page (needs the report key)
//   POST /api/deals/:id/status    mark a deal bought / bad match / passed
//   POST /api/deals/:id/review    your verdict: { verdict: good|bad|fake|null, reason, note }
//   GET  /api/review/export       every reviewed deal as CSV, with what today's rules make of it
//   POST /api/admin/scan          run a scan now (admin key); ?all=1 searches every set
//   POST /api/admin/digest        send today's Telegram digest now (admin key)
//   POST /api/admin/telegram      connect the bot to this worker so you can message it hunt commands (admin key, once)
//   POST /api/admin/hunt?q=sir    run a hunt from the command line (admin key); results go to Telegram
//   POST /telegram                Telegram webhook (secret header)
//   POST /api/admin/maintenance   store today's market index now (admin key)
import { runScan, sendDigest, dailyMaintenance, londonParts, loadSets, loadProducts, categoryIndex, watchList } from "./scan.js";
import { renderReport, renderLogin } from "./page.js";
import { config, ladderStats, soldTrend, holdEstimate } from "./score.js";
import { refreshLadder, loadLadders, loadSold } from "./ladder.js";
import { buildIndex } from "./match.js";
import { getToken } from "./ebay.js";
import { reviewData, saveReview, exportCsv, REVIEW_REASONS, REASONS_BY_KIND } from "./review.js";
import { runHunt } from "./hunt.js";
import { setupTelegram, sendText } from "./telegram.js";

// Telegram's webhook secret, derived from your ADMIN_KEY (letters and digits only, as Telegram requires).
async function webhookSecret(env) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tg:" + (env.ADMIN_KEY || "")));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { "Content-Type": "application/json" } });

function cookie(req, name) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const median = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ago = (days, from = new Date()) => new Date(from - days * 86400000).toISOString().slice(0, 10);

async function reportData(env, day) {
  const db = env.DB;
  const cfg = config(env);
  const { results: deals } = await db.prepare(
    `SELECT d.*, p.name, p.kind, p.category, p.grader, p.grade, p.number, p.pulse_url, p.lp, p.p10, p.set_id,
            s.name AS set_name, m.t7, m.t30, m.s7, m.s30, m.src
     FROM deals d JOIN products p ON p.id = d.product_id JOIN sets s ON s.id = p.set_id LEFT JOIN market m ON m.product_id = d.product_id
     WHERE d.day = ? ORDER BY d.net DESC`).bind(day).all();

  const ids = [...new Set(deals.map(d => d.product_id))];
  let supply = {};
  if (ids.length) {
    const { results } = await db.prepare(
      `SELECT product_id, SUM(CASE WHEN day = ? THEN listings ELSE 0 END) AS today, SUM(listings) AS week
       FROM product_daily WHERE day > ? AND day <= ? AND product_id IN (${ids.map(() => "?").join(",")}) GROUP BY product_id`)
      .bind(day, ago(7, new Date(day + "T12:00:00Z")), day, ...ids).all();
    supply = Object.fromEntries(results.map(r => [r.product_id, { today: r.today, avg: r.week / 7 }]));
  }

  const { results: days } = await db.prepare("SELECT day, COUNT(*) AS count FROM deals GROUP BY day ORDER BY day DESC LIMIT 30").all();
  const stats = await db.prepare("SELECT * FROM stats WHERE day = ?").bind(day).first();
  const meta = Object.fromEntries((await db.prepare("SELECT key, value FROM meta WHERE key IN ('last_scan','last_error')").all()).results.map(r => [r.key, r.value]));
  const mk = await db.prepare("SELECT MAX(updated_at) AS u FROM market").first();

  const sets = await loadSets(db);
  const products = await loadProducts(db, null, sets);
  const idx = categoryIndex(products);
  const { results: prevIdx } = await db.prepare(
    "SELECT category, t30 FROM index_daily WHERE day = (SELECT MAX(day) FROM index_daily WHERE day <= ?)").bind(ago(7)).all();
  const prev = Object.fromEntries(prevIdx.map(r => [r.category, r.t30]));
  const counts = {};
  for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;

  const { results: goneRows } = await db.prepare(
    `SELECT p.category, (julianday(d.gone_at) - julianday(d.found_at)) * 24 AS h FROM deals d JOIN products p ON p.id = d.product_id
     WHERE d.gone_at IS NOT NULL AND d.day >= ?`).bind(ago(7)).all();
  const speed = {};
  for (const r of goneRows) (speed[r.category] ||= []).push(r.h);

  const { results: rejects } = await db.prepare("SELECT at, title, reason FROM rejects ORDER BY at DESC LIMIT 20").all();
  const accuracy = await reviewData(db, deals, products, sets);

  return {
    day, today: londonParts().day, days, stats,
    deals: deals.map(d => ({
      ...d, factors: JSON.parse(d.factors || "[]"), instant: !!d.instant, fee_included: !!d.fee_included,
      ladder: d.ladder ? JSON.parse(d.ladder) : null, sold: d.sold ? JSON.parse(d.sold) : null,
      supply: supply[d.product_id] || null, review: d.review, recheck: d.recheck,
      gone_hours: d.gone_at ? (Date.parse(d.gone_at) - Date.parse(d.found_at)) / 3600000 : null,
    })),
    market: Object.entries(idx).map(([c, v]) => ({ category: c, t7: v.t7, t30: v.t30, n: counts[c], prev30: prev[c] ?? null, speedH: median(speed[c] || []) })),
    watch: watchList(products, cfg, 6).map(p => ({ name: p.name, grade: p.grader ? `${p.grader} ${p.grade}` : (p.kind === "sealed" ? "Sealed" : "Raw"), market: p.market, src: p.src, t7: p.t7, s7: p.s7, url: p.pulse_url })),
    rejects, accuracy, reasons: REVIEW_REASONS, reasonsByKind: REASONS_BY_KIND,
    lastScan: meta.last_scan || null,
    lastError: meta.last_error && (!meta.last_scan || meta.last_error.slice(0, 24) >= meta.last_scan.slice(0, 24)) ? meta.last_error : null,
    marketUpdated: mk?.u || null,
    mock: env.EBAY_MOCK === "1",
    catalogueSize: products.length,
    cfg: { minPct: cfg.minPct, instantPct: cfg.instantPct, instantNet: cfg.instantNet, maniaMarkupPct: cfg.maniaMarkupPct, sellFeePct: cfg.sellFeePct, gradingCost: cfg.gradingCost, newReleaseDays: cfg.newReleaseDays },
  };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/health") return json({ ok: true });

    // Telegram messages to the bot: hunt commands. Only your own chat is listened to.
    if (path === "/telegram" && req.method === "POST") {
      if (!env.ADMIN_KEY || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== await webhookSecret(env)) return new Response("forbidden", { status: 403 });
      const update = await req.json().catch(() => null);
      const msg = update?.message;
      if (msg?.text && String(msg.chat?.id) === String(env.TELEGRAM_CHAT_ID)) {
        ctx.waitUntil(runHunt(env, msg.text).catch(e => sendText(env, `Hunt failed: ${String(e.message || e).slice(0, 200)}`)));
      }
      return new Response("ok");
    }

    if (path.startsWith("/api/admin/")) {
      if (req.method !== "POST" || !safeEqual(req.headers.get("x-admin-key") || "", env.ADMIN_KEY || "")) return json({ error: "Not allowed" }, 403);
      if (path === "/api/admin/scan") return json(await runScan(env, { all: url.searchParams.get("all") === "1" }).catch(e => ({ error: String(e.message || e) })));
      if (path === "/api/admin/telegram") {
        if (!env.REPORT_URL) return json({ error: "Set REPORT_URL in wrangler.toml first" }, 400);
        return json(await setupTelegram(env, env.REPORT_URL.replace(/\/$/, "") + "/telegram", await webhookSecret(env)));
      }
      if (path === "/api/admin/hunt") return json(await runHunt(env, url.searchParams.get("q") || "help") ?? { ok: true });
      if (path === "/api/admin/digest") return json({ sent: await sendDigest(env, londonParts().day) });
      if (path === "/api/admin/maintenance") { await dailyMaintenance(env, londonParts().day); return json({ ok: true }); }
      if (path === "/api/admin/ladder") {
        // Refresh one product's ladder now and show its stats and sold record: /api/admin/ladder?id=<pulse product id>
        const id = url.searchParams.get("id");
        const sets = await loadSets(env.DB);
        const products = await loadProducts(env.DB, null, sets);
        const p = products.find(x => x.id === id);
        if (!p) return json({ error: "Unknown product id" }, 404);
        const now = new Date();
        const prev = (await loadLadders(env.DB, [id]))[id];
        const r = await refreshLadder(env, await getToken(env), p, buildIndex(products, sets), prev, now);
        const sold = soldTrend((await loadSold(env.DB, [id], now))[id], now);
        const ladder = ladderStats(r.entries, p.market, null);
        return json({ product: `${p.name} ${p.grader ? p.grader + " " + p.grade : p.kind}`, market: p.market, vanishedSinceLastCheck: r.vanished, ladder, sold, hold: holdEstimate(p, ladder, sold) });
      }
      return json({ error: "Unknown admin route" }, 404);
    }

    const qKey = url.searchParams.get("key");
    if (!env.REPORT_KEY) return html("<p>Set the REPORT_KEY secret first (see README).</p>", 500);
    const authed = safeEqual(cookie(req, "rk") || "", env.REPORT_KEY) || safeEqual(qKey || "", env.REPORT_KEY);
    if (!authed) return path.startsWith("/api/") ? json({ error: "Not signed in" }, 401) : html(renderLogin(qKey != null), 401);

    const rv = path.match(/^\/api\/deals\/(.+)\/review$/);
    if (rv && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      try { await saveReview(env.DB, decodeURIComponent(rv[1]), body); return json({ ok: true }); }
      catch (e) { return json({ error: String(e.message || e) }, 400); }
    }
    if (path === "/api/review/export") {
      const sets = await loadSets(env.DB);
      const csv = await exportCsv(env.DB, await loadProducts(env.DB, null, sets), sets);
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="deal-review-${londonParts().day}.csv"` } });
    }

    const m = path.match(/^\/api\/deals\/(.+)\/status$/);
    if (m && req.method === "POST") {
      const { status } = await req.json().catch(() => ({}));
      if (!["new", "bought", "bad", "passed"].includes(status)) return json({ error: "Status must be new, bought, bad or passed" }, 400);
      const r = await env.DB.prepare("UPDATE deals SET status = ? WHERE item_id = ?").bind(status, decodeURIComponent(m[1])).run();
      return json({ ok: r.meta.changes === 1 });
    }

    if (path === "/") {
      if (qKey) {
        const clean = new URL(url); clean.searchParams.delete("key");
        return new Response(null, { status: 302, headers: {
          Location: clean.pathname + clean.search,
          "Set-Cookie": `rk=${encodeURIComponent(env.REPORT_KEY)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
        } });
      }
      const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") || "") ? url.searchParams.get("day") : londonParts().day;
      return html(renderReport(await reportData(env, day)));
    }
    return html("<p>Not found</p>", 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScan(env).catch(async e => {
      await env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_error', ?)")
        .bind(`${new Date().toISOString()} ${e.message || e}`).run();
    }));
  },
};
