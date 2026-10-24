// Reviewing flagged deals: your verdicts, a re-check of each listing against today's rules, and the accuracy summary.
import { buildIndex, matchListing } from "./match.js";

// Why a match was wrong, by product type. Some reasons take a detail (stored as "reason:detail", e.g. "condition:MP").
const GRADERS = ["PSA", "ACE", "CGC", "BGS", "TAG", "SGC", "Other"];
export const REASONS_BY_KIND = {
  raw: [
    ["condition", "Condition worse than shown", ["LP", "MP", "HP", "DMG"]],
    ["graded", "It's actually a graded card", GRADERS],
    ["wrong_card", "Wrong card / set / number"],
    ["wrong_variant", "Wrong edition or variant (1st, shadowless, stamp, reverse)"],
    ["reprint", "Reprint or later set (Base Set 2, Celebrations…)"],
    ["language", "Not English"],
    ["multi", "Lot / several cards"],
    ["price_wrong", "Match right, market price wrong"],
    ["other", "Other (see note)"],
  ],
  slab: [
    ["wrong_grade", "Wrong grade", ["10", "9.5", "9", "8.5", "8", "7", "6 or lower"]],
    ["wrong_grader", "Different grading company", GRADERS],
    ["slab_damage", "Cracked or damaged slab"],
    ["not_graded", "Not actually graded (raw, or fake slab)"],
    ["wrong_card", "Wrong card / set / number"],
    ["wrong_variant", "Wrong edition or variant (1st, shadowless, stamp, reverse)"],
    ["language", "Not English"],
    ["multi", "Lot / several cards"],
    ["price_wrong", "Match right, market price wrong"],
    ["other", "Other (see note)"],
  ],
  sealed: [
    ["box_size", "Not a full booster box", ["Half box (18 packs)", "Some packs missing", "Different size product"]],
    ["no_seal", "Seal not there / opened / resealed"],
    ["promo_not_box", "Promo card instead of the sealed product"],
    ["graded_not_sealed", "Graded card, not sealed"],
    ["empty", "Empty / no packs included"],
    ["weight_wrong", "Pack weight wrong or misleading", ["Lighter than stated", "Heavier than stated", "Weighed / searched", "No weight given"]],
    ["wrong_product", "Wrong set or product (ETB vs bundle etc.)"],
    ["language", "Not English"],
    ["multi", "Several units / lot"],
    ["price_wrong", "Match right, market price wrong"],
    ["other", "Other (see note)"],
  ],
};
// Flat key -> label (includes reasons used by earlier versions so old reviews still read well).
export const REVIEW_REASONS = Object.assign(
  { not_sealed: "Seal not there / opened / resealed" },
  ...Object.values(REASONS_BY_KIND).map(list => Object.fromEntries(list.map(([k, l]) => [k, l]))),
);
export const reasonLabel = r => { if (!r) return ""; const [k, d] = String(r).split(":"); return (REVIEW_REASONS[k] || k) + (d ? ` (${d})` : ""); };

const inList = n => Array.from({ length: n }, () => "?").join(",");

