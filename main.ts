import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { buildDossier } from './vendor/makefun-board.ts';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const Radar = createRequire(import.meta.url)('./dashboard/radar.js');
const argv = process.argv.slice(2);
const input = argv.includes('--input') ? argv[argv.indexOf('--input') + 1] : '/input/snapshot.json';
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const snap = JSON.parse(readFileSync(input, 'utf8'));
const R = Radar.run(snap, {});
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ rows: R.board }, null, 1) + '\n');

// page data: the raw snapshot (compact) plus what this program ranked, so the page can refit and compare
const keys = ['slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'mcap_usd', 'listed_at', 'gecko_id', 'symbol'];
const page = {
  as_of: snap.as_of, source: snap.source, floor_usd: snap.floor_usd, watchlist: snap.watchlist, keys,
  rows: snap.protocols.map((p: any) => keys.map((k) => p[k] ?? null)),
  board: R.board.map((r: any) => [r.slug, r.rank, r.implied_value_usd]),
  checksum: R.sum,
};
writeFileSync(join(out, 'data.js'), 'window.DATA=' + JSON.stringify(page) + ';\n');

// copy dashboard/ and screenshots/ (regular files only, no dot-names)
function copyDir(src: string, dst: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) copyDir(join(src, e.name), join(dst, e.name));
    else if (e.isFile()) writeFileSync(join(dst, e.name), readFileSync(join(src, e.name)));
  }
}
copyDir(join(HERE, 'dashboard'), join(out, 'dashboard'));
copyDir(join(HERE, 'screenshots'), join(out, 'screenshots'));

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };
selfCheck();
if (existsSync(join(out, 'screenshots')) && readdirSync(join(out, 'screenshots')).some((n) => !n.startsWith('.'))) {
  const dossier = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
  writeFileSync(join(out, 'dossier.json'), dossier);
  check(dossier.length <= 1572864, `dossier.json ${dossier.length} B > 1,572,864 B cap`);
  console.log(`dossier.json ${dossier.length} B`);
} else fails.push('no screenshots yet: dossier.json not written');

console.log(`rows ${R.board.length} · checksum ${R.sum} · value terms ${R.VF.terms.join('+')} · odds terms ${R.OF.terms.join('+')}`);
console.log(`held-out miss: loo x${R.VF.held.looX.toFixed(2)} wf x${R.VF.held.wfX.toFixed(2)} (flat x${R.VF.flat.looX.toFixed(2)} / x${R.VF.flat.wfX.toFixed(2)}) · bands in50 ${(R.cal.split.in50 * 100).toFixed(0)}% in80 ${(R.cal.split.in80 * 100).toFixed(0)}%`);
if (fails.length) { console.error('SELF-CHECK FAILED:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('self-check: all gate rules pass');

function selfCheck(): void {
  const rows = R.board, slugs = new Set(snap.protocols.map((p: any) => p.slug)), seen = new Set<string>();
  check(rows.length >= 100 && rows.length <= 4000, `rows ${rows.length} not in 100..4000`);
  rows.forEach((r: any, i: number) => {
    check(slugs.has(r.slug) && !seen.has(r.slug), `slug ${r.slug} unknown or repeated`); seen.add(r.slug);
    check(r.rank === i + 1, `rank ${r.rank} at position ${i + 1}`);
    check(Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0, `${r.slug} implied not a positive whole number`);
    check(i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd, `${r.slug} implied rises`);
    check(typeof r.name === 'string' && r.name.length > 0, `${r.slug} no name`);
    check(Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12, `${r.slug} steps count`);
    for (const s of r.farm_steps) check(typeof s === 'string' && s.trim().length >= 20 && s.trim().length <= 600, `${r.slug} step length ${s.length}`);
  });
  check(new Set(rows.map((r: any) => r.implied_value_usd)).size > 1, 'all implied values equal');
  for (const w of snap.watchlist) check(seen.has(w), `watchlist ${w} missing`);
  check(R.L.total === snap.protocols.length && Object.values(R.L.counts).reduce((a: any, b: any) => a + b, 0) === snap.protocols.length, 'ledger does not sum');
  // dashboard rules
  const dash = join(out, 'dashboard'), files = readdirSync(dash);
  check(files.includes('index.html') && files.some((f) => f.endsWith('.css')) && files.some((f) => f.endsWith('.js')), 'dashboard needs index.html + .css + .js');
  let total = 0;
  for (const f of files) {
    const t = readFileSync(join(dash, f), 'utf8'); total += Buffer.byteLength(t);
    const bad = f.endsWith('.html') ? /\s(?:src|href|action|data|poster)\s*=\s*["']?\s*https?:|<style[^]*?https?:\/\/[^]*?<\/style>/i.test(t)
      : f.endsWith('.css') ? /https?:\/\//i.test(t) : /(?:import\s*\(?|require\s*\()\s*['"`]https?:/i.test(t);
    check(!bad, `${f}: http(s) reference`);
    for (const name of snap.protocols.map((p: any) => p.name)) if (name.length > 4 && f.endsWith('.js') && t.includes(`'${name}'`)) check(false, `${f} hardcodes ${name}`);
  }
  check(total <= 62000, `dashboard ${total} B > 62,000 B`);
  const app = readFileSync(join(dash, 'app.js'), 'utf8');
  check(app.includes(`data-act="json"`) && app.includes('application/json'), 'dashboard has no JSON export of the filtered board');
  check(/RD\.quant\(lc,\.05\)/.test(app), 'comparables do not use the 5% winsor band of the value fit');
  console.log(`dashboard ${total} B of 62,000 B budget`);
  const shots = join(out, 'screenshots');
  if (existsSync(shots)) {
    const names = readdirSync(shots).filter((n) => !n.startsWith('.')).sort();
    check(names.join(',') === '1-board.jpg,2-detail.jpg,3-filtered.jpg', `screenshots are ${names.join(',')}`);
    for (const n of names) {
      const b = readFileSync(join(shots, n)), dim = jpegSize(b);
      check(b.length <= 524288, `${n} ${b.length} B > 512 KiB`);
      check(b.length >= 280e3 && b.length <= 340e3, `${n} ${b.length} B outside the 280–340 KB band`);
      check(!!dim && Math.max(dim[0], dim[1]) >= 1440 && Math.min(dim[0], dim[1]) >= 800, `${n} size ${dim}`);
    }
  }
}
function jpegSize(b: Buffer): [number, number] | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
