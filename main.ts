// Token Launch Radar v6 — reads a DefiLlama snapshot, fits the radar model, writes the board.
// Node stdlib only. No network, no clock, no randomness beyond a seeded PRNG inside radar.js.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildDossier } from './vendor/makefun-board.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const Radar = createRequire(import.meta.url)(join(HERE, 'dashboard', 'radar.js'));

const argv = process.argv.slice(2);
const ii = argv.indexOf('--input');
const input = ii >= 0 ? argv[ii + 1] : '/input/snapshot.json';
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const snap = JSON.parse(readFileSync(input, 'utf8'));
const R = Radar.run(snap);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

const rows = R.rows.map((r: any) => ({
  slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied,
  farm_steps: r.plan.steps.map(Radar.stepText),
  tier: r.tier, category: r.p.cat, chains: r.p.chains, tvl_usd: r.p.tvl, change_7d: r.p.c7,
  launch_value_usd: Math.round(r.launch), launch_odds: r4(r.odds),
  p10_usd: r.band[0], p25_usd: r.band[1], p75_usd: r.band[2], p90_usd: r.band[3], rank_range: r.rr,
  deposit_usd: r.plan.deposit, chain: r.plan.chain, cost_usd: r2(r.plan.cost), drop_usd: r2(r.plan.drop),
  net_usd: r2(r.plan.net), hours: r2(r.plan.hours), net_per_hour_usd: r2(r.plan.nph), verdict: r.plan.verdict,
}));

// ---- data.js: compact raw protocols + the board this program wrote; the page refits from it
const D = R.D;
const page = {
  as_of: snap.as_of, source: String(snap.source).replace(/https?:\/\/\S+/g, 'api.llama.fi/protocols'), floor_usd: snap.floor_usd, watchlist: snap.watchlist,
  cols: ['slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'mcap_usd', 'listed_at', 'gecko_id', 'symbol'],
  protocols: snap.protocols.map((p: any) => [p.slug, p.name, p.category, p.chains, p.tvl_usd, p.change_7d, p.mcap_usd, p.listed_at, p.gecko_id ? 1 : null, p.symbol]),
  board: rows.map((r: any) => [r.slug, r.rank, r.implied_value_usd]),
  checksum: R.checksum, counts: D.cnt,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ rows }, null, 1) + '\n');
writeFileSync(join(out, 'data.js'), 'window.RADAR_DATA=' + JSON.stringify(page) + ';\n');

// ---- copy dashboard/ and screenshots/ (regular files only, no dot-names)
function copyDir(src: string, dst: string) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const n of readdirSync(src).sort()) {
    if (n.startsWith('.')) continue;
    const s = join(src, n), st = statSync(s);
    if (st.isDirectory()) copyDir(s, join(dst, n));
    else if (st.isFile()) copyFileSync(s, join(dst, n));
  }
}
copyDir(join(HERE, 'dashboard'), join(out, 'dashboard'));
copyDir(join(HERE, 'screenshots'), join(out, 'screenshots'));

// ---- self-check every gate rule before the dossier; any failure exits non-zero
const fails: string[] = [];
const need = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };
const slugs = new Set(snap.protocols.map((p: any) => p.slug)), seen = new Set<string>();
need(rows.length >= 100 && rows.length <= 4000, `row count ${rows.length} outside 100..4000`);
rows.forEach((r: any, i: number) => {
  need(slugs.has(r.slug) && !seen.has(r.slug), `slug ${r.slug} unknown or repeated`); seen.add(r.slug);
  need(r.rank === i + 1, `rank ${r.rank} at position ${i + 1}`);
  need(Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0, `${r.slug}: implied value not a positive whole number`);
  need(i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd, `${r.slug}: value rises at rank ${r.rank}`);
  need(typeof r.name === 'string' && r.name.length > 0, `${r.slug}: no name`);
  need(Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12, `${r.slug}: ${r.farm_steps.length} steps`);
  for (const s of r.farm_steps) need(s.trim().length >= 20 && s.trim().length <= 600, `${r.slug}: step length ${s.trim().length}`);
});
need(new Set(rows.map((r: any) => r.implied_value_usd)).size > 1, 'all values equal');
for (const w of snap.watchlist) need(seen.has(w), `watchlist ${w} missing`);
need(R.checksum === Radar.fnv(R.rows), 'checksum mismatch');
let dashBytes = 0; const dashFiles = readdirSync(join(out, 'dashboard')).sort();
for (const n of dashFiles) {
  const t = readFileSync(join(out, 'dashboard', n), 'utf8'); dashBytes += Buffer.byteLength(t);
  if (/\.html$/.test(n)) need(!/\s(?:src|href|action|data|poster|srcset)\s*=\s*["']?\s*https?:/i.test(t) && !/<style[\s\S]*?https?:\/\/[\s\S]*?<\/style>/i.test(t), `${n}: http(s) in an attribute or style`);
  if (/\.css$/.test(n)) need(!/https?:\/\//i.test(t), `${n}: http(s) in CSS`);
  if (/\.js$/.test(n)) need(!/(?:import|require)\s*\(?\s*["'`]https?:/i.test(t) && !/^\s*import\s[^;]*https?:/im.test(t), `${n}: http(s) import`);
}
need(dashFiles.includes('index.html') && dashFiles.some(n => n.endsWith('.css')) && dashFiles.some(n => n.endsWith('.js')), 'dashboard needs index.html + .css + .js');
need(dashBytes <= 62000, `dashboard source ${dashBytes} B > 62,000`);
const shots = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')).filter(n => !n.startsWith('.')).sort() : [];
need(shots.join(',') === '1-board.jpg,2-detail.jpg,3-filtered.jpg', `screenshots: ${shots.join(',') || 'none'}`);
for (const n of shots) need(statSync(join(out, 'screenshots', n)).size <= 524288, `${n} over 512 KiB`);
if (fails.length) { console.error('SELF-CHECK FAILED:\n  ' + fails.slice(0, 20).join('\n  ')); process.exit(1); }

// ---- LAST: the dossier, with its hard cap
const dossier = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
writeFileSync(join(out, 'dossier.json'), dossier);
if (dossier.byteLength > 1572864) { console.error(`SELF-CHECK FAILED: dossier.json ${dossier.byteLength} B > 1,572,864`); process.exit(1); }
console.log(`ok · rows ${rows.length} · checksum ${R.checksum} · value [${R.sv.terms}] · odds [${R.so.terms}] · dashboard ${dashBytes} B · dossier ${dossier.byteLength} B`);
