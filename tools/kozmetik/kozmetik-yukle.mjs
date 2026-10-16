#!/usr/bin/env node
// Kozmetik toplu yükleyici: bir klasördeki öğeleri (meta.json + animated.png / animated.webm / static.png)
// animasyonlu WebP'ye çevirip pirichat admin API'sine kozmetik olarak ekler.
// Öğeler repoda değil (GB'larca): varsayılan ~/Downloads/frames/Archive/locker-assets, --assets ile değişir.
//
// Gerekenler: node 20+, ffmpeg, ffprobe, img2webp, cwebp (brew install ffmpeg webp)
//
// Kullanım:
//   node tools/kozmetik/kozmetik-yukle.mjs                 seri listesi (tip, öğe sayısı, kaçı yüklü)
//   node tools/kozmetik/kozmetik-yukle.mjs arcade          "arcade" adlı serileri yükle (dekorasyon + profil efekti)
//   node tools/kozmetik/kozmetik-yukle.mjs arcade pirates  birden çok seri
//   node tools/kozmetik/kozmetik-yukle.mjs --all           hepsi
//   node tools/kozmetik/kozmetik-yukle.mjs arcade --dry-run   gönderme, sadece çevir
//   node tools/kozmetik/kozmetik-yukle.mjs --seri-guncelle    daha önce yüklenenlere seri adını yaz (görsel göndermez)
//
// Aynı adda öğe sunucuda varsa ya da daha önce yüklendiyse atlanır; tekrar çalıştırmak güvenli.
//
// Seçenekler:
//   <seri...>               locker-assets altındaki seri klasör adı (tip klasörü fark etmez)
//   --all                   locker-assets altındaki her şey
//   --dir <klasör>          Belirli bir klasör (alt klasörler taranır, meta.json olanlar öğe sayılır)
//   --type <tip>            avatar_decoration | profile_effect | nameplate | avatar_ultra (yoksa meta.json'daki type'tan)
//   --availability <a>      free | premium | owned (varsayılan premium)
//   --assets <klasör>       locker-assets klasörü (varsayılan ~/Downloads/frames/Archive/locker-assets)
//   --api <url>             varsayılan https://pirichat.online/api
//   --key <fa_...>          admin API anahtarı (ya da PIRICHAT_ADMIN_KEY env, ya da ~/.config/pirichat/admin_cosmetics_key)
//   --limit <n>             en fazla n öğe
//   --quality <0-100>       lossy WebP kalitesi (varsayılan 85)
//   --max-bytes <n>         sunucu sınırı (varsayılan 8 MiB)
//   --state <dosya>         yüklenenlerin kaydı (varsayılan <assets>/../kozmetik-yuklenen-pirichat.jsonl)
//   --out <klasör>          çevrilen webp'lerin tutulduğu yer; dosya zaten varsa yeniden çevrilmez
//                           (varsayılan <assets>/../scripts/.kozmetik-cache)
//   --seri-guncelle         yüklenenler dosyasındaki her öğeye meta.json'daki seriyi PATCH ile yaz
//   --force                 daha önce yüklenmiş ya da aynı adda olan öğeyi yine de gönder
//   --dry-run               çevir ama gönderme
//
// Anahtar: admin panel → Admin API keys → cosmetics:manage yetkili bir anahtar üret, ~/.config/pirichat/admin_cosmetics_key
// dosyasına yaz (repoya girmez).

import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function keyFromConfig() {
	const file = join(homedir(), '.config', 'pirichat', 'admin_cosmetics_key');
	return existsSync(file) ? readFileSync(file, 'utf8').trim() || null : null;
}
const TYPE_MAP = {
	'Avatar Decoration': 'avatar_decoration',
	'Profile Effect': 'profile_effect',
	Nameplate: 'nameplate',
};
const VALID_TYPES = new Set(['avatar_decoration', 'profile_effect', 'nameplate', 'avatar_ultra']);
const VALID_AVAIL = new Set(['free', 'premium', 'owned']);

