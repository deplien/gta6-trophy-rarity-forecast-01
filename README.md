# gta6-trophy-rarity-forecast-01

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/deplien/gta6-trophy-rarity-forecast-01/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/deplien/gta6-trophy-rarity-forecast-01/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

A forecasting program for the week-one earn rates of Grand Theft Auto VI's 55 PlayStation 5 trophies, as printed by Exophase. Given a case file holding every read the house made of the game's trophy page before a checkpoint, it writes five quantiles (5/25/50/75/95%) of each trophy's earn rate at the target. Per trophy it collapses the reads to refresh-distinct points, fits a recency-weighted line of logit(rate) against ln(1 + hours since release), shrinks the slope toward the cross-trophy pool, damps the extrapolation as rates saturate, and spreads the forecast by a horizon random walk plus the trophy's own fit error — wider near the 0.01% print floor, where a quiet trophy can still lift off. It runs offline in a few milliseconds and needs nothing beyond Node 22.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=p6grw8zt&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
