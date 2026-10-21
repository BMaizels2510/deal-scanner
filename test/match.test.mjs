import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, matchListing } from "../src/match.js";
import { calcDeal, bpFee, scoreDeal, sentiment, gradingPlay, exitRoutes, config } from "../src/score.js";
import { parseProduct } from "../scripts/build-seed.mjs";

const cat = JSON.parse(readFileSync(new URL("../data/catalogue.json", import.meta.url)));
const col = Object.fromEntries(cat.columns.map((c, i) => [c, i]));
const products = cat.products.map(r => ({ ...parseProduct(r), name: r[col.name], number: r[col.number], category: r[col.cat], market: r[col.market] }));
const sets = Object.fromEntries(Object.entries(cat.sets).map(([id, s]) => [id, { ...s, id }]));
const index = buildIndex(products, sets);

const m = (sets, title) => matchListing(title, sets, index);
const is = (sets, title, id) => { const r = m(sets, title); assert.equal(r.ok, true, `${title} -> ${r.reason}`); assert.equal(r.product.id, id, title); };
const no = (sets, title, why) => { const r = m(sets, title); assert.equal(r.ok, false, `${title} matched ${r.product?.id}`); if (why) assert.match(r.reason, why, title); };

test("modern SIR: raw and PSA 10 resolve to the right product", () => {
  const s = ["sv3pt5"];
  is(s, "Charizard ex 199/165 SIR PSA 10 Pokemon 151 Gem Mint", "card:sv3pt5|199/165|null|null|PSA|10");
  is(s, "PSA10 Charizard ex #199 Scarlet Violet 151 Special Illustration Rare", "card:sv3pt5|199/165|null|null|PSA|10");
  is(s, "Pokemon 151 Charizard ex 199/165 Special Illustration Rare NM", "card:sv3pt5|199/165|null|null|null|null");
  is(s, "Blastoise ex 200/165 SIR 151 Pokemon", "card:sv3pt5|200/165|null|null|null|null");
  no(s, "Blastoise ex 200/165 PSA 9 Mint Pokemon 151", /PSA 9 not watched/);
  no(s, "Charizard ex 199/165 151 Japanese PSA 10", /not English/);
  no(s, "Charizard ex 199/165 PSA 10 CGC 10 crossover", /several grades/);
  no(s, "Venusaur ex 198/165 SIR Pokemon 151 LP", /condition/);
  no(s, "Charizard ex 199/165 PSA 10 cracked case", /cracked/);
  no(s, "Charizard ex 183/165 151 holo", /not in catalogue/);
  no(s, "Charizard ex 199/165 proxy orica", /fake/);
});

test("same number in different sets is told apart by the search's sets", () => {
  is(["swsh11"], "Pikachu VMAX TG29/TG30 Lost Origin PSA 10", "card:swsh11|TG29/TG30|null|null|PSA|10");
  is(["swsh12"], "Rayquaza VMAX TG29/TG30 Silver Tempest PSA 10", "card:swsh12|TG29/TG30|null|null|PSA|10");
  is(["swsh12pt5"], "Giratina VSTAR GG69/GG70 Crown Zenith Galarian Gallery", "card:swsh12pt5|GG69/GG70|null|null|null|null");
  is(["swsh12pt5"], "Giratina VSTAR GG69 Crown Zenith PSA 10", "card:swsh12pt5|GG69/GG70|null|null|PSA|10");
});

test("promos: code numbers, stamps and Pokemon Center versions", () => {
  is(["svp"], "Pikachu with Grey Felt Hat SVP085 PSA 10 Van Gogh", "card:svp|SVP085|Non-holo|null|PSA|10");
  is(["svp"], "Pikachu Grey Felt Hat SVP 085 Promo Van Gogh Museum", "card:svp|SVP085|Non-holo|null|null|null");
  is(["svp"], "Eevee SVP173 Pokemon Center Stamp Promo", "card:svp|SVP173|null|Pokémon Center|null|null");
  is(["svp"], "Eevee SVP173 Black Star Promo PSA 10", "card:svp|SVP173|null|null|PSA|10");
  no(["svp"], "Charmander SVP044 promo staff stamp", /staff|stamp/);
  is(["swshp"], "Charizard VSTAR SWSH262 Black Star Promo", "card:swshp|SWSH262|null|null|null|null");
  is(["mep"], "Psyduck MEP007 Cosmos Holo PSA 10 promo", "card:mep|MEP007|Cosmos Holo|null|PSA|10");
  no(["mep"], "Psyduck MEP007 PSA 10 promo", /cosmos/);
  is(["basep"], "Mew #9 WOTC Black Star Promo Holo", "card:basep|9|null|null|null|null");
  is(["swshp"], "Mimikyu SWSH136 25th Anniversary promo PSA 10", "card:swshp|SWSH136|null|25th Anniversary|PSA|10");
  no(["swshp"], "Mimikyu SWSH136 promo PSA 10", /25th/);
});

