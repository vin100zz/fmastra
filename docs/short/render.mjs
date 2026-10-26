// Films the Short (index.html) frame by frame into an MP4 of 1080 × 1920 at 30 images a second.
//   node docs/short/render.mjs [sortie.mp4] [--fonts dossier] [--frames début:fin]
// Needs Playwright with Chromium and ffmpeg on the PATH. The page asks for the charter's fonts (Bahnschrift, Segoe UI);
// where they are missing, --fonts names a folder whose fonts.css declares stand-ins, used for --display.
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const fonts = option('--fonts');
const range = option('--frames');
const out = args[0] || path.join(here, 'football-manager-short.mp4');
const FPS = 30;

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 480, height: 854}, deviceScaleFactor: 2.25});
await page.goto(pathToFileURL(path.join(here, 'index.html')).href + '?capture');
if (fonts) {
  const css = fs.readFileSync(path.join(fonts, 'fonts.css'), 'utf8').replace(/url\((?!data:)([^)]+)\)/g, (_, f) => `url(${pathToFileURL(path.resolve(fonts, f)).href})`);
  const family = css.match(/font-family:\s*'([^']+)'/)[1];
  await page.addStyleTag({content: `${css}\n:root{--display:"${family}",sans-serif;--text:"Segoe UI","Inter",system-ui,sans-serif}`});
}
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.TOTAL);
const [first, last] = range ? range.split(':').map(Number) : [0, Math.round(total * FPS)];

const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-vf', 'crop=1080:1920:0:0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
{stdio: ['pipe', 'inherit', 'inherit']});
for (let f = first; f < last; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  const png = await page.screenshot({type: 'png'});
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (f % 150 === 0) process.stdout.write(`${f}/${last}\n`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on('close', r));
await browser.close();
console.log(out);
