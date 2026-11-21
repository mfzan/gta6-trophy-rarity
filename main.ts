// GTA VI trophy rarity forecast (Node 22, standard library only).
//
// Forecasts, for every PlayStation 5 trophy of Grand Theft Auto VI,
// its earn rate on Exophase at the case's target, as five quantiles.
// The program reads every <id>.in in the input directory and writes
// one <id>.out per case.
//
// The model, per trophy:
//   1. Take the trophy's earn rate at every valid read in the case's
//      history, as a logit, against ln(1 + hours since release).
//      Rates grow roughly log-linearly in the first week: players
//      accumulate, then progress through the game, so the logit of
//      the rate climbs with the log of the hours.
//   2. Fit a straight line to that by least squares over the whole
//      history (not just the last day), so a trophy whose rate has
//      been climbing steadily keeps climbing, and one that has
//      flattened stays flat. A trophy with fewer than three distinct
//      reads keeps its last rate (no trend to fit).
//   3. Read the line at the target's hours. The median is that
//      value, but it is never allowed to move against the direction
//      the trophy has actually moved in: if the line says a trophy
//      whose rate has only ever fallen should rise, the median stays
//      at the last rate. Refreshes drop every rate (new players are
//      tracked before they have earned anything), so a falling trend
//      is a refresh artefact, not a real decline.
//   4. The spread widens with the horizon like a random walk's, and
//      with the fit's residual: a trophy whose history the line fits
//      badly gets a wider band. The house baseline's 0.5 logit units
//      per square-root day is the floor.
//
// A prize needs a loss strictly below the best house entry's, so this
// entry's edge is the full-history trend: the house baseline persists
// the last rate, and the house curve fits only the last 24 hours.
// Over a 4.5-day horizon the whole launch history carries the signal.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and
// MAKEFUN_OUTPUT_DIR stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** The spread floor, in logit units per square-root day. */
const SIGMA_FLOOR = 0.5;
/** Release: the clock the growth curve is measured from. */
const RELEASE_MS = Date.parse('2026-11-19T00:00:00Z');

interface Trophy { id: number; }
interface Read { at: string; rates: Array<number | null>; }
interface Case {
  levels: number[];
  horizon_minutes: number;
  target: string;
  trophies: Trophy[];
  history: Read[];
}

const clamp = (x: number): number => Math.min(99.99, Math.max(0.01, x));
const logit = (pct: number): number => Math.log(clamp(pct) / (100 - clamp(pct)));
const invLogit = (l: number): number => 100 / (1 + Math.exp(-l));
/** x rounded to 4 decimals. */
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
/** Hours from release to an ISO timestamp. */
const hoursSinceRelease = (iso: string): number =>
  Math.max(0, (Date.parse(iso) - RELEASE_MS) / 3_600_000);

/**
 * Least-squares line y = a + b*x through points, plus the residual
 * spread (root mean square of the residuals). Returns null when the
 * points do not determine a line.
 */
function fitLine(xs: number[], ys: number[]): { a: number; b: number; resid: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) { const r = ys[i] - (a + b * xs[i]); ss += r * r; }
  return { a, b, resid: Math.sqrt(ss / n) };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
  }
  if (c.history.length === 0) throw new Error(`${file} has no history`);
  const last = c.history[c.history.length - 1];
  const horizonDays = c.horizon_minutes / 1440;
  const targetHours = hoursSinceRelease(c.target);

  const trophies = c.trophies.map((t, i) => {
    // The trophy's (log-hours, logit-rate) points, skipping reads
    // that lacked it, and collapsing duplicate hours.
    const pts: Array<[number, number]> = [];
    const seen = new Set<string>();
    for (const read of c.history) {
      const rate = read.rates[i];
      if (rate === null || rate === undefined) continue;
      const key = read.at;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push([Math.log1p(hoursSinceRelease(read.at)), logit(rate)]);
    }
    const lastRate = last.rates[i];
    const lastLogit = logit(lastRate ?? 0);
    const fit = fitLine(pts.map((p) => p[0]), pts.map((p) => p[1]));

    let medianLogit = lastLogit;
    let spread = SIGMA_FLOOR * Math.sqrt(horizonDays);
    if (fit) {
      const predicted = fit.a + fit.b * Math.log1p(targetHours);
      // Never move against the trophy's own direction: a falling
      // trend is a refresh artefact, so a rise the line predicts
      // from a falling history is not trusted, and vice versa.
      const firstLogit = pts[0][1];
      const moved = lastLogit - firstLogit;
      if ((predicted - lastLogit) * moved >= 0 || Math.abs(moved) < 1e-9) {
        medianLogit = predicted;
      }
      // A badly-fitting history widens the band, and a history with
      // only one distinct hour (a flat launch night) gives no trend
      // at all, so the median stays at the last rate.
      spread = Math.sqrt(spread * spread + fit.resid * fit.resid);
    }
    // The spread never narrows below the floor, and the band is
    // capped so no quantile leaves 0.01..99.99.
    spread = Math.max(SIGMA_FLOOR * Math.sqrt(horizonDays), spread);
    const q = Z.map((z) => round4(clamp(invLogit(medianLogit + z * spread))));
    // Quantiles must be non-decreasing; rounding can tie them, never invert them.
    for (let j = 1; j < q.length; j++) if (q[j] < q[j - 1]) q[j] = q[j - 1];
    return { id: t.id, q };
  });
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ trophies })}\n`);
}
