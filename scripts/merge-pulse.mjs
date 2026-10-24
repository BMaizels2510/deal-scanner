// Merges a Pulse refresh (data/pulse-refresh.json) into data/catalogue.json.
// - Products in the refresh get today's prices, trends and sales.
// - New products that appear in the category screens are added (if their set is known).
// - Products missing from the refresh keep their last values and are reported as stale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const catPath = new URL("../data/catalogue.json", import.meta.url);
const refPath = new URL("../data/pulse-refresh.json", import.meta.url);
if (!existsSync(refPath)) { console.error("data/pulse-refresh.json not found"); process.exit(1); }

const cat = JSON.parse(readFileSync(catPath, "utf8"));
const ref = JSON.parse(readFileSync(refPath, "utf8"));
const col = Object.fromEntries(cat.columns.map((c, i) => [c, i]));
const byId = new Map(cat.products.map(r => [r[col.id], r]));
const setOf = id => id.split(":")[1].split("|")[0];

let updated = 0, added = 0, skipped = [];
const seen = new Set();
for (const r of ref.rows) {
  const id = r[col.id];
  seen.add(id);
  const cur = byId.get(id);
  if (cur) {
    for (const k of ["name", "number", "market", "t7", "t30", "s7", "s30", "src"]) cur[col[k]] = r[col[k]];
    for (const k of ["p10", "lp", "url", "mp", "hp"].filter(k => col[k] != null)) if (r[col[k]] != null && r[col[k]] !== "") cur[col[k]] = r[col[k]];
    updated++;
  } else if (cat.sets[setOf(id)]) {
    cat.products.push(r); byId.set(id, r); added++;
  } else skipped.push(id);
}
const gradeOf = id => { const [g, n] = id.split("|").slice(4); return id.startsWith("sealed") ? "sealed" : g && g !== "null" ? `${g} ${n}` : "raw"; };
const stale = cat.products.filter(r => !seen.has(r[col.id])).map(r => `${r[col.name]} (${gradeOf(r[col.id])})`);

cat.updated_at = ref.fetched_at;
// One product per line keeps diffs readable in GitHub.
const rows = cat.products.map(r => "    " + JSON.stringify(r)).join(",\n");
writeFileSync(catPath, JSON.stringify({ ...cat, products: "__ROWS__" }, null, 2).replace('"__ROWS__"', "[\n" + rows + "\n  ]") + "\n");
console.log(`Merged Pulse refresh of ${ref.fetched_at}: ${updated} updated, ${added} added, ${stale.length} not in this refresh (kept last values).`);
if (skipped.length) console.log(`Skipped ${skipped.length} with unknown sets (add the set to catalogue.json first): ${skipped.slice(0, 5).join(", ")}`);
if (stale.length) console.log(`Not refreshed: ${stale.slice(0, 10).join("; ")}${stale.length > 10 ? "…" : ""}`);
