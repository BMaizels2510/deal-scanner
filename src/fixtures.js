// Fake eBay responses for local testing (EBAY_MOCK=1), keyed by search id.
// Includes traps the matcher must reject. One listing "sells" after its first lookup to exercise deal-speed tracking.

const L = (id, title, price, post, o = {}) => ({
  itemId: `v1|${id}|0`,
  title,
  price: { value: String(price), currency: "GBP" },
  shippingOptions: post == null ? undefined : [{ shippingCost: { value: String(post), currency: "GBP" } }],
  buyingOptions: o.bo ? ["FIXED_PRICE", "BEST_OFFER"] : ["FIXED_PRICE"],
  seller: { username: "seller" + id, feedbackPercentage: o.pct || "99.8", feedbackScore: o.fb || 412 },
  itemWebUrl: `https://www.ebay.co.uk/itm/${id}`,
  image: null,
  _ago: o.ago || 20,
  _account: o.biz ? "BUSINESS" : "INDIVIDUAL",
  _cert: o.cert || null,
  _sellsAfterLookup: !!o.sells,
});

const DATA = {
  "sv3pt5": [
    L(1001, "Charizard ex 199/165 SIR PSA 10 Pokemon 151 Gem Mint", 1049, 9.99, { bo: true, cert: "12345671" }),
    L(1002, "Pokemon 151 Charizard ex 199/165 Special Illustration Rare NM pack fresh", 215, 1.5, { bo: true, fb: 230 }),
    L(1003, "Blastoise ex 200/165 PSA 9 Mint Pokemon 151", 150, 4),
    L(1004, "Charizard ex 199/165 151 Japanese PSA 10", 900, 8),
    L(1005, "Pokemon 151 Booster Bundle Sealed English", 99, 4, { fb: 1066 }),
    L(1006, "Pokemon 151 Booster Bundle Display 10x Sealed", 950, 0),
    L(1007, "Venusaur ex 198/165 SIR Pokemon 151 LP", 55, 1.5),
    L(1008, "Alakazam ex 201/165 PSA 10 Pokemon 151", 120, 4),
  ],
  "me05": [
    L(2001, "Mega Darkrai ex 116/084 SIR Pitch Black Pokemon NM", 95, 1.2, { bo: true }),
    L(2002, "Pokemon Pitch Black Booster Box Sealed 36 packs", 140, 0, { biz: true, fb: 9120 }),
  ],
  "svp": [
    L(3001, "Pikachu with Grey Felt Hat SVP085 PSA 10 Van Gogh Promo", 1590, 10, { biz: true, fb: 3311, cert: "87654321", sells: true }),
    L(3002, "Mew ex SVP 053 Black Star Promo PSA 10", 430, 6, { cert: "11111110" }),
    L(3003, "Eevee SVP173 Pokemon Center Stamp Promo Holo", 35, 1.2),
    L(3004, "Charmander SVP044 promo staff stamp", 30, 1.2),
  ],
  "swshp": [
    L(3101, "Charizard VSTAR SWSH262 PSA 10 Black Star Promo", 800, 8),
  ],
  "swsh7": [
    L(4001, "Umbreon VMAX 215/203 Evolving Skies Alt Art Moonbreon PSA 10", 2799, 15, { bo: true, biz: true, fb: 2214, cert: "45678912" }),
    L(4002, "Rayquaza V 194/203 Alt Art Evolving Skies NM", 225, 3),
  ],
  "bsu+bs1s": [
    L(5001, "Charizard 4/102 Base Set Unlimited Holo PSA 9 Mint", 2350, 20, { bo: true, cert: "33445566" }),
    L(5002, "Charizard 4/102 Celebrations Classic Collection Holo", 90, 2),
    L(5003, "Machamp 8/102 1st Edition Base Set Holo Rare", 45, 2),
    L(5004, "Charizard Base Set 4/102 Holo Rare played", 260, 3),
  ],
  "ex2": [
    L(6001, "Gardevoir ex 96/100 EX Sandstorm Holo Rare NM", 160, 3, { fb: 88, pct: "100" }),
  ],
  "me2pt5": [
    L(7001, "Mega Gengar ex 284/217 SIR PSA 10 Ascended Heroes", 990, 8, { cert: "22334455" }),
  ],
  "sv10": [
    L(8001, "Team Rocket's Nidoking ex 233/182 PSA 10 Destined Rivals", 140, 5, { cert: "66778899" }),
  ],
  "mep": [
    L(9001, "Psyduck MEP007 Cosmos Holo PSA 10 Black Star Promo", 285, 5, { cert: "99887766" }),
  ],
};

const lookups = new Map();

// Times are stamped at search time: Workers report a zero clock while a module is loading.
export function mockSearch(searchId, min) {
  return (DATA[searchId] || []).filter(i => +i.price.value >= min)
    .map(i => ({ ...i, itemCreationDate: new Date(Date.now() - i._ago * 60000).toISOString() }));
}

export function mockItem(itemId) {
  for (const list of Object.values(DATA)) {
    const i = list.find(x => x.itemId === itemId);
    if (!i) continue;
    const n = (lookups.get(itemId) || 0) + 1;
    lookups.set(itemId, n);
    if (i._sellsAfterLookup && n > 1) return { gone: true };
    return {
      ...i,
      seller: { ...i.seller, sellerAccountType: i._account },
      localizedAspects: i._cert ? [{ name: "Certification Number", value: i._cert }] : [],
    };
  }
  return { gone: true };
}

// Ladders: listings of the same product around its market price. On each later fetch the cheapest listing
// "sells" and a new one appears, so the sold record and its trend build up in testing.
const ladderCalls = new Map();
const PROFILES = {
  "card:swsh7|194/203|null|null|null|null": [0.86, 0.88, 0.9, 0.92, 0.95, 1.0],     // soft: plenty already under Pulse
  "card:sv3pt5|199/165|null|null|null|null": [0.97, 1.0, 1.02, 1.05, 1.08],
  "card:me05|116/084|Holo|null|null|null": [0.92, 0.95, 0.97, 0.99, 1.0, 1.01, 1.03, 1.05, 1.06, 1.1, 1.12, 1.15],
};
export function mockLadder(p) {
  const n = (ladderCalls.get(p.id) || 0) + 1;
  ladderCalls.set(p.id, n);
  const steps = PROFILES[p.id] || [0.98, 1.02, 1.06, 1.1];
  const title = p.kind === "sealed" ? `Pokemon ${p.name} Sealed English` : `${p.name} ${p.number} ${p.grader ? p.grader + " " + p.grade : "NM"} pokemon`;
  const items = steps.slice(Math.min(n - 1, steps.length - 2)).map((k, i) => ({
    itemId: `v1|L-${p.id}-${i + Math.min(n - 1, steps.length - 2)}|0`,
    title,
    price: { value: (p.market * k * (1 + 0.02 * (n - 1))).toFixed(2), currency: "GBP" },
    shippingOptions: [{ shippingCost: { value: "0", currency: "GBP" } }],
  }));
  return items;
}
