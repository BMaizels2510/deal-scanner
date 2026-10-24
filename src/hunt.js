// On-demand hunts from Telegram: message the bot "sir", "/goldstars", "ereader", "fossil", "charizard"…
// and it checks every current UK listing of those cards right now (cheapest first), then sends a burst of the best under-market finds.
// A hunt is a quick check from listing titles: no description, seller or cert lookups (instant alerts still do those).
import { getToken, searchProduct, itemPrice, shippingCost, bigImage } from "./ebay.js";
import { buildIndex, matchListing, parseCondition, COND_LABEL } from "./match.js";
import { config, calcDeal, conditionFactor, sentiment } from "./score.js";
import { loadSets, loadProducts } from "./scan.js";
import { sendText, sendHuntCard } from "./telegram.js";

const ERA = new Set(["ecard1", "ecard2", "ecard3"]);
export const HUNTS = {
  sir: { label: "Modern SIRs", words: ["sir", "sirs", "special illustration", "illustration rare"], pick: p => p.category === "sir" },
  alt: { label: "Alt Arts", words: ["alt", "alts", "alt art", "alt arts", "alternate art"], pick: p => p.category === "alt" },
  promos: { label: "Promos", words: ["promo", "promos", "black star"], pick: p => p.category === "promo" },
  ex: { label: "Early EX era", words: ["ex", "early ex", "ex era", "ex cards"], pick: p => p.category === "ex_era" && !/☆/.test(p.name) },
  goldstars: { label: "Gold Stars", words: ["gold star", "gold stars", "goldstar", "goldstars", "stars", "star"], pick: p => /☆/.test(p.name) },
  wotc: { label: "WOTC holos", words: ["wotc", "wotc holo", "wotc holos", "holos", "vintage", "vintage holos"], pick: p => p.category === "wotc" && !ERA.has(p.set_id) },
  ereader: { label: "e-Reader era", words: ["ereader", "e reader", "e-reader", "e card", "ecard", "expedition", "aquapolis", "skyridge"], pick: p => ERA.has(p.set_id) && p.kind !== "sealed" },
  packs: { label: "Vintage packs", words: ["packs", "pack", "vintage packs", "booster packs", "loose packs"], pick: p => p.kind === "sealed" && /booster pack/i.test(p.name) && p.vintage },
  sealed: { label: "Modern sealed", words: ["sealed", "etb", "etbs", "boxes", "booster box", "booster boxes", "bundles"], pick: p => p.kind === "sealed" && !p.vintage && !/booster pack/i.test(p.name) },
};
const PER_HUNT = 24;   // cards checked per message: one eBay search each, inside Cloudflare's free per-request limit

export const HELP = [
  "<b>Hunt commands</b> (checks every current UK listing, cheapest first):",
  "• <b>sir</b>: modern Special Illustration Rares",
  "• <b>alt</b>: Sword & Shield / Sun & Moon alt arts",
  "• <b>promos</b>: promos, every era",
  "• <b>ex</b>: early EX era ex cards",
  "• <b>goldstars</b>: Gold Stars ☆",
  "• <b>wotc</b>: WOTC holos (Base to Neo, Base Set 2, Legendary Collection)",
  "• <b>ereader</b>: Expedition, Aquapolis, Skyridge",
  "• <b>packs</b>: vintage booster packs",
  "• <b>sealed</b>: modern ETBs, boxes, bundles",
  "• or any set or card name: <i>fossil</i>, <i>151</i>, <i>charizard</i>, <i>umbreon psa 10</i>",
  "• <b>more</b>: the next batch of the last hunt",
  `Each hunt checks the ${PER_HUNT} most-traded cards in the group; send <b>more</b> for the rest.`,
].join("\n");

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9☆ ]+/g, " ").replace(/\s+/g, " ").trim();

