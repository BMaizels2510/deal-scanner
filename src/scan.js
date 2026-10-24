// One scan run: search a batch of sets on eBay, identify listings, price and score them, alert, and record history.
import { getToken, searchListings, getItem, shippingCost, itemPrice, bigImage, certNumber, conditionFromItem } from "./ebay.js";
import { buildIndex, matchListing, parseCondition, COND_LABEL } from "./match.js";
import { readDescription, readSealedDescription, worstCondition } from "./condition.js";
import { packWeight, sellerClaims, judgeWeight, hasWeightData } from "./packs.js";
import { config, conditionFactor, calcDeal, exitRoutes, gradingPlay, scoreDeal, sentiment, indexOf, ladderStats, soldTrend, holdEstimate, chooseMarket } from "./score.js";
import { laddersFor, backgroundLadders, loadSold } from "./ladder.js";
import { verifyCert } from "./psa.js";
import { sendDealAlert, sendText } from "./telegram.js";

const num = (v, d) => (v == null || v === "" ? d : Number(v));
const inList = n => Array.from({ length: n }, () => "?").join(",");

export function londonParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, time: `${p.hour}:${p.minute}` };
}

async function metaMap(db, keys) {
  const { results } = await db.prepare(`SELECT key, value FROM meta WHERE key IN (${inList(keys.length)})`).bind(...keys).all();
  return Object.fromEntries(results.map(r => [r.key, r.value]));
}
const setMeta = (db, key, value) => db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").bind(key, String(value));

export async function loadSets(db) {
  const { results } = await db.prepare("SELECT * FROM sets").all();
  return Object.fromEntries(results.map(s => [s.id, s]));
}

export async function loadProducts(db, setIds, sets) {
  const where = setIds ? `AND p.set_id IN (${inList(setIds.length)})` : "";
  const stmt = db.prepare(
    `SELECT p.*, m.market, m.t7, m.t30, m.s7, m.s30, m.src, m.updated_at AS market_updated, cp.lp AS c_lp, cp.mp AS c_mp, cp.hp AS c_hp
     FROM products p JOIN market m ON m.product_id = p.id LEFT JOIN cond_prices cp ON cp.product_id = p.id WHERE p.active = 1 ${where}`);
  const { results } = await (setIds ? stmt.bind(...setIds) : stmt).all();
  return results.map(p => ({ ...p, released: sets[p.set_id]?.released || null, vintage: !!sets[p.set_id]?.vintage }));
}

export function categoryIndex(products) {
  const by = {};
  for (const p of products) (by[p.category] ||= []).push(p);
  return Object.fromEntries(Object.entries(by).map(([c, rows]) => [c, indexOf(rows)]));
}

async function ownHistory(db, ids) {
  if (!ids.length) return {};
  const { results } = await db.prepare(
    `SELECT product_id, at, market FROM market_snapshots WHERE product_id IN (${inList(ids.length)}) ORDER BY at`).bind(...ids).all();
  const by = {};
  for (const r of results) (by[r.product_id] ||= []).push(r);
  const out = {};
  for (const [id, rows] of Object.entries(by)) {
    const first = rows[0], last = rows[rows.length - 1];
    const days = Math.round((Date.parse(last.at) - Date.parse(first.at)) / 86400000);
    out[id] = { points: rows.length, days, change30: days >= 7 ? (last.market / first.market - 1) * 100 : null };
  }
  return out;
}

