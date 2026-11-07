#!/usr/bin/env node
// Re-mux a new audio track onto an already rendered video, exactly as _system/tools/render.mjs does it
// (two-pass loudnorm, linear, I=-14 TP=-1.5 LRA=11, AAC 320k 48 kHz, video stream copied).
// A local copy because importing render.mjs runs its CLI (exits on a missing --page).
//   node 08-instagram/src/mux.mjs <video.mp4> <audio.wav> <out.mp4>
import { spawn } from 'node:child_process';
import { rename } from 'node:fs/promises';

const [video, audio, out] = process.argv.slice(2);
if (!out) { console.error('usage: mux.mjs <video.mp4> <audio.wav> <out.mp4>'); process.exit(1); }
const capture = (cmd, a) => new Promise((res, rej) => { let e = ''; const p = spawn(cmd, a); p.stderr.on('data', d => (e += d)); p.on('close', c => (c === 0 ? res(e) : rej(new Error(e.slice(-500))))); });
const run = (cmd, a) => new Promise((res, rej) => spawn(cmd, a, { stdio: 'inherit' }).on('close', c => (c === 0 ? res() : rej(new Error(cmd + ' exit ' + c)))));

const target = 'I=-14:TP=-1.5:LRA=11';
const m = await capture('ffmpeg', ['-hide_banner', '-nostats', '-i', audio, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
const j = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
const af = `loudnorm=${target}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
const tmp = out.replace(/\.mp4$/, '.mux-tmp.mp4');
await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', tmp]);
await rename(tmp, out);
console.log(`muxed ${out}`);
