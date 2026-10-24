// Loose vintage booster packs: reads a stated pack weight and compares it with the community pack-weight database
// (data/pack-weights.json, from Wisewailmer's sheet). Heavier packs tend to hold a holo; lighter ones don't.
// Not a guarantee: the heavy and light ranges overlap, so only weights clear of the overlap get a firm call.
import WEIGHTS from "../data/pack-weights.json" with { type: "json" };
import { htmlToText } from "./condition.js";

// "21.6g", "21.60 grams", "weight: 21.6", "weighs 21,6g"
const WEIGHT = /(?:weigh(?:s|t|ing)?\s*:?\s*(?:approx\.?\s*|about\s*|is\s*)?)?(\d{2}[.,]\d{1,3})\s*(?:g|gr|grams?|gms?)\b|weigh(?:s|t|ing)?\s*:?\s*(\d{2}[.,]\d{1,3})/i;

export function packWeight(text) {
  const m = htmlToText(text).match(WEIGHT);
  if (!m) return null;
  const w = parseFloat((m[1] || m[2]).replace(",", "."));
  return w > 12 && w < 26 ? w : null;
}

export function sellerClaims(text) {
  const t = htmlToText(text).toLowerCase();
  return {
    heavy: /\bheavy\b/.test(t) && !/\b(not|isn'?t) heavy\b/.test(t),
    light: /\blight (pack|weight)\b|\bweighed light\b/.test(t),
    unweighed: /\bun-?weighed\b|\bnot (been )?weighed\b|\bnever weighed\b/.test(t),
    unsearched: /\bun-?searched\b|\bnot (been )?searched\b/.test(t),
  };
}

// cls: "Heavy" | "Light" | "Leans heavy" | "Leans light" | "Can't tell"
export function judgeWeight(setId, w) {
  const db = WEIGHTS[setId];
  if (!db || w == null) return null;
  const maxLight = db.light[db.light.length - 1], minHeavy = db.heavy[0];
  const near = arr => arr.filter(x => Math.abs(x - w) <= 0.05).length;
  const h = near(db.heavy), l = near(db.light);
  const base = { weight: w, set: db.name, samples: db.heavy.length + db.light.length, heavyNear: h, lightNear: l };
  if (w > maxLight + 0.01) return { ...base, cls: "Heavy", why: `heavier than all ${db.light.length} recorded no-holo ${db.name} packs (max ${maxLight}g)` };
  if (w < minHeavy - 0.01) return { ...base, cls: "Light", why: `lighter than all ${db.heavy.length} recorded holo ${db.name} packs (min ${minHeavy}g)` };
  if (h + l >= 4) {
    const pct = Math.round((h / (h + l)) * 100);
    const why = `${pct}% of ${h + l} recorded ${db.name} packs within 0.05g had a holo`;
    if (pct >= 75) return { ...base, cls: "Leans heavy", pct, why };
    if (pct <= 25) return { ...base, cls: "Leans light", pct, why };
    return { ...base, cls: "Can't tell", pct, why };
  }
  return { ...base, cls: "Can't tell", why: `too few recorded ${db.name} packs near ${w}g` };
}

export const hasWeightData = setId => !!WEIGHTS[setId];
