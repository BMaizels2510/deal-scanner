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
  assert.equal(m(s, "Venusaur ex 198/165 SIR Pokemon 151 LP").cond, "LP");
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
  assert.equal(m(s, "Charizard Base Set 4/102 Holo Rare played").cond, "MP");
  assert.equal(m(s, "Charizard 4/102 Base Set Holo Rare WOTC NM").cond, "NM");
  assert.equal(m(s, "Charizard 4/102 Base Set Holo 120 HP").cond, null);
  no(s, "Charizard 4/130 Base Set 2 Holo Rare WOTC", /Base Set 2|not in catalogue/);
  no(s, "Charizard 4/130 Holo Rare WOTC 2000", /not in catalogue/);
  no(s, "Charizard Base Set 2 Holo 4 Pokemon", /Base Set 2/);
  assert.equal(m(s, "Charizard 4/102 Base Set Holo heavily played").cond, "HP");
  assert.equal(m(s, "Charizard 4/102 Base Set Holo creased").cond, "DMG");
  // Base Set 2 and Legendary Collection are watched in their own right.
  is(["base4"], "Charizard 4/130 Base Set 2 Holo Rare WOTC", "card:base4|4/130|Holo|null|null|null");
  is(["base4"], "Charizard Base Set 2 4/130 PSA 9 Mint", "card:base4|4/130|Holo|null|PSA|9");
  is(["base6"], "Pikachu 86/110 Legendary Collection Reverse Holo Firework", "card:base6|86/110|Reverse Holo|null|null|null");
  no(["base6"], "Pikachu 86/110 Legendary Collection Common", /reverse holo/);
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

import { readDescription } from "../src/condition.js";
test("description: the seller's own words lower the condition", () => {
  const r = t => readDescription(t).level;
  assert.equal(r("The card has a slight bow and a holo scratch as shown in the pictures. please assess the condition on the card from the picture."), "MP");
  assert.equal(r("Light whitening on the back corners, otherwise clean."), "LP");
  assert.equal(r("Pulled straight from the pack and sleeved immediately. Mint condition."), "NM");
  assert.equal(r("No scratches, no whitening, no creases."), null);
  assert.equal(r("Crease in the bottom corner."), "DMG");
  assert.equal(r("Posted in a toploader. Returns accepted if damaged in transit."), null);
  assert.ok(readDescription("Please judge condition from the photos").hedge);
});

test("sealed: half booster boxes are their own product", () => {
  const s = ["me05"];
  is(s, "Pokemon Mega Evolution Pitch Black Half Booster Box 18 Booster Packs Sealed", "sealed:me05|Pitch Black Half Booster Boxes");
  is(s, "Pokemon Pitch Black Booster Box 36 Packs Sealed", "sealed:me05|Pitch Black Booster Box");
  is(s, "Pitch Black Booster Box Sealed Pokemon TCG", "sealed:me05|Pitch Black Booster Box");
  no(s, "Pitch Black Booster Box 24 packs sealed", /24 packs/);
  no(s, "Pitch Black Booster Box contents only no promo", /partial/);
});
import { readSealedDescription } from "../src/condition.js";
test("sealed: description reveals a half box, opened or damaged box", () => {
  assert.match(readSealedDescription("Half booster box, 18 packs, factory sealed", "Pitch Black Booster Box").wrongItem, /half/);
  assert.equal(readSealedDescription("Half booster box, 18 packs", "Pitch Black Half Booster Boxes", { title: "Pitch Black half booster box sealed" }).wrongItem, null);
  assert.match(readSealedDescription("Box has been opened but packs are sealed", "X Booster Box").wrongItem, /opened/);
  assert.equal(readSealedDescription("Never opened. Shipped in a box, returns if damaged in transit", "X Booster Box", { title: "X booster box sealed" }).wrongItem, null);
  assert.equal(readSealedDescription("Small dent on the corner of the box", "X Booster Box").damage.length, 1);
  assert.equal(readSealedDescription("No dents or tears", "X Booster Box").damage.length, 0);
});