export async function runScan(env, { all = false } = {}) {
  const db = env.DB;
  const cfg = config(env);
  const perRun = num(env.SEARCHES_PER_RUN, 8);
  const now = new Date();
  const { day, hour } = londonParts(now);
  const log = { day, searched: [], listings: 0, fresh: 0, matched: 0, rejected: [], flagged: [], gone: [], errors: [] };

  const { results: searches } = await db.prepare("SELECT * FROM searches WHERE active = 1 ORDER BY id").all();
  if (!searches.length) return { ...log, note: "No searches. Load the catalogue first (npm run db:init)." };
  const meta = await metaMap(db, ["cursor", "maint_day", "digest_day", ...searches.map(s => `wm:${s.id}`)]);

  let batch = searches;
  const writes = [];
  if (!all && searches.length > perRun) {
    const cursor = num(meta.cursor, 0) % searches.length;
    batch = Array.from({ length: perRun }, (_, i) => searches[(cursor + i) % searches.length]);
    writes.push(setMeta(db, "cursor", (cursor + perRun) % searches.length));
  }

  const sets = await loadSets(db);
  const products = await loadProducts(db, null, sets);
  const index = buildIndex(products, sets);
  // Your corrections, remembered: a listing with the same title (relisted, or a seller's reused title) is what you said it was.
  const normTitle = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const { results: learned } = await db.prepare("SELECT d.title, c.product_id, c.qty FROM corrections c JOIN deals d ON d.item_id = c.item_id").all().catch(() => ({ results: [] }));
  const memory = new Map(learned.map(r => [normTitle(r.title), r]));
  const productById = Object.fromEntries(products.map(p => [p.id, p]));
  const recall = title => {
    const mem = memory.get(normTitle(title));
    if (!mem) return null;
    if (mem.product_id === "none") return { ok: false, reason: "you corrected this title before: not watched" };
    const p = productById[mem.product_id];
    if (!p) return null;
    return { ok: true, product: p, qty: mem.qty, grade: p.grader ? { g: p.grader.toLowerCase(), n: p.grade } : null, cond: p.kind === "raw" ? parseCondition(title) : null,
      note: mem.qty > 1 ? `You corrected this title before: ${mem.qty} × ${p.name}` : null, learned: true };
  };
  const byCard = {};
  for (const p of products) if (p.card_key) (byCard[p.card_key] ||= []).push(p);

  const token = await getToken(env);
  const candidates = [];
  const supply = {};
  const seenKeys = new Set();
  const watermark = {};

  for (const s of batch) {
    let items;
    try { items = await searchListings(env, token, s); }
    catch (e) { log.errors.push(String(e.message || e)); continue; }
    log.searched.push(s.id);
    log.listings += items.length;

    // Only look at listings newer than the last run's newest (with a 15-minute overlap), then dedupe by id+price.
    const wm = meta[`wm:${s.id}`];
    const cutoff = wm ? Date.parse(wm) - 15 * 60000 : 0;
    const recent = items.filter(i => !i.itemCreationDate || Date.parse(i.itemCreationDate) > cutoff);
    const newest = items.reduce((a, i) => (i.itemCreationDate && i.itemCreationDate > a ? i.itemCreationDate : a), wm || "");
    if (newest) watermark[s.id] = newest;
    if (!recent.length) continue;

    const keyed = recent.map(i => ({ i, key: `${i.itemId}:${i.price?.value}` }));
    const seen = new Set();
    for (let k = 0; k < keyed.length; k += 90) {
      const chunk = keyed.slice(k, k + 90).map(x => x.key);
      const { results } = await db.prepare(`SELECT key FROM seen WHERE key IN (${inList(chunk.length)})`).bind(...chunk).all();
      results.forEach(r => seen.add(r.key));
    }
    const fresh = keyed.filter(x => !seen.has(x.key));
    log.fresh += fresh.length;
    fresh.forEach(x => seenKeys.add(x.key));

    const setIds = JSON.parse(s.set_ids);
    for (const { i, key } of fresh) {
      const price = itemPrice(i);
      if (price == null) { log.rejected.push({ search: s.id, title: i.title, reason: "No single price (multi-variation listing)" }); continue; }
      const m = recall(i.title) || matchListing(i.title, setIds, index);
      if (!m.ok) { log.rejected.push({ search: s.id, title: i.title, reason: m.reason }); continue; }
      log.matched++;
      supply[m.product.id] = (supply[m.product.id] || 0) + 1;
      const post = shippingCost(i);
      // Optimistic first pass: a raw card with no stated condition is treated as NM until the full listing is read.
      const condF = m.product.kind === "raw" && m.cond ? conditionFactor(m.product, m.cond, cfg).factor : 1;
      const qty = m.qty || 1;   // an unsealed box is priced as qty loose packs
      const pre = calcDeal({ price, post, market: m.product.market * condF * qty, accountType: "BUSINESS", feeMode: cfg.feeMode });
      if (pre.pct >= cfg.minPct) candidates.push({ i, key, search: s.id, p: m.product, grade: m.grade, cond: m.cond || null, qty, note: m.note || null, learned: !!m.learned, price, post, pre });
    }
  }

  // Shortlist: full listing lookup, PSA cert check, signals, score.
  // Anything beyond the shortlist stays unseen and the search's watermark is held back, so it's picked up next run.
  candidates.sort((a, b) => b.pre.net - a.pre.net);
  const cap = num(env.SHORTLIST_PER_RUN, 12);
  const shortlist = candidates.slice(0, cap);
  for (const c of candidates.slice(cap)) {
    seenKeys.delete(c.key);
    const held = new Date(Date.parse(c.i.itemCreationDate || now.toISOString()) - 1000).toISOString();
    if (!watermark[c.search] || held < watermark[c.search]) watermark[c.search] = held;
    log.deferred = (log.deferred || 0) + 1;
  }
  const seenList = [...seenKeys];
  for (let k = 0; k < seenList.length; k += 45) {
    const chunk = seenList.slice(k, k + 45);
    writes.push(db.prepare(`INSERT OR IGNORE INTO seen (key, at) VALUES ${chunk.map(() => "(?, ?)").join(",")}`)
      .bind(...chunk.flatMap(key => [key, now.toISOString()])));
  }
  for (const [id, wm] of Object.entries(watermark)) writes.push(setMeta(db, `wm:${id}`, wm));
  const own = await ownHistory(db, shortlist.map(c => c.p.id));
  const catIndex = categoryIndex(products);
  const ladders = shortlist.length ? await laddersFor(env, token, shortlist.map(c => c.p), index, now, log) : {};
  const soldBy = await loadSold(db, shortlist.map(c => c.p.id), now);
  let certChecks = 0;

  for (const c of shortlist) {
    const detail = await getItem(env, token, c.i.itemId);
    if (detail?.gone) continue;
    const descText = [detail?.conditionDescription, detail?.shortDescription, detail?.description].filter(Boolean).join("\n");
    const sealedNote = c.p.kind === "sealed" && !(c.qty > 1) && !c.learned ? readSealedDescription(descText, c.p.name, { title: c.i.title, itemCondition: detail?.condition || c.i.condition }) : null;
    if (sealedNote?.wrongItem) { log.rejected.push({ search: c.search, title: c.i.title, reason: sealedNote.wrongItem }); continue; }
    const accountType = detail?.seller?.sellerAccountType || "UNKNOWN";
    const post = shippingCost(detail) ?? c.post;
    const sold = soldTrend(soldBy[c.p.id], now);
    const isRaw = c.p.kind === "raw";
    const fieldCond = isRaw ? conditionFromItem(detail) : null;
    // What the seller claims (condition field, else title), checked against what their own description admits to.
    const stated = fieldCond || c.cond || null;
    const desc = isRaw ? readDescription(descText) : null;
    const read = worstCondition(stated, desc?.level);
    const condSrc = !read ? null : read === stated ? (fieldCond ? "listing" : "title") : "description";
    const condCode = isRaw ? (read || cfg.condUnknown) : null;
    const condition = isRaw ? { code: condCode, src: condSrc, stated, desc, ...conditionFactor(c.p, condCode, cfg), label: COND_LABEL[condCode] || condCode } : null;
    const ref0 = chooseMarket(c.p.market, sold, num(env.EBAY_SOLD_MIN, 4));
    let ref = condition && condition.factor !== 1 ? { ...ref0, market: ref0.market * condition.factor, nm: ref0.market } : ref0;
    if (c.qty > 1) ref = { ...ref, market: ref.market * c.qty, each: ref.market };
    const calc = calcDeal({ price: c.price, post, market: ref.market, accountType, feeMode: cfg.feeMode });
    if (calc.pct < cfg.minPct) continue;

    const siblings = byCard[c.p.card_key] || [];
    const raw = siblings.find(x => x.kind === "raw");
    const psa10 = siblings.find(x => x.kind === "slab" && x.grader === "PSA" && x.grade === "10");
    const priceSuspect = c.p.kind === "slab" && raw && c.p.market / raw.market > 15;

    let cert = null, certStatus = null;
    if (c.p.kind === "slab" && c.p.grader === "PSA") {
      cert = certNumber(detail, c.i.title);
      if (cert && certChecks < num(env.PSA_CHECKS_PER_RUN, 6)) { certChecks++; certStatus = await verifyCert(env, cert, c.p); }
      else certStatus = cert ? "unchecked" : "no cert";
    }

    const routes = exitRoutes(c.p.kind, ref.market, calc.total, cfg);
    const grading = isRaw && condCode === "NM" ? gradingPlay(c.p, psa10, calc.total, cfg) : null;
    const ladder = c.qty > 1 ? null : ladderStats(ladders[c.p.id] || null, ref.market, c.i.itemId, condCode);
    const hold = holdEstimate(c.p, ladder, sold);
    const sc = scoreDeal({ p: c.p, m: { ...c.p, market: ref.market }, pct: calc.pct, cfg, index: catIndex[c.p.category], own: own[c.p.id], priceSuspect, certStatus, ladder, sold, hold, total: calc.total, ref, condition, now });
    // Loose vintage packs: weigh the seller's stated weight against the community pack-weight database.
    let pack = null;
    if (/booster pack/i.test(c.p.name) && hasWeightData(c.p.set_id)) {
      const text = `${c.i.title}\n${descText}`;
      const claims = sellerClaims(text);
      const j = judgeWeight(c.p.set_id, packWeight(text));
      pack = { ...claims, judge: j };
      const add = (pts, tone, msg) => { sc.conf = Math.max(0, Math.min(100, sc.conf + pts)); sc.factors.push([tone, msg]); };
      if (j) {
        const map = { "Heavy": [10, "g"], "Leans heavy": [5, "g"], "Can't tell": [0, "w"], "Leans light": [-10, "b"], "Light": [-15, "b"] };
        const [pts, tone] = map[j.cls];
        add(pts, tone, `${j.weight}g: ${j.cls.toLowerCase()} (${j.why})${/light/i.test(j.cls) ? ". Likely no holo: worth less than the average pack price" : ""}`);
      } else if (claims.heavy) add(-3, "w", "Seller says heavy but gives no weight");
      else if (claims.unweighed) add(3, "g", "Unweighed pack");
      else add(0, "w", "No pack weight given: ask the seller");
      if (claims.unsearched) sc.factors.push(["g", "Described as unsearched"]);
    }
    if (c.qty > 1) sc.factors.unshift(["w", `${c.note} × £${ref.each.toFixed(2)} each (Pulse)`]);
    if (c.learned) sc.factors.unshift(["g", "Matched from your earlier correction of this title"]);
    if (sealedNote?.damage.length) { sc.conf = Math.max(0, sc.conf - 10); sc.factors.push(["b", `Box damage mentioned: "${sealedNote.damage[0]}"`]); }
    if (grading?.suspect) sc.factors.push(["w", "PSA 10 price looks wrong: grading value skipped"]);
    else if (grading?.worth) sc.factors.push(["g", `Grading play: ${Math.round(grading.p10 * 100)}% PSA 10 rate`]);

    const seller = c.i.seller || {};
    const d = {
      item_id: c.i.itemId, product_id: c.p.id, day, found_at: now.toISOString(),
      title: c.i.title, price: c.price, post, fee: calc.fee, fee_included: calc.feeIncluded ? 1 : 0, total: calc.total,
      market: ref.market, market_source: ref.source, pulse_market: c.p.market, net: calc.net, pct: calc.pct, conf: sc.conf, label: sc.label, factors: JSON.stringify(sc.factors),
      resale_net: routes.resaleNet, mania_net: routes.maniaNet,
      hold_days: Number.isFinite(hold.days) ? hold.days : null, hold_cls: hold.cls,
      ladder: ladder ? JSON.stringify(ladder) : null, sold: JSON.stringify(sold),
      grade_ev: grading && !grading.suspect ? grading.ev : null, grade_gain: grading && !grading.suspect ? grading.gain : null,
      cert, cert_status: certStatus,
      seller: seller.username || null,
      feedback: seller.feedbackScore != null ? `${Number(seller.feedbackScore).toLocaleString("en-GB")} (${seller.feedbackPercentage}%)` : null,
      account_type: accountType,
      format: (c.i.buyingOptions || []).includes("BEST_OFFER") ? "Buy It Now · Best Offer" : "Buy It Now",
      image: bigImage(c.i.image?.imageUrl || detail?.image?.imageUrl), url: c.i.itemWebUrl, listed_at: c.i.itemCreationDate || null,
    };
    const blocked = ["Check cert", "Check price"].includes(sc.label) || sc.conf < 35 || /light/i.test(pack?.judge?.cls || "");
    d.instant = !blocked && calc.pct >= cfg.instantPct && calc.net >= cfg.instantNet ? 1 : 0;
    let alerted = 0;
    if (d.instant) alerted = (await sendDealAlert(env, { ...d, name: c.p.name, grade: c.p.grader ? `${c.p.grader} ${c.p.grade}` : null,
      set_name: sets[c.p.set_id]?.name || null, number: c.p.number, condition, nm_market: ref.nm ?? null, pack, qty: c.qty, qty_note: c.note, each: ref.each,
      ladder_summary: ladder && ladder.active ? `${ladder.active} other ${condition ? condition.code + " " : ""}listings, ${ladder.belowMarket} under market` : null })) ? 1 : 0;

    const cols = Object.keys(d);
    writes.push(db.prepare(
      `INSERT INTO deals (${cols.join(",")}, alerted) VALUES (${inList(cols.length + 1)})
       ON CONFLICT(item_id) DO UPDATE SET day=excluded.day, found_at=excluded.found_at, price=excluded.price, post=excluded.post,
         fee=excluded.fee, total=excluded.total, market=excluded.market, market_source=excluded.market_source, pulse_market=excluded.pulse_market, net=excluded.net, pct=excluded.pct, conf=excluded.conf,
         label=excluded.label, factors=excluded.factors, resale_net=excluded.resale_net, mania_net=excluded.mania_net,
         hold_days=excluded.hold_days, hold_cls=excluded.hold_cls, ladder=excluded.ladder, sold=excluded.sold,
         grade_ev=excluded.grade_ev, grade_gain=excluded.grade_gain, cert_status=excluded.cert_status, instant=excluded.instant,
         alerted=MAX(deals.alerted, excluded.alerted), gone_at=NULL`)
      .bind(...cols.map(k => d[k]), alerted));
    log.flagged.push({ id: d.item_id, name: c.p.name, grade: c.p.grader ? `${c.p.grader} ${c.p.grade}` : condition ? `raw ${condition.code}${condition.src ? "" : "?"}` : c.p.kind, title: c.i.title, net: Math.round(d.net), pct: +d.pct.toFixed(1), conf: d.conf, label: d.label, hold: hold.cls, holdDays: d.hold_days && Math.round(d.hold_days), ladder: ladder && `${ladder.active} listed, ${ladder.belowMarket} under Pulse`, sold: sold.count30, instant: !!d.instant, alerted: !!alerted });
  }

  // Supply: new UK listings per product per day.
  for (const [pid, n] of Object.entries(supply)) {
    writes.push(db.prepare(`INSERT INTO product_daily (product_id, day, listings) VALUES (?, ?, ?)
      ON CONFLICT(product_id, day) DO UPDATE SET listings = listings + excluded.listings`).bind(pid, day, n));
  }
  for (const r of log.rejected.slice(0, 25)) {
    writes.push(db.prepare("INSERT INTO rejects (at, search_id, title, reason) VALUES (?, ?, ?, ?)").bind(now.toISOString(), r.search, r.title, r.reason));
  }
  writes.push(db.prepare(
    `INSERT INTO stats (day, scans, listings, matched, rejected, flagged) VALUES (?, 1, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET scans = scans + 1, listings = listings + excluded.listings, matched = matched + excluded.matched,
       rejected = rejected + excluded.rejected, flagged = flagged + excluded.flagged`)
    .bind(day, log.fresh, log.matched, log.rejected.length, log.flagged.length));
  writes.push(setMeta(db, "last_scan", now.toISOString()));
  if (log.errors.length) writes.push(setMeta(db, "last_error", `${now.toISOString()} ${log.errors[0]}`));
  await db.batch(writes);

  await backgroundLadders(env, token, products, index, new Date(), log);
  log.gone = await checkGone(env, token, new Date());
  if (hour >= 7 && meta.maint_day !== day) { await dailyMaintenance(env, day, sets); await setMeta(db, "maint_day", day).run(); }
  if (hour >= num(env.DIGEST_HOUR, 18) && meta.digest_day !== day) { await sendDigest(env, day); await setMeta(db, "digest_day", day).run(); }
  return log;
}

