// PSA cert check via PSA's official public API (free token from psacard.com/publicapi).
// Confirms the cert exists and that its grade and card match what the listing claims.
import { normalise } from "./match.js";

export async function verifyCert(env, cert, product) {
  if (!cert) return "no cert";
  if (env.EBAY_MOCK === "1") return cert.endsWith("0") ? "mismatch" : "verified";
  if (!env.PSA_TOKEN) return "unchecked";
  try {
    const res = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(cert)}`, {
      headers: { Authorization: `bearer ${env.PSA_TOKEN}` },
    });
    if (!res.ok) return "unchecked";
    const c = (await res.json())?.PSACert;
    if (!c) return "mismatch";
    const gradeOk = new RegExp(`\\b${String(product.grade).replace(".", "\\.")}\\b`).test(String(c.CardGrade || ""));
    const subject = normalise(`${c.Subject || ""} ${c.Variety || ""}`);
    const nameOk = normalise(product.name).split(" ").filter(w => w.length >= 4 && !["mega", "team"].includes(w)).some(w => subject.includes(w));
    const numOk = !c.CardNumber || String(product.number || "").replace(/^0+/, "").startsWith(String(c.CardNumber).replace(/^0+/, ""));
    return gradeOk && nameOk && numOk ? "verified" : "mismatch";
  } catch {
    return "unchecked";
  }
}