test("WOTC: editions, shadowless and reprints", () => {
  const s = ["bsu", "bs1s"];
  is(s, "Charizard 4/102 Base Set Unlimited Holo PSA 9 Mint", "card:bsu|4/102|Holo|null|PSA|9");
  is(s, "Charizard 4/102 Base Set Holo Rare WOTC NM", "card:bsu|4/102|Holo|null|null|null");
  is(s, "Machamp 8/102 1st Edition Base Set Holo Rare", "card:bs1s|8/102|Holo|1st Edition, Shadowless|null|null");
  is(s, "Machamp 8/102 1st Edition Base Set Holo PSA 9", "card:bsu|8/102|Holo|1st Edition|PSA|9");
  no(s, "Charizard 4/102 Celebrations Classic Collection Holo", /reprint/);
  no(s, "Charizard 4/102 1st Edition Base Set PSA 9", /1st edition variant not watched/);
  no(s, "Charizard Base Set 4/102 Holo Rare played", /condition/);
  is(["base3"], "Articuno 2/62 Fossil 1st Edition Holo PSA 9", "card:base3|2/62|Holo|1st Edition|PSA|9");
  is(["base3"], "Articuno 2/62 Fossil Holo PSA 9 Unlimited", "card:base3|2/62|Holo|null|PSA|9");
});

test("sealed: product type, Pokemon Center, displays and multiples", () => {
  is(["sv3pt5"], "Pokemon 151 Booster Bundle Sealed English", "sealed:sv3pt5|151 Booster Bundle");
  is(["sv3pt5"], "Pokemon 151 Elite Trainer Box ETB Sealed", "sealed:sv3pt5|151 Elite Trainer Box");
  no(["sv3pt5"], "Pokemon 151 Booster Bundle Display 10x Sealed");
  is(["sv8pt5"], "Prismatic Evolutions Elite Trainer Box Sealed UK", "sealed:sv8pt5|Prismatic Evolutions Elite Trainer Box");
  is(["sv8pt5"], "Prismatic Evolutions Pokemon Center ETB Sealed", "sealed:sv8pt5|Prismatic Evolutions Pokemon Center Elite Trainer Box");
  no(["sv8pt5"], "Prismatic Evolutions ETB x2 sealed", /multiple/);
  no(["sv8pt5"], "Prismatic Evolutions ETB resealed", /opened/);
  is(["me05"], "Pokemon Pitch Black Booster Box Sealed 36 packs", "sealed:me05|Pitch Black Booster Box");
});

test("EX era: lowercase ex cards and graded copies", () => {
  is(["ex2"], "Gardevoir ex 96/100 EX Sandstorm Holo Rare NM", "card:ex2|96/100|Holo|null|null|null");
  is(["ex2"], "Aerodactyl ex 94/100 EX Sandstorm PSA 9", "card:ex2|94/100|Holo|null|PSA|9");
  no(["ex2"], "Gardevoir ex 96/100 EX Sandstorm Reverse Holo", /reverse/);
});

test("fees, exits and grading value", () => {
  assert.equal(bpFee(20), 1.5);
  const inc = calcDeal({ price: 1049, post: 9.99, market: 1246.39, accountType: "INDIVIDUAL" });
  assert.equal(+inc.total.toFixed(2), 1058.99);
  const cfg = config({});
  const ex = exitRoutes("slab", 1246.39, 1058.99, cfg);
  assert.ok(Math.abs(ex.resaleNet - (1246.39 * 0.872 - 0.3 - 4.5 - 1058.99)) < 0.01);
  assert.ok(Math.abs(ex.maniaNet - 52.95) < 0.01);
  const g = gradingPlay({ market: 264.1, p10: 0.272 }, { market: 1246.39 }, 216.5, cfg);
  assert.ok(g.worth && g.gain > 200, JSON.stringify(g));
  assert.equal(gradingPlay({ market: 56.69, p10: 0.15 }, { market: 1132 }, 50, cfg).suspect, true);
});

