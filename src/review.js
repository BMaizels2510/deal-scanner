// Reviewing flagged deals: your verdicts, a re-check of each listing against today's rules, and the accuracy summary.
import { buildIndex, matchListing } from "./match.js";

export const REVIEW_REASONS = {
  wrong_card: "Wrong card / set / number",
  wrong_variant: "Wrong edition or variant (1st, shadowless, stamp, finish)",
  wrong_grade: "Wrong grade or grader",
  condition: "Condition worse than shown",
  box_size: "Half box / wrong box size / loose packs",
  promo_not_box: "Promo card, not the sealed box",
  graded_not_sealed: "Graded card, not sealed",
  empty: "Empty / no packs included",
  not_sealed: "Not sealed / opened / resealed",
  reprint: "Reprint or later set (Base Set 2, Celebrations…)",
  language: "Not English",
  multi: "Lot / several items",
  price_wrong: "Match right, market price wrong",
  other: "Other (see note)",
};

const inList = n => Array.from({ length: n }, () => "?").join(",");

async function loadReviews(db, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT * FROM reviews WHERE item_id IN (${inList(chunk.length)})`).bind(...chunk).all();
    for (const r of results) out[r.item_id] = r;
  }
  return out;
}

// What today's rules make of a deal's listing title: "same", "rejected" (with reason) or "different" (another product).
export function recheck(index, d) {
  const r = matchListing(d.title, [d.set_id], index);
  if (!r.ok) return { now: "rejected", reason: r.reason };
  if (r.product.id !== d.product_id || (r.qty || 1) > 1) return { now: "different", product: r.product.name + (r.product.grader ? ` ${r.product.grader} ${r.product.grade}` : "") + (r.qty > 1 ? ` × ${r.qty}` : "") };
  return { now: "same" };
}

// Attach review + recheck to one day's deals, and summarise accuracy across every day.
export async function reviewData(db, deals, products, sets) {
  const index = buildIndex(products, sets);
  const reviews = await loadReviews(db, deals.map(d => d.item_id));
  for (const d of deals) {
    d.review = reviews[d.item_id] || (d.status === "bad" ? { verdict: "bad", reason: null } : null);
    d.recheck = recheck(index, d);
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
      const k = x.reason || "unspecified"; s.byReason[k] = (s.byReason[k] || 0) + 1;
      if (recheck(index, x).now !== "same") s.fixed++;
    }
  }
  return s;
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
  if (reason && !REVIEW_REASONS[reason]) throw new Error("unknown reason");
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
            COALESCE(r.verdict, CASE WHEN d.status = 'bad' THEN 'bad' END) AS verdict, r.reason, r.note
     FROM deals d JOIN products p ON p.id = d.product_id LEFT JOIN reviews r ON r.item_id = d.item_id ORDER BY d.found_at`).all();
  const cols = ["day", "found_at", "verdict", "reason", "note", "title", "matched_as", "now", "now_detail", "price", "total", "market", "net", "pct", "conf", "label", "instant", "url"];
  const q = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(",")];
  for (const d of results) {
    const rc = recheck(index, d);
    const row = { ...d, matched_as: d.name + (d.grader ? ` ${d.grader} ${d.grade}` : ""), reason: d.reason ? REVIEW_REASONS[d.reason] : "", now: rc.now, now_detail: rc.reason || rc.product || "",
      net: d.net?.toFixed(2), pct: d.pct?.toFixed(1), market: d.market?.toFixed(2), total: d.total?.toFixed(2) };
    lines.push(cols.map(c => q(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}