function parseArgs(argv) {
	const out = {
		dir: null,
		series: [],
		all: false,
		type: null,
		availability: 'premium',
		assets: join(homedir(), 'Downloads', 'frames', 'Archive', 'locker-assets'),
		api: 'https://pirichat.online/api',
		key: process.env.PIRICHAT_ADMIN_KEY ?? keyFromConfig(),
		limit: Infinity,
		quality: 85,
		maxBytes: 8 * 1024 * 1024,
		state: null,
		out: null,
		force: false,
		dryRun: false,
		seriesUpdate: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => argv[++i];
		switch (a) {
			case '--dir': out.dir = next(); break;
			case '--assets': out.assets = resolve(next()); break;
			case '--type': out.type = next(); break;
			case '--availability': out.availability = next(); break;
			case '--api': out.api = next().replace(/\/+$/, ''); break;
			case '--key': out.key = next(); break;
			case '--limit': out.limit = Number(next()); break;
			case '--quality': out.quality = Number(next()); break;
			case '--max-bytes': out.maxBytes = Number(next()); break;
			case '--state': out.state = next(); break;
			case '--out': out.out = next(); break;
			case '--force': out.force = true; break;
			case '--all': out.all = true; break;
			case '--seri-guncelle': out.seriesUpdate = true; break;
			case '--dry-run': out.dryRun = true; break;
			case '-h': case '--help': usage(0); break;
			default:
				if (a.startsWith('-')) { console.error(`bilinmeyen seçenek: ${a}`); usage(1); }
				out.series.push(a);
		}
	}
	out.state ??= join(out.assets, '..', 'kozmetik-yuklenen-pirichat.jsonl');
	out.out ??= join(out.assets, '..', 'scripts', '.kozmetik-cache');
	ASSETS_ROOT = out.assets;
	if (out.type && !VALID_TYPES.has(out.type)) { console.error(`geçersiz --type: ${out.type}`); process.exit(1); }
	if (!VALID_AVAIL.has(out.availability)) { console.error(`geçersiz --availability: ${out.availability}`); process.exit(1); }
	if (!out.dryRun && !out.key && (out.dir || out.all || out.series.length || out.seriesUpdate)) { console.error('admin anahtarı yok: --key, PIRICHAT_ADMIN_KEY env ya da ~/.config/pirichat/admin_cosmetics_key'); process.exit(1); }
	return out;
}

function usage(code) {
	console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
	process.exit(code);
}

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts});
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr}`);
	return r.stdout;
}

function requireTools() {
	for (const t of ['ffmpeg', 'ffprobe', 'img2webp', 'cwebp']) {
		const r = spawnSync('which', [t]);
		if (r.status !== 0) { console.error(`eksik araç: ${t} (brew install ffmpeg webp)`); process.exit(1); }
	}
}

function findItems(root) {
	const items = [];
	const walk = (d) => {
		for (const name of readdirSync(d)) {
			if (name.startsWith('.')) continue;
			const p = join(d, name);
			if (statSync(p).isDirectory()) walk(p);
			else if (name === 'meta.json') items.push(d);
		}
	};
	walk(root);
	return items.sort();
}

function pickSource(dir) {
	for (const f of ['animated.webm', 'animated.png', 'animated.webp', 'animated.gif', 'static.png', 'static.webp']) {
		const p = join(dir, f);
		if (existsSync(p)) return p;
	}
	return null;
}

function probe(file) {
	const json = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name', '-of', 'json', file]));
	const s = json.streams?.[0];
	if (!s) throw new Error(`video akışı yok: ${file}`);
	const [n, d] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
	const fps = d && n ? n / d : 0;
	return {width: s.width, height: s.height, frames: Number(s.nb_read_frames ?? 1), fps, codec: s.codec_name};
}

// ffmpeg kareleri çıkarır (webm alfa için libvpx-vp9 çözücü), img2webp animasyonlu webp'ye diker.
function toAnimatedWebp(src, dst, {quality, scale, fps}) {
	const tmp = mkdtempSync(join(tmpdir(), 'kozmetik-'));
	try {
		const decoder = src.endsWith('.webm') ? ['-c:v', 'libvpx-vp9'] : [];
		const vf = scale && scale !== 1 ? ['-vf', `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2:flags=lanczos`] : [];
		run('ffmpeg', ['-v', 'error', '-y', ...decoder, '-i', src, ...vf, '-pix_fmt', 'rgba', join(tmp, 'f%05d.png')]);
		const frames = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort().map((f) => join(tmp, f));
		if (frames.length === 0) throw new Error('kare çıkmadı');
		const ms = Math.max(20, Math.round(1000 / (fps > 0 && fps <= 120 ? fps : 25)));
		const args = ['-loop', '0', '-mixed', '-min_size'];
		for (const f of frames) args.push('-d', String(ms), '-lossy', '-q', String(quality), f);
		args.push('-o', dst);
		run('img2webp', args);
	} finally {
		rmSync(tmp, {recursive: true, force: true});
	}
}

function toStaticWebp(src, dst, {quality, scale}) {
	const args = ['-quiet', '-q', String(quality), '-alpha_q', '100', '-metadata', 'none'];
	if (scale && scale !== 1) {
		const {width, height} = probe(src);
		args.push('-resize', String(Math.max(32, Math.round(width * scale))), String(Math.max(32, Math.round(height * scale))));
	}
	run('cwebp', [...args, src, '-o', dst]);
}

// Önce kaliteyi, sonra boyutu düşürerek sınırın altına in.
function convert(src, dst, info, opts) {
	const animated = info.frames > 1;
	const attempts = [
		{quality: opts.quality, scale: 1},
		{quality: Math.max(40, opts.quality - 20), scale: 1},
		{quality: Math.max(40, opts.quality - 20), scale: 0.75},
		{quality: 50, scale: 0.5},
	];
	for (const a of attempts) {
		if (animated) toAnimatedWebp(src, dst, {...a, fps: info.fps});
		else toStaticWebp(src, dst, a);
		const size = statSync(dst).size;
		if (size <= opts.maxBytes) return {size, ...a, animated};
	}
	throw new Error(`sınırın altına inmedi (${statSync(dst).size} bayt)`);
}

async function api(opts, method, path, body) {
	const res = await fetch(`${opts.api}${path}`, {
		method,
		headers: {Authorization: `Admin ${opts.key}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': 'kozmetik-yukle script'},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let json = null;
	try { json = JSON.parse(text); } catch {}
	// admin:cosmetics:manage dakikada 30 istek: sınıra takılınca söylenen süre kadar bekleyip yeniden dene.
	if (res.status === 429) {
		const wait = Math.ceil(Number(json?.retry_after ?? res.headers.get('retry-after') ?? 10) * 1000) + 500;
		await new Promise((r) => setTimeout(r, wait));
		return api(opts, method, path, body);
	}
	if (!res.ok) {
		const detail = json?.errors?.map((e) => `${e.path}: ${e.message}`).join('; ') || json?.message || text.slice(0, 300);
		throw new Error(`HTTP ${res.status} ${method} ${path}: ${detail}`);
	}
	return json;
}

