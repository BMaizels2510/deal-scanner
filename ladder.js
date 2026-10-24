// The live ladder for a product: every current UK listing of that exact card + grade (or sealed item).
// Comparing ladders between checks gives our own sold record: listings that vanish are recorded as likely sales.
import { searchProduct, shippingCost, itemPrice } from "./ebay.js";
import { matchListing, parseCondition } from "./match.js";

const num = (v, d) => (v == null || v === "" ? d : Number(v));
const inList = n => Array.from({ length: n }, () => "?").join(",");

async function fetchLadder(env, token, p, index) {
  const items = await searchProduct(env, token, p);
  const out = [];
  for (const i of items) {
    const m = matchListing(i.title, [p.set_id], index);
    const price = itemPrice(i);
    if (price == null || !m.ok || m.product.id !== p.id) continue;
    const entry = { id: i.itemId, total: Math.round((price + (shippingCost(i) || 0)) * 100) / 100 };
    if (p.kind === "raw") { const c = parseCondition(i.title); if (c) entry.cond = c; }
    out.push(entry);
  }
  return out;
}

// Refreshes the ladder if it's older than LADDER_TTL_H hours (or forced), records vanished listings, returns entries.
export async function refreshLadder(env, token, p, index, prev, now) {
  const db = env.DB;
  const entries = await fetchLadder(env, token, p, index);
  const prevItems = prev ? JSON.parse(prev.items) : [];
  const prevAge = prev ? now - Date.parse(prev.fetched_at) : Infinity;
  const firstSeen = Object.fromEntries(prevItems.map(x => [x.id, x.first || prev.fetched_at]));
  const current = new Set(entries.map(e => e.id));
  const writes = [];
  // Only trust disappearances between checks less than 48h apart; longer gaps hide too much.
  if (prev && prevAge <= 48 * 3600000) {
    for (const x of prevItems) {
      if (current.has(x.id)) continue;
      writes.push(db.prepare("INSERT OR IGNORE INTO observed_sales (item_id, product_id, price, first_seen, gone_at) VALUES (?, ?, ?, ?, ?)")
        .bind(x.id, p.id, x.total, x.first || prev.fetched_at, now.toISOString()));
    }
  }
  const stored = entries.map(e => ({ ...e, first: firstSeen[e.id] || now.toISOString() }));
  writes.push(db.prepare("INSERT OR REPLACE INTO ladders (product_id, fetched_at, items) VALUES (?, ?, ?)")
    .bind(p.id, now.toISOString(), JSON.stringify(stored)));
  await db.batch(writes);
  return { entries: stored, vanished: prev ? prevItems.filter(x => !current.has(x.id)).length : 0 };
}

export async function loadLadders(db, ids) {
  if (!ids.length) return {};
  const { results } = await db.prepare(`SELECT * FROM ladders WHERE product_id IN (${inList(ids.length)})`).bind(...ids).all();
  return Object.fromEntries(results.map(r => [r.product_id, r]));
}

export async function loadSold(db, ids, now) {
  if (!ids.length) return {};
  const since = new Date(now - 60 * 86400000).toISOString();
  const { results } = await db.prepare(
    `SELECT product_id, price, gone_at FROM observed_sales WHERE gone_at > ? AND product_id IN (${inList(ids.length)}) ORDER BY gone_at`)
    .bind(since, ...ids).all();
  const by = {};
  for (const r of results) (by[r.product_id] ||= []).push(r);
  return by;
}

// Ladders for the shortlisted products: cached ones reused, stale ones refreshed (capped per run).
export async function laddersFor(env, token, products, index, now, log) {
  const db = env.DB;
  const ttl = num(env.LADDER_TTL_H, 6) * 3600000;
  const cap = num(env.LADDER_PER_RUN, 8);
  const ids = [...new Set(products.map(p => p.id))];
  const cached = await loadLadders(db, ids);
  const out = {};
  let refreshed = 0;
  for (const p of products) {
    if (out[p.id]) continue;
    const prev = cached[p.id];
    if (prev && now - Date.parse(prev.fetched_at) < ttl) { out[p.id] = JSON.parse(prev.items); continue; }
    if (refreshed >= cap) { if (prev) out[p.id] = JSON.parse(prev.items); continue; }
    try { const r = await refreshLadder(env, token, p, index, prev, now); out[p.id] = r.entries; refreshed++; }
    catch (e) { log.errors.push(`ladder ${p.name}: ${e.message || e}`); if (prev) out[p.id] = JSON.parse(prev.items); }
  }
  log.laddersRefreshed = (log.laddersRefreshed || 0) + refreshed;
  return out;
}

// Background: keep the most-traded products' ladders fresh so the sold record builds across the catalogue.
export async function backgroundLadders(env, token, products, index, now, log) {
  const n = num(env.LADDER_BG_PER_RUN, 2);
  if (!n) return;
  const ttl = num(env.LADDER_TTL_H, 6) * 3600000;
  const cutoff = new Date(now - ttl).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT p.id FROM products p JOIN market m ON m.product_id = p.id LEFT JOIN ladders l ON l.product_id = p.id
     WHERE p.active = 1 AND (l.fetched_at IS NULL OR l.fetched_at <= ?)
     ORDER BY (l.fetched_at IS NOT NULL), COALESCE(m.s30, 0) DESC LIMIT ?`).bind(cutoff, n).all();
  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const stale = results.map(r => byId[r.id]).filter(Boolean);
  const cached = await loadLadders(env.DB, stale.map(p => p.id));
  for (const p of stale) {
    try { const r = await refreshLadder(env, token, p, index, cached[p.id], now); log.soldSeen = (log.soldSeen || 0) + r.vanished; }
    catch (e) { log.errors.push(`ladder ${p.name}: ${e.message || e}`); }
  }
  log.laddersRefreshed = (log.laddersRefreshed || 0) + stale.length;
}
