# Pulse refresh procedure

Runs twice a day (07:00 and 19:00 UK) as a scheduled Claude task with the Pulse connector. It can also be run by hand: ask Claude to "refresh the deal scanner from Pulse".

Pulse is the market price the scanner buys against and the price you resell at, so this keeps both honest.

## Steps for Claude

1. Clone the deal-scanner repo and work in it.
2. Run every Pulse market screen below with `sortBy: volume30d`, `sortDirection: desc`. Take the first page only; that's where the liquid cards are.
3. For every product in `data/catalogue.json` that none of the screens returned (sealed, thin EX-era and WOTC cards), fetch it with `get_product_details`, 10 ids per call.
4. For any **new raw card** that has a PSA 10 version in the refresh, fetch `get_product_details` to get its PSA 10 rate (`gradedPopulation.byGrader.psa.grade10Probability`) and LP price.
5. Write `data/pulse-refresh.json`:
   ```json
   { "fetched_at": "<ISO timestamp>", "rows": [ [id, name, number, market, t7, t30, s7, s30, src, cat, p10, lp, urlSlug], ... ] }
   ```
   Columns follow `columns` in `catalogue.json`: t7 / t30 rounded to 1 decimal; src = `salesRateChangePercent` (null if missing); urlSlug = the part of the Pulse URL after `/cards/` or `/sealed/`; p10 and lp null unless fetched; cat = the category of the screen it came from.
6. Run `node scripts/merge-pulse.mjs`, then `npm test`. Only continue if tests pass.
7. Commit `data/catalogue.json` with the message `Pulse refresh <timestamp>` and push. The GitHub Action loads it into the database.
8. Reply with the merge summary line and anything unusual: big moves, products dropped from screens, prices that look wrong.

## Screens

| cat | productType | filters |
|---|---|---|
| sir | cards | seriesPrefixes `sv, me, m1`; languages `English`; rarities `Special Illustration Rare`; excludeGraded; price ≥ 25; volume30d ≥ 3; limit 50 |
| sir | cards | same, but gradingCompany `PSA`, grade `10`, price ≥ 60, volume30d ≥ 2; limit 25 |
| promo | cards | setIds `basep, np, dpp, bwp, xyp, smp, swshp, svp, mep`; excludeGraded; price ≥ 30; volume30d ≥ 3; limit 25 |
| promo | cards | same sets, PSA 10, price ≥ 60, volume30d ≥ 3; limit 20 |
| alt | cards | seriesPrefixes `swsh, sm`; languages `English`; rarities `Rare Ultra, Rare Rainbow, Rare Secret, Trainer Gallery Rare Ultra`; excludeGraded; price ≥ 40; volume30d ≥ 3; limit 25 |
| alt | cards | same, PSA 10, price ≥ 80, volume30d ≥ 2; limit 20 |
| ex_era | cards | setIds `ex1`–`ex16`, `base5`; rarities `Rare Holo ex, Rare Holo ☆`; excludeGraded; price ≥ 30; volume30d ≥ 2; limit 20 |
| ex_era | cards | same sets/rarities, PSA 9, price ≥ 50, volume30d ≥ 1; limit 15 |
| wotc | cards | setIds `bs1s, bss, bsu, base2, base3, base4, base6, tr, gym1, gym2, neo1, neo2, neo3, neo4, ecard1, ecard2, ecard3`; rarities `Rare Holo, Rare Secret, Rare Shining, Rare Holo ☆`; excludeGraded; price ≥ 40; volume30d ≥ 3; limit 20 |
| wotc | cards | same, PSA 9, price ≥ 60, volume30d ≥ 2; limit 20 |

Skip any row whose price history looks broken (for example a 99% one-week drop on a card with one sale). Note it in the reply instead.

## Scheduled task prompt

Use this as the prompt when creating the twice-daily scheduled task (from your personal Claude account, with the Pulse connector and the GitHub repo connected):

> Refresh the deal scanner catalogue from Pulse. Clone my deal-scanner GitHub repo, then follow REFRESH.md in it exactly: run the screens, fetch missing products, write data/pulse-refresh.json, merge, test, commit and push. Reply with the merge summary and anything unusual.