// Turns a message into a list of products to check.
export function resolveHunt(text, products, sets) {
  const t = norm(text.replace(/^\//, "").replace(/@\w+/, ""));
  for (const [key, h] of Object.entries(HUNTS)) {
    if (t === key || h.words.includes(t)) return { key, label: h.label, list: products.filter(h.pick) };
  }
  // Free text: every word must appear in the product's name, set name, number or grade.
  const words = t.split(" ").filter(w => w && w !== "hunt");
  if (!words.length) return null;
  const list = products.filter(p => {
    const hay = norm(`${p.name} ${sets[p.set_id]?.name || ""} ${p.number || ""} ${p.grader ? `${p.grader} ${p.grade}` : p.kind === "raw" ? "raw" : "sealed"}`);
    return words.every(w => hay.split(" ").includes(w) || (w.length > 3 && hay.includes(w)));
  });
  return list.length ? { key: `q:${t}`, label: `"${text.trim()}"`, list } : null;
}

const byLiquidity = (a, b) => (b.s30 || 0) - (a.s30 || 0) || (b.market || 0) - (a.market || 0);

export async function runHunt(env, text) {
  const db = env.DB;
  const cfg = config(env);
  const sets = await loadSets(db);
  const products = await loadProducts(db, null, sets);
  let offset = 0, hunt;
  if (/^\/?more$/i.test(text.trim())) {
    const last = await db.prepare("SELECT value FROM meta WHERE key = 'hunt_last'").first();
    if (!last) return sendText(env, "No hunt to continue yet. " + HELP);
    const prev = JSON.parse(last.value);
    hunt = resolveHunt(prev.text, products, sets); offset = prev.next;
  } else if (/^\/?(help|start|commands|\?)$/i.test(text.trim())) {
    return sendText(env, HELP);
  } else hunt = resolveHunt(text, products, sets);
  if (!hunt) return sendText(env, `Nothing in the catalogue matches "${text.trim()}".\n\n${HELP}`);

  const all = hunt.list.sort(byLiquidity);
  const batch = all.slice(offset, offset + PER_HUNT);
  if (!batch.length) return sendText(env, `That's everything for ${hunt.label}: all ${all.length} checked.`);
  await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('hunt_last', ?)")
    .bind(JSON.stringify({ text: hunt.key.startsWith("q:") ? hunt.key.slice(2) : hunt.key, next: offset + batch.length })).run();
  await sendText(env, `🔎 Hunting <b>${hunt.label}</b>: checking ${batch.length} of ${all.length} cards (${offset + 1}–${offset + batch.length}, most traded first)…`);

  const index = buildIndex(products, sets);
  const token = await getToken(env);
  const hits = [], seen = new Set();
  let listings = 0, errors = 0;
  for (const p of batch) {
    let items;
    try { items = await searchProduct(env, token, p); } catch { errors++; continue; }
    for (const i of items) {
      if (seen.has(i.itemId)) continue;
      const m = matchListing(i.title, [p.set_id], index);
      if (!m.ok || m.product.id !== p.id || (m.qty || 1) > 1) continue;
      const price = itemPrice(i); if (price == null) continue;
      listings++;
      const cond = p.kind === "raw" ? (parseCondition(i.title) || null) : null;
      const condCode = p.kind === "raw" ? (cond || cfg.condUnknown) : null;
      const cf = p.kind === "raw" ? conditionFactor(p, condCode, cfg) : { factor: 1 };
      const market = p.market * cf.factor;
      const post = shippingCost(i);
      const calc = calcDeal({ price, post, market, accountType: "BUSINESS", feeMode: cfg.feeMode });
      if (calc.pct < cfg.minPct || calc.net < 5) continue;
      seen.add(i.itemId);
      hits.push({ p, i, price, post, calc, market, condCode, condStated: !!cond, s: sentiment(p, p, cfg) });
    }
  }
  hits.sort((a, b) => b.calc.net - a.calc.net);

  if (!hits.length) {
    return sendText(env, `Nothing under market for ${hunt.label} right now (${listings} matching listings checked${errors ? `, ${errors} searches failed` : ""}).` +
      (offset + batch.length < all.length ? `\nSend <b>more</b> to check the next ${Math.min(PER_HUNT, all.length - offset - batch.length)}.` : ""));
    return;
  }
  for (const h of hits.slice(0, 5)) await sendHuntCard(env, h, sets);
  const rest = hits.slice(5, 20);
  const gbp0 = n => "£" + Math.round(n).toLocaleString("en-GB");
  const lines = [`<b>${hunt.label}: ${hits.length} under market</b> from ${listings} listings`];
  if (rest.length) lines.push("", ...rest.map(h => `• <a href="${h.i.itemWebUrl}">${h.p.name}${h.p.grader ? ` ${h.p.grader} ${h.p.grade}` : h.condCode ? ` ${h.condCode}${h.condStated ? "" : "?"}` : ""}</a>: ${gbp0(h.calc.total)} vs ${gbp0(h.market)}, <b>${gbp0(h.calc.net)} under</b> (${Math.round(h.calc.pct)}%)`));
  if (hits.length > 20) lines.push(`…and ${hits.length - 20} smaller ones.`);
  if (offset + batch.length < all.length) lines.push("", `Send <b>more</b> for the next ${Math.min(PER_HUNT, all.length - offset - batch.length)} cards.`);
  lines.push("", "<i>Quick check from listing titles: open each listing and check condition, photos and seller before buying.</i>");
  await sendText(env, lines.join("\n"));
  return { label: hunt.label, checked: batch.length, of: all.length, listings, hits: hits.length,
    top: hits.slice(0, 8).map(h => `${h.p.name}${h.p.grader ? ` ${h.p.grader} ${h.p.grade}` : h.condCode ? ` ${h.condCode}` : ""}: £${h.calc.total.toFixed(2)} vs £${h.market.toFixed(2)} (${Math.round(h.calc.pct)}% under)`) };
}