test("sentiment follows the backtest rules", () => {
  const cfg = config({});
  const now = new Date("2026-10-21T12:00:00Z");
  assert.equal(sentiment({ kind: "raw", released: "2026-06-27" }, { t7: 0, t30: 0 }, cfg, now).label, "New release");
  assert.equal(sentiment({ kind: "raw", released: "2023-09-22" }, { t7: -5, t30: -15 }, cfg, now).label, "Bearish");
  assert.equal(sentiment({ kind: "slab" }, { t7: 1.8, t30: -6, src: 90, s7: 4 }, cfg, now).label, "Hot");
  assert.equal(sentiment({ kind: "sealed", released: "2026-09-01" }, { t7: 2, t30: 12 }, cfg, now).label, "Bullish");
  const base = { t7: -5, t30: -15, src: 0, s7: 2, s30: 30 };
  const raw = scoreDeal({ p: { kind: "raw" }, m: base, pct: 15, cfg, now }).conf;
  const slab = scoreDeal({ p: { kind: "slab" }, m: base, pct: 15, cfg, now }).conf;
  assert.ok(slab > raw + 10, `falling raw (${raw}) should score well below falling slab (${slab})`);
  assert.equal(scoreDeal({ p: { kind: "slab" }, m: base, pct: 15, cfg, now, certStatus: "mismatch" }).conf, 0);
});

test("Brandon's example: £195 listing vs £210 Pulse, flat solds, stalling sales = contender but high risk", async () => {
  const { ladderStats, soldTrend, holdEstimate } = await import("../src/score.js");
  const cfg = config({});
  const now = new Date("2026-10-21T12:00:00Z");
  const asks = [200, 205, 210, 215, 195, 225, 210, 210, 210].map((total, i) => ({ id: "L" + i, total }));
  const ladder = ladderStats(asks, 210, "L4");                       // the £195 listing is the deal itself
  assert.equal(ladder.active, 8);
  assert.equal(ladder.lowest, 200);
  const sales = [200, 203, 198, 195, 200, 190, 220].map((price, i) => ({ price, gone_at: new Date(now - (25 - i * 3) * 86400000).toISOString() }));
  const sold = soldTrend(sales, now);
  assert.ok(Math.abs(sold.change) < 5, "solds flat around £200");
  const m = { market: 210, t7: -1, t30: 0, s7: 1, s30: 8, src: -45 };
  const hold = holdEstimate(m, ladder, sold);
  assert.equal(hold.cls, "Long hold");
  const r = scoreDeal({ p: { kind: "slab" }, m, pct: (210 - 195) / 210 * 100, cfg, ladder, sold, hold, total: 195, now });
  const text = r.factors.map(f => f[1]).join(" | ");
  assert.match(text, /Sales stalling/);
  assert.match(text, /Long hold/);
  assert.ok(r.conf < 45, `should read as risky, got ${r.conf}: ${text}`);

  // Same card, but selling fast with prices climbing and few cheaper listings: should be a confident quick flip.
  const fast = { market: 210, t7: 4, t30: 8, s7: 9, s30: 30, src: 20 };
  const rising = soldTrend([180, 185, 190, 200, 205, 210].map((price, i) => ({ price, gone_at: new Date(now - (12 - i * 2) * 86400000).toISOString() })), now);
  const thin = ladderStats([{ id: "a", total: 215 }, { id: "b", total: 230 }], 210, "x");
  const h2 = holdEstimate(fast, thin, rising);
  assert.equal(h2.cls, "Quick flip");
  const r2 = scoreDeal({ p: { kind: "slab" }, m: fast, pct: 7, cfg, ladder: thin, sold: rising, hold: h2, total: 195, now });
  assert.ok(r2.conf >= 65, `should read as strong, got ${r2.conf}: ${r2.factors.map(f => f[1]).join(" | ")}`);
});

test("eBay sold record takes over from Pulse once it has enough sales", async () => {
  const { chooseMarket, soldTrend } = await import("../src/score.js");
  const now = new Date("2026-10-21T12:00:00Z");
  const few = soldTrend([{ price: 190, gone_at: "2026-10-20T10:00:00Z" }], now);
  assert.equal(chooseMarket(210, few).source, "Pulse");
  const many = soldTrend([200, 203, 198, 195, 200].map((price, i) => ({ price, gone_at: new Date(now - (10 - i) * 86400000).toISOString() })), now);
  const ref = chooseMarket(210, many);
  assert.equal(ref.source, "eBay sold");
  assert.equal(ref.market, 200);
  assert.ok(Math.abs(ref.gap - (-4.76)) < 0.1);
  const cfg = config({});
  const r = scoreDeal({ p: { kind: "slab" }, m: { market: 200, t7: 0, t30: 0, s7: 4, s30: 20 }, pct: 10, cfg, ref: chooseMarket(240, many), sold: many, now });
  assert.match(r.factors.map(f => f[1]).join(" | "), /Pulse above eBay sold by 17%/);
});
