# Mania Deal Scanner

Watches eBay UK around the clock for Pokémon cards and sealed product priced under market, in the categories you care about. It sends instant Telegram alerts for the best ones, tracks how the market is moving, and keeps an end-of-day report page. Runs free on Cloudflare.

## What it watches

The catalogue (`data/catalogue.json`) is built from Pulse and currently holds 303 products:

| Category | What's in it |
|---|---|
| Modern SIR | Special Illustration Rares from Scarlet & Violet and Mega Evolution, raw and PSA 10. Searches only pull listings with "SIR" or "Illustration" in the title |
| Promos | Black Star promos from every era (WOTC to Mega Evolution), raw NM and PSA 10, with stamped versions tracked separately |
| Alt Art | Sun & Moon and Sword & Shield ultra/secret rares above £40, raw NM and PSA 10 |
| EX era | EX-era (2003–07) ex cards and Gold Stars, raw NM and PSA 9 |
| WOTC vintage | Wizards-era holos, raw and PSA 9, with 1st Edition and Shadowless tracked separately, plus Base Set 2 holos and Legendary Collection (including the reverse holos) |
| Sealed | A handful of ETBs, booster boxes and bundles |

Only products with real recent sales on Pulse are included, so the scanner isn't comparing against prices nobody pays.

## What it does every 5 minutes

1. Runs 8 set-level eBay searches (64 in total, so every set is checked about every 40 minutes), newest UK Buy It Now / Best Offer listings first.
2. Identifies each new listing against the catalogue by card number, name, set, grade, edition, stamp and finish. Fakes, Japanese copies, wrong grades, reprints, empty boxes and multi-listings are rejected; raw cards are priced for their condition, and the report shows the reason for each.
3. Prices the best 12 candidates properly: seller type, real postage and a PSA cert check. Anything beyond 12 is held over to the next run rather than lost.
4. Scores each deal and labels it:
   - **Hot:** selling much faster than its 30-day pace, with the price holding. This is the momentum play.
   - **Bullish / Bearish:** a 30-day trend that's still moving.
   - **New release:** singles from sets less than 120 days old, which kept falling in the backtest.
   - **Opportunity:** under market with no warnings.
   - **Check cert / Check price:** the PSA cert doesn't match, or Pulse's price looks wrong.
5. Shows what you'd actually clear: resold on eBay after fees, passed to Mania at your markup, and the expected gain from grading raw cards.
6. Sends a Telegram alert for anything at least 15% and £20 under market with confidence of 35 or more.
7. Records supply (new UK listings per card per day) and checks whether earlier deals have gone, to measure how fast deals disappear.

Once a day it stores the market index per category. After 6pm it sends the end-of-day summary with top deals, cards to watch and the market by category.

## How it judges a deal

eBay is the market. Pulse is the quick comp most buyers now use, so the scanner works the same way: it comps every listing against Pulse instantly, and switches each card to its real eBay sold price as soon as it has enough of its own sold data (4 sales in 30 days by default, `EBAY_SOLD_MIN`). Deals show which one they were priced on, and flag it when Pulse and eBay disagree by more than 10%. Because so many buyers comp off Pulse, anything listed well under it goes quickly, which is why speed matters most on exactly those deals.

eBay also tells you how hard the resale will be:
- **The ladder:** every other current UK listing of the same card and grade. How many there are, how many already sit under Pulse, and whether this listing is the cheapest by a margin. Plenty of listings under Pulse means the real market is softer than Pulse says.
- **Our sold record:** listings that drop off the ladder between checks are recorded as likely sales, with price and date. Rising sold prices add confidence; falling ones take it away. It can't see Best Offer prices, so it's a guide, not gospel.
- **Time to sell:** listings queued at or below Pulse, divided by sales per day (Pulse, plus our sold record). Under a week is a quick flip, over a month a long hold, and the score moves accordingly. Each deal also shows resale profit per day held.
- **Sales stalling:** this week's sales well under the usual pace, with the price not rising, costs 10 points. A cheap listing on a card nobody is buying is a high-risk buy.

## Hunting on demand from Telegram

Message the bot a category or a name and it checks every current UK listing of those cards right now, cheapest first, then sends the best under-market finds: the top 5 as photo cards, the rest as a list.

| Send | Hunts |
|---|---|
| `sir` | Modern Special Illustration Rares |
| `alt` | Alt arts |
| `promos` | Promos, every era |
| `ex` | Early EX era ex cards |
| `goldstars` | Gold Stars ☆ |
| `wotc` | WOTC holos |
| `ereader` | Expedition, Aquapolis, Skyridge |
| `packs` | Vintage booster packs |
| `sealed` | Modern ETBs, boxes, bundles |
| any name | e.g. `fossil`, `151`, `charizard`, `umbreon psa 10` |
| `more` | The next batch of the last hunt |

