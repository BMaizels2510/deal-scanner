// Turns data/pack-weights.csv (Wisewailmer's community pack-weight database: HEAVY = had a holo, LIGHT = no holo)
// into data/pack-weights.json, keyed by Pulse set id. Run after replacing the CSV with a newer export.
import { readFileSync, writeFileSync } from "node:fs";

const SET_IDS = {
  "Base Set": ["bsu", "bs1s", "bss"], "Jungle": ["base2"], "Fossil": ["base3"], "Base Set 2": ["base4"], "Team Rocket": ["tr"],
  "Gym Heroes": ["gym1"], "Gym Challenge": ["gym2"], "Neo Genesis": ["neo1"], "Neo Discovery": ["neo2"], "Neo Revelation": ["neo3"],
  "Neo Destiny": ["neo4"], "Legendary Collection": ["base6"], "Expedition Base Set": ["ecard1"], "Aquapolis": ["ecard2"], "Skyridge": ["ecard3"],
  "EX Ruby & Sapphire": ["ex1"], "EX Sandstorm": ["ex2"], "EX Dragon": ["ex3"], "EX Team Magma Team Aqua": ["ex4"], "EX Hidden legends": ["ex5"],
  "EX FireRed & LeafGreen": ["ex6"], "EX Team Rocket Returns": ["base5"], "EX Deoxys": ["ex8"], "EX Emerald": ["ex9"], "EX Unseen Forces": ["ex10"],
  "EX Delta Species": ["ex11"], "EX Legend Maker": ["ex12"], "EX Holon Phantoms": ["ex13"], "EX Crystal Guardians": ["ex14"],
  "EX Dragon Frontiers": ["ex15"], "EX Power Keepers": ["ex16"],
};

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(new URL("../data/pack-weights.csv", import.meta.url), "utf8"));
const headerIdx = rows.findIndex(r => r[0] === "Notes");
const header = rows[headerIdx];
const out = {};
for (let c = 1; c < header.length; c += 2) {
  const name = header[c].trim();
  const ids = SET_IDS[name];
  if (!ids) continue;
  const col = k => rows.slice(headerIdx + 1).map(r => parseFloat(r[k])).filter(v => Number.isFinite(v) && v > 10 && v < 30).sort((a, b) => a - b);
  const heavy = col(c), light = col(c + 1);
  if (!heavy.length || !light.length) continue;
  for (const id of ids) out[id] = { name, heavy, light };
}
writeFileSync(new URL("../data/pack-weights.json", import.meta.url), JSON.stringify(out));
console.log(Object.entries(out).filter(([id], i, a) => a.findIndex(x => x[1].name === out[id].name) === i)
  .map(([id, v]) => `${v.name}: ${v.heavy.length} heavy ${v.heavy[0]}–${v.heavy.at(-1)}g, ${v.light.length} light ${v.light[0]}–${v.light.at(-1)}g`).join("\n"));
