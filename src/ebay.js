// eBay Browse API client (official API, free developer keys).
import { mockSearch, mockItem, mockLadder } from "./fixtures.js";
import { parseCondition } from "./match.js";

const API = "https://api.ebay.com";
const HEADERS = {
  "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
  "X-EBAY-C-ENDUSERCTX": "contextualLocation=country=GB",
};

export async function getToken(env) {
  if (env.EBAY_MOCK === "1") return "mock";
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key='ebay_token'").first();
  if (row) {
    const t = JSON.parse(row.value);
    if (t.exp > Date.now() + 120000) return t.token;
  }
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`),
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) throw new Error(`eBay login failed (${res.status}): ${await res.text()}`);
  const j = await res.json();
  await env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('ebay_token', ?)")
    .bind(JSON.stringify({ token: j.access_token, exp: Date.now() + j.expires_in * 1000 })).run();
  return j.access_token;
}

// Newest UK Buy It Now / Best Offer listings for a set-level search.
export async function searchListings(env, token, search) {
  if (env.EBAY_MOCK === "1") return mockSearch(search.id, search.min_price);
  const filter = [
    "buyingOptions:{FIXED_PRICE|BEST_OFFER}",
    "itemLocationCountry:GB",
    `price:[${search.min_price}..]`,
    "priceCurrency:GBP",
  ].join(",");
  const url = `${API}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(search.q)}` +
    `&filter=${encodeURIComponent(filter)}&sort=newlyListed&limit=200`;
  const res = await fetch(url, { headers: { ...HEADERS, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`eBay search failed for "${search.q}" (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).itemSummaries || [];
}

// Every current UK listing of one product, cheapest first, for the ladder.
export async function searchProduct(env, token, p) {
  if (env.EBAY_MOCK === "1") return mockLadder(p);
  const n = String(p.number || "");
  const numTerm = n.includes("/") ? n.split("/")[0].replace(/^0+(?=\d)/, "") : n;
  const q = ["pokemon", p.name.replace(/[^\w\s&']/g, " "), numTerm, p.grader ? `${p.grader} ${p.grade}` : ""].join(" ").replace(/\s+/g, " ").trim();
  const filter = [
    "buyingOptions:{FIXED_PRICE|BEST_OFFER}",
    "itemLocationCountry:GB",
    `price:[${Math.floor(p.market * 0.3)}..${Math.ceil(p.market * 3)}]`,
    "priceCurrency:GBP",
  ].join(",");
  const url = `${API}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}&sort=price&limit=100`;
  const res = await fetch(url, { headers: { ...HEADERS, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`eBay ladder search failed (${res.status})`);
  return (await res.json()).itemSummaries || [];
}

// Full listing: seller type, exact postage, item specifics (cert number), availability.
// Returns { gone: true } when the listing has ended or sold out.
export async function getItem(env, token, itemId) {
  if (env.EBAY_MOCK === "1") return mockItem(itemId);
  const res = await fetch(`${API}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { gone: true };
  if (!res.ok) return null;
  const item = await res.json();
  const status = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
  const ended = item.itemEndDate && Date.parse(item.itemEndDate) < Date.now();
  if (status === "OUT_OF_STOCK" || ended) item.gone = true;
  return item;
}

// Listing price in GBP, or null when eBay doesn't give one (e.g. multi-variation listings).
export function itemPrice(x) {
  const v = x?.price?.value ?? x?.currentBidPrice?.value;
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? null : n;
}

export function shippingCost(x) {
  const v = x?.shippingOptions?.[0]?.shippingCost?.value;
  return v == null ? null : Number(v);
}

export function bigImage(url) {
  return url ? url.replace(/s-l\d+\./, "s-l500.") : null;
}

// The seller's own "Card Condition" field on an ungraded card, when they filled it in.
export function conditionFromItem(item) {
  const texts = [];
  for (const d of item?.conditionDescriptors || []) {
    if (/condition/i.test(d.name || "")) for (const v of d.values || []) texts.push(v.content || v.value || "");
  }
  for (const a of item?.localizedAspects || []) if (/card condition/i.test(a.name || "")) texts.push(a.value || "");
  for (const t of texts) { const c = parseCondition(t); if (c) return c; }
  return null;
}

export function certNumber(item, title) {
  const aspects = item?.localizedAspects || [];
  const a = aspects.find(x => /cert/i.test(x.name || ""));
  const fromAspect = a && String(a.value || "").match(/\d{7,10}/);
  if (fromAspect) return fromAspect[0];
  const fromTitle = String(title || "").match(/cert(?:ificat(?:e|ion))?\s*(?:no\.?|number|#)?\s*:?\s*(\d{7,10})/i);
  return fromTitle ? fromTitle[1] : null;
}