function loadState(file) {
	const done = new Map();
	if (!existsSync(file)) return done;
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		done.set(r.source, r);
	}
	return done;
}

let ASSETS_ROOT;

// Seri adı: meta.json'daki category (locker verisi), yoksa seri klasörünün adı ("all-ears" → "All Ears").
function seriesOf(meta, dir) {
	const fromMeta = typeof meta?.category === 'string' ? meta.category.replace(/\s+/g, ' ').trim() : '';
	if (fromMeta) return fromMeta.slice(0, 64);
	const folder = basename(dirname(dir));
	if (!folder || folder === basename(ASSETS_ROOT)) return null;
	return folder.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 64);
}

// Daha önce yüklenen öğelere seri adını yazar; görsel göndermez. Seri alanı olmayan sunucuda 400 döner.
async function updateSeries(opts, done) {
	const rows = [...done.values()];
	console.log(`${rows.length} yüklenmiş öğe için seri yazılacak`);
	const list = await api(opts, 'GET', '/admin/cosmetics/items');
	const onServer = new Map(list.map((i) => [i.id, i]));
	let sent = 0, skipped = 0, failed = 0;
	for (const row of rows) {
		if (sent >= opts.limit) break;
		const current = onServer.get(row.id);
		if (!current) { skipped++; continue; }
		let meta = null;
		try { meta = JSON.parse(readFileSync(join(row.source, 'meta.json'), 'utf8')); } catch {}
		const series = seriesOf(meta, row.source);
		if (!series) { console.log(`  - ${row.name}: seri bulunamadı`); skipped++; continue; }
		if (!opts.force && current.series === series) { skipped++; continue; }
		if (opts.dryRun) { console.log(`  · ${row.name} → ${series}`); sent++; continue; }
		try {
			await api(opts, 'PATCH', `/admin/cosmetics/items/${row.id}`, {series});
			console.log(`  ✓ ${row.name} → ${series}`);
			sent++;
		} catch (e) {
			console.log(`  ! ${row.name}: ${e.message.split('\n')[0]}`);
			failed++;
		}
	}
	console.log(`\n${opts.dryRun ? 'yazılacak' : 'yazıldı'}: ${sent}, atlandı: ${skipped}, hata: ${failed}`);
	if (failed) process.exitCode = 1;
}

// locker-assets/<tip>/<seri>/<öğe> düzeninde serileri listele.
function listSeries() {
	const out = [];
	if (!existsSync(ASSETS_ROOT)) return out;
	for (const typeDir of readdirSync(ASSETS_ROOT)) {
		const typePath = join(ASSETS_ROOT, typeDir);
		if (typeDir.startsWith('.') || !statSync(typePath).isDirectory()) continue;
		for (const series of readdirSync(typePath)) {
			const seriesPath = join(typePath, series);
			if (series.startsWith('.') || !statSync(seriesPath).isDirectory()) continue;
			out.push({typeDir, series, path: seriesPath, items: findItems(seriesPath)});
		}
	}
	return out;
}

