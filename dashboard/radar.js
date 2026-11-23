// Token Launch Radar model: one file, run by main.ts in Node and again by the page in the browser.
// Order: prep > ledger > fitValue/fitOdds (stepwise via heldOut) > calibrate > impliedValue > bootstrap > farmPlan/minDeposit.
(() => {
'use strict';
const YR = 365.25, X = Math.exp, L = Math.log;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sorted = a => a.slice().sort((x, y) => x - y);
const quant = (s, q) => { if (!s.length) return 0; const h = (s.length - 1) * q, i = Math.floor(h), f = h - i; return i + 1 < s.length ? s[i] + f * (s[i + 1] - s[i]) : s[i]; };
const med = a => quant(sorted(a), 0.5);
const mean = a => { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : 0; };
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const bySlug = (x, y) => x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0;
const day = s => Date.parse(s + 'T00:00:00Z');

// prep(): one record per protocol, features from the snapshot only (standardised over all protocols)
function prep(snap) {
  const asOf = day(snap.as_of), W = new Set(snap.watchlist);
  const P = snap.protocols.map((p, i) => ({ i, slug: p.slug, name: p.name, cat: p.category || 'Other', chains: p.chains || [], tvl: p.tvl_usd, c7: p.change_7d, mcap: p.mcap_usd, listed: p.listed_at, sym: p.symbol,
    g: p.change_7d == null ? 0 : clamp(p.change_7d / 100, -0.25, 0.25), age: p.listed_at ? (asOf - day(p.listed_at)) / 864e5 / YR : null,
    token: !!(p.gecko_id || p.symbol || p.mcap_usd != null), priced: p.mcap_usd > 0, w: W.has(p.slug) }));
  const ma = med(P.filter(p => p.age != null).map(p => p.age));
  for (const p of P) {
    if (p.age == null) p.age = ma;
    p.f = { size: L(p.tvl), carry: L(p.tvl * (1 + p.g)), chains: L(Math.max(1, p.chains.length)), age: p.age, growth: p.g };
  }
  const st = {};
  for (const k of ['size', 'carry', 'chains', 'age', 'growth']) { const v = P.map(p => p.f[k]); st[k] = { m: mean(v), sd: sd(v) || 1 }; }
  return { P, st, asOf: snap.as_of, floor: snap.floor_usd, n: P.length };
}

// ledger(): every protocol in exactly one group, in a fixed order of rules
const firstWord = n => String(n).toLowerCase().split(/[\s\-_.]/)[0];
function ledger(D) {
  const tokW = {}, bestNo = {}, mark = /\b(wrapped|staked)\b|\sv\d+(\.\d+)?$/i, cnt = {};
  for (const p of D.P) {
    p.fw = firstWord(p.name);
    if (p.token) tokW[p.fw] = 1; else if (!bestNo[p.fw] || p.tvl > bestNo[p.fw].tvl) bestNo[p.fw] = p;
  }
  for (const p of D.P) {
    const c = p.cat, prod = !p.token && p.fw.length > 2 && (tokW[p.fw] || (mark.test(p.name) && bestNo[p.fw] !== p));
    p.gr = p.w ? 'watch' : /bridge/i.test(c) ? 'bridge' : /liquid (re)?staking|^restaking$/i.test(c) ? 'lst' : /^cex$/i.test(c) ? 'cex'
      : p.priced ? 'peer' : p.token ? 'nocap' : prod ? 'ver' : p.tvl < D.floor ? 'early' : 'off';
    cnt[p.gr] = (cnt[p.gr] || 0) + 1;
  }
  D.cnt = cnt;
  D.ranked = D.P.filter(p => /^(watch|early|off)$/.test(p.gr));
  D.peers = D.P.filter(p => p.gr === 'peer');
  D.pool = D.P.filter(p => !/^(bridge|lst|cex|ver)$/.test(p.gr));
  return cnt;
}

// design matrix: intercept, standardised terms, category one-hot (families fixed on the whole fitted pool)
function famSet(pool, min) { const c = {}; for (const p of pool) c[p.cat] = (c[p.cat] || 0) + 1; return Object.keys(c).filter(k => c[k] >= min).sort(); }
function row(D, p, terms, fams) {
  const r = [1];
  for (const t of terms) { if (t === 'fam') for (const f of fams) r.push(p.cat === f ? 1 : 0); else r.push((p.f[t] - D.st[t].m) / D.st[t].sd); }
  return r;
}
function pens(terms, fams, fw) { const w = [0]; for (const t of terms) { if (t === 'fam') for (const f of fams) w.push(fw); else w.push(1); } return w; }
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / d; if (k) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / (M[i][i] || 1e-12); }
  return x;
}
const zeros = k => Array.from({ length: k }, () => new Array(k).fill(0));
function wls(Xm, y, w, lam, pw) {
  const k = Xm[0].length, A = zeros(k), b = new Array(k).fill(0);
  Xm.forEach((x, r) => { const wr = w[r]; for (let i = 0; i < k; i++) { b[i] += wr * x[i] * y[r]; for (let j = 0; j < k; j++) A[i][j] += wr * x[i] * x[j]; } });
  for (let i = 0; i < k; i++) A[i][i] += lam * pw[i];
  return solve(A, b);
}

