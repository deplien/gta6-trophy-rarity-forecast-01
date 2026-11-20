// GTA VI trophy rarity forecaster — make.fun bounty gta6-trophy-rarity-forecast-01.
// Reads a case file (the house's Exophase reads for the game's PS5 trophy page)
// and writes, for every trophy, five quantiles of its earn rate at the target:
// the 5/25/50/75/95% points of an honest predictive distribution, on the logit
// scale the contest scores. Model, per trophy: collapse the read history to
// refresh-distinct points, fit a recency-weighted line of logit(rate) against
// ln(1 + hours since release), shrink its slope toward the cross-trophy pool,
// damp the extrapolation, and spread by a horizon random walk plus fit error.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
const CLAMP_LO = 0.01;
const CLAMP_HI = 99.99;

function clampRate(r: number): number {
  return Math.min(CLAMP_HI, Math.max(CLAMP_LO, r));
}
function logitPct(r: number): number {
  const p = clampRate(r) / 100;
  return Math.log(p / (1 - p));
}
function invLogitPct(x: number): number {
  const p = 1 / (1 + Math.exp(-x));
  return 100 * p;
}

type Read = {
  at: string;
  players_tracked: number;
  rates: (number | null)[];
};
type CaseFile = {
  id: string;
  at: string;
  target: string;
  horizon_minutes: number;
  game: { release_date?: string };
  trophies: { id: number }[];
  history: Read[];
};

// Refresh-distinct points for one trophy: a new point when its rate or the
// tracked-player count changes (Exophase refreshes on its own clock, so most
// reads repeat the previous state and carry no new information).
function seriesFor(c: CaseFile, j: number, t0ms: number): { x: number[]; y: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  let lastR: number | null = null;
  let lastN: number | null = null;
  for (const rd of c.history) {
    const r = rd.rates[j];
    if (r === null || r === undefined) continue;
    if (lastR !== null && r === lastR && rd.players_tracked === lastN) continue;
    const hrs = Math.max(0, (Date.parse(rd.at) - t0ms) / 3600000);
    xs.push(Math.log(1 + hrs));
    ys.push(logitPct(r));
    lastR = r;
    lastN = rd.players_tracked;
  }
  return { x: xs, y: ys };
}

// Recency-weighted least squares of y on x (weights halve every `halfLifeH`
// hours of x-distance from the last point), returning slope, intercept at the
// last x, and the weighted residual standard deviation.
function fitLine(xs: number[], ys: number[], halfLifeX: number): { slope: number; resid: number } {
  const n = xs.length;
  const xLast = xs[n - 1];
  let sw = 0, sx = 0, sy = 0;
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    const wi = Math.pow(0.5, (xLast - xs[i]) / halfLifeX) + 0.05;
    w.push(wi);
    sw += wi; sx += wi * xs[i]; sy += wi * ys[i];
  }
  const mx = sx / sw, my = sy / sw;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += w[i] * (xs[i] - mx) * (xs[i] - mx);
    sxy += w[i] * (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxx > 1e-9 ? sxy / sxx : 0;
  let sr = 0;
  for (let i = 0; i < n; i++) {
    const fit = my + slope * (xs[i] - mx);
    sr += w[i] * (ys[i] - fit) * (ys[i] - fit);
  }
  return { slope, resid: Math.sqrt(sr / Math.max(1, sw - 1)) };
}

function forecastCase(c: CaseFile): { trophies: { id: number; q: number[] }[] } {
  const t0ms = Date.parse(c.game.release_date ?? "2026-11-19") || Date.parse("2026-11-19T00:00:00Z");
  const days = c.horizon_minutes / 1440;
  const targetHrs = Math.max(0, (Date.parse(c.target) - t0ms) / 3600000);
  const xTarget = Math.log(1 + targetHrs);

  // First pass: per-trophy fits, to pool the slopes for shrinkage.
  const fits = c.trophies.map((t, j) => {
    const s = seriesFor(c, j, t0ms);
    if (s.x.length === 0) return { j, n: 0, slope: 0, resid: 0, lastY: logitPct(0.01), xLast: 0, lastR: 0.01 };
    const f = s.x.length >= 3 ? fitLine(s.x, s.y, 0.55) : { slope: 0, resid: 0.4 };
    const lastIdx = s.x.length - 1;
    return {
      j,
      n: s.x.length,
      slope: f.slope,
      resid: f.resid,
      lastY: s.y[lastIdx],
      xLast: s.x[lastIdx],
      lastR: invLogitPct(s.y[lastIdx]),
    };
  });
  const slopes = fits.filter((f) => f.n >= 3).map((f) => f.slope).sort((a, b) => a - b);
  const poolSlope = slopes.length ? slopes[Math.floor(slopes.length / 2)] : 0;

  const rows = fits.map((f) => {
    const dx = Math.max(0, xTarget - f.xLast);
    // Shrink the trophy's own slope toward the pooled median slope; a trophy
    // with few distinct points or a noisy fit leans mostly on the pool.
    const trust = f.n >= 3 ? Math.min(0.85, f.n / (f.n + 5)) : 0;
    const slope = trust * f.slope + (1 - trust) * poolSlope;
    // Damp the extrapolation: growth in ln-time decelerates as rates saturate,
    // so the far segment counts for less than the fitted segment did.
    const damp = 1 / (1 + dx / 2.2);
    let dLogit = slope * dx * damp;
    dLogit = Math.max(-2.4, Math.min(2.4, dLogit));
    const med = f.lastY + dLogit;

    // Spread: a horizon random walk plus the trophy's own fit noise, with a
    // floor so no forecast is overconfident and extra width near the 0.01%
    // print floor, where a quiet trophy can still lift off over a long
    // horizon (the width grows in only as the horizon does: at a few hours
    // the floor barely moves, and a wide band there just pays pinball rent).
    const walk = 0.44 * Math.sqrt(days);
    const fitErr = Math.min(1.1, Math.max(0.15, f.resid * (0.45 + 0.3 * dx)));
    let sigma = Math.sqrt(walk * walk + fitErr * fitErr);
    if (f.lastR <= 0.05) sigma += 0.3 * Math.min(1, days / 2);
    if (f.lastR >= 99.9) sigma = Math.min(sigma, 0.55);
    sigma = Math.min(1.9, sigma);

    const q = Z.map((z) => {
      const v = invLogitPct(med + z * sigma);
      return Math.round(Math.min(100, Math.max(0, v)) * 10000) / 10000;
    });
    for (let i = 1; i < q.length; i++) if (q[i] < q[i - 1]) q[i] = q[i - 1];
    return { id: c.trophies[f.j].id, q };
  });
  return { trophies: rows };
}

function main(): void {
  const inDir = process.env.MAKEFUN_INPUT_DIR || "/input";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const files = readdirSync(inDir).filter((f) => f.endsWith(".in")).sort();
  for (const file of files) {
    const c = JSON.parse(readFileSync(join(inDir, file), "utf8")) as CaseFile;
    const out = forecastCase(c);
    writeFileSync(join(outDir, c.id + ".out"), JSON.stringify(out));
  }
}

main();
