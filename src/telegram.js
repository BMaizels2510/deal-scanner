// Telegram alerts: photo, the numbers, and a button straight to the listing.

const gbp = n => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gbp0 = n => (n < 0 ? "-£" : "£") + Math.abs(Math.round(n)).toLocaleString("en-GB");
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return res.ok;
}

export function telegramReady(env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

export async function sendDealAlert(env, d) {
  if (!telegramReady(env)) return false;
  const c = d.condition;
  const srcText = c && (c.src === "listing" ? "seller's condition field" : c.src === "description" ? `description: ${(c.desc?.defects || []).join(", ")}${c.stated ? `; seller said ${c.stated}` : ""}` : "from title");
  const condLine = c ? (c.src ? `Condition: <b>${esc(c.label)}</b> (${esc(srcText)})${c.desc?.hedge ? " ⚠️ judge from photos" : ""}`
                              : `Condition: <b>not stated</b>, priced as ${esc(c.label)}${c.desc?.hedge ? " ⚠️ judge from photos" : ""}`) : null;
  const src = d.market_source === "eBay sold" ? "eBay sold" : "Pulse";
  const mkt = d.nm_market != null
    ? `${src} ${c.code} ${gbp(d.market)}${c.priced === "estimate" ? " (estimate)" : ""} · NM ${gbp0(d.nm_market)}`
    : d.market_source === "eBay sold" ? `eBay sold ${gbp(d.market)} (Pulse ${gbp0(d.pulse_market)})` : `Pulse ${gbp(d.market)}`;
  const lines = [
    `<b>${esc(d.label)}</b> · <b>${esc(String(d.title || "").slice(0, 110))}</b>`,
    `Pulse match: ${esc(d.name)}${d.grade ? " · " + esc(d.grade) : ""}${d.qty > 1 ? ` × ${d.qty}` : ""} · ${[d.set_name, d.number].filter(Boolean).map(esc).join(" ")}`,
    condLine,
    d.qty > 1 ? `📦 ${esc(d.qty_note)} at ${gbp(d.each)} each` : null,
    d.pack ? (d.pack.judge ? `⚖️ <b>${d.pack.judge.weight}g: ${esc(d.pack.judge.cls)}</b> (${esc(d.pack.judge.why)})` : d.pack.heavy ? "⚖️ Seller says heavy, no weight given" : d.pack.unweighed ? "⚖️ Unweighed" : "⚖️ No weight given") : null,
    `${gbp(d.price)}${d.post != null ? ` + ${gbp(d.post)} post` : " (check postage)"} = <b>${gbp(d.total)}</b>`,
    `${mkt} → <b>${gbp0(d.net)} under (${d.pct.toFixed(1)}%)</b>`,
    `Resell on eBay: ${gbp0(d.resale_net)} · To Mania: ${gbp0(d.mania_net)}`,
  ];
  if (d.hold_cls) lines.push(`${esc(d.hold_cls)}: ${d.hold_days == null ? "no recent sales" : "~" + Math.max(1, Math.round(d.hold_days)) + " days to sell"}${d.ladder_summary ? " · " + esc(d.ladder_summary) : ""}`);
  if (d.grade_gain != null && d.grade_gain > 0) lines.push(`Grading play: ${gbp0(d.grade_gain)} expected after grading`);
  lines.push(`Confidence ${d.conf}/100 · ${esc(d.format)} · ${d.account_type === "BUSINESS" ? "Business" : d.account_type === "INDIVIDUAL" ? "Private" : "Unknown"} seller ${esc(d.feedback || "")}`);
  if (d.cert_status === "verified") lines.push("PSA cert verified");
  const caption = lines.filter(Boolean).join("\n").slice(0, 1020);
  const reply_markup = { inline_keyboard: [[{ text: "Open on eBay", url: d.url }]] };
  if (d.image && await call(env, "sendPhoto", { chat_id: env.TELEGRAM_CHAT_ID, photo: d.image, caption, parse_mode: "HTML", reply_markup })) return true;
  return call(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: caption, parse_mode: "HTML", reply_markup });
}

export async function sendText(env, text, button) {
  if (!telegramReady(env)) return false;
  const body = { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (button) body.reply_markup = { inline_keyboard: [[button]] };
  return call(env, "sendMessage", body);
}

// One hunt find: photo, the numbers and a button to the listing.
export async function sendHuntCard(env, h, sets) {
  if (!telegramReady(env)) return false;
  const p = h.p;
  const grade = p.grader ? ` · ${p.grader} ${p.grade}` : p.kind === "raw" ? ` · ${h.condCode}${h.condStated ? "" : " (condition not in title, priced as " + h.condCode + ")"}` : "";
  const lines = [
    `<b>🔎 ${esc(String(h.i.title).slice(0, 110))}</b>`,
    `Pulse match: ${esc(p.name)}${esc(grade)} · ${[sets[p.set_id]?.name, p.number].filter(Boolean).map(esc).join(" ")}`,
    `${gbp(h.price)}${h.post != null ? ` + ${gbp(h.post)} post` : " (check postage)"} = <b>${gbp(h.calc.total)}</b>`,
    `Pulse ${p.kind === "raw" ? h.condCode + " " : ""}${gbp(h.market)} → <b>${gbp0(h.calc.net)} under (${h.calc.pct.toFixed(1)}%)</b>`,
    `${p.s30 ?? 0} sales in 30 days · ${esc(h.s.label === "Neutral" ? "Opportunity" : h.s.label)}`,
  ];
  const caption = lines.filter(Boolean).join("\n").slice(0, 1020);
  const reply_markup = { inline_keyboard: [[{ text: "Open on eBay", url: h.i.itemWebUrl }]] };
  const img = h.i.image?.imageUrl ? h.i.image.imageUrl.replace(/s-l\d+\./, "s-l500.") : null;
  if (img && await call(env, "sendPhoto", { chat_id: env.TELEGRAM_CHAT_ID, photo: img, caption, parse_mode: "HTML", reply_markup })) return true;
  return call(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text: caption, parse_mode: "HTML", reply_markup, disable_web_page_preview: true });
}

// Telegram setup: point the bot at the worker and list the hunt commands in its menu.
export async function setupTelegram(env, url, secret) {
  const res = [];
  for (const [method, body] of [
    ["setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true }],
    ["setMyCommands", { commands: [
      ["sir", "Hunt modern Special Illustration Rares"], ["alt", "Hunt alt arts"], ["promos", "Hunt promos"],
      ["ex", "Hunt early EX era"], ["goldstars", "Hunt Gold Stars"], ["wotc", "Hunt WOTC holos"],
      ["ereader", "Hunt Expedition / Aquapolis / Skyridge"], ["packs", "Hunt vintage booster packs"],
      ["sealed", "Hunt modern sealed"], ["more", "Next batch of the last hunt"], ["help", "What the bot can do"],
    ].map(([command, description]) => ({ command, description })) }],
  ]) {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    res.push({ method, ...(await r.json().catch(() => ({ ok: r.ok }))) });
  }
  return res;
}
