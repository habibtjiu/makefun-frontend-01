// Hands this repository's frontend in: copies app/ and screenshots/ from
// beside this file to the output directory and writes dossier.json, the
// summary the judge reads, with the vendored make.fun library. Node 22,
// standard library only, no network. The grader runs it twice and both runs
// must write the same bytes, so nothing here reads the clock, and the only
// environment it consults is the output directory override.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const SCREENSHOT_COUNT = 3;
const SCREENSHOT_MAX_BYTES = 262144;
const OUTPUT_ENTRY_CAP = 1000;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message: string): never {
  throw new Error(`main.ts: ${message}`);
}

/** Entries (files and directories) and file bytes under a directory. */
function countTree(dir: string): { entries: number; bytes: number } {
  let entries = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    entries += 1;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(path);
      entries += sub.entries;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      bytes += statSync(path).size;
    }
  }
  return { entries, bytes };
}

/** Refuse a broken handoff before copying anything. */
function preflight(): void {
  const index = join(here, 'app', 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) fail('app/index.html is missing');
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length !== SCREENSHOT_COUNT) {
    fail(`screenshots/ holds ${shots.length} files, expected ${SCREENSHOT_COUNT}`);
  }
  for (const name of shots) {
    const path = join(shotsDir, name);
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf('.');
    const image = dot >= 0 && IMAGE_EXTENSIONS.has(lower.slice(dot));
    if (!statSync(path).isFile() || !image) fail(`screenshots/${name} is not a PNG or JPEG file`);
    const size = statSync(path).size;
    if (size > SCREENSHOT_MAX_BYTES) {
      fail(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
    }
  }
}

preflight();

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'app'), join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: SCREENSHOT_COUNT, max_bytes: SCREENSHOT_MAX_BYTES },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Verify what was written: the dossier reads back whole, and the output
// stays within the platform's own entry cap.
const written = readFileSync(join(outDir, 'dossier.json'));
if (written.length !== dossier.length) fail('dossier.json did not write back whole');
const appCount = countTree(join(outDir, 'app'));
const shotCount = countTree(join(outDir, 'screenshots'));
const entries = appCount.entries + shotCount.entries + 1;
if (entries > OUTPUT_ENTRY_CAP) fail(`output holds ${entries} entries, over the ${OUTPUT_ENTRY_CAP} cap`);
console.log(
  `wrote ${outDir}: app/ ${appCount.entries} entries (${appCount.bytes} bytes), ` +
    `screenshots/ ${shotCount.entries} entries (${shotCount.bytes} bytes), dossier.json (${written.length} bytes)`,
);