// fitValue(): log market cap of traded peers. Huber IRLS (12 it., h = 0.3*MAD/0.6745), ridge lambda 3
// (family columns x8, families with >= 5 peers), residual log(cap/TVL) winsorised to its own 5-95%.
function fitValue(D, peers, terms) {
  const r = peers.map(p => L(p.mcap / p.tvl)), s = sorted(r), lo = quant(s, 0.05), hi = quant(s, 0.95);
  const y = peers.map((p, i) => p.f.size + clamp(r[i], lo, hi)), fams = terms.includes('fam') ? famSet(D.peers, 5) : [];
  const Xm = peers.map(p => row(D, p, terms, fams)), pw = pens(terms, fams, 8);
  let w = y.map(() => 1), b;
  for (let it = 0; it < 12; it++) {
    b = wls(Xm, y, w, 3, pw);
    const e = Xm.map((x, i) => y[i] - dot(x, b)), h = 0.3 * med(e.map(Math.abs)) / 0.6745;
    w = e.map(v => Math.abs(v) <= h ? 1 : h / Math.abs(v));
  }
  return { kind: 'value', terms, fams, b, lo, hi };
}
const flatValue = peers => ({ kind: 'flat', m: med(peers.map(p => L(p.mcap / p.tvl))) });
const predV = (D, m, p) => m.kind === 'flat' ? p.f.size + m.m : dot(row(D, p, m.terms, m.fams), m.b);

// fitOdds(): "records a token" over every non-set-aside protocol. L2 logistic (lambda 1), Newton steps.
const sig = z => 1 / (1 + X(-z));
function fitOdds(D, pool, terms, iters) {
  const fams = terms.includes('fam') ? famSet(D.pool, 8) : [], Xm = pool.map(p => row(D, p, terms, fams)), pw = pens(terms, fams, 1), y = pool.map(p => p.token ? 1 : 0);
  const k = Xm[0].length, b = new Array(k).fill(0);
  for (let it = 0; it < (iters || 12); it++) {
    const A = zeros(k), g = b.map((v, i) => -pw[i] * v);
    for (let i = 0; i < k; i++) A[i][i] = pw[i];
    Xm.forEach((x, r) => { const q = sig(dot(x, b)), v = q * (1 - q), e = y[r] - q; for (let i = 0; i < k; i++) { g[i] += x[i] * e; const vx = v * x[i]; for (let j = 0; j < k; j++) A[i][j] += vx * x[j]; } });
    const d = solve(A, g); for (let i = 0; i < k; i++) b[i] += d[i];
  }
  return { kind: 'odds', terms, fams, b };
}
const predO = (D, m, p) => m.kind === 'base' ? m.rate : sig(dot(row(D, p, m.terms, m.fams), m.b));

// heldOut(): leave-one-out, ten-fold (slug order mod 10) and walk-forward (6 chunks by listed date)
const byListed = a => a.slice().sort((x, y) => { const u = x.listed || '0000', v = y.listed || '0000'; return u < v ? -1 : u > v ? 1 : bySlug(x, y); });
const chunks = (a, k) => Array.from({ length: k }, (_, i) => a.slice(Math.floor(i * a.length / k), Math.floor((i + 1) * a.length / k)));
function heldOut(D, kind, fit, set) {
  const res = [];
  if (kind === 'loo') set.forEach((p, i) => res.push([p, fit(set.filter((_, j) => j !== i))]));
  else if (kind === 'tenfold') {
    const s = set.slice().sort((x, y) => x.slug < y.slug ? -1 : 1);
    for (let f = 0; f < 10; f++) { const m = fit(s.filter((_, j) => j % 10 !== f)); s.forEach((p, j) => { if (j % 10 === f) res.push([p, m]); }); }
  } else {
    const c = chunks(byListed(set), 6);
    for (let q = 1; q < 6; q++) { const m = fit([].concat(...c.slice(0, q))); for (const p of c[q]) res.push([p, m]); }
  }
  return res;
}
const vRes = (D, pairs) => pairs.map(([p, m]) => L(p.mcap) - predV(D, m, p));
const miss = r => X(med(r.map(Math.abs)));
const brier = (D, pairs) => mean(pairs.map(([p, m]) => { const e = predO(D, m, p) - (p.token ? 1 : 0); return e * e; }));

