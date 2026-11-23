// Page: refits the model from data.js via radar.js, then draws board, tabs and detail.
(() => {
'use strict';
const RD = window.RADAR_DATA, Rd = window.Radar, usd = Rd.usd, L = Math.log, X = Math.exp, app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pc = (v, d) => (v * 100).toFixed(d || 0) + '%';
const sg = v => (v >= 0 ? '+' : '−') + usd(Math.abs(v));
const sn = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
const cls = v => v > 0 ? 'pos' : 'neg';
const c7 = p => p.c7 == null ? '<span class="mu">n/a</span>' : `<span class="${p.c7 >= 0 ? 'pos' : 'neg'}">${sn(p.c7, 1)}%</span>`;
const ageT = p => !p.listed ? '<span class="mu">undated</span>' : p.age * 365.25 < 365 ? Math.round(p.age * 365.25) + ' d' : p.age.toFixed(1) + ' yr';
const fn = n => `<code>${n}()</code>`;
const tn = v => `<td class="n">${v}</td>`;
const chip = v => `<span class="vc ${v}">${v}</span>`;
const TIER = { watch: 'watchlist', early: 'early', off: 'off-list' };
const badge = t => `<span class="bd b-${t}">${TIER[t]}</span>`;
const TNAME = { size: 'size, log TVL', carry: '7-day carry', chains: 'chains, log', age: 'years listed', fam: 'category', growth: '7-day growth', flat: 'flat cap/TVL', base: 'base rate' };
const TN = t => TNAME[t] || t;
const tbl = (head, rows, c) => `<table class="${c || 'ev'}"><tr>${head.map(h => h[0] === '>' ? `<th class="n">${h.slice(1)}</th>` : `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table>`;
const card = (h, b, c) => `<div class="card ${c || ''}"><h3>${h}</h3>${b}</div>`;

// ---------- refit everything from the raw snapshot, in this browser
const snap = { as_of: RD.as_of, source: RD.source, floor_usd: RD.floor_usd, watchlist: RD.watchlist, protocols: RD.protocols.map(a => Object.fromEntries(RD.cols.map((k, i) => [k, a[i]]))) };
const R = Rd.run(snap), D = R.D, M = R.M, N = R.rows.length;
const same = R.rows.filter((r, i) => { const b = RD.board[i]; return b && b[0] === r.slug && b[1] === r.rank && b[2] === r.implied; }).length;
const CK = R.checksum === RD.checksum, OK = same === N && RD.board.length === N && CK;
const BY = Object.fromEntries(R.rows.map(r => [r.slug, r]));
const PEER = Object.fromEntries(R.cal.peerSlugs.map((s, i) => [s, R.cal.res[i]]));
const DEF = { share: 7, weeks: 12, verdict: 'All', tier: 'All', q: '', cat: '', chain: '', sort: 'rank', dir: 1, open: '', tab: 'no' };
const S = Object.assign({ ev: 1 }, DEF);
const replan = () => Rd.plans(R, { share: S.share / 100, weeks: S.weeks });
const counts = rows => rows.reduce((c, r) => (c[r.plan.verdict]++, c), { FARM: 0, MARGINAL: 0, SKIP: 0 });

// ---------- hash state: #verdict=FARM&sort=nethour&open=<slug> or #p=<slug>&weeks=8
const parse = () => Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map(kv => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))]; }));
let boardHash = '';
function toHash() { boardHash = Object.keys(DEF).filter(k => S[k] !== DEF[k]).map(k => k + '=' + encodeURIComponent(S[k])).join('&'); history.replaceState(null, '', '#' + boardHash); }

// ---------- shared pieces
const LO = L(Math.min(...R.rows.map(r => r.band[0]))), HI = L(Math.max(...R.rows.map(r => r.band[3])));
function strip(r, w) {
  const x = v => (2 + (L(v) - LO) / (HI - LO) * (w - 4)).toFixed(1);
  return `<svg class="st" width="${w}" height="10"><line x1="${x(r.band[0])}" x2="${x(r.band[3])}" y1="5" y2="5"/><rect x="${x(r.band[1])}" width="${(x(r.band[2]) - x(r.band[1])).toFixed(1)}" y="2" height="6"/><line class="tk" x1="${x(r.implied)}" x2="${x(r.implied)}" y1="0" y2="10"/></svg>`;
}
const sub = p => esc(p.cat) + ' · ' + esc(p.chains[0] || '') + (p.chains.length > 1 ? ' +' + (p.chains.length - 1) : '');
function planTable(f) {
  const rows = f.steps.map((s, i) => { const b = s.day === 'Budget'; return `<tr${b ? ' class="bud"' : ''}><td><i>${i + 1}</i> ${esc(s.day)}</td><td>${esc(s.text)}</td><td class="n">$${s.cost.toFixed(2)}</td>${tn(b ? f.hours.toFixed(1) + ' h' : s.min + ' min')}</tr>`; });
  rows.push(`<tr class="all"><td></td><td><b>All in: ${f.steps.length} steps over ${7 * f.weeks} days on ${usd(f.deposit)}, expected drop ${usd(f.drop)}: net ${sg(f.net)}, ${sg(f.nph)} an hour</b> → ${chip(f.verdict)}</td><td class="n"><b>$${f.cost.toFixed(2)}</b></td><td class="n"><b>${f.hours.toFixed(1)} h</b></td></tr>`);
  return tbl(['When', 'Step', '>Cost', '>Time'], rows, 'plan');
}
function head() {
  const ca = D.cnt, on = !parse().p, t = (k, l, n) => `<a class="tab${S.tab === k && on ? ' on' : ''}" data-tab="${k}">${l} <em>${n}</em></a>`;
  return `<header><div class="ti"><h1><span>T</span>oken Launch Radar</h1><p>pre-token DeFi protocols, valued from the snapshot's own record</p></div><nav>${t('no', 'No token yet', N)}${t('tok', 'Token trades', ca.peer)}${t('aside', 'Set aside', ca.bridge + ca.lst + ca.cex + ca.ver)}</nav>` +
    `<div class="hr"><p>DefiLlama snapshot <b>${esc(RD.as_of)}</b> · ${D.n} protocols read · no network · model refitted in this browser</p><p><span class="ck ${CK ? 'ok' : 'bad'}">${CK ? '✓' : '✗'} checksum ${R.checksum} = main.ts</span><span class="ck ${OK ? 'ok' : 'bad'}">${OK ? '✓' : '✗'} ${same} of ${N} rows recomputed = board.json</span></p></div></header>`;
}
const formula = () => `<div class="fx"><b>Implied value = launch value</b> ${fn('fitValue')} (TVL carried at its 7-day change) <b>× launch odds</b> ${fn('fitOdds')} (${R.so.terms.map(TN).join(' + ')}) · range ${fn('calibrate')} from held-out misses · rank range ${fn('bootstrap')}</div>`;

// ---------- KPI strip and ledger
function kpis() {
  const v = R.sv, o = R.so, c = R.cal, k = counts(R.rows), vt = v.table.length - 1, ot = o.table.length - 1;
  const kp = (h, big, txt, c2) => `<div class="kp ${c2 || ''}"><h4>${h}</h4><b>${big}</b><p>${txt}</p></div>`;
  return '<section class="kps">' +
    kp('Held-out miss · WF', `×${v.final[1].toFixed(2)} <small>vs ×${v.flat[1].toFixed(2)} flat</small>`, `a later-listed token's cap priced only from earlier peers is typically off by this; leave-one-out ×${v.final[0].toFixed(2)} (flat ×${v.flat[0].toFixed(2)}), ${D.peers.length} traded`) +
    kp('Range honesty', `${pc(c.split[0])} · ${pc(c.split[1])}`, `real caps inside P25–P75 · P10–P90 (stated 50 · 80), scored on the half not used to set it; walk-forward ${pc(c.wf[0])} · ${pc(c.wf[1])}`) +
    kp('Token odds · Brier', `${o.final[0].toFixed(3)} <small>vs ${o.table[0].a.toFixed(3)} base</small>`, `ten-fold over ${D.pool.length} stand-alone protocols; walk-forward ${o.final[1].toFixed(3)} vs ${o.table[0].b.toFixed(3)}`) +
    kp('Terms kept', `${v.terms.length} of ${vt} · ${o.terms.length} of ${ot}`, `value keeps 7-day carry (it replaced size); odds keep ${o.terms.map(TN).join(', ')}`) +
    kp(`Farm · ${S.share}%, ${S.weeks} wk`, `${k.FARM} <small>farm ·</small> ${k.MARGINAL} <small>marg.</small>`, `of ${N}: net of gas, bridge and 4% T-bill clears $25/h at the smallest deposit; ${k.SKIP} SKIP`, 'hi') +
    kp('Watchlist ranked', `${R.rows.filter(r => r.tier === 'watch').length} / ${RD.watchlist.length}`, `plus ${D.cnt.early} early (< ${usd(RD.floor_usd)} TVL) and ${D.cnt.off} off-list pre-token protocols`) + '</section>';
}
const GL = [['watch', 'Ranked · watchlist'], ['early', 'Ranked · early, below the floor'], ['off', 'Ranked · off-list, above the floor'], ['peer', 'Token trades · priced peer'], ['nocap', 'Token recorded · no usable cap'], ['bridge', 'Set aside · bridge'], ['lst', 'Set aside · liquid (re)staking'], ['cex', 'Set aside · exchange'], ['ver', 'Set aside · product of a parent']];
function ledgerBar() {
  const c = D.cnt, tot = GL.reduce((a, g) => a + (c[g[0]] || 0), 0), mono = R.rows.every((r, i) => !i || r.implied <= R.rows[i - 1].implied), sum = R.rows.reduce((a, r) => a + r.implied, 0), w = RD.watchlist.filter(s => BY[s]).length;
  const ck = (ok, t) => `<span class="ck ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${t}</span>`;
  return `<section class="led"><h3>${fn('ledger')} Protocol accounting <small>all ${D.n} protocols in exactly one group · set aside: bridges, liquid (re)staking, exchanges, parent-named products</small></h3><div class="bar">${GL.map(g => `<span class="g-${g[0]}" style="flex:${c[g[0]] || 0}"></span>`).join('')}</div>` +
    `<div class="lg">${GL.map(g => `<span><i class="g-${g[0]}"></i>${g[1]} <b>${c[g[0]] || 0}</b></span>`).join('')}</div><div>${ck(tot === D.n, `ledger ${tot} of ${D.n}`)}${ck(mono, `ranks 1–${N}, values never rise`)}${ck(w === RD.watchlist.length, `watchlist ${w} of ${RD.watchlist.length}`)}${ck(OK, 'totals equal: ' + usd(sum) + ' implied')}</div></section>`;
}

// ---------- evidence (sidebar) and scatter
function scatter(w, h, hl) {
  const xs = [], ys = [], px = 36;
  D.peers.forEach(p => { xs.push(L(p.tvl)); ys.push(L(p.mcap)); });
  R.rows.forEach(r => { xs.push(L(r.p.tvl)); ys.push(L(r.launch)); });
  const x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2, y0 = Math.min(...ys) - 0.3, y1 = Math.max(...ys) + 0.3;
  const XX = v => (px + (v - x0) / (x1 - x0) * (w - px - 6)).toFixed(1), YY = v => (h - 18 - (v - y0) / (y1 - y0) * (h - 28)).toFixed(1);
  const ln = v => Rd.predV(D, M.value, { f: { size: v, carry: v }, cat: '' });
  let s = `<svg class="sc" viewBox="0 0 ${w} ${h}">`;
  for (const t of [1e6, 1e7, 1e8, 1e9, 1e10, 1e11]) {
    const l = L(t), lab = usd(t).replace('.0', '');
    if (l > x0 && l < x1) s += `<line class="gx" x1="${XX(l)}" x2="${XX(l)}" y1="10" y2="${h - 18}"/><text x="${XX(l)}" y="${h - 5}" text-anchor="middle">${lab}</text>`;
    if (l > y0 && l < y1) s += `<line class="gx" x1="${px}" x2="${w}" y1="${YY(l)}" y2="${YY(l)}"/><text x="${px - 3}" y="${+YY(l) + 3}" text-anchor="end">${lab}</text>`;
  }
  D.peers.forEach(p => { s += `<circle class="pa" cx="${XX(L(p.tvl))}" cy="${YY(L(p.mcap))}" r="2.3"/>`; });
  R.rows.forEach(r => { s += `<circle class="pv" cx="${XX(L(r.p.tvl))}" cy="${YY(L(r.launch))}" r="1.9"/>`; });
  s += `<line class="fl" x1="${XX(x0)}" y1="${YY(ln(x0))}" x2="${XX(x1)}" y2="${YY(ln(x1))}"/>`;
  if (hl) { const a = XX(L(hl.p.tvl)), b = YY(L(hl.launch)); s += `<circle class="hl" cx="${a}" cy="${b}" r="6"/><text class="hlt" x="${+a + 9}" y="${+b - 7}">${esc(hl.name)}</text>`; }
  return s + '</svg>';
}
const stCls = st => ({ base: 'mu', kept: 'pos', replaced: 'am' }[st] || 'neg');
function evTables() {
  const step = (t, f) => t.map(r => `<tr class="${r.st === 'kept' ? 'kp1' : ''}"><td>${r.st === 'base' ? '' : '+ '}${TN(r.term)}</td>${tn(f(r.a))}${tn(f(r.b))}<td class="${stCls(r.st)}">${r.st}</td></tr>`);
  const c = R.cal, hon = [['within ×3 of the model', 2], ['inside P25–P75, stated 50%', 0], ['inside P10–P90, stated 80%', 1]].map(h => `<tr><td>${h[0]}</td>${tn(pc(c.split[h[1]]))}${tn(pc(c.wf[h[1]]))}</tr>`);
  const bo = M.odds.b, so = R.boot.seO, sd = D.st.carry.sd, ot = []; let j = 1;
  for (const t of M.odds.terms) {
    if (t === 'fam') { const f = bo.slice(j, j + M.odds.fams.length); ot.push(`category ${M.odds.fams.length} families ${sn(Math.min(...f), 2)} to ${sn(Math.max(...f), 2)}`); j += f.length; }
    else { ot.push(`${TN(t)} ${sn(bo[j], 2)} ± ${so[j].toFixed(2)}`); j++; }
  }
  return `<h5>Value if a token launches · median miss, ${D.peers.length} traded tokens</h5>${tbl(['Term, in order', '>Left out', '>Walk-fwd', ''], step(R.sv.table, v => '×' + v.toFixed(2)))}` +
    `<h5>Token odds · Brier, ${D.pool.length} stand-alone protocols</h5>${tbl(['Term, in order', '>Ten-fold', '>Walk-fwd', ''], step(R.so.table, v => v.toFixed(4)))}` +
    `<h5>Is the printed range honest? ${fn('calibrate')}</h5>${tbl(['Share of real caps', '>Other half', '>Walk-fwd'], hon)}` +
    `<p class="note">Fitted, ± bootstrap s.e. (${R.boot.B} refits, seed ${R.boot.seed}): cap ∝ TVL<sup>${(M.value.b[1] / sd).toFixed(2)}</sup> ± ${(R.boot.seV[1] / sd).toFixed(2)}; odds logit per s.d.: ${ot.join('; ')}.</p>`;
}
const judge = () => `<div class="jb"><h4>For the judge, in criteria order</h4><ol><li><b>Working radar</b> → ${fn('ledger')} ${D.n}/${D.n}, watchlist 40/40, checksum ${R.checksum} recomputed here = main.ts</li>` +
  `<li><b>Value model</b> → ${fn('fitValue')} TVL carried at its 7-day change; ${fn('fitOdds')} years listed with no token + family + 7-day growth + size; ${fn('impliedValue')} = product</li>` +
  `<li><b>Farm plans</b> → ${fn('farmPlan')} cost + time per step; ${fn('minDeposit')} smallest deposit that pays $25/h</li><li><b>Use</b> → sort headers, filter verdict / tier / category / chain, row = plan, name = detail</li>` +
  `<li><b>Made</b> → ink-and-amber palette, mono numbers, no framework, no network</li></ol></div>`;
const evidence = () => `<aside class="side">${judge()}<div class="evp"><h4><a data-act="ev">▾ Out-of-sample evidence</a> ${fn('heldOut')}</h4>${evTables()}<h5>Cap on TVL: traded (amber), board launch value (violet), fit line</h5>${scatter(290, 190)}` +
  `<p class="note">Fixed settings: Huber 12 it., h = 0.3·MAD, ridge λ 3 (family ×8, ≥ 5), 5–95% winsor; logistic L2 λ 1, Newton 8/12 it., family ≥ 8; walk-forward 6 chunks; ${fn('bootstrap')} 200, seed 20261114.</p></div></aside>`;

// ---------- board
const KEY = { rank: r => r.rank, name: r => r.name.toLowerCase(), tvl: r => r.p.tvl, c7: r => r.p.c7 == null ? -1e9 : r.p.c7, age: r => r.p.age, odds: r => r.odds, launch: r => r.launch, implied: r => r.implied, plan: r => r.plan.deposit, net: r => r.plan.net, nethour: r => r.plan.nph };
const SL = { c7: '7-day change', age: 'no-token age', odds: 'token odds', launch: 'launch value', implied: 'implied value', plan: 'deposit', nethour: 'net / hour' };
const asc = k => k === 'rank' || k === 'name';
function filtered() {
  const q = S.q.toLowerCase(), k = KEY[S.sort] || KEY.rank, d = asc(S.sort) ? S.dir : -S.dir;
  return R.rows.filter(r => (S.verdict === 'All' || r.plan.verdict === S.verdict) && (S.tier === 'All' || r.tier === S.tier) && (!S.cat || r.p.cat === S.cat) && (!S.chain || r.p.chains.includes(S.chain)) &&
    (!q || (r.name + ' ' + r.p.cat + ' ' + r.p.chains.join(' ')).toLowerCase().includes(q))).sort((x, y) => { const u = k(x), v = k(y); return (u < v ? -1 : u > v ? 1 : 0) * d || x.rank - y.rank; });
}
const th = (k, l, c) => `<th class="${c || 'n'}${S.sort === k ? ' on' : ''}" data-sort="${k}">${l}${S.sort === k ? (S.dir * (asc(k) ? 1 : -1) > 0 ? ' ▴' : ' ▾') : ''}</th>`;
function trow(r) {
  const p = r.p, f = r.plan, op = S.open === r.slug;
  return `<tr class="r${op ? ' op' : ''}" data-s="${r.slug}"><td class="rk"><b>${r.rank}</b><i>${r.rr[0]}–${r.rr[1]}</i></td><td class="pn"><a class="nm" data-p="${r.slug}">${esc(r.name)}</a> ${badge(r.tier)}<i>${sub(p)}</i></td>` +
    `${tn(usd(p.tvl))}${tn(c7(p))}${tn(ageT(p))}<td class="od"><em>${pc(r.odds)}</em><span class="ob"><span style="width:${pc(r.odds)}"></span></span></td>${tn(usd(r.launch))}` +
    `<td class="iv">${strip(r, 50)}<b>${usd(r.implied)}</b><i>${usd(r.band[1])}–${usd(r.band[2])}</i></td><td class="fp">${usd(f.deposit)} · ${7 * f.weeks} d · ${f.steps.length} steps<i>${op ? '▴' : '▾'} ${esc(f.chain)} · cost ${usd(f.cost)}</i></td>` +
    `<td class="vd">${chip(f.verdict)} <b class="${cls(f.net)}">${sg(f.net)}</b><i>${usd(f.drop)} − ${usd(f.cost)}</i></td><td class="n nh"><b class="${cls(f.nph)}">${sg(f.nph)}</b><i>${f.hours.toFixed(1)} h</i></td></tr>` +
    (op ? `<tr class="pl"><td colspan="11">${planTable(f)}</td></tr>` : '');
}
function boardTable() {
  const a = filtered(), tv = a.reduce((s, r) => s + r.p.tvl, 0), iv = a.reduce((s, r) => s + r.implied, 0), net = a.reduce((s, r) => s + r.plan.net, 0);
  let cap = '';
  if (Object.keys(DEF).some(k => k !== 'tab' && S[k] !== DEF[k])) {
    const fl = [S.verdict !== 'All' && S.verdict, S.tier !== 'All' && TIER[S.tier], S.cat && esc(S.cat), S.chain && esc(S.chain), S.q && '“' + esc(S.q) + '”'].filter(Boolean).map(x => `<b>${x}</b>`).join(' + ') || '<b>all rows</b>';
    cap = `<div class="cap">Filtered to ${fl} · sorted by <b>${SL[S.sort] || S.sort}</b>${asc(S.sort) ? '' : ' (best first)'} · scenario ${S.share}% drop, ${S.weeks} weeks${S.open && BY[S.open] ? ` · plan open: <b>${esc(BY[S.open].name)}</b>` : ''} · ${a.length} of ${N} rows, ${sg(net)} combined net</div>`;
  }
  return cap + `<p class="sum">${a.length} of ${N} rows · ${usd(tv)} TVL · ${usd(iv)} implied</p><table class="bt"><colgroup>${[62, 0, 64, 56, 62, 58, 64, 118, 160, 124, 68].map(w => w ? `<col style="width:${w}px">` : '<col>').join('')}</colgroup><thead><tr>` +
    th('rank', '# · range', 'c') + th('name', 'Protocol', 'l') + th('tvl', 'TVL') + th('c7', '7D') + th('age', 'No-token age') + th('odds', 'Token odds') + th('launch', 'If it launches') + th('implied', 'Implied · P25–P75') + th('plan', 'Farm plan', 'l') + th('net', 'Verdict · net', 'l') + th('nethour', 'Net / hour') +
    `</tr></thead><tbody>${a.map(trow).join('')}</tbody></table>`;
}
const opts = (list, cur, all) => `<option value="">${all}</option>` + list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
function controls() {
  const k = counts(R.rows), t = { All: N, watch: D.cnt.watch, early: D.cnt.early, off: D.cnt.off };
  const seg = (n, list, lab, cn) => `<span class="seg">${list.map(v => `<a data-${n}="${v}" class="${S[n] === v ? 'on' : ''}">${lab[v] || v} <em>${cn[v]}</em></a>`).join('')}</span>`;
  const cats = [...new Set(R.rows.map(r => r.p.cat))].sort(), chs = [...new Set([].concat(...R.rows.map(r => r.p.chains)))].sort();
  return `<div class="ctl">${seg('verdict', ['All', 'FARM', 'MARGINAL', 'SKIP'], { FARM: 'Farm', MARGINAL: 'Marginal', SKIP: 'Skip' }, Object.assign({ All: N }, k))}${seg('tier', ['All', 'watch', 'early', 'off'], { All: 'All tiers', watch: 'Watchlist', early: 'Early', off: 'Off-list' }, t)}` +
    `<input class="q" placeholder="Search name, category, chain" value="${esc(S.q)}" data-in="q"></div>` +
    `<div class="ctl"><label class="sl">Drop share <input type="range" min="3" max="15" value="${S.share}" data-in="share"><b>${S.share}%</b></label><label class="sl">Horizon <input type="range" min="2" max="26" value="${S.weeks}" data-in="weeks"><b>${S.weeks} wk</b></label><select data-in="cat">${opts(cats, S.cat, 'All categories')}</select><select data-in="chain">${opts(chs, S.chain, 'All chains')}</select>` +
    `<a class="btn" data-act="reset">Reset</a><a class="btn" data-act="csv">CSV</a><a class="btn" data-act="json">JSON</a></div>`;
}
const boardView = () => head() + `<main class="bv${S.ev ? '' : ' wide'}"><div class="col">${S.ev ? formula() + kpis() + ledgerBar() : `<div class="fx"><a data-act="ev">▸ Show evidence, KPIs and ledger</a> · implied value = launch value ${fn('fitValue')} × launch odds ${fn('fitOdds')} · plans ${fn('farmPlan')} at ${fn('minDeposit')}</div>`}<div id="ctls">${controls()}</div><div id="tbl">${boardTable()}</div></div>${S.ev ? evidence() : ''}</main>` ;

// ---------- token and set-aside tabs
function peerRow(q, lead) { const e = PEER[q.slug], m = X(Math.abs(e)); return `<tr><td>${lead}</td>${tn(usd(q.mcap))}${tn((q.mcap / q.tvl).toFixed(2))}${tn(usd(q.mcap / X(e)))}<td class="n">×${m.toFixed(2)} ${m > 10 ? '<span class="neg">outlier</span>' : e > 0 ? 'low' : 'high'}</td></tr>`; }
function peersView() {
  const a = D.peers.slice().sort((x, y) => y.mcap - x.mcap), nc = D.P.filter(p => p.gr === 'nocap').sort((x, y) => y.tvl - x.tvl);
  const rows = a.map(p => peerRow(p, `<b>${esc(p.name)}</b> <span class="mu">${esc(p.sym || '')}</span></td><td>${esc(p.cat)}</td>${tn(usd(p.tvl))}<td class="n">${c7(p)}`));
  return head() + `<main class="one"><p class="lead">${a.length} tokens with a market cap train ${fn('fitValue')}; blind model = leave-one-out prediction.</p>${tbl(['Token trades', 'Category', '>TVL', '>7D', '>Market cap', '>Cap/TVL', '>Blind model', '>Miss'], rows)}` +
    `<h3 class="h3">Token recorded · no usable cap <em>${nc.length}</em></h3><p class="lead">A token (a 1 in ${fn('fitOdds')}) but no positive cap, so no value training.</p><div class="chipl">${nc.map(p => `<span>${esc(p.name)} <i>${usd(p.tvl)}</i></span>`).join('')}</div></main>`;
}
function asideView() {
  const G = { bridge: 'bridge', lst: 'liquid staking / restaking', cex: 'exchange', ver: 'product of a parent' };
  return head() + `<main class="one"><p class="lead">${fn('ledger')} sets these aside before any fit: bridges, staking wrappers and exchanges are not launches; a no-token product sharing a tokened protocol's name is that parent's.</p>` +
    Object.keys(G).map(g => { const a = D.P.filter(p => p.gr === g).sort((x, y) => y.tvl - x.tvl); return `<h3 class="h3">Set aside · ${G[g]} <em>${a.length}</em></h3><div class="chipl">${a.map(p => `<span>${esc(p.name)} <i>${esc(p.cat)} · ${usd(p.tvl)}</i></span>`).join('')}</div>`; }).join('') + '</main>';
}

// ---------- detail
function variant(p, tvl, g, age) { const q = Object.create(p); q.tvl = tvl; q.g = g; q.age = age; q.f = { size: L(tvl), carry: L(tvl * (1 + g)), chains: p.f.chains, age, growth: g }; return q; }
const REF = { f: { size: L(1e8), carry: L(1e8), chains: 0, age: 0, growth: 0 }, cat: '—' };
function contrib(m, p) {
  const a = Rd.row(D, p, m.terms, m.fams), b = Rd.row(D, REF, m.terms, m.fams), parts = []; let j = 1;
  for (const t of m.terms) { const n = t === 'fam' ? m.fams.length : 1; let s = 0; for (let k = j; k < j + n; k++) s += m.b[k] * (a[k] - b[k]); parts.push([t, s]); j += n; }
  return { base: m.b.reduce((s, v, k) => s + v * b[k], 0), parts };
}
function buildUp(r) {
  const p = r.p, cv = contrib(M.value, p), co = contrib(M.odds, p), tr = (a, b, c, d, k) => `<tr${k ? ` class="${k}"` : ''}><td>${a}</td>${tn(b)}${tn(c)}<td class="n mu">${d}</td></tr>`;
  let h = tr('Curve base: $100M TVL, flat week', '', usd(X(cv.base)), `e<sup>${cv.base.toFixed(2)}</sup>`);
  cv.parts.forEach(t => { h += tr(`× ${TN(t[0])}, log TVL × (1+7d)`, usd(p.tvl * (1 + p.g)), '×' + X(t[1]).toFixed(2), 'log ' + sn(t[1], 3)); });
  h += tr('= Launch value', '', usd(r.launch), 'value if a token launches', 'tot') + tr('Odds base: new, $100M, flat week, pooled family', '', sn(co.base, 2), 'log-odds');
  co.parts.forEach(t => { h += tr('+ ' + (t[0] === 'fam' ? 'family: ' + esc(M.odds.fams.includes(p.cat) ? p.cat : 'pooled') : TN(t[0])), t[0] === 'age' ? p.age.toFixed(2) + ' yr' : t[0] === 'size' ? usd(p.tvl) : t[0] === 'growth' ? pc(p.g, 1) : '', sn(t[1], 2), 'log-odds'); });
  const z = co.base + co.parts.reduce((s, t) => s + t[1], 0);
  return '<table class="bu">' + h + tr('= Launch odds', '', pc(r.odds, 1), `1 / (1 + e<sup>${sn(-z, 2)}</sup>)`, 'tot') + tr(`Implied value = ${usd(r.launch)} × ${pc(r.odds, 1)}`, '', `<b>${usd(r.implied)}</b>`, `rank ${r.rank}, bootstrap ${r.rr[0]}–${r.rr[1]}`, 'tot2') + '</table>';
}
function comps(p) {
  const cp = D.peers.filter(q => q.mcap / q.tvl >= 0.01), near = a => a.sort((x, y) => Math.abs(L(x.tvl / p.tvl)) - Math.abs(L(y.tvl / p.tvl)));
  let cl = near(cp.filter(q => q.cat === p.cat)).slice(0, 5); if (cl.length < 5) cl = cl.concat(near(cp.filter(q => q.cat !== p.cat)).slice(0, 5 - cl.length));
  return tbl(['Token trades', '>TVL', '>Market cap', '>Cap/TVL', '>Blind model', '>Miss'], cl.map(q => peerRow(q, `${esc(q.name)} <span class="mu">${esc(q.sym || '')}${q.cat !== p.cat ? ' · ' + esc(q.cat) : ''}</span></td><td class="n">${usd(q.tvl)}`))) +
    '<p class="note">Rule: same category, closest TVL; cap/TVL below 0.01 skipped; blind = leave-one-out; miss above ×10 = outlier.</p>';
}
function hist(r) {
  const rk = r.ranks, [lo, hi] = r.rr, nb = Math.min(40, hi - lo + 1), bw = (hi - lo + 1) / nb, bins = new Array(nb).fill(0), bi = v => Math.min(nb - 1, Math.floor((v - lo) / bw));
  rk.forEach(v => bins[bi(v)]++);
  const mx = Math.max(...bins), s = rk.slice().sort((a, b) => a - b), t50 = rk.filter(v => v <= 50).length / rk.length;
  return `<svg class="hs" viewBox="0 0 600 80" preserveAspectRatio="none">${bins.map((b, k) => `<rect class="${k === bi(r.rank) ? 'own' : ''}" x="${(k * 600 / nb + 1).toFixed(1)}" width="${(600 / nb - 2).toFixed(1)}" y="${(78 - b / mx * 74).toFixed(1)}" height="${(b / mx * 74).toFixed(1)}"/>`).join('')}</svg>` +
    `<p class="hx"><span>#${lo}</span><span>P10–P90 #${s[Math.floor(rk.length * 0.1)]}–${s[Math.floor(rk.length * 0.9)]} · in top 50: ${pc(t50)} · this rank #${r.rank}</span><span>#${hi}</span></p>`;
}
function detailView(slug) {
  const r = BY[slug]; if (!r) return head() + '<main class="one"><p>Unknown protocol.</p></main>';
  const p = r.p, f = r.plan, i = r.rank - 1, prv = R.rows[i - 1], nxt = R.rows[i + 1], d0 = f.deposit, pl = (sh, dep, wk) => Rd.farmPlan(D, r, { share: sh, weeks: wk, deposit: dep });
  const nav = `<div class="dnav"><a class="btn" data-act="back">← Board, filters kept</a>${prv ? `<a class="btn" data-p="${prv.slug}">‹ #${prv.rank}</a>` : ''}${nxt ? `<a class="btn" data-p="${nxt.slug}">#${nxt.rank} ›</a>` : ''}<span class="am">scenario on this page: ${S.share}% of the implied value goes to users · ${S.weeks}-week hold · board default 7% · 12 wk</span></div>`;
  const hero = `<section class="hero"><div class="hrk"><b>#${r.rank}</b><i>of ${N} · range ${r.rr[0]}–${r.rr[1]}</i></div><div class="hnm"><h2>${esc(r.name)} ${badge(r.tier)} <span class="bd b-nt">records no token on DefiLlama</span></h2><p>${esc(p.cat)} · ${p.chains.length} chain${p.chains.length > 1 ? 's' : ''}: ${esc(p.chains.slice(0, 4).join(', '))}${p.chains.length > 4 ? ' +' + (p.chains.length - 4) : ''}</p></div>` +
    `<div class="hv"><h4>Implied value ${fn('impliedValue')}</h4><b>${usd(r.implied)}</b>${strip(r, 160)}<i>P25–P75 ${usd(r.band[1])}–${usd(r.band[2])} · P10–P90 ${usd(r.band[0])}–${usd(r.band[3])}</i></div>` +
    `<div class="hv"><h4>Farm verdict ${fn('farmPlan')}</h4><b>${chip(f.verdict)} ${sg(f.nph)}/h</b><i>net ${sg(f.net)} on ${usd(d0)} over ${7 * f.weeks} days · ${f.hours.toFixed(1)} h of work</i></div></section>`;
  const k6 = `<section class="k6">${[['TVL today', usd(p.tvl)], ['7-day change', p.c7 == null ? 'n/a' : sn(p.c7, 2) + '%'], ['Listed since', p.listed || 'undated'], ['No-token age', ageT(p)], ['Launch odds', pc(r.odds)], ['If it launches', usd(r.launch)]].map(k => `<div><h4>${k[0]}</h4><b>${k[1]}</b></div>`).join('')}</section>`;
  const shs = [S.share / 200, S.share / 100, S.share / 50], deps = [...new Set([1000, 10000, 50000, d0])].sort((a, b) => a - b), cell = x => `<td class="n c-${x.verdict}">${sg(x.net)}</td>`;
  const g1 = tbl([''].concat(shs.map(s => '>' + pc(s, 1))), deps.map(dp => `<tr${dp === d0 ? ' class="me"' : ''}><td>${usd(dp)}</td>${shs.map(s => cell(pl(s, dp, S.weeks))).join('')}</tr>`), 'gr');
  const ws = [4, 8, 12, 26].map(w => pl(S.share / 100, d0, w));
  const g2 = tbl(ws.map(x => '>' + x.weeks + ' wk'), [`<tr>${ws.map(cell).join('')}</tr>`, `<tr>${ws.map(x => `<td class="n mu">${sg(x.nph)}/h</td>`).join('')}</tr>`], 'gr');
  const mv = [['as recorded', p], ['TVL 30% lower', variant(p, p.tvl * 0.7, p.g, p.age)], ['TVL 30% higher', variant(p, p.tvl * 1.3, p.g, p.age)], ['7-day change 0%', variant(p, p.tvl, 0, p.age)], ['7-day change +20%', variant(p, p.tvl, 0.2, p.age)], ['six more months, still no token', variant(p, p.tvl, p.g, p.age + 0.5)]];
  const wm = tbl(['If', '>Launch value', '>Odds', '>Implied', '>vs now'], mv.map(m => { const v = Rd.impliedValue(D, M, m[1]); return `<tr><td>${m[0]}</td>${tn(usd(v.launch))}${tn(pc(v.odds))}${tn(usd(v.implied))}<td class="n">×${(v.implied / r.implied).toFixed(2)}</td></tr>`; }));
  const k2 = d0 / (p.tvl + d0), bes = f.cost / (r.implied * k2), bev = f.cost / (S.share / 100 * k2);
  const risk = `<div class="k3"><div><h4>Break-even drop share</h4><b>${pc(bes, 1)}</b><i>this page uses ${S.share}.0%</i></div><div><h4>Break-even value</h4><b>${usd(bev)}</b><i>implied ${usd(r.implied)} = ×${(r.implied / bev).toFixed(2)} cover</i></div><div><h4>Exit trigger TVL</h4><b>${usd(p.tvl * (1 - D.exitPct / 100))}</b><i>−${D.exitPct}% in one week</i></div></div><p class="note">All-in cost ${usd(f.cost)} = ${pc(f.cost / d0, 2)} of the deposit; below either break-even the plan loses money.</p>`;
  const nbt = tbl(['#', 'Protocol', '>Implied', '>Net/h', '>Verdict'], R.rows.slice(Math.max(0, i - 5), i + 6).map(x => `<tr${x === r ? ' class="me"' : ''}><td>${x.rank}</td><td><a data-p="${x.slug}">${esc(x.name)}</a></td>${tn(usd(x.implied))}${tn(sg(x.plan.nph))}${tn(chip(x.plan.verdict))}</tr>`));
  return head() + `<main class="dv">${nav}${hero}${k6}<div class="dg"><div>` + card(`Value build-up ${fn('fitValue')} × ${fn('fitOdds')}`, buildUp(r)) + card('Cap on TVL: this one (red ring) among traded (amber) and board (violet)', scatter(600, 270, r)) +
    card(`Nearest traded comparables · ${esc(p.cat)}, closest TVL`, comps(p)) + card(`Rank across ${R.boot.B} bootstrap refits ${fn('bootstrap')}`, hist(r)) + card(`Farm risk on ${usd(d0)} ${fn('farmPlan')}`, risk) +
    `</div><div>${card(`Farm plan · ${esc(f.chain)} · ${usd(d0)} ${fn('farmPlan')} ${fn('minDeposit')}`, planTable(f))}<div class="two">${card('Net by deposit × drop share', g1)}${card('Net by weeks held on ' + usd(d0), g2)}</div>` +
    card(`What moves the value ${fn('impliedValue')} on a changed record`, wm + `<p class="note">${fn('minDeposit')}: smallest rung of $250–$50K that clears $25/h, else best net/h. FARM ≥ $25/h, MARGINAL > 0, SKIP loses money. Gas, bridge fee and T-bill rate are stated assumptions, not quotes.</p>`) +
    card('Board neighbours', nbt) + '</div></div></main>';
}

// ---------- render + events
function render() {
  const h = parse();
  if (h.p) { if (h.weeks) S.weeks = +h.weeks; if (h.share) S.share = +h.share; replan(); app.innerHTML = detailView(h.p); return; }
  app.innerHTML = S.tab === 'tok' ? peersView() : S.tab === 'aside' ? asideView() : boardView();
}
function fromHash() {
  const h = parse(); if (h.p) return;
  Object.assign(S, DEF);
  for (const k in h) if (k in DEF) S[k] = typeof DEF[k] === 'number' ? +h[k] : h[k];
  S.ev = h.verdict || h.open || h.sort ? 0 : 1;
  replan();
}
function refresh() { toHash(); document.getElementById('tbl').innerHTML = boardTable(); document.getElementById('ctls').innerHTML = controls(); const k = document.querySelector('.kps'); if (k) k.outerHTML = kpis(); }
function dl(name, type, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
const exportRows = () => filtered().map(r => ({ rank: r.rank, slug: r.slug, name: r.name, tier: r.tier, category: r.p.cat, tvl_usd: r.p.tvl, odds: +r.odds.toFixed(4), implied_usd: r.implied, p25: r.band[1], p75: r.band[2], deposit: r.plan.deposit, net: +r.plan.net.toFixed(2), net_hour: +r.plan.nph.toFixed(2), verdict: r.plan.verdict }));
const csvCell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
app.addEventListener('click', e => {
  const t = e.target.closest('[data-p],[data-tab],[data-sort],[data-verdict],[data-tier],[data-act],tr.r'); if (!t) return;
  const d = t.dataset;
  if (d.p) location.hash = 'p=' + d.p + (S.weeks !== DEF.weeks ? '&weeks=' + S.weeks : '');
  else if (d.tab) { S.tab = d.tab; toHash(); render(); }
  else if (d.sort) { if (S.sort === d.sort) S.dir = -S.dir; else { S.sort = d.sort; S.dir = 1; } refresh(); }
  else if (d.verdict) { S.verdict = d.verdict; refresh(); }
  else if (d.tier) { S.tier = d.tier; refresh(); }
  else if (d.act === 'ev') { S.ev = S.ev ? 0 : 1; render(); }
  else if (d.act === 'back') location.hash = boardHash;
  else if (d.act === 'reset') { Object.assign(S, DEF); replan(); toHash(); render(); }
  else if (d.act === 'csv') { const a = exportRows(), ks = Object.keys(a[0] || {}); dl('token-radar.csv', 'text/csv', [ks.join(',')].concat(a.map(o => ks.map(k => csvCell(o[k])).join(','))).join('\n')); }
  else if (d.act === 'json') dl('token-radar.json', 'application/json', JSON.stringify({ as_of: RD.as_of, scenario: { share: S.share / 100, weeks: S.weeks }, rows: exportRows() }, null, 1));
  else if (d.s) { S.open = S.open === d.s ? '' : d.s; refresh(); }
});
app.addEventListener('input', e => {
  const k = e.target.dataset.in; if (!k) return;
  const v = e.target.value, num = k === 'share' || k === 'weeks';
  S[k] = num ? +v : v;
  if (num) { replan(); e.target.nextSibling.textContent = v + (k === 'share' ? '%' : ' wk'); const kk = document.querySelector('.kps'); if (kk) kk.outerHTML = kpis(); }
  toHash(); document.getElementById('tbl').innerHTML = boardTable();
});
window.addEventListener('hashchange', () => { fromHash(); render(); scrollTo(0, 0); });
fromHash(); render();
})();
