// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, the renderer paints what is there. Screens: title,
// play, paused, landed, crashed. ?shot=start|play|ring|end (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { buildWorld } from './terrain.js';
import { buildAircraft, poseAircraft } from './aircraft.js';
import { createFlightState } from './physics.js';
import { createGame, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const view = createRenderer(canvas);
const random = createRandom(seed);
const { clouds } = buildWorld(view.scene, random);
const aircraft = buildAircraft();
view.scene.add(aircraft.group);
const audio = createAudio();
const game = createGame(view.scene, audio);
const hud = createHud();
const input = createInput(canvas);

const overlays = {
  title: document.getElementById('screen-title'),
  paused: document.getElementById('screen-paused'),
  landed: document.getElementById('screen-landed'),
  crashed: document.getElementById('screen-crashed'),
};
const finalScoreEl = document.getElementById('final-score');
const crashScoreEl = document.getElementById('crash-score');
const finalDetailEl = document.getElementById('final-detail');
const crashReasonEl = document.getElementById('crash-reason');
const bestEls = document.querySelectorAll('.best-score');

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('show', key === name);
  }
  bestEls.forEach((el) => {
    el.textContent = `BEST ${game.best}`;
  });
  if (name === 'landed') {
    finalScoreEl.textContent = String(game.finalScore);
    finalDetailEl.textContent = `8 rings · ${Math.floor(game.elapsed)}s in the air · fuel ${Math.round(game.flight.fuel)}% left`;
  }
  if (name === 'crashed') {
    crashReasonEl.textContent = game.crashReason;
    crashScoreEl.textContent = String(game.finalScore);
  }
}

function paint() {
  poseAircraft(aircraft, game.flight);
  view.update(game.flight, 1 / 60);
  view.renderer.render(view.scene, view.camera);
  hud.update(game.flight, game);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  view.resize(width, height);
  canvas.width = width;
  canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

function runShot(name) {
  const screen = stageShot(name, game);
  if (screen === SCREEN_TITLE) {
    // Parked on the strip at golden hour, nose down the runway. Showcase
    // angle: the jet sits left of the title card, not behind it, so the
    // cover shot shows the aircraft, the strip and the lit instruments.
    game.flight.position.copy(createFlightState().position);
    game.flight.heading = -THREE.MathUtils.degToRad(90);
    view.snapShowcase(game.flight);
    showOverlay('title');
  } else {
    view.snap(game.flight);
    showOverlay(null);
  }
  let painted = 0;
  function paintFrame() {
    paint();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paintFrame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintFrame);
}

function runGame() {
  let last = performance.now();
  let accumulator = 0;
  showOverlay('title');

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (input.consume('Enter') || input.consume('Space')) {
      if (game.screen === SCREEN_TITLE) game.startSortie();
      else if (game.screen === SCREEN_LANDED || game.screen === SCREEN_CRASHED) game.startSortie();
    }
    if (input.consume('KeyP') && (game.screen === SCREEN_PLAY || game.screen === SCREEN_PAUSED)) {
      game.screen = game.screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      audio.click();
    }
    if (input.consume('KeyR') && game.screen !== SCREEN_TITLE) game.startSortie();
    if (input.consume('KeyM')) audio.toggleMute();

    if (game.screen === SCREEN_PLAY) {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        game.step(input.stick(), STEP, hud);
        accumulator -= STEP;
        if (game.screen !== SCREEN_PLAY) break;
      }
    }
    if (game.screen === SCREEN_TITLE) {
      // Idle drift on the title screen: the jet sits on the strip, clouds move.
      game.flight.position.copy(createFlightState().position);
    }

    // Clouds drift with the wind, always.
    clouds.children.forEach((puff, i) => {
      puff.position.x += (0.6 + (i % 5) * 0.12) * frameDt;
      if (puff.position.x > 2100) puff.position.x = -2100;
    });

    if (game.screen === SCREEN_LANDED) showOverlay('landed');
    else if (game.screen === SCREEN_CRASHED) showOverlay('crashed');
    else if (game.screen === SCREEN_PAUSED) showOverlay('paused');
    else if (game.screen === SCREEN_TITLE) showOverlay('title');
    else showOverlay(null);

    paint();
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// Debug handle for play-testing in the browser console.
window.__aurelia = { game };