Each message checks the 24 most-traded cards in the group (one eBay search each, inside Cloudflare's free per-request limit); `more` continues. Hunts are a quick check from listing titles: no description, seller or cert lookups, so open each one before buying.

**One-time setup** after deploying: `curl.exe -X POST -H "x-admin-key: YOUR_ADMIN_KEY" https://<your worker>/api/admin/telegram`. That points the bot at the worker and adds the commands to its menu. The bot only answers your own chat (`TELEGRAM_CHAT_ID`).

## Card condition (raw cards)

The scanner reads the condition from the seller's **Card Condition** field on the listing first, then from the title, then checks it against the seller's own **description** (`src/condition.js`). The description is scanned against a word bank of flaws (whitening, edge wear, scratches, scuffs, dents, bows, lifts, fading, creases, water damage, ink…), softened by "slight / minor / light", hardened by "heavy / multiple", ignored when negated ("no scratches") or in postage text. If the description admits to more than the seller claimed, the lower condition wins and the deal loses 8 confidence. "Judge from the photos" lowers confidence too. Condition words it recognises: NM / Near Mint, LP / Lightly Played / Excellent, MP / Moderately Played / Played, HP / Heavily Played / Poor, DMG / Damaged / Creased. Pulse's own price for that condition is the market (Pulse has NM, LP, MP and HP prices). Damaged has no Pulse price, so it's valued at 60% of the HP price, flagged as an estimate and loses 10 confidence. A listing that states no condition anywhere is priced as LP and loses 5 confidence. Grading plays are only shown for NM cards, and the listing ladder only compares copies in the same condition.

Fallbacks when Pulse has no price for a condition: `COND_LP` 0.7, `COND_MP` 0.5, `COND_HP` 0.35 of NM; `COND_DMG_OF_HP` 0.6; `COND_UNKNOWN` "LP". Set any of them in `wrangler.toml` `[vars]` to change them.

## Sealed products and vintage packs

Sealed listings must say they're **sealed / unopened / brand new** somewhere (title, description, or eBay's "New" condition), and anything empty, opened, resealed, searched or "pack art" is turned away. Booster boxes, half boxes (18 packs) and bundles are told apart by pack count, and a description that reveals a half box or an opened box drops the listing. Box damage in the description costs 10 confidence.

**Single vintage packs** (WOTC and early EX era, 1st Edition and Unlimited tracked separately) are judged by weight. If the title or description states a weight (e.g. "21.6g"), it's compared with the community pack-weight database in `data/pack-weights.csv` (Wisewailmer's sheet; rebuild with `node scripts/build-weights.mjs` after replacing it):
- **Heavy:** heavier than every recorded no-holo pack of that set: holo likely, +10 confidence
- **Leans heavy / Leans light:** 75%+ of recorded packs within 0.05g did / didn't have a holo: ±5 / −10
- **Can't tell:** inside the overlap where holo and non-holo packs weigh the same
- **Light:** lighter than every recorded holo pack: holo unlikely, −15 confidence and never an instant alert, because Pulse's price is for an average pack

The weight bands overlap a lot, so most weights land in "can't tell"; only the tails are informative. It's a guide, not a guarantee.

## The data gets better over time

Every catalogue refresh adds a dated snapshot of every product's price and sales pace. The deals table records what you bought and what was a bad match. Together they allow:
- the confidence score to use each card's own price history (it starts doing this automatically once a card has 4+ snapshots)
- the "Hot" signal to be backtested once there are a few weeks of sales-pace history (`research/` has the first backtest)
- title rules to be tightened from your Bad match marks and the Recent rejections list

## One-time setup (about 30 minutes)

You need [Node.js](https://nodejs.org) (the LTS version). Open a terminal in this folder for every command.

### 1. Install
```
npm install
```

### 2. Cloudflare (free)
1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) with your **personal** email.
2. `npx wrangler login`
3. `npx wrangler d1 create deal-scanner`, then paste the `database_id` it prints into `wrangler.toml`.
4. `npm run db:init` (creates the tables and loads the catalogue).

