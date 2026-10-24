// Reads a raw card's condition from the seller's own words: the listing description and condition notes.
// A word bank of defects (each with a weight), softened or hardened by words like "slight" or "heavy",
// ignored when negated ("no scratches") or when the sentence is about postage.
// Each kind of flaw counts once (at its worst). Total weight -> condition: under 2 = LP, 2-4 = MP, 5+ = HP;
// creases, tears and water damage = DMG.

export const COND_ORDER = ["NM", "LP", "MP", "HP", "DMG"];
export const worstCondition = (...codes) =>
  codes.filter(Boolean).sort((a, b) => COND_ORDER.indexOf(b) - COND_ORDER.indexOf(a))[0] || null;

// [pattern, label, weight] — weight "DMG" / "HP" sets that condition outright.
const DEFECTS = [
  [/water ?damage[d]?|water ?marks?|liquid damage|got wet/, "water damage", "DMG"],
  [/creas(e|es|ed|ing)/, "crease", "DMG"],
  [/\btear\b|\btorn\b|\bripped\b|\brip\b|missing (a )?(piece|chunk)/, "tear", "DMG"],
  [/\bink\b|pen marks?|writing on|written on|marker|sticker residue|glue/, "ink / writing", "HP"],
  [/heavy (wear|whitening|play|scratch(es|ing)?)|heavily (played|worn|scratched)|well (played|loved|used)|binder dent/, "heavy wear", "HP"],
  [/\bbent\b|\bbend(s|ing)?\b|\bfold(ed)?\b/, "bend", 3],
  [/(holo )?(lift(ing|ed)?|bubbl(e|es|ing)|peel(ing|ed)?|delaminat\w*)/, "lift / peeling", 3],
  [/\bbow(ed|ing)?\b|warp(ed|ing)?|\bcurl(ed|ing|s)?\b/, "bow / warp", 2],
  [/\bdent(s|ed)?\b|\bdings?\b|indent(s|ation)?|\bnicks?\b|impression/, "dent", 2],
  [/scratches|scratched|scratching/, "scratches", 2],
  [/(holo )?\bscratch\b/, "scratch", 1],
  [/fad(ed|ing)|discolou?r(ed|ation)?|yellow(ed|ing)|stain(s|ed)?|sun ?damage/, "fading / stain", 2],
  [/\bdamp\b|smoke|musty/, "damp / smoke", 2],
  [/whiten(ing|ed)|white (edges|corners|marks|spots)|silvering|edge ?wear|worn edges|edge (damage|chipping|wear)|chipping|chipped/, "whitening / edge wear", 1],
  [/corner (wear|damage|dings?)|soft corners|rounded corners|worn corners/, "corner wear", 1],
  [/scuff(s|ed|ing)?|surface (wear|marks?|damage|scratch\w*)|print lines?|roller marks?/, "scuffs / surface wear", 1],
  [/(light|some|minor|slight) (play|wear)|\bplayed\b|\bwear\b|\bworn\b/, "wear", 1],
];
const OFF_CENTRE = /off[- ]?cent(er|re)(ed)?|miscut|poor(ly)? cent(er|re)(d|ing)?/;
const SOFTEN = /(slight(ly)?|light(ly)?|minor|small|tiny|faint|minimal|very light|a little|little|barely|hardly)\W+(\w+\W+){0,2}$/;
const HARDEN = /(heavy|heavily|major|significant|lots of|lot of|bad(ly)?|severe|big|noticeable|obvious|large|deep|multiple|several)\W+(\w+\W+){0,2}$/;
const NEGATE = /\b(no|not|without|free of|zero|never|nor|any)\W+(\w+\W+){0,3}$/;
const BOILERPLATE = /\b(ship(ping|ped)?|post(age|ed|ing)?|deliver(y|ed)?|dispatch\w*|courier|returns?|refunds?|transit|packag\w*|payment|feedback|combined|royal mail|tracked|bubble wrap|top ?loaders?|penny sleeves?|team bags?|insured|evri|parcel)\b/;
const HEDGE = /(assess|judge|decide|determine|check) (the )?(card'?s? )?condition|condition (is )?(shown )?in (the )?(photos|pictures|pics|images)|(see|refer to|check|view) (the )?(photos|pictures|pics|images) for (the )?condition|sold as seen|as pictured|grade (it )?yourself|use your own judg(e)?ment/;
const POSITIVE = /pack fresh|fresh (from|out of) (the )?pack|straight (from|out of) (the )?(pack|booster)|sleeved (immediately|straight away|from pack)|\bnear mint\b|\bmint\b|\bnm\b|\bclean\b|\bperfect\b|flawless|never played|immaculate/;

export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/li|li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;|&#\d+;/g, " ");
}

// text: the seller's description and condition notes (HTML is fine).
// Returns { level, points, defects: [labels], positive: [phrases], hedge, offCentre } — level null when it says nothing either way.
export function readDescription(text) {
  const plain = htmlToText(text).slice(0, 20000).toLowerCase().replace(/[‘’`]/g, "'");
  const sentences = plain.split(/[.!?\n•|;]+/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean)
    .filter(s => !BOILERPLATE.test(s));
  let outright = null, hedge = false, offCentre = false;
  const worst = {};   // label -> heaviest weight seen
  const defects = [], positive = [];
  for (const s of sentences) {
    if (HEDGE.test(s)) hedge = true;
    if (OFF_CENTRE.test(s)) offCentre = true;
    const p = s.match(POSITIVE); if (p && !NEGATE.test(s.slice(0, p.index))) positive.push(p[0]);
    const taken = [];   // character ranges already matched in this sentence (so "holo scratch" isn't also a "scratch")
    for (const [re, label, weight] of DEFECTS) {
      const g = new RegExp(re.source, "g");
      let m;
      while ((m = g.exec(s))) {
        const start = m.index, end = m.index + m[0].length;
        if (taken.some(([a, b]) => start < b && end > a)) continue;
        taken.push([start, end]);
        const before = s.slice(Math.max(0, start - 40), start);
        if (NEGATE.test(before)) continue;
        if (typeof weight === "string") { outright = worstCondition(outright, weight); defects.push(label); continue; }
        let w = weight;
        if (SOFTEN.test(before)) w = Math.max(0.5, w - 1);
        else if (HARDEN.test(before)) w += 1;
        if (!(label in worst) || w > worst[label].w) worst[label] = { w, text: (SOFTEN.test(before) ? "slight " : HARDEN.test(before) ? "heavy " : "") + label };
      }
    }
  }
  let points = Object.values(worst).reduce((a, x) => a + x.w, 0);
  defects.push(...Object.values(worst).map(x => x.text));
  if (hedge && (points > 0 || outright)) points += 1;   // "judge from the photos" alongside a known flaw: the seller isn't vouching
  const fromPoints = points <= 0 ? null : points < 2 ? "LP" : points < 5 ? "MP" : "HP";
  const level = worstCondition(outright, fromPoints) || (positive.length ? "NM" : null);
  return { level, points, defects: [...new Set(defects)], positive: [...new Set(positive)], hedge, offCentre };
}