// stepwise: a term is kept only if it lowers BOTH held-out scores; best by their sum
function stepwise(cur, sc, cand, ev, score, swap) {
  const table = [], last = {};
  for (;;) {
    let best = null;
    for (const c of cand) {
      if (cur.includes(c) || (swap && swap(c, cur) === null)) continue;
      const t = swap ? swap(c, cur) : cur.concat([c]), s = ev(t); last[c] = s;
      if (s[0] < sc[0] && s[1] < sc[1] && (!best || score(s) < best.v)) best = { c, t, s, v: score(s) };
    }
    if (!best) break;
    cur = best.t; sc = best.s; table.push({ term: best.c, a: sc[0], b: sc[1], st: 'kept' }); delete last[best.c];
  }
  for (const c of cand) if (last[c]) table.push({ term: c, a: last[c][0], b: last[c][1], st: 'not kept' });
  return { cur, sc, table };
}
function stepValue(D) {
  const pe = D.peers, ev = fit => [miss(vRes(D, heldOut(D, 'loo', fit, pe))), miss(vRes(D, heldOut(D, 'wf', fit, pe)))], mk = t => ev(tr => fitValue(D, tr, t));
  const flat = ev(flatValue), s0 = mk(['size']);
  const swap = (c, cur) => (c === 'growth' && cur.includes('carry')) || (c === 'carry' && cur.includes('growth')) ? null : c === 'carry' ? cur.map(x => x === 'size' ? 'carry' : x) : cur.concat([c]);
  const s = stepwise(['size'], s0, ['chains', 'age', 'fam', 'growth', 'carry'], mk, v => L(v[0]) + L(v[1]), swap);
  const table = [{ term: 'flat', a: flat[0], b: flat[1], st: 'base' }, { term: 'size', a: s0[0], b: s0[1], st: s.cur.includes('size') ? 'kept' : 'replaced' }].concat(s.table);
  return { terms: s.cur, table, flat, final: s.sc };
}
function stepOdds(D) {
  const po = D.pool, ev = fit => [brier(D, heldOut(D, 'tenfold', fit, po)), brier(D, heldOut(D, 'wf', fit, po))];
  const base = ev(tr => ({ kind: 'base', rate: mean(tr.map(p => p.token ? 1 : 0)) }));
  const s = stepwise([], base, ['age', 'size', 'growth', 'chains', 'fam'], t => ev(tr => fitOdds(D, tr, t, 8)), v => v[0] + v[1]);
  return { terms: s.cur, table: [{ term: 'base', a: base[0], b: base[1], st: 'base' }].concat(s.table), final: s.sc };
}