// Deal speed: re-check a few open deals each run; record when they disappear.
async function checkGone(env, token, now) {
  const since = new Date(now - 3 * 86400000).toISOString().slice(0, 10);
  const stale = new Date(now - num(env.GONE_CHECK_MIN, 20) * 60000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT item_id FROM deals WHERE gone_at IS NULL AND day >= ? AND found_at < ? AND (checked_at IS NULL OR checked_at < ?)
     ORDER BY checked_at IS NOT NULL, checked_at LIMIT 3`).bind(since, stale, stale).all();
  const gone = [];
  for (const r of results) {
    const item = await getItem(env, token, r.item_id);
    if (item?.gone) {
      gone.push(r.item_id);
      await env.DB.prepare("UPDATE deals SET gone_at = ?, checked_at = ? WHERE item_id = ?").bind(now.toISOString(), now.toISOString(), r.item_id).run();
    } else {
      await env.DB.prepare("UPDATE deals SET checked_at = ? WHERE item_id = ?").bind(now.toISOString(), r.item_id).run();
    }
  }
  return gone;
}

// Once a day: store the market index, prune old housekeeping rows.
export async function dailyMaintenance(env, day, sets) {
  const db = env.DB;
  const idx = categoryIndex(await loadProducts(db, null, sets || await loadSets(db)));
  const w = Object.entries(idx).map(([c, v]) =>
    db.prepare("INSERT OR REPLACE INTO index_daily (day, category, t7, t30, n) VALUES (?, ?, ?, ?, ?)").bind(day, c, v.t7, v.t30, v.n));
  w.push(db.prepare("DELETE FROM seen WHERE at < ?").bind(new Date(Date.now() - 14 * 86400000).toISOString()));
  w.push(db.prepare("DELETE FROM rejects WHERE at < ?").bind(new Date(Date.now() - 7 * 86400000).toISOString()));
  await db.batch(w);
}

// Cards to watch: selling fast with the price holding, across the whole catalogue.
export function watchList(products, cfg, limit = 6) {
  return products
    .map(p => ({ p, s: sentiment(p, p, cfg) }))
    .filter(x => x.s.hot && !x.s.newRelease)
    .sort((a, b) => (b.p.src ?? 0) - (a.p.src ?? 0))
    .slice(0, limit)
    .map(x => x.p);
}

export async function sendDigest(env, day) {
  const db = env.DB;
  const cfg = config(env);
  const sets = await loadSets(db);
  const products = await loadProducts(db, null, sets);
  const { results } = await db.prepare(
    `SELECT d.net, d.pct, d.conf, d.label, d.instant, p.name, p.grader, p.grade FROM deals d JOIN products p ON p.id = d.product_id
     WHERE d.day = ? AND d.status != 'bad' ORDER BY d.net DESC`).bind(day).all();
  const total = results.reduce((a, r) => a + r.net, 0);
  const g = r => (r.grader ? ` ${r.grader} ${r.grade}` : "");
  const top = results.slice(0, 5).map(r => `• ${r.name}${g(r)}: £${Math.round(r.net)} under (${r.pct.toFixed(0)}%), ${r.label}, conf ${r.conf}`).join("\n");
  const hot = watchList(products, cfg, 4).map(p => `• ${p.name}${p.grader ? ` ${p.grader} ${p.grade}` : ""}: sales pace +${Math.round(p.src)}%, £${Math.round(p.market)}`).join("\n");
  const idx = categoryIndex(products);
  const names = { sir: "Modern SIR", promo: "Promos", alt: "Alt Art", ex_era: "EX era", wotc: "WOTC", sealed: "Sealed" };
  const market = Object.entries(idx).map(([c, v]) => `${names[c] || c} ${v.t30 >= 0 ? "+" : ""}${Math.round(v.t30)}%`).join(" · ");
  let text = [
    "<b>End-of-day report</b>",
    results.length ? `${results.length} deals flagged, £${Math.round(total).toLocaleString("en-GB")} under market in total.\n\n${top}` : "No under-market listings today.",
    hot ? `\n<b>Cards to watch</b> (selling fast)\n${hot}` : "",
    `\n<b>Market, 30-day median</b>\n${market}`,
  ].join("\n");
  // The daily review: how many of today's deals still need a verdict, and the running accuracy.
  const rv = await db.prepare(
    `SELECT SUM(CASE WHEN d.day = ? AND r.item_id IS NULL AND d.status != 'bad' THEN 1 ELSE 0 END) AS todo,
            SUM(CASE WHEN r.verdict = 'good' THEN 1 ELSE 0 END) AS good, COUNT(r.item_id) AS reviewed
     FROM deals d LEFT JOIN reviews r ON r.item_id = d.item_id`).bind(day).first().catch(() => null);
  if (rv) text += `\n\n<b>Review</b>: ${rv.todo || 0} of today's deals to check` + (rv.reviewed ? ` · match accuracy so far ${Math.round((rv.good / rv.reviewed) * 100)}% (${rv.reviewed} reviewed)` : "");
  const link = env.REPORT_URL ? { text: "Open report & review", url: `${env.REPORT_URL}/?day=${day}&key=${encodeURIComponent(env.REPORT_KEY || "")}` } : null;
  return sendText(env, text, link);
}
