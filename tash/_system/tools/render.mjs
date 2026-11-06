#!/usr/bin/env node
// TASH frame renderer — deterministic HTML → MP4.
// A page exposes:  window.TASH = { width, height, fps, duration, ready: Promise, seek: async (t) => void }
// Every visual must be a pure function of t (no CSS animations / transitions / rAF timing).
//
// Usage:
//   node render.mjs --page 04-launch-ad/src/index.html --out 04-launch-ad/out/video.mp4 [--workers 2] [--from 0] [--to 26]
//   node render.mjs --page ... --stills 0.5,2,7.25 --stills-dir review/   (PNG stills only, no video)
//   node render.mjs --page ... --audio music.wav --out final.mp4          (mux audio, loudness-normalised to -14 LUFS)
// Paths are relative to the tash/ root (served over a local static server so ES modules work).
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
if (!args.page) { console.error('missing --page'); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
export function serve(root = ROOT) {
  return new Promise(res => {
    const srv = createServer(async (req, rsp) => {
      try {
        const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(root)) throw new Error('forbidden');
        const buf = await readFile(p);
        rsp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        rsp.end(buf);
      } catch { rsp.writeHead(404); rsp.end('not found'); }
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--font-render-hinting=none', '--force-color-profile=srgb'];

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.TASH && window.TASH.seek, null, { timeout: 60000 });
  const meta = await page.evaluate(async () => { await (window.TASH.ready || Promise.resolve()); await document.fonts.ready; const { width, height, fps, duration } = window.TASH; return { width, height, fps, duration }; });
  await page.setViewportSize({ width: meta.width, height: meta.height });
  const cdp = await page.context().newCDPSession(page);
  return { page, meta, cdp };
}

async function grab(cdp, fmt = 'jpeg') {
  const { data } = await cdp.send('Page.captureScreenshot', fmt === 'png' ? { format: 'png', optimizeForSpeed: true } : { format: 'jpeg', quality: 96, optimizeForSpeed: true });
  return Buffer.from(data, 'base64');
}

function ffmpegEncoder(out, fps, fmt) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', fmt === 'png' ? 'png' : 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high', '-tune', 'film',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  return { ff, done };
}

async function main() {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/${args.page.replace(/^\/+/, '')}`;
  const fmt = args.png ? 'png' : 'jpeg';

  // ---- stills mode -------------------------------------------------------
  if (args.stills) {
    const browser = await chromium.launch({ args: LAUNCH_ARGS });
    const { page, cdp } = await openPage(browser, url);
    const dir = resolve(ROOT, args['stills-dir'] || 'review');
    await mkdir(dir, { recursive: true });
    for (const t of String(args.stills).split(',').map(Number)) {
      await page.evaluate(t => window.TASH.seek(t), t);
      const f = join(dir, `${(args.prefix || 'still')}_${t.toFixed(2).padStart(6, '0')}.png`);
      await writeFile(f, await grab(cdp, 'png'));
      console.log(f);
    }
    await browser.close(); srv.close(); return;
  }

  // ---- video mode --------------------------------------------------------
  const probeB = await chromium.launch({ args: LAUNCH_ARGS });
  const { meta } = await openPage(probeB, url);
  await probeB.close();
  const fps = Number(args.fps || meta.fps || 30);
  const from = Number(args.from || 0), to = Number(args.to || meta.duration);
  const total = Math.round((to - from) * fps);
  const workers = Math.max(1, Math.min(Number(args.workers || 2), 6));
  const out = resolve(ROOT, args.out || 'out.mp4');
  await mkdir(dirname(out), { recursive: true });
  const tmp = out + '.parts'; await rm(tmp, { recursive: true, force: true }); await mkdir(tmp, { recursive: true });
  const per = Math.ceil(total / workers);
  const t0 = Date.now(); let doneFrames = 0;
  const silent = out.replace(/\.mp4$/, '') + (args.audio ? '.silent.mp4' : '.mp4');

  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const a = w * per, z = Math.min(total, a + per);
    if (a >= z) return;
    const browser = await chromium.launch({ args: LAUNCH_ARGS });
    const { page, cdp } = await openPage(browser, url);
    const { ff, done } = ffmpegEncoder(join(tmp, `part${String(w).padStart(2, '0')}.mp4`), fps, fmt);
    for (let f = a; f < z; f++) {
      await page.evaluate(t => window.TASH.seek(t), from + f / fps);
      const buf = await grab(cdp, fmt);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (++doneFrames % 60 === 0) { const el = (Date.now() - t0) / 1000; process.stdout.write(`\r${doneFrames}/${total} frames  ${(doneFrames / el).toFixed(1)} fps  eta ${Math.round((total - doneFrames) / (doneFrames / el))}s   `); }
    }
    ff.stdin.end(); await done; await browser.close();
  }));
  srv.close();
  const list = Array.from({ length: workers }, (_, w) => join(tmp, `part${String(w).padStart(2, '0')}.mp4`)).filter(existsSync);
  await writeFile(join(tmp, 'list.txt'), list.map(p => `file '${p}'`).join('\n'));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', silent]);
  await rm(tmp, { recursive: true, force: true });
  if (args.audio) { await mux(silent, resolve(ROOT, args.audio), out); await rm(silent); }
  console.log(`\n✔ ${out}  (${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

export async function mux(video, audio, out) {
  // Loudness: -14 LUFS integrated, -1 dBTP — Instagram/TikTok normalise to roughly this.
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-af', 'loudnorm=I=-14:TP=-1.0:LRA=9', '-ar', '48000', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out]);
}
function run(cmd, a) { return new Promise((res, rej) => spawn(cmd, a, { stdio: 'inherit' }).on('close', c => (c === 0 ? res() : rej(new Error(cmd + ' exit ' + c))))); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
