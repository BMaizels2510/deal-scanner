// Works out which catalogue product an eBay listing is, or why it isn't one.
// Rule-based: free, fast, and every rejection has a readable reason.

const GLOBAL_REJECT = [
  [/\b(proxy|replica|fake|custom|orica|reprint|unofficial|fan ?made|novelty|art ?card|metal card)\b/, "fake/custom"],
  [/\b(digital|code ?cards?|ptcgo|tcg ?live|online code)\b/, "code card/digital"],
  [/\b(empty|box only|no (cards?|packs?)|display only|case only|tin only|slab only|label only|wrapper only)\b/, "empty/packaging only"],
  [/\b(damaged|creased|crease|bent|water damage|poor condition|dented|heavily played|\bhp condition)\b/, "damaged"],
  [/read (the )?desc/, "read description"],
  [/\b(choose|pick (your|a|from)|you pick|select your|multi ?listing|lot of|job ?lot|joblot|bundle of|collection of|binder)\b/, "multi-item listing"],
  [/\b(sticker|poster|sleeves?|playmat|plush|figure|deck box|coin|pin badge|jumbo|oversized)\b/, "accessory/jumbo"],
];
const NOT_ENGLISH = /\b(japanese|japan|jpn|jp|korean|kor|chinese|chn|s-?chinese|t-?chinese|thai|indonesian|german|french|italian|spanish|portuguese)\b/;
const GRADED_WORD = /\b(psa|bgs|beckett|cgc|sgc|ace|tag|graded|slab(bed)?|gem ?mint|pristine)\b/;
const GRADE_TOKENS = /\b(psa|bgs|beckett|cgc|sgc|ace|tag)\s*(?:gem\s*mint|gem\s*mt|gem|mint|nm-?mt|pristine|black\s*label)?\s*(\d{1,2}(?:\.5)?)\b/g;
const CRACKED = /\b(cracked|crack|chipped|scuffed slab|broken slab)\b/;
const CONDITION = /\b(lightly played|moderately played|light play|lp|mp|played|excellent|exc|very good|vg|good condition|scratch(es|ed)?|whitening|wear|worn)\b/;
const OPENED = /\b(opened|unsealed|re-?sealed|no shrink|without shrink|loose packs?|weighed|searched|empty)\b/;
const MULTIPLES = /\b\d+\s*x\b|\bx\s*\d+\b|\b(two|three|four|2|3|4) (etbs|boxes|bundles|cards)\b/;
const VINTAGE_REPRINT = /\b(celebrations?|classic collection|25th|evolutions|reprint|xy12)\b/;
const STAMP_WORDS = /\b(stamp(ed)?|prize pack|league|winner|staff|pre-?release|professor|error|misprint|holiday calendar)\b/;
const NAME_STOP = new Set(["ex", "gx", "v", "vmax", "vstar", "mega", "team", "rocket", "the", "with", "and", "origin", "forme", "special", "delivery", "dark", "shining", "grey", "felt", "hat", "star"]);

// Stamps and editions: each must appear in the title exactly when the product has it.
const VARIANTS = [
  ["1st edition", /\b(1st|first)\s*ed(ition|\.)?\b|\b1st\b/],
  ["shadowless", /\bshadowless\b/],
  ["pokemon center", /pokemon cent(er|re)|\bpc stamp\b|\bpc\b/],
  ["25th anniversary", /\b25th\b/],
  ["prerelease", /pre-?release/],
  ["staff", /\bstaff\b/],
  ["professor program", /professor/],
];
const MATERIALS = [
  ["reverse holo", /\breverse\b/],
  ["cosmos holo", /\bcosmos\b/],
  ["poke ball", /\bpoke ?ball\b/],
  ["master ball", /\bmaster ?ball\b/],
];

