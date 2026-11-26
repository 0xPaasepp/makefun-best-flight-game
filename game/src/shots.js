// Deterministic screenshot scenes (?shot=start|play|ring|end). Each one plays
// the real rules forward from a fresh world with a simple autopilot, so the
// frame is what a real sortie looks like and the same seed always gives the
// same frame. No scene is posed by hand except the final approach, which
// stages the jet on the glide slope the rules themselves would fly.
import { RUNWAY, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './world.js';

const PLAY_SECONDS = 24;
const STUB_HUD = { showBanner() {}, showWarning() {} };

function wrapAngle(angle) {
  return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Steer toward the next ring. Gentle by design: a straight climb-out after
 * takeoff, banks capped at 30 degrees, and altitude first — it climbs to the
 * gate's height before it worries about lining up on it.
 * Exported for headless flight-model testing (sim.mjs).
 */
export function autopilotInput(game, elapsed) {
  const flight = game.flight;
  const target = game.nextTarget;
  if (elapsed < 5 || flight.onGround) {
    // Climb-out: full throttle, wings level, nose 10 degrees up.
    return {
      pitch: 0.55,
      roll: 0,
      rudder: 0,
      throttleUp: true,
      throttleDown: false,
      brake: false,
      boost: false,
    };
  }
  const dx0 = target.x - flight.position.x;
  const dz0 = target.z - flight.position.z;
  // Line-follow the gate: far out, fly at its centre; close in, follow the
  // line through it along its approach axis, chasing a carrot beyond the
  // jet's projection on that line. Pure pursuit of a point orbits the gate;
  // a line puts the jet through its middle. Once the course is complete the
  // line is the runway centreline and the target is a glide slope to it.
  const ring = game.rings[game.ringsPassed];
  const done = game.ringsPassed >= game.ringsTotal;
  const line = ring
    ? { x: ring.centre.x, y: ring.centre.y, z: ring.centre.z, nx: ring.normal.x, nz: ring.normal.z }
    : done
      ? { x: RUNWAY.x - RUNWAY.length / 2, y: RUNWAY.elevation + 2, z: RUNWAY.z, nx: 1, nz: 0 }
      : null;
  const horizontal = Math.sqrt(dx0 * dx0 + dz0 * dz0);
  let aimX = target.x;
  let aimZ = target.z;
  if (line) {
    const relX = flight.position.x - line.x;
    const relZ = flight.position.z - line.z;
    const s = relX * line.nx + relZ * line.nz;
    // The carrot leads the jet by two seconds of flight: a short lead at
    // low speed tracks the line tightly, a long one at high speed keeps the
    // jet from oscillating around it.
    const lead = clamp(flight.speed * 2, 70, 180);
    const carrotX = line.x + line.nx * (s + lead);
    const carrotZ = line.z + line.nz * (s + lead);
    const w = ring ? clamp((450 - horizontal) / 250, 0, 1) : 1;
    aimX = line.x + (carrotX - line.x) * w;
    aimZ = line.z + (carrotZ - line.z) * w;
  }
  const dx = aimX - flight.position.x;
  const dz = aimZ - flight.position.z;
  // Desired altitude: the gate's height, or a glide slope to the threshold
  // once the course is complete. The slope is along-track: west of the
  // threshold it falls toward the strip, east of it the jet goes around.
  let wantAlt = target.y;
  let overshot = false;
  if (done && line) {
    const along = (flight.position.x - line.x) * line.nx + (flight.position.z - line.z) * line.nz;
    // Past the far end of the strip with no room left: go around. Anywhere
    // else over the strip, the jet lands where it is.
    if (along > 500) overshot = true;
    else wantAlt = Math.min(100, Math.max(2, 2 + Math.max(0, -along) * 0.1));
  }
  const dy = wantAlt - flight.position.y;
  const wantHeading = Math.atan2(-dx, -dz);
  const headingError = wrapAngle(wantHeading - flight.heading);
  if (overshot) {
    // Go around: climb to 90 and fly back west to the approach fix.
    const fixDx = RUNWAY.x - 900 - flight.position.x;
    const fixDz = RUNWAY.z - flight.position.z;
    const fixHeading = Math.atan2(-fixDx, -fixDz);
    const fixError = wrapAngle(fixHeading - flight.heading);
    return {
      // Climb back to the fix, but never pitch up steeply while slow: a
      // stalled go-around is worse than a late one.
      pitch: clamp(clamp((90 - flight.position.y) * 0.008, -0.1, flight.speed < 40 ? 0.09 : 0.24) / 0.42, -1, 1),
      roll: clamp(fixError * 1.6, -0.7, 0.7),
      rudder: 0,
      throttleUp: flight.speed < 60,
      throttleDown: flight.speed > 66,
      brake: false,
      boost: false,
    };
  }
  // Climb first when well below the gate; only then chase the line. The pitch
  // command is proportional to the height error, so the jet levels at the
  // gate's height instead of sailing over it.
  const wantPitch =
    horizontal > 200
      ? clamp(dy * 0.008, -0.1, 0.24)
      : clamp(dy * 0.02, -0.12, 0.12);
  // Near the gate, fly straight through it instead of chasing the bearing.
  const nearGate = horizontal < 120 ? 0.4 : 1;
  const bigTurn = Math.abs(headingError) > 0.5;
  // Race it like a pilot: fast on the straights, slow for the turns. The
  // gates are only ~700 m apart, so the jet brakes inside 550 m of the next
  // one — at 90 m/s it cannot turn onto the next gate in time.
  const targetSpeed = done ? 48 : bigTurn ? 52 : horizontal < 550 ? 58 : 70;
  // Landing flare: low over the strip, throttle right back, the nose up just
  // a touch to arrest the sink — a hard flare balloons the jet back into
  // the sky instead of settling her.
  const flaring = done && flight.position.y < 10 && Math.abs(flight.position.z - RUNWAY.z) < 60;
  const wantPitchFlared = flaring ? 0.03 : wantPitch;
  return {
    pitch: clamp(wantPitchFlared / 0.42, -1, 1),
    roll: clamp(headingError * 1.6, -0.7, 0.7) * nearGate,
    rudder: 0,
    throttleUp: !flaring && flight.speed < targetSpeed,
    throttleDown: flaring || flight.speed > targetSpeed + 6,
    brake: flaring ? flight.speed > 40 : flight.speed > targetSpeed + 12,
    boost: false,
  };
}

function flyFor(game, seconds) {
  let elapsed = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    game.step(autopilotInput(game, elapsed), STEP, STUB_HUD);
    elapsed += STEP;
    if (game.screen !== SCREEN_PLAY) break;
  }
}

/**
 * Stage the named scene and return the screen to show. The caller paints a
 * few frames and then sets window.__shotReady.
 */
export function stageShot(name, game) {
  game.reset();
  if (name === 'play') {
    game.startSortie();
    flyFor(game, PLAY_SECONDS);
    return SCREEN_PLAY;
  }
  if (name === 'ring') {
    game.startSortie();
    // Fly until the jet is a few seconds out from ring 3, nose on the gate.
    let elapsed = 0;
    for (let i = 0; i < 600 / STEP; i += 1) {
      game.step(autopilotInput(game, elapsed), STEP, STUB_HUD);
      elapsed += STEP;
      if (game.screen !== SCREEN_PLAY) break;
      const target = game.nextTarget;
      const dx = target.x - game.flight.position.x;
      const dz = target.z - game.flight.position.z;
      const dy = target.y - game.flight.position.y;
      if (game.ringsPassed === 2 && Math.sqrt(dx * dx + dy * dy + dz * dz) < 260) break;
    }
    return SCREEN_PLAY;
  }
  if (name === 'end') {
    game.startSortie();
    game.stageFinalApproach();
    return SCREEN_PLAY;
  }
  return SCREEN_TITLE;
}