### 3. eBay developer keys (free)
1. Sign up at [developer.ebay.com](https://developer.ebay.com) with your personal account and create a **Production** keyset.
2. Save them:
   ```
   npx wrangler secret put EBAY_CLIENT_ID
   npx wrangler secret put EBAY_CLIENT_SECRET
   ```

### 4. Telegram bot (free)
1. In Telegram, message **@BotFather**, send `/newbot` and follow the prompts.
2. Send any message to your new bot, then open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` and find `"chat":{"id":123456789`.
3. Save both:
   ```
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

### 5. PSA cert checks (free, optional but recommended)
Sign in at [psacard.com/publicapi](https://www.psacard.com/publicapi/documentation), generate an access token, then:
```
npx wrangler secret put PSA_TOKEN
```
Without it, slabs show "cert unchecked" instead of verified or mismatch.

### 6. Report passwords
```
npx wrangler secret put REPORT_KEY
npx wrangler secret put ADMIN_KEY
```

### 7. Go live
```
npm run deploy
```
Paste the address it prints into `REPORT_URL` in `wrangler.toml` and deploy again. Open the address and enter your `REPORT_KEY`.

### 8. First live check
```
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" "https://deal-scanner.yourname.workers.dev/api/admin/scan?all=1"
```
It returns every search run, what matched, what was rejected and why, and what was flagged.

**On the first real private-seller deal,** check that the price eBay shows matches the "Listed" price in the report. eBay says private-seller prices already include the buyer fee. If it's added again at checkout, set `FEE_MODE = "add"` in `wrangler.toml` and redeploy.

**On the first day of live scanning,** read the Recent rejections list on the report. If real deals are being turned away, that's a rule to loosen. Ask Claude with the titles.

## Day to day

**Pulse refresh, twice a day (automatic).** Pulse has no public API, so a scheduled Claude task does it:
1. Put this project in a **private GitHub repo** under your personal account.
2. In the repo's Settings → Secrets → Actions, add `CLOUDFLARE_API_TOKEN` (a Cloudflare API token with D1 edit permission) and `CLOUDFLARE_ACCOUNT_ID`.
3. In your personal Claude account, with the Pulse connector and the GitHub repo connected, create a scheduled task for 07:00 and 19:00 using the prompt at the bottom of `REFRESH.md`.

Each run re-screens the categories on Pulse, merges the results into `data/catalogue.json`, runs the tests and pushes. The GitHub Action (`.github/workflows/update-prices.yml`) then loads it into the database. Every refresh is kept as a timestamped snapshot. New cards that start trading in your categories are added automatically; ones that drop out keep their last prices and are listed in the summary.

To refresh by hand instead: ask Claude to "refresh the deal scanner from Pulse", then run `npm run prices:update`.

**Checking one card's market depth.** Refreshes its ladder now and shows the queue, sold record and time to sell:
```
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" "https://deal-scanner.yourname.workers.dev/api/admin/ladder?id=<Pulse product id>"
```

**Changing what counts as a deal, your Mania markup or selling fees.** Edit `[vars]` in `wrangler.toml`, then `npm run deploy`. If you sell as a private seller, set `SELL_FEE_PCT = "0"`.

**Adding a category or set.** Ask Claude; it adds the set's search phrase and the products to `data/catalogue.json`.

## Free-tier limits

| Service | Free allowance | This app |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day; 50 outbound calls per run | ~300 scans/day; under 40 calls per run |
| Cloudflare D1 | 5 GB, 5M reads/day | Small |
| eBay Browse API | ~5,000 calls/day by default | ~4,300: searches, ladders, shortlist lookups. Apply for eBay's free Application Growth Check before adding more searches or running every minute |
| PSA public API | Daily cap on cert lookups | Up to 6 per run, only for shortlisted slabs |
| Telegram | Free | Free |

## Testing locally (no keys needed)
```
npm test                       # 50+ title checks, fees, scoring
cp .dev.vars.example .dev.vars
npm run db:init:local
npm run dev
```
Then in another terminal:
```
curl -X POST -H "x-admin-key: adminkey" "localhost:8787/api/admin/scan?all=1"
```
and open `http://localhost:8787/?key=testkey`. Test mode uses built-in sample listings, including traps: a fake cert, a suspect price, a reprint, a staff stamp, Japanese and played copies. One listing also sells between scans.

## Files
- `data/catalogue.json`: what to watch, with Pulse prices, sales pace and PSA 10 rates
- `src/match.js`: identifies a listing's product from its title
- `src/score.js`: fees, exits, grading value, sentiment labels and the confidence score
- `src/scan.js`: the scan run, deal-speed checks, daily index, digest
- `src/ladder.js`: live listing ladders and the sold record
- `scripts/merge-pulse.mjs` + `REFRESH.md`: the twice-daily Pulse refresh
- `src/ebay.js`, `src/psa.js`, `src/telegram.js`: outside services
- `src/page.js`: the report page
- `research/`: the backtest behind the scoring weights
