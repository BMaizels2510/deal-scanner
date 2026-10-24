// The report page. Same design as the prototype, filled with real scanner data.

export function renderReport(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Mania Deal Scanner</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --bg:#EEF1F5; --surface:#FFFFFF; --ink:#152132; --muted:#5B6878; --line:#D7DDE5;
  --accent:#2350C8; --accent-soft:#E3EAFB; --on-accent:#FFFFFF;
  --good:#127A4B; --good-soft:#DDF3E8; --warn:#A35A00; --warn-soft:#FBEBD5; --bad:#B4282E; --bad-soft:#FADDDE;
  --hot:#B53A12; --hot-soft:#FCE3D6; --tile:#DCE3EC; --tile-ink:#33435A;
  --f-display:"Bricolage Grotesque","Avenir Next",system-ui,sans-serif;
  --f-body:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){:root{
  --bg:#0E141C; --surface:#16202C; --ink:#E6ECF3; --muted:#93A1B2; --line:#26323F;
  --accent:#7D9DF5; --accent-soft:#1D2A47; --on-accent:#0E141C;
  --good:#4FD08F; --good-soft:#143326; --warn:#F0A44A; --warn-soft:#3A2A14; --bad:#F2777C; --bad-soft:#3B1C1F;
  --hot:#FF8A5B; --hot-soft:#3D2016; --tile:#1F2B39; --tile-ink:#B5C3D4; color-scheme:dark}}
*{box-sizing:border-box}
html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.5}
img{max-width:100%}
[hidden]{display:none!important}
.wrap{max-width:1120px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:20px}
.num{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
header{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px}
.eyebrow{font-family:var(--f-mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
h1{font-family:var(--f-display);font-weight:800;font-size:clamp(28px,4.4vw,40px);line-height:1.05;margin:4px 0 0;letter-spacing:-.01em;text-wrap:balance}
h2{font-family:var(--f-display);font-weight:700;font-size:17px;margin:0}
.run{font-size:13px;color:var(--muted);text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
select{font:500 13px var(--f-body);background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
.notice{border-radius:10px;padding:10px 14px;font-size:13.5px;background:var(--accent-soft)}
.notice.err{background:var(--bad-soft);color:var(--bad)}
.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.summary div{background:var(--surface);padding:14px 16px;display:flex;flex-direction:column;gap:2px}
.summary .k{font-size:12px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.summary .v{font-family:var(--f-display);font-weight:700;font-size:26px;font-variant-numeric:tabular-nums}
.summary .v.good{color:var(--good)}
.scanline{font-size:13px;color:var(--muted)}
@media (max-width:640px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.run{align-items:flex-start;text-align:left}}

.marketrow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
@media (max-width:900px){.marketrow{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:480px){.marketrow{grid-template-columns:repeat(2,minmax(0,1fr))}}
.mkt{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.mkt .n{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mkt .v{font-family:var(--f-display);font-weight:700;font-size:22px;font-variant-numeric:tabular-nums}
.mkt .s{font-size:11.5px;color:var(--muted);font-family:var(--f-mono)}
.sect{display:flex;flex-direction:column;gap:10px}
.sect .hint{font-size:12.5px;color:var(--muted);margin:0}
.watch{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}
.wcard{flex:0 0 auto;min-width:210px;max-width:260px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--hot);border-radius:10px;padding:10px 12px;text-decoration:none;color:var(--ink);display:flex;flex-direction:column;gap:2px}
.wcard b{font-family:var(--f-display);font-size:14.5px}
.wcard span{font-size:12px;color:var(--muted);font-family:var(--f-mono)}
.wcard .up{color:var(--hot);font-weight:600}

.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.filters button{font:500 13px var(--f-body);border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 14px;cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
button:focus-visible,a:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.filters .sort{margin-left:auto;font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center}
.list{display:flex;flex-direction:column;gap:14px}
.empty{background:var(--surface);border:1px dashed var(--line);border-radius:14px;padding:28px;text-align:center;color:var(--muted)}

.deal{background:var(--surface);border:1px solid var(--line);border-radius:14px;display:grid;grid-template-columns:132px minmax(0,1fr) 250px;gap:18px;padding:16px}
.deal.flag{border-color:var(--good)}
.deal.st-bad,.deal.is-gone{opacity:.6}
@media (max-width:860px){.deal{grid-template-columns:104px minmax(0,1fr)}.deal .side{grid-column:1 / -1}}
.photo{aspect-ratio:1;max-width:100%;border-radius:10px;background:var(--tile);color:var(--tile-ink);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;text-decoration:none;overflow:hidden}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.photo svg{width:56%;height:auto}
.photo small{font-family:var(--f-mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.8;text-align:center;padding:0 4px}
.photo:hover{outline:2px solid var(--accent)}
.main{display:flex;flex-direction:column;gap:10px;min-width:0}
.titlerow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.title{font-family:var(--f-display);font-weight:700;font-size:19px;line-height:1.2;text-decoration:none;color:var(--ink)}
.title:hover{color:var(--accent)}
.pill{font:700 11px var(--f-body);letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.pill.Opportunity{background:var(--good-soft);color:var(--good)}
.pill.Hot{background:var(--hot-soft);color:var(--hot)}
.pill.Bullish{background:var(--good-soft);color:var(--good)}
.pill.Bearish,.pill.Check-cert,.pill.Check-price{background:var(--bad-soft);color:var(--bad)}
.pill.New-release{background:var(--warn-soft);color:var(--warn)}
.pill.Neutral{background:var(--bg);color:var(--muted)}
.raw{font-size:12.5px;color:var(--muted);font-family:var(--f-mono);overflow-wrap:anywhere}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:6px;background:var(--bg);color:var(--muted);letter-spacing:.02em}
.tag.instant{background:var(--good-soft);color:var(--good)}
.tag.warn{background:var(--warn-soft);color:var(--warn)}
.tag.good{background:var(--good-soft);color:var(--good)}
.tag.bad{background:var(--bad-soft);color:var(--bad)}
.tag.bought{background:var(--accent-soft);color:var(--accent)}
.maths{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:1px;background:var(--line);border-radius:10px;overflow:hidden;border:1px solid var(--line)}
.maths div{background:var(--surface);padding:8px 10px;display:flex;flex-direction:column}
.maths .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.maths .v{font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-weight:500;font-size:15px}
.maths .sub{font-size:11px;color:var(--muted);font-family:var(--f-mono)}
.maths .diff .v{font-weight:600}
.exits{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.exit{border:1px dashed var(--line);border-radius:10px;padding:7px 10px;display:flex;justify-content:space-between;gap:8px;align-items:baseline;font-size:12.5px;color:var(--muted)}
.exit b{font-family:var(--f-mono);font-size:14px;color:var(--ink)}
.exit.grading{border-color:var(--good);background:var(--good-soft);color:var(--good)}
.exit.grading b{color:var(--good)}
.pos{color:var(--good)!important}.neg{color:var(--bad)!important}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.btn{font:600 13px var(--f-body);text-decoration:none;border-radius:8px;padding:7px 14px;border:1px solid var(--line);color:var(--ink);background:var(--surface);cursor:pointer}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.btn.small{font-size:12px;padding:5px 10px;font-weight:500}
.btn:hover{border-color:var(--accent)}
.actions .spacer{flex:1}
.side{display:flex;flex-direction:column;gap:10px;border-left:1px solid var(--line);padding-left:18px;min-width:0}
@media (max-width:860px){.side{border-left:0;padding-left:0;border-top:1px solid var(--line);padding-top:12px}}
.conf{display:flex;align-items:center;gap:12px}
.ring{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;flex:none}
.ring span{width:46px;height:46px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font:700 17px var(--f-display);font-variant-numeric:tabular-nums}
.conf .lbl{display:flex;flex-direction:column;gap:2px}
.conf .lbl b{font-family:var(--f-display);font-size:15px}
.small-muted{font-size:11.5px;color:var(--muted)}
.trend{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.trend div{background:var(--bg);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column}
.trend .k{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.trend .v{font-family:var(--f-mono);font-size:13.5px;font-weight:600}
.depth{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:10px;padding:9px 10px}
.depth .row{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)}
.depth .row b{font-family:var(--f-mono);font-size:12.5px;color:var(--ink);font-weight:600;text-align:right}
.hold{font:700 11px var(--f-body);letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;align-self:flex-start}
.hold.q{background:var(--good-soft);color:var(--good)}.hold.n{background:var(--bg);color:var(--muted)}.hold.l{background:var(--warn-soft);color:var(--warn)}.hold.v{background:var(--bad-soft);color:var(--bad)}
.ladder{position:relative;height:22px;border-radius:6px;background:var(--bg);margin-top:2px}
.ladder i{position:absolute;top:5px;width:3px;height:12px;border-radius:2px;background:var(--muted);opacity:.7}
.ladder i.pm{background:var(--accent);opacity:1;width:2px;top:2px;height:18px}
.ladder i.you{background:var(--good);opacity:1;width:5px;top:3px;height:16px}
.ladder-cap{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);font-family:var(--f-mono)}
.ladder-key{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--muted)}
.ladder-key span{display:inline-flex;align-items:center;gap:4px}
.ladder-key i{display:inline-block;width:4px;height:11px;border-radius:2px}
.k-you{background:var(--good)}.k-pm{background:var(--accent);width:2px!important}.k-ask{background:var(--muted);opacity:.7}
.factors{display:flex;flex-wrap:wrap;gap:5px}
.factor{font-size:11px;padding:2px 7px;border-radius:5px;font-weight:600}
.factor.g{background:var(--good-soft);color:var(--good)}.factor.w{background:var(--warn-soft);color:var(--warn)}.factor.b{background:var(--bad-soft);color:var(--bad)}
details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
summary{cursor:pointer;font-weight:600;font-family:var(--f-display);font-size:16px}
details p,details li{max-width:72ch;font-size:14px}
details ul{padding-left:18px;display:flex;flex-direction:column;gap:4px}
.rej{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.rej div{display:flex;gap:10px;font-size:12.5px;border-bottom:1px solid var(--line);padding-bottom:6px;min-width:0}
.rej .r{flex:0 0 170px;color:var(--bad);font-weight:600}
.rej .t{color:var(--muted);font-family:var(--f-mono);overflow-wrap:anywhere;min-width:0}
@media (max-width:560px){.rej div{flex-direction:column;gap:2px}.rej .r{flex:none}}
footer{font-size:12px;color:var(--muted);max-width:80ch}
.acc{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.acc .nums{display:flex;flex-wrap:wrap;gap:18px}
.acc .nums div{display:flex;flex-direction:column;gap:2px;min-width:0}
.acc .nums .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.acc .nums .v{font-family:var(--f-display);font-weight:700;font-size:22px;font-variant-numeric:tabular-nums}
.acc .bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden;display:flex}
.acc .bar i{display:block;height:100%}
.acc .why{display:flex;flex-wrap:wrap;gap:6px}
.review{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border-top:1px dashed var(--line);padding-top:10px}
.review .q{font-size:12.5px;color:var(--muted);margin-right:4px}
.review .btn[aria-pressed="true"].good{background:var(--good-soft);color:var(--good);border-color:var(--good)}
.review .btn[aria-pressed="true"].bad{background:var(--bad-soft);color:var(--bad);border-color:var(--bad)}
.review .btn[aria-pressed="true"].fake{background:var(--warn-soft);color:var(--warn);border-color:var(--warn)}
.reasons{display:flex;flex-wrap:wrap;gap:6px;width:100%}
.reasons button{font-size:12px;padding:5px 9px;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--text);cursor:pointer}
.reasons button[aria-pressed="true"]{border-color:var(--bad);color:var(--bad);background:var(--bad-soft)}
.reasons input{flex:1 1 220px;min-width:0;font:inherit;font-size:12.5px;padding:5px 9px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text)}
.tag.fixed{background:var(--good-soft);color:var(--good)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <div class="eyebrow">End-of-day report · eBay UK · Pokémon</div>
      <h1>Mania Deal Scanner</h1>
    </div>
    <div class="run">
      <label class="small-muted" for="daypick">Report day</label>
      <select id="daypick"></select>
      <span class="num" id="pricesAsOf"></span>
    </div>
  </header>

  <div class="notice err" id="errbox" hidden></div>
  <div class="notice" id="mockbox" hidden><b>Test mode.</b> The scanner is using built-in sample listings, not live eBay. Add your eBay keys to go live.</div>

  <section class="summary" aria-label="Summary">
    <div><span class="k">Flagged</span><span class="v" id="s-count">0</span></div>
    <div><span class="k">Instant alerts</span><span class="v" id="s-instant">0</span></div>
    <div><span class="k">Net under market</span><span class="v good num" id="s-net">£0</span></div>
    <div><span class="k">Avg confidence</span><span class="v" id="s-conf">–</span></div>
  </section>
  <div class="scanline" id="scanline"></div>

  <section class="sect" aria-labelledby="acc-h">
    <h2 id="acc-h">Match accuracy</h2>
    <p class="hint">Your verdicts on every flagged deal, all days. Mark each one right, wrong (and why) or fake. Wrong matches become new rules; "fixed" counts wrong ones today's rules would now turn away or price differently.</p>
    <div class="acc" id="acc"></div>
  </section>

  <section class="sect" aria-labelledby="mkt-h">
    <h2 id="mkt-h">Market by category</h2>
    <p class="hint">Median 30-day price change across the cards the scanner watches in each category. Arrows compare with a week ago once history builds up.</p>
    <div class="marketrow" id="market"></div>
  </section>

  <section class="sect" aria-labelledby="watch-h" id="watchsect">
    <h2 id="watch-h">Cards to watch</h2>
    <p class="hint">Selling noticeably faster than their 30-day pace with the price holding. Not a forecast; this signal hasn't been backtested yet.</p>
    <div class="watch" id="watch"></div>
  </section>

  <div class="filters" role="toolbar" aria-label="Filter deals" id="filters">
    <label class="sort" for="sortby">Sort
      <select id="sortby">
        <option value="net">Net £ under market</option>
        <option value="pct">% under market</option>
        <option value="conf">Confidence</option>
        <option value="resale">Profit if resold</option>
        <option value="speed">Quickest to sell</option>
        <option value="new">Newest</option>
      </select>
    </label>
  </div>

  <div class="list" id="list"></div>

  <details>
    <summary>How the numbers work</summary>
    <p><b>Total in</b> is what you pay: listed price plus postage. On UK private-seller listings eBay already includes its Buyer Protection fee in the shown price, so it's shown for reference, not added twice.</p>
    <p><b>Market</b> is eBay: once a card has at least 4 sales in our own sold record over 30 days, their median is the market price. Until then Pulse stands in as the quick comp. When the two differ by more than 10% the deal says so. <b>Under market</b> is that market price minus your total in. <span id="rules"></span></p>
    <p><b>Exits</b> show what you'd clear: <b>Resell</b> is the market price after eBay selling fees and postage, minus what you paid. <b>To Mania</b> is your agreed markup on cost. <b>Grading play</b> appears on raw cards when the expected graded value (PSA 10 rate × PSA 10 price, the rest valued near raw, minus grading cost) beats what you'd pay by a clear margin. PSA 10 rates come from population reports, which flatter the odds because people submit their best copies.</p>
    <p><b>Labels</b> come from the backtest on a year of Pulse prices:</p>
    <ul>
      <li><b>Hot:</b> selling well above its normal pace with the price holding. The momentum play; not yet backtested.</li>
      <li><b>Bullish / Bearish:</b> up or down more than 10% over 30 days and still moving that way. This mattered for sealed and raw cards, not for slabs.</li>
      <li><b>New release:</b> singles from sets out less than <span id="nrdays"></span> days. In the backtest these kept falling for months.</li>
      <li><b>Opportunity:</b> under market with none of the warnings above.</li>
      <li><b>Check cert / Check price:</b> the PSA cert doesn't match, or Pulse's price for this slab looks wrong.</li>
    </ul>
    <p><b>Time to sell</b> assumes you resell at the Pulse price. It divides the listings already queued at or below that price by how many sell per day (Pulse sales, plus our own sold record once it builds): under a week is a quick flip, over a month a long hold. The ladder shows every other UK listing of the same card and grade against Pulse and this deal. Our sold record comes from listings that drop off the ladder between checks; it can't see Best Offer prices, so treat it as a guide.</p>
    <p><b>Confidence</b> (0–100) weighs those signals differently for sealed, raw and graded, then adds liquidity (sales in 30 days), the category's trend, your own price history once it builds up, and how far under market you're buying. It is a guide, not a prediction.</p>
    <p>Mark deals as <b>Bought</b>, and review each one: <b>Right</b>, <b>Wrong</b> (pick why) or <b>Fake card</b>. Wrong matches are how the rules get tightened; download the review CSV from the accuracy panel and send it to Claude.</p>
  </details>

  <details id="rejbox">
    <summary>Recent rejections</summary>
    <p class="hint">The latest listings the title rules turned away, with the reason. If a real deal shows up here, the rule needs loosening.</p>
    <div class="rej" id="rejects"></div>
  </details>

  <footer>Market values, sales volumes and grading rates from Pulse (pulsetcg.io). Listings from eBay UK. <span id="catsize"></span></footer>
</div>

<script>
const DATA = ${json};
const CAT = { sir: "Modern SIR", promo: "Promos", alt: "Alt Art", ex_era: "EX era", wotc: "WOTC vintage", sealed: "Sealed" };
const gbp = n => "£" + Number(n).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2});
const gbp0 = n => (n < 0 ? "−£" : "£") + Math.abs(Math.round(n)).toLocaleString("en-GB");
const pct = (n, d=1) => { if (n == null) return "–"; const v = +Number(n).toFixed(d); return v === 0 ? "0%" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(d) + "%"; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}) : "–";
const fmtDay = d => new Date(d+"T12:00:00Z").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const hours = h => h == null ? null : h < 1 ? Math.max(1, Math.round(h*60)) + " min" : h < 48 ? h.toFixed(h < 10 ? 1 : 0) + " h" : Math.round(h/24) + " days";

function icon(kind){
  if(kind==="slab") return '<svg viewBox="0 0 60 84" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="54" height="78" rx="4"/><rect x="9" y="9" width="42" height="12" rx="2" fill="currentColor" fill-opacity=".25"/><rect x="11" y="26" width="38" height="49" rx="2"/></svg>';
  if(kind==="sealed") return '<svg viewBox="0 0 80 64" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 18 L40 6 L74 18 L74 52 L40 60 L6 52 Z"/><path d="M6 18 L40 30 L74 18 M40 30 L40 60"/></svg>';
  return '<svg viewBox="0 0 60 84" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="5" y="3" width="50" height="78" rx="5"/><rect x="11" y="10" width="38" height="32" rx="2" fill="currentColor" fill-opacity=".2"/><path d="M11 50 H49 M11 58 H40 M11 66 H44"/></svg>';
}
const sellerLabel = t => t==="BUSINESS"?"Business seller":t==="INDIVIDUAL"?"Private seller":"Seller type unknown";
const gradeLabel = d => d.grader ? d.grader + " " + d.grade : d.kind === "sealed" ? "Sealed" : "Raw NM";

function depth(d){
  const cls={"Quick flip":"q","Normal":"n","Long hold":"l","Very long hold":"v"}[d.hold_cls]||"n";
  const days=d.hold_days==null?"no recent sales":d.hold_days<1.5?"~1 day":"~"+Math.round(d.hold_days)+" days";
  const perDay=d.hold_days?d.resale_net/Math.max(1,d.hold_days):null;
  let html='<div class="depth"><span class="hold '+cls+'">'+esc(d.hold_cls||"Unknown")+' · '+days+'</span>';
  if(perDay!=null&&d.resale_net>0) html+='<div class="row">Resale profit per day held <b>'+gbp(perDay)+'</b></div>';
  const L=d.ladder;
  if(L&&L.active){
    html+='<div class="row">Other UK listings <b>'+L.active+' · '+L.belowMarket+' under Pulse</b></div>';
    html+='<div class="row">Lowest / median ask <b>'+gbp0(L.lowest)+' / '+gbp0(L.median)+'</b></div>';
    const all=[...L.prices,d.total,d.market]; const lo=Math.min(...all)*0.97, hi=Math.max(...all)*1.03, x=v=>((v-lo)/(hi-lo)*100).toFixed(1)+"%";
    html+='<div class="ladder" role="img" aria-label="Listing prices vs Pulse market and this deal">'+L.prices.map(v=>'<i style="left:'+x(v)+'"></i>').join("")+'<i class="pm" style="left:'+x(d.market)+'"></i><i class="you" style="left:'+x(d.total)+'"></i></div>';
    html+='<div class="ladder-cap"><span>'+gbp0(lo)+'</span><span>'+gbp0(hi)+'</span></div>';
    html+='<div class="ladder-key"><span><i class="k-you"></i>This deal</span><span><i class="k-pm"></i>Pulse</span><span><i class="k-ask"></i>Other listings</span></div>';
  } else html+='<div class="row">Other UK listings <b>not checked yet</b></div>';
  const S=d.sold;
  if(S&&S.count30) html+='<div class="row">Seen sold, 30 days <b>'+S.count30+(S.median?' · median '+gbp0(S.median):'')+(S.change!=null?' · '+pct(S.change,0):'')+'</b></div>';
  else html+='<div class="row">Our sold record <b>building</b></div>';
  return html+'</div>';
}

function reasonText(r){ const [k,dt]=String(r||"").split(":"); return (DATA.reasons[k]||k)+(dt?" ("+dt+")":""); }
function reviewBar(d){
  const v=d.review&&d.review.verdict, open=v==="bad";
  const id=esc(d.item_id);
  let h='<div class="review"><span class="q">Was this match right?</span>'+
    '<button class="btn small good" data-rv="good" data-id="'+id+'" aria-pressed="'+(v==="good")+'">✅ Right</button>'+
    '<button class="btn small bad" data-rv="bad" data-id="'+id+'" aria-pressed="'+(v==="bad")+'">❌ Wrong</button>'+
    '<button class="btn small fake" data-rv="fake" data-id="'+id+'" aria-pressed="'+(v==="fake")+'">🚩 Fake card</button>'+
    (v?'<button class="btn small" data-rv="" data-id="'+id+'">Clear</button>':'');
  if(open){
    const list=(DATA.reasonsByKind||{})[d.kind]||[];
    const [rk,rd]=String(d.review.reason||"").split(":");
    h+='<div class="reasons" role="group" aria-label="Why was it wrong?"><span class="q">Why? ('+(d.kind==="slab"?"graded card":d.kind==="sealed"?"sealed":"raw card")+')</span>'+
      list.map(([k,l])=>'<button data-reason="'+k+'" data-id="'+id+'" aria-pressed="'+(rk===k)+'">'+esc(l)+'</button>').join("")+'</div>';
    const pick=list.find(x=>x[0]===rk&&x[2]);
    if(pick) h+='<div class="reasons" role="group" aria-label="Detail"><span class="q">'+(rk==="condition"?"Actual condition:":rk==="graded"||rk==="wrong_grader"?"Graded by:":rk==="wrong_grade"?"Actual grade:":"Which?")+'</span>'+
      pick[2].map(o=>'<button data-reason="'+rk+':'+esc(o)+'" data-id="'+id+'" aria-pressed="'+(rd===o)+'">'+esc(o)+'</button>').join("")+'</div>';
    h+='<div class="reasons"><input type="text" placeholder="Note (optional): what was it really?'+(rk==="graded"||rk==="wrong_grade"?" e.g. ACE 9":"")+'" data-note="'+id+'" value="'+esc(d.review.note||"")+'" aria-label="Note"></div>';
  }
  if(v==="fake") h+='<div class="reasons"><input type="text" placeholder="What gave it away? (optional)" data-note="'+id+'" value="'+esc(d.review.note||"")+'" aria-label="Note"></div>';
  return h+'</div>';
}

function accuracy(){
  const a=DATA.accuracy||{}; const el=document.getElementById("acc");
  const pctOf=(n,t)=>t?Math.round(n/t*100)+"%":"–";
  const reasons=Object.entries(a.byReason||{}).sort((x,y)=>y[1]-x[1]);
  el.innerHTML='<div class="nums">'+
    '<div><span class="k">Reviewed</span><span class="v">'+(a.reviewed||0)+' / '+(a.flagged||0)+'</span></div>'+
    '<div><span class="k">Right</span><span class="v pos">'+(a.good||0)+' · '+pctOf(a.good,a.reviewed)+'</span></div>'+
    '<div><span class="k">Wrong</span><span class="v neg">'+(a.bad||0)+'</span></div>'+
    '<div><span class="k">Fake</span><span class="v">'+(a.fake||0)+'</span></div>'+
    '<div><span class="k">Alerts right</span><span class="v">'+pctOf(a.alertsGood,a.alertsReviewed)+'</span></div>'+
    '<div><span class="k">Wrong now fixed</span><span class="v pos">'+(a.fixed||0)+' / '+(a.bad||0)+'</span></div>'+
  '</div>'+
  (a.reviewed?'<div class="bar" role="img" aria-label="Right, wrong and fake share"><i style="width:'+(a.good/a.reviewed*100)+'%;background:var(--good)"></i><i style="width:'+(a.bad/a.reviewed*100)+'%;background:var(--bad)"></i><i style="width:'+(a.fake/a.reviewed*100)+'%;background:var(--warn)"></i></div>':'')+
  (reasons.length?'<div class="why">'+reasons.map(([k,n])=>'<span class="tag bad">'+esc(DATA.reasons[k]||"No reason given")+' · '+n+'</span>').join("")+'</div>':'')+
  '<div><a class="btn small" href="/api/review/export" download>Download review (CSV) to send to Claude</a></div>';
}

function card(d){
  const ringCol=d.conf>=65?"var(--good)":d.conf>=45?"var(--warn)":"var(--bad)";
  const verdict=d.conf>=65?"Strong buy":d.conf>=45?"Check first":"Risky";
  const fallback = icon(d.kind)+'<small>'+esc(d.set_name)+'</small>';
  const photo=d.image?'<img src="'+esc(d.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createRange().createContextualFragment(this.dataset.f))" data-f="'+esc(fallback)+'">':fallback;
  const feeTxt=d.account_type==="INDIVIDUAL"?(d.fee_included?"incl. in price":"added"):d.account_type==="BUSINESS"?"none (business)":"check listing";
  const rv=d.review;
  const st=(d.status==="bought"?'<span class="tag bought">Bought</span>':"")+
    (rv?(rv.verdict==="good"?'<span class="tag good">✅ Right match</span>':rv.verdict==="fake"?'<span class="tag warn">🚩 Fake</span>':'<span class="tag bad">❌ Wrong'+(rv.reason?": "+esc(reasonText(rv.reason)):"")+'</span>'):"")+
    (d.recheck&&d.recheck.now!=="same"?'<span class="tag '+(rv&&rv.verdict==="bad"?"fixed":"warn")+'">Today’s rules: '+(d.recheck.now==="rejected"?"turned away ("+esc(d.recheck.reason)+")":"now "+esc(d.recheck.product))+'</span>':"");
  const gone=d.gone_hours!=null?'<span class="tag bad">Gone after '+hours(d.gone_hours)+'</span>':"";
  const cert=d.cert_status==="verified"?'<span class="tag good">PSA cert verified</span>':d.cert_status==="mismatch"?'<span class="tag bad">PSA cert mismatch</span>':d.cert_status==="no cert"?'<span class="tag warn">No cert number shown</span>':d.cert?'<span class="tag">Cert '+esc(d.cert)+'</span>':"";
  const sup=d.supply?'<span class="tag'+(d.supply.today>d.supply.avg*2&&d.supply.today>=3?' warn':'')+'">'+d.supply.today+' new UK listing'+(d.supply.today===1?"":"s")+' today · '+d.supply.avg.toFixed(1)+'/day avg</span>':"";
  const t7=d.t7??0;
  const grading=d.grade_gain!=null&&d.grade_gain>0?'<div class="exit grading" title="Expected value if graded: '+gbp0(d.grade_ev)+' at a '+Math.round((d.p10||0)*100)+'% PSA 10 rate">Grading play <b>'+gbp0(d.grade_gain)+'</b></div>':"";
  return '<article class="deal '+(d.instant?"flag ":"")+"st-"+d.status+(d.gone_hours!=null?" is-gone":"")+'">'+
    '<a class="photo" href="'+esc(d.url)+'" target="_blank" rel="noopener" aria-label="Open listing on eBay">'+photo+'</a>'+
    '<div class="main">'+
      '<div class="titlerow"><span class="pill '+esc(d.label).replace(/ /g,"-")+'">'+esc(d.label)+'</span><a class="title" href="'+esc(d.url)+'" target="_blank" rel="noopener">'+esc(d.name)+' · '+esc(gradeLabel(d))+'</a></div>'+
      '<div class="raw">"'+esc(d.title)+'"</div>'+
      '<div class="tags">'+(d.instant?'<span class="tag instant">Instant alert</span>':'')+st+gone+
        '<span class="tag">'+esc(CAT[d.category]||d.category)+' · '+esc(d.set_name)+(d.number?' '+esc(d.number):'')+'</span>'+
        '<span class="tag">'+esc(d.format)+'</span>'+
        '<span class="tag">'+sellerLabel(d.account_type)+(d.feedback?' · '+esc(d.feedback):'')+'</span>'+
        '<span class="tag">Found '+fmtTime(d.found_at)+'</span>'+cert+sup+
        (d.post==null?'<span class="tag warn">Check postage</span>':'')+
        (d.kind==="raw"&&d.lp?'<span class="tag">LP value '+gbp0(d.lp)+'</span>':'')+
      '</div>'+
      '<div class="maths">'+
        '<div><span class="k">Listed</span><span class="v">'+gbp(d.price)+'</span><span class="sub">'+(d.post==null?"postage unknown":"+"+gbp(d.post)+" post")+'</span></div>'+
        '<div><span class="k">Buyer fee</span><span class="v">'+(d.account_type==="INDIVIDUAL"?gbp(d.fee):gbp(0))+'</span><span class="sub">'+feeTxt+'</span></div>'+
        '<div><span class="k">Total in</span><span class="v">'+gbp(d.total)+'</span><span class="sub">what you pay</span></div>'+
        '<div><span class="k">'+(d.market_source==="eBay sold"?"eBay sold":"Market (Pulse)")+'</span><span class="v">'+gbp(d.market)+'</span><span class="sub">'+(d.market_source==="eBay sold"?"Pulse "+gbp0(d.pulse_market):'<span class="'+(t7>=0?"pos":"neg")+'">'+pct(t7)+' 7d</span>')+'</span></div>'+
        '<div class="diff"><span class="k">Under market</span><span class="v '+(d.net>=0?"pos":"neg")+'">'+gbp(d.net)+'</span><span class="sub '+(d.net>=0?"pos":"neg")+'">'+d.pct.toFixed(1)+'%</span></div>'+
      '</div>'+
      '<div class="exits">'+
        '<div class="exit">Resell on eBay <b class="'+(d.resale_net>=0?"pos":"neg")+'">'+gbp0(d.resale_net)+'</b></div>'+
        '<div class="exit">To Mania at +'+DATA.cfg.maniaMarkupPct+'% <b>'+gbp0(d.mania_net)+'</b></div>'+grading+
      '</div>'+
      '<div class="actions">'+
        '<a class="btn primary" href="'+esc(d.url)+'" target="_blank" rel="noopener">Open on eBay</a>'+
        (d.pulse_url?'<a class="btn" href="'+esc(d.pulse_url)+'" target="_blank" rel="noopener">View on Pulse</a>':'')+
        '<span class="spacer"></span>'+
        '<button class="btn small" data-act="bought" data-id="'+esc(d.item_id)+'">'+(d.status==="bought"?"Undo bought":"Bought")+'</button>'+
      '</div>'+reviewBar(d)+
    '</div>'+
    '<div class="side">'+
      '<div class="conf"><div class="ring" style="background:conic-gradient('+ringCol+' '+d.conf+'%, var(--line) 0)"><span>'+d.conf+'</span></div>'+
        '<div class="lbl"><b>'+verdict+'</b><span class="small-muted">'+(d.s7??0)+' sales this week · '+(d.s30??0)+' in 30 days</span></div></div>'+
      '<div class="trend">'+
        '<div><span class="k">7 days</span><span class="v '+((d.t7??0)>=0?"pos":"neg")+'">'+pct(d.t7)+'</span></div>'+
        '<div><span class="k">30 days</span><span class="v '+((d.t30??0)>=0?"pos":"neg")+'">'+pct(d.t30)+'</span></div>'+
        '<div><span class="k">Sales pace</span><span class="v '+((d.src??0)>=0?"pos":"neg")+'">'+pct(d.src,0)+'</span></div>'+
      '</div>'+
      depth(d)+
      '<div class="factors">'+(d.factors||[]).map(f=>'<span class="factor '+f[0]+'">'+esc(f[1])+'</span>').join("")+'</div>'+
    '</div>'+
  '</article>';
}

let filter="all", sortBy="net";
try{ sortBy=localStorage.getItem("mds-sort")||"net"; }catch(e){}
document.getElementById("sortby").value=sortBy;

const cats=[...new Set(DATA.deals.map(d=>d.category))];
const fbar=document.getElementById("filters");
const sortEl=fbar.querySelector(".sort");
[["all","All"],["toreview","To review"],["wrong","Wrong / fake"],["instant","Instant alerts"],["hot","Hot"],["grading","Grading plays"],...cats.map(c=>["cat:"+c,CAT[c]||c]),["bought","Bought"]].forEach(([f,l],i)=>{
  const b=document.createElement("button"); b.id="f-"+f.replace(":","-"); b.dataset.f=f; b.textContent=l; b.setAttribute("aria-pressed",i===0);
  fbar.insertBefore(b,sortEl);
});

function summary(){
  const live=DATA.deals.filter(d=>d.status!=="bad");
  document.getElementById("s-count").textContent=live.length;
  document.getElementById("s-instant").textContent=live.filter(d=>d.instant).length;
  document.getElementById("s-net").textContent=gbp0(live.reduce((a,d)=>a+d.net,0));
  document.getElementById("s-conf").textContent=live.length?Math.round(live.reduce((a,d)=>a+d.conf,0)/live.length):"–";
}

const touched=new Set();   // deals you've just reviewed stay in view until you change filter
function keep(d){
  if(filter==="all"||touched.has(d.item_id)) return true;
  if(filter==="instant") return d.instant;
  if(filter==="toreview") return !d.review;
  if(filter==="wrong") return d.review&&d.review.verdict!=="good";
  if(filter==="hot") return d.label==="Hot";
  if(filter==="grading") return d.grade_gain!=null&&d.grade_gain>0;
  if(filter==="bought") return d.status==="bought";
  return d.category===filter.slice(4);
}

function render(){
  const keys={net:d=>d.net,pct:d=>d.pct,conf:d=>d.conf,resale:d=>d.resale_net,speed:d=>-(d.hold_days??1e9),new:d=>Date.parse(d.found_at)};
  const shown=DATA.deals.filter(keep).sort((a,b)=>(a.status==="bad")-(b.status==="bad")||keys[sortBy](b)-keys[sortBy](a));
  document.getElementById("list").innerHTML=shown.length?shown.map(card).join(""):
    '<div class="empty">'+(DATA.deals.length?"Nothing in this filter.":"No under-market listings found on this day yet. The scanner checks eBay every 5 minutes.")+'</div>';
  summary(); accuracy();
}

document.getElementById("market").innerHTML=DATA.market.sort((a,b)=>Object.keys(CAT).indexOf(a.category)-Object.keys(CAT).indexOf(b.category)).map(m=>{
  const arrow=m.prev30==null?"":(m.t30>m.prev30+1?" ▲":m.t30<m.prev30-1?" ▼":" ▶");
  return '<div class="mkt"><span class="n">'+esc(CAT[m.category]||m.category)+'</span><span class="v '+((m.t30??0)>=0?"pos":"neg")+'">'+pct(m.t30,0)+arrow+'</span>'+
    '<span class="s">'+pct(m.t7,1)+' 7d · '+m.n+' cards</span>'+(m.speedH!=null?'<span class="s">Deals gone in ~'+hours(m.speedH)+'</span>':'')+'</div>';
}).join("");

if(DATA.watch.length){
  document.getElementById("watch").innerHTML=DATA.watch.map(w=>'<a class="wcard" href="'+esc(w.url||"#")+'" target="_blank" rel="noopener"><b>'+esc(w.name)+'</b><span>'+esc(w.grade)+' · '+gbp0(w.market)+'</span><span><span class="up">'+pct(w.src,0)+' sales pace</span> · '+(w.s7??0)+' sold this week</span></a>').join("");
} else document.getElementById("watchsect").hidden=true;

if(DATA.rejects.length){
  document.getElementById("rejects").innerHTML=DATA.rejects.map(r=>'<div><span class="r">'+esc(r.reason)+'</span><span class="t">'+esc(r.title)+'</span></div>').join("");
} else document.getElementById("rejbox").hidden=true;

const st=DATA.stats||{};
document.getElementById("scanline").textContent=
  "Last scan "+fmtTime(DATA.lastScan)+" · "+(st.scans||0)+" scans · "+(st.listings||0).toLocaleString("en-GB")+" new listings checked · "+(st.matched||0)+" matched to the catalogue · "+(st.rejected||0)+" turned away by title rules";
document.getElementById("pricesAsOf").textContent="Pulse prices as of "+(DATA.marketUpdated?new Date(DATA.marketUpdated).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}):"–");
document.getElementById("rules").textContent="Listings at least "+DATA.cfg.instantPct+"% and £"+DATA.cfg.instantNet+" under market, with confidence of 35 or more, trigger an instant Telegram alert. Anything at least "+DATA.cfg.minPct+"% under lands in this report.";
document.getElementById("nrdays").textContent=DATA.cfg.newReleaseDays;
document.getElementById("catsize").textContent="Watching "+DATA.catalogueSize+" products.";
if(DATA.lastError){ const e=document.getElementById("errbox"); e.textContent="Last problem: "+DATA.lastError; e.hidden=false; }
if(DATA.mock) document.getElementById("mockbox").hidden=false;

const pick=document.getElementById("daypick");
const days=DATA.days.some(x=>x.day===DATA.day)?DATA.days:[{day:DATA.day,count:0},...DATA.days];
pick.innerHTML=days.map(x=>'<option value="'+x.day+'"'+(x.day===DATA.day?" selected":"")+'>'+fmtDay(x.day)+(x.day===DATA.today?" (today)":"")+" · "+x.count+'</option>').join("");
pick.addEventListener("change",()=>{ location.search="?day="+pick.value; });

fbar.addEventListener("click",e=>{
  const b=e.target.closest("button[data-f]"); if(!b) return;
  filter=b.dataset.f; touched.clear();
  fbar.querySelectorAll("button[data-f]").forEach(x=>x.setAttribute("aria-pressed",x===b));
  render();
});
document.getElementById("sortby").addEventListener("change",e=>{ sortBy=e.target.value; try{localStorage.setItem("mds-sort",sortBy);}catch(err){} render(); });

async function sendReview(d, body){
  const r=await fetch("/api/deals/"+encodeURIComponent(d.item_id)+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(await r.text());
  const a=DATA.accuracy, was=d.review&&d.review.verdict;
  if(was){ a.reviewed--; a[was]--; if(was==="bad"){ const k=d.review.reason||"unspecified"; const k2=k.split(":")[0]; if(a.byReason[k2]&&!--a.byReason[k2]) delete a.byReason[k2]; if(d.recheck&&d.recheck.now!=="same") a.fixed--; } if(d.instant){ a.alertsReviewed--; if(was==="good") a.alertsGood--; } }
  d.review=body.verdict?{verdict:body.verdict,reason:body.reason||null,note:body.note||null}:null;
  const now=d.review&&d.review.verdict;
  if(now){ a.reviewed++; a[now]++; if(now==="bad"){ const k=(d.review.reason||"unspecified").split(":")[0]; a.byReason[k]=(a.byReason[k]||0)+1; if(d.recheck&&d.recheck.now!=="same") a.fixed++; } if(d.instant){ a.alertsReviewed++; if(now==="good") a.alertsGood++; } }
  if(d.status!=="bought") d.status=now&&now!=="good"?"bad":"new";
}
document.getElementById("list").addEventListener("change",async e=>{
  const inp=e.target.closest("input[data-note]"); if(!inp) return;
  const d=DATA.deals.find(x=>x.item_id===inp.dataset.note); if(!d||!d.review) return;
  try{ await sendReview(d,{verdict:d.review.verdict,reason:d.review.reason,note:inp.value}); inp.style.borderColor="var(--good)"; }catch(err){ inp.style.borderColor="var(--bad)"; }
});
document.getElementById("list").addEventListener("click",async e=>{
  const rb=e.target.closest("button[data-rv],button[data-reason]");
  if(rb){
    const d=DATA.deals.find(x=>x.item_id===rb.dataset.id); if(!d) return;
    rb.disabled=true; touched.add(d.item_id);
    try{
      if(rb.dataset.reason) await sendReview(d,{verdict:"bad",reason:rb.dataset.reason,note:d.review&&d.review.note});
      else { const v=rb.dataset.rv; await sendReview(d, v ? {verdict:v,reason:v==="bad"&&d.review?d.review.reason:null,note:d.review&&d.review.note} : {verdict:null}); }
      render();
    }catch(err){ rb.disabled=false; rb.textContent="Couldn't save, try again"; }
    return;
  }
  const b=e.target.closest("button[data-act]"); if(!b) return;
  const d=DATA.deals.find(x=>x.item_id===b.dataset.id); if(!d) return;
  const next=d.status===b.dataset.act?"new":b.dataset.act;
  b.disabled=true;
  try{
    const r=await fetch("/api/deals/"+encodeURIComponent(d.item_id)+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});
    if(!r.ok) throw new Error(await r.text());
    d.status=next; render();
  }catch(err){ b.disabled=false; b.textContent="Couldn't save, try again"; }
});
render();
</script>
</body>
</html>`;
}

export function renderLogin(wrong) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Mania Deal Scanner</title>
<style>:root{--bg:#EEF1F5;--surface:#fff;--ink:#152132;--muted:#5B6878;--line:#D7DDE5;--accent:#2350C8;--bad:#B4282E}
@media (prefers-color-scheme: dark){:root{--bg:#0E141C;--surface:#16202C;--ink:#E6ECF3;--muted:#93A1B2;--line:#26323F;--accent:#7D9DF5;--bad:#F2777C}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px system-ui,sans-serif;padding:16px}
form{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:12px;width:min(360px,100%)}
input{font:inherit;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
button{font:600 14px system-ui;padding:9px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
p{margin:0;color:var(--muted);font-size:13px}.err{color:var(--bad)}</style></head>
<body><form method="get" action="/"><b>Mania Deal Scanner</b><label for="key">Report key</label><input id="key" name="key" type="password" autocomplete="current-password" required>
${wrong ? '<p class="err">That key is wrong.</p>' : '<p>Enter the report key you set up.</p>'}<button type="submit">Open report</button></form></body></html>`;
}