async function loadBy(db, table, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT * FROM ${table} WHERE item_id IN (${inList(chunk.length)})`).bind(...chunk).all();
    for (const r of results) out[r.item_id] = r;
  }
  return out;
}

// What today's rules make of a deal's listing title: "same", "rejected" (with reason) or "different" (another product).
export const dealQty = d => (d.kind === "sealed" || /^sealed:/.test(d.product_id || "")) && d.pulse_market > 0 ? Math.max(1, Math.round(d.market / d.pulse_market)) : 1;
export function recheck(index, d) {
  const r = matchListing(d.title, [d.set_id], index);
  if (!r.ok) return { now: "rejected", reason: r.reason };
  if (r.product.id !== d.product_id || (r.qty || 1) !== dealQty(d)) return { now: "different", id: r.product.id, qty: r.qty || 1, product: r.product.name + (r.product.grader ? ` ${r.product.grader} ${r.product.grade}` : "") + (r.qty > 1 ? ` × ${r.qty}` : "") };
  return { now: "same" };
}

// Attach review + recheck to one day's deals, and summarise accuracy across every day.
export async function reviewData(db, deals, products, sets) {
  const index = buildIndex(products, sets);
  const reviews = await loadBy(db, "reviews", deals.map(d => d.item_id));
  const fixes = await loadBy(db, "corrections", deals.map(d => d.item_id));
  for (const d of deals) {
    d.review = reviews[d.item_id] || (d.status === "bad" ? { verdict: "bad", reason: null } : null);
    d.recheck = recheck(index, d);
    d.qty = dealQty(d);
    const c = fixes[d.item_id];
    if (c) {
      const p = c.product_id === "none" ? null : products.find(x => x.id === c.product_id);
      d.correction = { product_id: c.product_id, qty: c.qty, name: p ? p.name + (p.grader ? ` ${p.grader} ${p.grade}` : "") : "Not something the catalogue watches",
        market: p ? p.market * c.qty : null, matchesNow: d.recheck.now === "different" ? d.recheck.id === c.product_id && d.recheck.qty === c.qty : d.recheck.now === "rejected" && c.product_id === "none" };
    }
  }
  const { results: all } = await db.prepare(
    `SELECT d.item_id, d.title, d.product_id, d.status, d.instant, p.set_id, r.verdict, r.reason
     FROM deals d JOIN products p ON p.id = d.product_id LEFT JOIN reviews r ON r.item_id = d.item_id`).all();
  const s = { flagged: all.length, alerts: all.filter(x => x.instant).length, reviewed: 0, good: 0, bad: 0, fake: 0, byReason: {}, fixed: 0, alertsGood: 0, alertsReviewed: 0 };
  for (const x of all) {
    const verdict = x.verdict || (x.status === "bad" ? "bad" : null);
    if (!verdict) continue;
    s.reviewed++; s[verdict]++;
    if (x.instant) { s.alertsReviewed++; if (verdict === "good") s.alertsGood++; }
    if (verdict === "bad") {
      const k = (x.reason || "unspecified").split(":")[0]; s.byReason[k] = (s.byReason[k] || 0) + 1;
      if (recheck(index, x).now !== "same") s.fixed++;
    }
  }
  return s;
}

// "It was really this": the right catalogue product (or "none") and how many of it.
export async function saveCorrection(db, itemId, { product_id, qty }) {
  if (!product_id) { await db.prepare("DELETE FROM corrections WHERE item_id = ?").bind(itemId).run(); return true; }
  if (product_id !== "none" && !(await db.prepare("SELECT 1 FROM products WHERE id = ?").bind(product_id).first())) throw new Error("unknown product");
  const n = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
  await db.batch([
    db.prepare(`INSERT INTO corrections (item_id, product_id, qty, at) VALUES (?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET product_id = excluded.product_id, qty = excluded.qty, at = excluded.at`).bind(itemId, product_id, n, new Date().toISOString()),
    // a correction means the match was wrong: record that if you haven't already said why
    db.prepare(`INSERT INTO reviews (item_id, verdict, reason, note, at) VALUES (?, 'bad', 'wrong_card', NULL, ?) ON CONFLICT(item_id) DO NOTHING`).bind(itemId, new Date().toISOString()),
    db.prepare("UPDATE deals SET status = 'bad' WHERE item_id = ? AND status != 'bought'").bind(itemId),
  ]);
  return true;
}

export async function saveReview(db, itemId, { verdict, reason, note }) {
  if (!verdict) {
    await db.batch([
      db.prepare("DELETE FROM reviews WHERE item_id = ?").bind(itemId),
      db.prepare("UPDATE deals SET status = 'new' WHERE item_id = ? AND status = 'bad'").bind(itemId),
    ]);
    return true;
  }
  if (!["good", "bad", "fake"].includes(verdict)) throw new Error("verdict must be good, bad or fake");
  if (reason && (!REVIEW_REASONS[String(reason).split(":")[0]] || String(reason).length > 60)) throw new Error("unknown reason");
  await db.batch([
    db.prepare(`INSERT INTO reviews (item_id, verdict, reason, note, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET verdict = excluded.verdict, reason = excluded.reason, note = excluded.note, at = excluded.at`)
      .bind(itemId, verdict, verdict === "bad" ? reason || null : null, note ? String(note).slice(0, 500) : null, new Date().toISOString()),
    // wrong matches and fakes drop out of the day's totals; a "right" verdict puts a previously-bad deal back
    verdict === "good"
      ? db.prepare("UPDATE deals SET status = 'new' WHERE item_id = ? AND status = 'bad'").bind(itemId)
      : db.prepare("UPDATE deals SET status = 'bad' WHERE item_id = ? AND status != 'bought'").bind(itemId),
  ]);
  return true;
}

// Everything reviewed, as CSV: send it to Claude to turn wrong matches into rules.
export async function exportCsv(db, products, sets) {
  const index = buildIndex(products, sets);
  const { results } = await db.prepare(
    `SELECT d.day, d.found_at, d.item_id, d.title, d.product_id, p.name, p.set_id, p.grader, p.grade, d.price, d.total, d.market, d.net, d.pct, d.conf, d.label, d.instant, d.url,
            COALESCE(r.verdict, CASE WHEN d.status = 'bad' THEN 'bad' END) AS verdict, r.reason, r.note, d.pulse_market, p.kind,
            c.product_id AS fix_id, c.qty AS fix_qty, cp.name AS fix_name, cp.grader AS fix_grader, cp.grade AS fix_grade
     FROM deals d JOIN products p ON p.id = d.product_id LEFT JOIN reviews r ON r.item_id = d.item_id
       LEFT JOIN corrections c ON c.item_id = d.item_id LEFT JOIN products cp ON cp.id = c.product_id ORDER BY d.found_at`).all();
  const cols = ["day", "found_at", "verdict", "reason", "note", "title", "matched_as", "corrected_to", "corrected_id", "now", "now_detail", "price", "total", "market", "net", "pct", "conf", "label", "instant", "url"];
  const q = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(",")];
  for (const d of results) {
    const rc = recheck(index, d);
    const q = dealQty(d);
    const row = { ...d, matched_as: d.name + (d.grader ? ` ${d.grader} ${d.grade}` : "") + (q > 1 ? ` x ${q}` : ""),
      corrected_to: d.fix_id ? (d.fix_id === "none" ? "not watched" : d.fix_name + (d.fix_grader ? ` ${d.fix_grader} ${d.fix_grade}` : "") + (d.fix_qty > 1 ? ` x ${d.fix_qty}` : "")) : "", corrected_id: d.fix_id || "", reason: reasonLabel(d.reason), now: rc.now, now_detail: rc.reason || rc.product || "",
      net: d.net?.toFixed(2), pct: d.pct?.toFixed(1), market: d.market?.toFixed(2), total: d.total?.toFixed(2) };
    lines.push(cols.map(c => q(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}