function resolveRoots(opts) {
	if (opts.dir) return [resolve(opts.dir)];
	const all = listSeries();
	if (opts.all) return all.map((s) => s.path);
	const roots = [];
	for (const name of opts.series) {
		const hits = all.filter((s) => s.series === name || s.series.toLowerCase() === name.toLowerCase());
		if (hits.length === 0) { console.error(`seri bulunamadı: ${name} (listeyi görmek için argümansız çalıştır)`); process.exit(1); }
		roots.push(...hits.map((s) => s.path));
	}
	return roots;
}

function printSeriesTable(done) {
	const all = listSeries();
	if (all.length === 0) { console.log(`locker-assets klasörü yok: ${ASSETS_ROOT}`); return; }
	const supported = (t) => ['avatar-decoration', 'profile-effect', 'nameplate'].includes(t);
	let cur = '';
	for (const s of all.sort((a, b) => a.typeDir.localeCompare(b.typeDir) || a.series.localeCompare(b.series))) {
		if (s.typeDir !== cur) { cur = s.typeDir; console.log(`\n${cur}${supported(cur) ? '' : '  (desteklenmiyor, atlanır)'}`); }
		const uploaded = s.items.filter((d) => done.has(d)).length;
		console.log(`  ${s.series.padEnd(28)} ${String(s.items.length).padStart(3)} öğe${uploaded ? `, ${uploaded} yüklü` : ''}`);
	}
	console.log('\nYüklemek için: node tools/kozmetik/kozmetik-yukle.mjs <seri> [<seri>...]   ya da --all');
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const done = loadState(opts.state);
	if (opts.seriesUpdate) { await updateSeries(opts, done); return; }
	if (!opts.dir && !opts.all && opts.series.length === 0) { printSeriesTable(done); return; }
	requireTools();
	mkdirSync(opts.out, {recursive: true});
	const roots = resolveRoots(opts);
	const items = roots.flatMap((r) => findItems(r).map((d) => ({dir: d, root: r})));
	console.log(`${items.length} öğe bulundu (${roots.length} klasör)`);

	let existing = new Set();
	if (!opts.dryRun) {
		const list = await api(opts, 'GET', '/admin/cosmetics/items');
		existing = new Set(list.map((i) => `${i.type}\u0000${i.name.toLowerCase()}`));
		console.log(`sunucuda ${list.length} kozmetik var`);
	}

	let sent = 0, skipped = 0, failed = 0;
	for (const {dir, root} of items) {
		if (sent >= opts.limit) break;
		const rel = dir.slice(ASSETS_ROOT.length + 1) || dir.slice(root.length + 1) || basename(dir);
		let meta;
		try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')); } catch (e) { console.log(`  ! ${rel}: meta.json okunamadı`); failed++; continue; }
		const type = opts.type ?? TYPE_MAP[meta.type];
		if (!type) { console.log(`  - ${rel}: desteklenmeyen tip "${meta.type}", atlandı`); skipped++; continue; }
		const name = String(meta.name ?? basename(dir)).slice(0, 64);
		const description = meta.label ? String(meta.label).slice(0, 256) : null;
		const series = seriesOf(meta, dir);
		if (!opts.force && done.has(dir)) { skipped++; continue; }
		if (!opts.force && existing.has(`${type}\u0000${name.toLowerCase()}`)) { console.log(`  - ${rel}: "${name}" zaten var, atlandı`); skipped++; continue; }
		const src = pickSource(dir);
		if (!src) { console.log(`  ! ${rel}: görsel yok`); failed++; continue; }

		try {
			const info = probe(src);
			const dst = join(opts.out, `${type}--${basename(dir)}.webp`);
			const cached = existsSync(dst) && statSync(dst).size <= opts.maxBytes;
			const r = cached ? {size: statSync(dst).size, quality: 'önbellek', scale: 1} : convert(src, dst, info, opts);
			const line = `${rel} [${type}] ${basename(src)} ${info.width}x${info.height} ${info.frames}k → webp ${(r.size / 1024).toFixed(0)} KB q${r.quality}${r.scale !== 1 ? ` x${r.scale}` : ''}`;
			if (opts.dryRun) { console.log(`  · ${line}`); sent++; continue; }
			const asset = readFileSync(dst).toString('base64');
			const created = await api(opts, 'POST', '/admin/cosmetics/items', {type, name, description, series, availability: opts.availability, asset});
			appendFileSync(opts.state, JSON.stringify({source: dir, id: created.id, type, name, series, at: new Date().toISOString()}) + '\n');
			existing.add(`${type}\u0000${name.toLowerCase()}`);
			console.log(`  ✓ ${line} → id ${created.id}`);
			sent++;
		} catch (e) {
			console.log(`  ! ${rel}: ${e.message.split('\n')[0]}`);
			failed++;
		}
	}
	console.log(`\n${opts.dryRun ? 'çevrildi' : 'yüklendi'}: ${sent}, atlandı: ${skipped}, hata: ${failed}`);
	if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