// calibrate(): bands from leave-one-out misses; honesty scored on data that did not set them
const bands = r => { const s = sorted(r); return [0.1, 0.25, 0.75, 0.9].map(q => quant(s, q)); };
const cover = (r, b) => [r.filter(v => v >= b[1] && v <= b[2]).length / r.length, r.filter(v => v >= b[0] && v <= b[3]).length / r.length, r.filter(v => Math.abs(v) <= L(3)).length / r.length];
function calibrate(D, terms) {
  const fit = tr => fitValue(D, tr, terms), loo = heldOut(D, 'loo', fit, D.peers), lr = vRes(D, loo), wr = vRes(D, heldOut(D, 'wf', fit, D.peers));
  const s = loo.map(([p], i) => [p.slug, lr[i]]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const A = s.filter((_, i) => i % 2 === 0).map(x => x[1]), B = s.filter((_, i) => i % 2 === 1).map(x => x[1]);
  const ab = cover(B, bands(A)), ba = cover(A, bands(B)), band = bands(lr);
  return { band, split: ab.map((v, i) => (v + ba[i]) / 2), wf: cover(wr, band), loo: cover(lr, band), res: lr, peerSlugs: loo.map(([p]) => p.slug) };
}

// impliedValue(): launch value x launch odds, whole dollars
function impliedValue(D, M, p) { const launch = X(predV(D, M.value, p)), odds = predO(D, M.odds, p); return { launch, odds, implied: Math.max(1, Math.round(launch * odds)) }; }
function rankRows(D, M, list) {
  const r = list.map(p => Object.assign({ p, slug: p.slug }, impliedValue(D, M, p)));
  r.sort((a, b) => b.implied - a.implied || bySlug(a, b));
  r.forEach((x, i) => { x.rank = i + 1; });
  return r;
}

// bootstrap(): 200 refits on resampled peers and odds pool (mulberry32, fixed seed)
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function bootstrap(D, M, rows, B, seed) {
  const rnd = mulberry32(seed), idx = {}, rk = rows.map(() => []), cv = [], co = [];
  rows.forEach((r, i) => { idx[r.slug] = i; });
  const draw = a => a.map(() => a[Math.floor(rnd() * a.length)]);
  for (let b = 0; b < B; b++) {
    const m = { value: fitValue(D, draw(D.peers), M.value.terms), odds: fitOdds(D, draw(D.pool), M.odds.terms, 12) };
    cv.push(m.value.b); co.push(m.odds.b);
    for (const x of rankRows(D, m, D.ranked)) rk[idx[x.slug]].push(x.rank);
  }
  const se = l => l[0].map((_, j) => sd(l.map(r => r[j])));
  rows.forEach((r, i) => { const a = rk[i]; r.ranks = a; r.rr = [Math.min(r.rank, ...a), Math.max(r.rank, ...a)]; });
  return { B, seed, seV: se(cv), seO: se(co) };
}

// farmPlan(): costed, timed steps; minDeposit(): smallest ladder rung that reaches FARM, else best net/hour
const LADDER = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const GAS = { Ethereum: 1.5, Bitcoin: 2, Tron: 0.6, Arbitrum: 0.1, Base: 0.08, Optimism: 0.1, Solana: 0.05, Binance: 0.1, Polygon: 0.05, Avalanche: 0.15, Sui: 0.05, Aptos: 0.05, Sonic: 0.05, Hyperliquid: 0.05, 'Hyperliquid L1': 0.05, Monad: 0.05, Plasma: 0.05, Mantle: 0.08, Linea: 0.1, Scroll: 0.1 };
const SCEN = { share: 0.07, weeks: 12, tbill: 0.04, target: 25 };
const gasOf = c => GAS[c] != null ? GAS[c] : 0.2;
const cheapest = p => p.chains.reduce((b, c) => !b || gasOf(c) < gasOf(b) ? c : b, null) || 'Ethereum';
function usd(v) { const a = Math.abs(v), s = v < 0 ? '-$' : '$'; return a >= 1e9 ? s + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? s + (a / 1e3).toFixed(1) + 'K' : a >= 100 ? s + String(Math.round(a)).replace(/\B(?=(\d{3})+$)/g, ',') : s + a.toFixed(2); }
function enterStep(p, d, ch) {
  const c = p.cat.toLowerCase(), u = usd(d) + ' USDC', n = p.name;
  if (/lending|cdp|credit/.test(c)) return [2, `supply ${u} to ${n} on ${ch}, borrow at most 30% LTV against it`];
  if (/dex|liquidity|amm/.test(c)) return [4, `add ${u} to ${n}'s deepest stablecoin pool on ${ch}, plus one round-trip swap`];
  if (/derivative|perp|option|prediction/.test(c)) return [3, `margin ${u} into ${n}'s LP vault on ${ch}, or equal long and short 1x (price-neutral)`];
  if (/rwa/.test(c)) return [2, `pass ${n}'s identity checks, then subscribe ${u} on ${ch}`];
  if (/staking|collateral|restaking|bitcoin|btc/.test(c)) return [2, `stake ${u} through ${n}'s own pool on ${ch}`];
  if (/curator|allocator|yield|vault|farm|index/.test(c)) return [2, `deposit ${u} into ${n}'s largest stablecoin vault on ${ch}; read curator, fees and withdrawal queue first`];
  if (/chain|payment/.test(c)) return [3, `bridge ${u} onto ${n}, park it in the largest native stablecoin pool, one payment or swap a week`];
  if (/basis|synthetic|stable/.test(c)) return [3, `mint ${n}'s dollar at par with ${u} on ${ch} and stake it`];
  return [2, `deposit ${u} into ${n}'s largest stablecoin vault on ${ch}`];
}
function farmPlan(D, r, sc) {
  const p = r.p, d = sc.deposit, W = sc.weeks, ch = cheapest(p), g = gasOf(ch), br = ch === 'Ethereum' ? 0 : 2 + 0.0005 * d, en = enterStep(p, d, ch);
  const fy = d * SCEN.tbill * W / 52, drop = r.implied * sc.share * d / (p.tvl + d);
  const S = [
    ['Day 0', `Verify: open ${p.name}'s official docs from its DefiLlama page and match every contract address on ${ch}; never sign an approval sent by DM, ad or reply`, 0, 15, 0],
    ['Day 0', `Fund: move ${usd(d)} USDC to a fresh wallet on ${ch}` + (br ? ` (bridge in ${usd(br / 2)})` : ' (no bridge needed)'), 1, 15, g + br / 2],
    ['Day 0', 'Enter: ' + en[1], en[0], 15, en[0] * g],
    ['Day 0', 'Record: log date, amount, tx hashes and wallet in a sheet so any drop and its tax lot can be traced', 0, 10, 0],
    ['Day 1', `Risk cap: keep the position at ${usd(d)}; ${p.name} records no token on DefiLlama, so any drop is this model's estimate, not a promise; contract and depeg risk stay with you`, 0, 5, 0],
    ['Weekly ×' + W, `Monitor: check the position and ${p.name}'s TVL (${usd(p.tvl)} today); one claim or touch transaction a week`, W, 5 * W, W * g],
    ['Any day', `Exit rule: if TVL falls more than ${D.exitPct}% in one week (worse than 9 in 10 protocols this week), withdraw that day`, 0, 5, 0],
    ['Day ' + 7 * W, 'Exit: withdraw' + (br ? `, bridge back (${usd(br / 2)})` : '') + ' and close the sheet with the final balance', 2, 20, 2 * g + br / 2]
  ];
  let tx = 0, mins = 0; for (const s of S) { tx += s[2]; mins += s[3]; }
  const gas = tx * g, cost = gas + br + fy, net = drop - cost, h = mins / 60, nph = net / h;
  const v = net > 0 && nph >= SCEN.target ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  S.push(['Budget', `All in: gas ${usd(gas)} (${tx} tx at $${g} on ${ch}) + bridge ${usd(br)} + forgone T-bill ${usd(fy)} (4% × ${W} wk on ${usd(d)}) against a modelled drop of ${usd(drop)} = ${Math.round(sc.share * 100)}% of ${usd(r.implied)} × ${usd(d)} ÷ (TVL + deposit); net ${usd(net)}, ${usd(nph)} an hour → ${v}`, 0, mins, cost]);
  return { steps: S.map(s => ({ day: s[0], text: s[1], tx: s[2], min: s[3], cost: s[4] })), chain: ch, gasTx: g, tx, gas, bridge: br, fy, cost, drop, net, hours: h, nph, verdict: v, deposit: d, weeks: W, share: sc.share };
}
function minDeposit(D, r, sc) {
  let best = null;
  for (const d of LADDER) { const f = farmPlan(D, r, { share: sc.share, weeks: sc.weeks, deposit: d }); if (f.verdict === 'FARM') return f; if (!best || f.nph > best.nph) best = f; }
  return best;
}
const stepText = s => { const t = s.day === 'Budget' ? ' total' : ''; return `${s.day} · ${s.text}. Cost: $${s.cost.toFixed(2)}${t} · Time: ${s.min} min${t}`; };
// checksum: 32-bit FNV-1a over "slug|rank|implied_value_usd" lines
function fnv(rows) {
  const s = rows.map(r => r.slug + '|' + r.rank + '|' + r.implied).join('\n'); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function plans(R, sc) { for (const r of R.rows) r.plan = minDeposit(R.D, r, sc); return R; }

function fit(snap) {
  const D = prep(snap); ledger(D);
  D.exitPct = Math.round(-quant(sorted(D.P.filter(p => p.c7 != null).map(p => p.c7)), 0.1));
  const sv = stepValue(D), so = stepOdds(D), M = { value: fitValue(D, D.peers, sv.terms), odds: fitOdds(D, D.pool, so.terms, 12) };
  const cal = calibrate(D, sv.terms), rows = rankRows(D, M, D.ranked);
  for (const r of rows) { r.name = r.p.name; r.tier = r.p.gr; r.band = cal.band.map(b => Math.max(1, Math.round(r.implied * X(b)))); }
  return { D, sv, so, M, cal, rows, checksum: fnv(rows) };
}
function run(snap, opt) {
  const R = fit(snap);
  R.boot = bootstrap(R.D, R.M, R.rows, (opt && opt.B) || 200, 20261114);
  return plans(R, { share: SCEN.share, weeks: SCEN.weeks });
}

const api = { prep, ledger, fitValue, fitOdds, heldOut, calibrate, impliedValue, farmPlan, minDeposit, bootstrap, rankRows, plans, run, fit, fnv, stepText, usd, predV, predO, row, quant, sorted, LADDER, GAS, SCEN };
if (typeof window !== 'undefined') window.Radar = api;
if (typeof module !== 'undefined') module.exports = api;
})();
