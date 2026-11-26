// The sortie: title, flying, paused, landed, crashed. Eight rings in order,
// then a landing on the coastal strip. Rings score and refuel; the landing
// pays a bonus and refuels the jet; a crash costs damage and a respawn.
import * as THREE from 'three';
import {
  DAMAGE,
  FLIGHT,
  LANDING_BONUS,
  RING_FUEL_BONUS,
  RING_POINTS,
  RUNWAY,
  TIME_BONUS_RATE,
} from './config.js';
import { createFlightState, stepFlight } from './physics.js';
import { buildRings, checkRingPass, highlightNextRing, markRingPassed, runwayApproachPoint } from './rings.js';
import { heightAt } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';

export function createGame(scene, audio) {
  const flight = createFlightState();
  const rings = buildRings(scene);
  let screen = SCREEN_TITLE;
  let score = 0;
  let ringsPassed = 0;
  let elapsed = 0;
  let best = readBest();
  let missionText = 'Line up on the runway — throttle up with W, lift off, fly ring 1.';
  let nextTarget = rings[0].centre;
  let finalScore = 0;
  let crashReason = '';
  let warnCooldown = 0;

  function readBest() {
    try {
      return Number.parseInt(window.localStorage.getItem('aurelia-ring-run-best') ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }
  function saveBest(value) {
    try {
      window.localStorage.setItem('aurelia-ring-run-best', String(value));
    } catch {
      // Private windows: the best score lasts this visit only.
    }
  }

  function reset() {
    const fresh = createFlightState();
    flight.position.copy(fresh.position);
    flight.velocity.set(0, 0, 0);
    flight.heading = fresh.heading;
    flight.pitch = 0;
    flight.roll = 0;
    flight.throttle = 0;
    flight.speed = 0;
    flight.fuel = 100;
    flight.damage = 0;
    flight.onGround = true;
    rings.forEach((ring) => {
      ring.passed = false;
      ring.torus.material = new THREE.MeshStandardMaterial({
        color: 0xffb020,
        emissive: 0xffb020,
        emissiveIntensity: 0.9,
        roughness: 0.3,
      });
      ring.pillar.material.opacity = 0.07;
    });
    score = 0;
    ringsPassed = 0;
    elapsed = 0;
    missionText = 'Line up on the runway — throttle up with W, lift off, fly ring 1.';
    nextTarget = rings[0].centre;
    highlightNextRing(rings, 0);
    screen = SCREEN_TITLE;
  }

  function startSortie() {
    reset();
    screen = SCREEN_PLAY;
    audio.start();
    audio.click();
  }

  function finishLanding() {
    const timeBonus = Math.max(0, Math.round(1200 - elapsed * TIME_BONUS_RATE));
    finalScore = score + LANDING_BONUS + timeBonus;
    score = finalScore;
    flight.fuel = 100;
    screen = SCREEN_LANDED;
    audio.land();
    if (score > best) {
      best = score;
      saveBest(score);
    }
  }

  function crash(reason) {
    crashReason = reason;
    screen = SCREEN_CRASHED;
    audio.crash();
    finalScore = score;
    if (score > best) {
      best = score;
      saveBest(score);
    }
  }

  function step(input, dt, hud) {
    if (screen !== SCREEN_PLAY) return;
    elapsed += dt;
    const prevPos = flight.position.clone();
    const event = stepFlight(flight, input, dt);
    audio.update(flight);

    // Ring gates, in order.
    const ring = rings[ringsPassed];
    if (ring && checkRingPass(ring, prevPos, flight.position)) {
      markRingPassed(ring);
      ringsPassed += 1;
      score += RING_POINTS;
      flight.fuel = Math.min(100, flight.fuel + RING_FUEL_BONUS);
      audio.ring();
      if (ringsPassed < rings.length) {
        nextTarget = rings[ringsPassed].centre;
        highlightNextRing(rings, ringsPassed);
        missionText = `Ring ${ringsPassed + 1} of ${rings.length} — follow the gold arrow.`;
        hud.showBanner(`RING ${ringsPassed} — +${RING_POINTS} PTS, +${RING_FUEL_BONUS} FUEL`, 2.5);
      } else {
        nextTarget = runwayApproachPoint();
        missionText = 'All rings clear — bring her home. Land on the coastal strip.';
        hud.showBanner('ALL RINGS CLEAR — LAND ON THE RUNWAY', 4);
      }
    }

    // Warnings the pilot can still act on.
    warnCooldown -= dt;
    if (warnCooldown <= 0) {
      if (flight.fuel < 20 && flight.fuel > 0) {
        hud.showWarning('LOW FUEL — LAND OR RING UP', 2);
        audio.warn();
        warnCooldown = 2;
      } else if (flight.speed < FLIGHT.stallSpeed && !flight.onGround && flight.position.y > heightAt(flight.position.x, flight.position.z) + 12) {
        hud.showWarning('STALL — NOSE DOWN, THROTTLE UP', 2);
        audio.warn();
        warnCooldown = 2;
      } else if (flight.position.y - heightAt(flight.position.x, flight.position.z) < 25 && flight.verticalSpeed < -6 && !flight.onGround) {
        hud.showWarning('PULL UP', 1.5);
        audio.warn();
        warnCooldown = 1.5;
      }
    }

    if (event === 'landed') {
      if (ringsPassed >= rings.length) finishLanding();
      else {
        flight.fuel = 100;
        hud.showBanner('TOUCHDOWN — REFUELLED. THROTTLE UP AND GO AGAIN.', 3);
        audio.land();
      }
    } else if (event === 'landed-hard') {
      hud.showWarning(`HARD LANDING — HULL ${Math.round(100 - flight.damage)}%`, 3);
    } else if (event === 'crashed-water') {
      crash('Ditched in the sea — the Kitehawk floats badly.');
    } else if (event === 'crashed-terrain' || event === 'crashed-hard') {
      crash('Terrain strike — the mountains win this round.');
    }

    if (flight.damage >= DAMAGE.max && screen === SCREEN_PLAY) crash('Hull failure — the airframe gave up.');
    if (flight.fuel <= 0 && !flight.onGround) {
      // Out of fuel: the jet glides. Nothing to do but find the strip.
      missionText = 'OUT OF FUEL — GLIDE TO THE RUNWAY.';
    }
  }

  /** Stage the jet on final approach with the course complete (screenshot only). */
  function stageFinalApproach() {
    rings.forEach((ring) => markRingPassed(ring));
    ringsPassed = rings.length;
    score = rings.length * RING_POINTS;
    nextTarget = new THREE.Vector3(RUNWAY.x, RUNWAY.elevation + 2, RUNWAY.z);
    missionText = 'Final approach — runway ahead. Easy does it.';
    flight.position.set(RUNWAY.x - 420, RUNWAY.elevation + 48, RUNWAY.z + 14);
    flight.heading = -THREE.MathUtils.degToRad(RUNWAY.heading);
    flight.pitch = THREE.MathUtils.degToRad(-3);
    flight.roll = 0;
    flight.throttle = 0.55;
    flight.fuel = 61;
    flight.damage = 0;
    flight.onGround = false;
    const speed = 62;
    // Runway heading is east (+X), so the approach velocity is +X with a sink.
    flight.velocity.set(speed, -2.5, 0);
    flight.speed = speed;
    elapsed = 214;
    screen = SCREEN_PLAY;
  }

  return {
    get flight() {
      return flight;
    },
    get rings() {
      return rings;
    },
    get screen() {
      return screen;
    },
    set screen(value) {
      screen = value;
    },
    get score() {
      return score;
    },
    get ringsPassed() {
      return ringsPassed;
    },
    get ringsTotal() {
      return rings.length;
    },
    get elapsed() {
      return elapsed;
    },
    get best() {
      return best;
    },
    get missionText() {
      return missionText;
    },
    get nextTarget() {
      return nextTarget;
    },
    get finalScore() {
      return finalScore;
    },
    get crashReason() {
      return crashReason;
    },
    startSortie,
    reset,
    step,
    stageFinalApproach,
  };
}
