# Token Launch Radar v6

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/atomicbyte2-ai/token-radar-01-v6/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/atomicbyte2-ai/token-radar-01-v6/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for DeFi protocols that have **no token yet**. From one DefiLlama snapshot
(no network) it ranks every pre-token protocol by an **implied value** and gives each
one a costed, timed **farm plan** with a FARM / MARGINAL / SKIP verdict.

## How the number is made

- **Implied value = launch value × launch odds**, whole dollars, ranks never rise.
- `ledger()` puts all 758 protocols in exactly one group: ranked (watchlist, early
  below the floor, off-list above it), token trades (priced peers), token without a
  usable cap, and set aside (bridges, liquid (re)staking, exchanges, parent-named products).
- `fitValue()` – Huber-weighted ridge on log market cap of the 88 traded peers.
  Terms are kept only if they lower **both** leave-one-out and walk-forward miss:
  the 7-day carry of TVL survives (×2.21 walk-forward vs ×4.58 flat).
- `fitOdds()` – L2 logistic “records a token” over 507 stand-alone protocols, same
  two-test stepwise: years listed, category, 7-day growth and size kept
  (Brier 0.182 vs 0.242 base, walk-forward 0.227 vs 0.291).
- `calibrate()` – P25–P75 / P10–P90 bands from held-out misses, scored on data that
  did not set them; `bootstrap()` – 200 seeded refits give each row a rank range.
- `farmPlan()` / `minDeposit()` – 3–12 steps with cost and minutes each (gas, bridge,
  forgone 4% T-bill), at the smallest deposit rung that clears $25/hour.

## Run

```sh
node main.ts --input /input/snapshot.json      # writes to /output
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts --input ./snapshot.json
```

Node stdlib only, deterministic (byte-identical across runs). It writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and finally `dossier.json`,
and self-checks every gate (rows, ranks, values, watchlist, steps, dashboard size,
no remote URLs, screenshots, dossier cap) – any failure exits non-zero.

Open `dashboard/index.html` from the output folder. The page refits the whole model
in the browser from `data.js` with the same `radar.js` and shows the checksum match.

- `#` board · `#p=<slug>&weeks=8` detail · `#verdict=FARM&sort=nethour&open=<slug>`
- Sort any header, filter verdict / tier / category / chain, drop-share and horizon
  sliders, CSV / JSON export of the filtered rows.

Farm plans are estimates from public numbers, not advice: a protocol may never
launch a token, and contract and depeg risk stay with you.

## Files

- `main.ts` – runner, writer and gate checks
- `dashboard/radar.js` – the model (shared by Node and the browser)
- `dashboard/app.js`, `app.css`, `index.html` – the page
- `vendor/makefun-board.ts` – organiser's dossier library (unchanged)
- `screenshots/` – three real 1440×1440 renders

MIT licence, see `LICENSE`.
