// Hand-in for AURELIA RING RUN, a best-flight-game entry (Node 22, standard
// library only). The game is plain static files under game/ — index.html plus
// its ES modules and the vendored three.js build, nothing fetched over the
// network — and screenshots/ holds four real renders of it taken in a browser.
// This program copies both folders into the grader's output directory and
// writes dossier.json there with the kit's makefun-game library, which is
// what the judge reads: the screenshots as a contact sheet and an outline of
// the game's own source.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR set:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function handIn() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  const shots = join(repoRoot, 'screenshots');
  if (existsSync(shots)) {
    cpSync(shots, join(outDir, 'screenshots'), { recursive: true });
  }
  // Same caps the gate enforces, so a dossier written here is the dossier
  // the scorer rebuilds: 160 KiB of source text, at most 4 screenshots of
  // 256 KiB each, game/ at most 993 files and 48 MiB, paths at most 1000 bytes.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

handIn();
