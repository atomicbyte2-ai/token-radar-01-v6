# Token Launch Radar v6

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/atomicbyte2-ai/token-radar-01-v6/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/atomicbyte2-ai/token-radar-01-v6/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for a DefiLlama snapshot: every protocol is accounted for, the ones that record
no token are ranked by an implied value fitted on the snapshot itself, and each ranked protocol gets a
dated farm plan with a cost and a time on every step.

## What it does

- `ledger()` puts all protocols in exactly one group: ranked (watchlist, early below the floor,
  off-list above it), token trades (priced peers), token recorded without a usable cap, or set aside
  (bridges, liquid staking / restaking, exchanges, products whose name points to a parent).
- `fitValue()` fits log market cap on the priced peers with a robust (Huber IRLS) ridge regression
  and adds candidate terms stepwise: chain count, years listed, category effect, 7-day growth and a
  7-day carry of TVL. A term is kept only if it lowers the median held-out miss in both
  leave-one-out and walk-forward tests (peers listed earlier predict those listed later).
- `fitOdds()` is an L2 logistic regression (Newton, fixed iterations) of "records a token" on years
  listed, category family, 7-day growth, size and chain count, scored by Brier in ten-fold and
  walk-forward tests against the base rate.
- `impliedValue()` = launch value × launch odds. `calibrate()` sets P25–P75 and P10–P90 bands from
  held-out misses and scores their coverage on the half not used to set them.
- `bootstrap()` refits both models 200 times (fixed-seed mulberry32) for coefficient errors and
  rank ranges.
- `farmPlan()` / `minDeposit()` build a protocol-specific plan per row: verify contracts, fund, enter
  (by category and cheapest chain), record, risk cap, weekly monitoring, an exit rule from the
  snapshot's own 7-day change distribution, exit, and an all-in budget. The deposit is the smallest
  rung of a ladder that clears $25/h after gas, bridge fees and the forgone 4% T-bill.

All model and plan code lives in `dashboard/radar.js`. `main.ts` loads that same file, so the page
refits the model in the browser and checks it against what `main.ts` wrote (row-by-row and a
checksum chip). No protocol names are hardcoded; there is no network access and no clock.

## Run

```sh
node main.ts                                   # reads /input/snapshot.json, writes /output
node main.ts --input snapshot.json             # another snapshot
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts --input snapshot.json
```

Node 22+, standard library only. Output: `board.json`, `data.js`, `dashboard/`, `screenshots/`,
`dossier.json`. `main.ts` ends with a self-check of every gate rule (row count, ranks, values,
watchlist coverage, step lengths, dashboard size and links, screenshot sizes, dossier cap) and exits
non-zero if any fails. Two runs write byte-identical files.

Open `/output/dashboard/index.html` in a browser. Views: `#` board, `#p=<slug>` detail,
`#tab=trades`, `#tab=aside`, and filters such as `#verdict=FARM&sort=nethour&open=<slug>`.

## Caveats

A protocol that records no token on DefiLlama may never launch one. Odds are the share of
comparable protocols that record a token, not a forecast. Gas, bridge fee, drop share and T-bill
rate are stated assumptions you can change on the page.