export function normalise(t) {
  return (t || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")       // é -> e
    .toLowerCase()
    .replace(/[‘’`]/g, "'").replace(/'s\b/g, "s").replace(/'/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ").trim();
}

const normPart = s => {
  const m = String(s).toLowerCase().match(/^([a-z]*)0*(\d+)$/);
  return m ? m[1] + m[2] : String(s).toLowerCase();
};

function numberSpec(number) {
  if (!number) return null;
  const n = String(number);
  if (n.includes("/")) {
    const [a, b] = n.split("/");
    return { type: "frac", n: normPart(a), d: normPart(b) };
  }
  const code = n.match(/^([A-Za-z]+)0*(\d+)$/);
  if (code) return { type: "code", n: code[1].toLowerCase() + code[2] };
  return { type: "plain", n: normPart(n) };
}

function nameTokens(name) {
  return normalise(name).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !NAME_STOP.has(w));
}

function wordRe(n) {
  // "199" -> matches "199", "#199", "no. 199" but not "1199" or "199/165"'s denominator side handled elsewhere
  const m = n.match(/^([a-z]*)(\d+)$/);
  const body = m ? `${m[1]}\\s*0*${m[2]}` : n;
  return new RegExp(`(?<![a-z0-9/])(?:#\\s*|no\\.?\\s*)?${body}(?![0-9])`);
}

export function buildIndex(products, sets) {
  const bySet = {};
  for (const p of products) {
    const set = sets[p.set_id] || {};
    const prepared = {
      ...p,
      _num: numberSpec(p.number),
      _tokens: nameTokens(p.name),
      _promo: normalise(p.promo || ""),
      _material: normalise(p.material || ""),
      _vintage: !!set.vintage,
      _setTokens: normalise(set.q || "").split(" ").filter(w => !["pokemon", "holo", "sir", "promo", "wotc", "ex"].includes(w)),
    };
    (bySet[p.set_id] ||= []).push(prepared);
  }
  return bySet;
}

function parseTitle(t) {
  const fracs = [...t.matchAll(/(?<![a-z0-9])([a-z]{0,3}\d{1,3})\s*\/\s*([a-z]{0,3}\d{1,3})(?![0-9])/g)]
    .map(m => ({ n: normPart(m[1]), d: normPart(m[2]) }));
  const codes = [...t.matchAll(/\b(svp|swsh|sm|xy|bw|dp|hgss|mep)\s*[-#]?\s*(?:en\s*)?0*(\d{1,3})\b/g)].map(m => m[1] + m[2]);
  const grades = [...t.matchAll(GRADE_TOKENS)].map(m => ({ g: m[1] === "beckett" ? "bgs" : m[1], n: m[2] }));
  return { fracs, codes, grades };
}

function numberMatches(spec, parsed, t) {
  if (!spec) return false;
  if (spec.type === "frac") {
    if (parsed.fracs.some(f => f.n === spec.n && f.d === spec.d)) return true;
    // "Charizard ex 199 151" style titles: accept the bare number unless the title shows a different card from the same set.
    if (parsed.fracs.some(f => f.d === spec.d && f.n !== spec.n)) return false;
    return wordRe(spec.n).test(t);
  }
  if (spec.type === "code") return parsed.codes.includes(spec.n);
  return wordRe(spec.n).test(t) && /\b(promo|black star)\b/.test(t);
}

function variantProblem(t, p) {
  for (const [name, re] of VARIANTS) {
    const has = p._promo.includes(name);
    const inTitle = re.test(t);
    if (name === "shadowless" && p._promo.includes("1st edition")) continue; // 1st Edition Base is shadowless by definition
    if (has && !inTitle) return `not ${name}`;
    if (!has && inTitle) return `${name} variant not watched`;
  }
  if (!p._promo && STAMP_WORDS.test(t)) return "stamped/special variant";
  for (const [name, re] of MATERIALS) {
    const has = p._material.includes(name);
    const inTitle = re.test(t);
    if (has && !inTitle) return `not ${name}`;
    if (!has && inTitle) return `${name} not watched`;
  }
  if (p._vintage && VINTAGE_REPRINT.test(t)) return "reprint, not original";
  return null;
}

function matchSealed(t, candidates) {
  if (OPENED.test(t)) return { ok: false, reason: "opened/resealed" };
  if (MULTIPLES.test(t)) return { ok: false, reason: "multiple units" };
  const tPC = /pokemon cent(er|re)|\bpc\b/.test(t);
  const tETB = /elite trainer box|\betb\b/.test(t);
  const tBundle = /booster bundle/.test(t);
  const tBox = /booster box|booster display|36 (booster )?packs/.test(t);
  const hits = candidates.filter(p => {
    const n = normalise(p.name);
    if (!p._setTokens.every(w => t.includes(w))) return false;
    if (n.includes("elite trainer box")) return tETB && tPC === n.includes("pokemon center") && !/\bcase\b/.test(t);
    if (n.includes("booster bundle")) return tBundle && !/display|\bcase\b/.test(t);
    if (n.includes("booster box")) return tBox && !/\bcase\b/.test(t);
    return false;
  });
  if (hits.length === 1) return { ok: true, product: hits[0] };
  if (hits.length > 1) return { ok: false, reason: "ambiguous sealed product" };
  return { ok: false, reason: "sealed product not watched" };
}

const SEALED_WORDS = /\b(elite trainer box|etb|booster box|booster bundle|booster display|blister|tin|premium collection|collection box|build and battle)\b/;

// search.set_ids limits candidates to the sets that search covers.
export function matchListing(rawTitle, setIds, index) {
  const t = normalise(rawTitle);
  for (const [re, why] of GLOBAL_REJECT) if (re.test(t)) return { ok: false, reason: why };
  if (NOT_ENGLISH.test(t)) return { ok: false, reason: "not English" };

  const pool = setIds.flatMap(id => index[id] || []);
  const sealedPool = pool.filter(p => p.kind === "sealed");
  const cardPool = pool.filter(p => p.kind !== "sealed");

  if (SEALED_WORDS.test(t)) {
    if (!sealedPool.length) return { ok: false, reason: "sealed, not watched in this set" };
    return matchSealed(t, sealedPool);
  }

  const parsed = parseTitle(t);
  const distinctGrades = [...new Set(parsed.grades.map(g => `${g.g} ${g.n}`))];
  if (distinctGrades.length > 1) return { ok: false, reason: `mentions several grades (${distinctGrades.join(", ")})` };
  const grade = parsed.grades[0] || null;
  if (!grade && GRADED_WORD.test(t)) return { ok: false, reason: "graded but grade unclear" };
  if (grade && CRACKED.test(t)) return { ok: false, reason: "cracked slab" };

  let cards = cardPool.filter(p => numberMatches(p._num, parsed, t) && p._tokens.some(w => t.includes(w)));
  if (!cards.length) return { ok: false, reason: "card not in catalogue" };

  const variantReasons = [];
  cards = cards.filter(p => { const v = variantProblem(t, p); if (v) variantReasons.push(v); return !v; });
  if (!cards.length) return { ok: false, reason: variantReasons[0] };

  const pick = list => {
    const keys = [...new Set(list.map(p => p.card_key))];
    if (keys.length > 1) return { ok: false, reason: "ambiguous: matches several cards" };
    return list.length ? { ok: true, product: list[0] } : null;
  };

  if (grade) {
    const r = pick(cards.filter(p => p.kind === "slab" && p.grader.toLowerCase() === grade.g && p.grade === grade.n));
    return r ? (r.ok ? { ...r, grade } : r) : { ok: false, reason: `${grade.g.toUpperCase()} ${grade.n} not watched for this card` };
  }
  if (CONDITION.test(t)) return { ok: false, reason: "condition below NM" };
  const r = pick(cards.filter(p => p.kind === "raw"));
  return r ? (r.ok ? { ...r, grade: null } : r) : { ok: false, reason: "raw copy not watched for this card" };
}