test("vintage packs: single sealed packs by edition, not boxes or modern look-alikes", () => {
  is(["base3"], "Pokemon Fossil Booster Pack 1st Edition Sealed 21.3g", "sealed:base3|Fossil Booster Pack (1st Edition)");
  is(["base3"], "Fossil Booster Pack Sealed WOTC 1999 weighed 21.05g", "sealed:base3|Fossil Booster Pack (Unlimited Edition)");
  is(["tr"], "Team Rocket 1st Edition Booster Pack sealed unsearched", "sealed:tr|Team Rocket Booster Pack (1st Edition)");
  no(["tr"], "Team Rocket Booster Pack Unlimited Sealed", /not 1st Edition/);
  no(["tr"], "Pokemon Destined Rivals Team Rocket's booster pack sealed", /not watched|not in catalogue/);
  no(["base3"], "Fossil empty booster pack wrapper", /empty/);
  no(["base3"], "Fossil booster pack art only", /opened|empty/);
  no(["base3"], "3x Fossil booster packs sealed", /multiple|several/);
  is(["bsu", "bs1s"], "Pokemon Base Set Booster Pack Sealed Charizard art", "sealed:bsu|Base Set Booster Pack");
  no(["bsu", "bs1s"], "Pokemon Base Set 2 Booster Pack Sealed", /not watched|ambiguous/);
  is(["base4"], "Pokemon Base Set 2 Booster Pack Sealed", "sealed:base4|Base Set 2 Booster Pack");
});
import { packWeight, judgeWeight } from "../src/packs.js";
import { readSealedDescription as rsd } from "../src/condition.js";
test("vintage packs: weight against the pack-weight database, and proof it's sealed", () => {
  assert.equal(judgeWeight("tr", packWeight("Team Rocket Booster Pack 21.6g")).cls, "Heavy");
  assert.equal(judgeWeight("bsu", packWeight("base set pack weighs 20.6 grams")).cls, "Light");
  assert.equal(packWeight("no weight here"), null);
  assert.match(rsd("Great pack", "Fossil Booster Pack", { title: "Fossil booster pack" }).wrongItem, /not described as sealed/);
  assert.equal(rsd("Factory sealed, weighed 21.2g", "Fossil Booster Pack", { title: "Fossil booster pack" }).wrongItem, null);
  assert.equal(rsd("", "Pitch Black ETB", { title: "Pitch Black ETB", itemCondition: "New" }).wrongItem, null);
  assert.match(rsd("Box has been weighed", "Pitch Black Booster Box", { title: "Pitch Black booster box sealed" }).wrongItem, /weighed/);
});

test("sealed: empty boxes and 'no packs included' are never deals", () => {
  for (const t of [
    "Pokemon Journey Together ETB Booster Box - NO BOOSTER PACKS INCLUDED",
    "Journey Together Elite Trainer Box packs not included",
    "Journey Together ETB without booster packs",
    "Journey Together ETB excluding packs",
    "Journey Together Elite Trainer Box no packs",
    "Journey Together ETB empty box",
  ]) no(["sv9"], t, /packs not included|empty/);
  is(["sv9"], "Journey Together Elite Trainer Box Sealed", "sealed:sv9|Journey Together Elite Trainer Box");
  assert.match(rsd("Box and sleeves only, booster packs have been removed", "Journey Together Elite Trainer Box", { title: "Journey Together ETB sealed" }).wrongItem, /removed/);
  assert.equal(rsd("Brand new sealed, nothing removed", "Journey Together Elite Trainer Box", { title: "Journey Together ETB" }).wrongItem, null);
});

test("promo cards from ETBs and graded slabs never match the ETB", () => {
  const s = ["sv8pt5"];
  is(s, "Pokémon TCG Eevee 173 Promo Card Prismatic Evolutions ETB Pokemon Centre Sealed", "card:svp|SVP173|null|Pokémon Center|null|null");
  no(s, "Eevee 173 Prismatic Evolutions Pokemon Center Stamp ETB Promo PSA 9", /PSA 9 not watched/);
  is(s, "Prismatic Evolutions Pokemon Center Elite Trainer Box Sealed with Eevee promo", "sealed:sv8pt5|Prismatic Evolutions Pokemon Center Elite Trainer Box");
  is(s, "Prismatic Evolutions Pokemon Center ETB Sealed", "sealed:sv8pt5|Prismatic Evolutions Pokemon Center Elite Trainer Box");
});
test("unsealed boxes are priced as loose packs", () => {
  const h = m(["sv8"], "Pokemon TCG Scarlet & Violet Surging Sparks Half Booster Box No Factory Seal");
  assert.equal(h.product.id, "sealed:sv8|Surging Sparks Booster Pack"); assert.equal(h.qty, 18);
  assert.equal(m(["sv8"], "Surging Sparks Booster Box 36 packs no shrink").qty, 36);
  assert.equal(m(["sv8"], "Surging Sparks booster box without factory seal").qty, 36);
  assert.equal(m(["sv8"], "Surging Sparks booster box loose packs").qty, 36);
  assert.equal(m(["sv8"], "Surging Sparks 18 loose booster packs").qty, 18);
  is(["sv8"], "Surging Sparks Booster Box Sealed", "sealed:sv8|Surging Sparks Booster Box");
  no(["sv8"], "Surging Sparks booster pack sealed", /modern packs not watched|not in catalogue/);
});

import { resolveHunt } from "../src/hunt.js";
test("hunt commands resolve to the right cards", () => {
  const ps = products.map(p => ({ ...p, vintage: !!sets[p.set_id]?.vintage }));
  const r = t => resolveHunt(t, ps, sets);
  assert.ok(r("/sir").list.every(p => p.category === "sir") && r("sir").list.length > 40);
  assert.ok(r("Gold Stars").list.length >= 20 && r("goldstars").list.every(p => /☆/.test(p.name)));
  assert.ok(r("ereader").list.every(p => ["ecard1", "ecard2", "ecard3"].includes(p.set_id)));
  assert.ok(r("/packs").list.every(p => /booster pack/i.test(p.name)));
  assert.ok(r("fossil").list.length > 0 && r("fossil").list.every(p => p.set_id === "base3"));
  assert.ok(r("charizard").list.length > 5);
  assert.ok(r("umbreon psa 10").list.every(p => p.grader === "PSA" && p.grade === "10"));
  assert.equal(r("zzzz nothing"), null);
});
