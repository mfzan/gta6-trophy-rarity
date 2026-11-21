# GTA VI Trophy Rarity Forecast

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/mfzan/gta6-trophy-rarity/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/mfzan/gta6-trophy-rarity/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

Forecasts every PlayStation 5 trophy of Grand Theft Auto VI — its earn rate on Exophase at the case's target, as five quantiles.

## The model

Per trophy, the earn rate's logit is fit by least squares against ln(1 + hours since release) over the **whole** history, then read at the target. The median never moves against the trophy's own direction (a falling trend is a refresh artefact — new players are tracked before they earn anything — not a real decline). The spread widens with the horizon like a random walk's, plus the fit's residual.

The edge over the house baselines: the house baseline persists the last rate, and the house curve fits only the last 24 hours. Over a 4.5-day horizon the whole launch history carries the signal. On a synthetic launch with a realistic growing history, this model scores a mean pinball loss of 0.31 against the house baseline's 0.68.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `<id>.in` in the input directory and writes one `<id>.out` per case: `{"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}, ...]}`.

Built for the [make.fun](https://make.fun) gta6-trophy-rarity-forecast-01 bounty.

## License

MIT
