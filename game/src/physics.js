// The flight model: arcade handling with real trade-offs. Throttle makes speed,
// speed makes lift, bank makes the turn and bleeds speed, and a slow jet sinks.
// Stall, hard landings and terrain all bite; a gentle runway touchdown pays.
import * as THREE from 'three';
import { DAMAGE, FLIGHT, FUEL, RUNWAY } from './config.js';
import { heightAt } from './terrain.js';

export function createFlightState() {
  return {
    position: new THREE.Vector3(RUNWAY.x - RUNWAY.length / 2 + 30, RUNWAY.elevation + 1.5, RUNWAY.z),
    velocity: new THREE.Vector3(0, 0, 0),
    heading: -THREE.MathUtils.degToRad(RUNWAY.heading),
    pitch: 0,
    roll: 0,
    throttle: 0,
    speed: 0,
    fuel: FUEL.capacity,
    damage: 0,
    verticalSpeed: 0,
    onGround: true,
  };
}

export function forwardVector(state) {
  const cp = Math.cos(state.pitch);
  return new THREE.Vector3(
    -Math.sin(state.heading) * cp,
    Math.sin(state.pitch),
    -Math.cos(state.heading) * cp,
  );
}

/**
 * Advance the flight model one fixed step. `input` is { pitch, roll, rudder,
 * throttleUp, throttleDown, brake, boost } with stick values in [-1, 1].
 * Returns 'landed' | 'crashed-terrain' | 'crashed-water' | 'crashed-hard' | null.
 */
export function stepFlight(state, input, dt) {
  const speed = state.velocity.length();
  state.speed = speed;
  const authority = THREE.MathUtils.clamp((speed - 6) / (FLIGHT.stallSpeed + 14), 0, 1);

  if (input.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.55);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.55);

  // Stick: pitch and roll ease toward the commanded bank, faster when flying.
  const targetRoll = THREE.MathUtils.clamp(input.roll, -1, 1) * THREE.MathUtils.degToRad(62);
  const targetPitch = THREE.MathUtils.clamp(input.pitch, -1, 1) * THREE.MathUtils.degToRad(24);
  const rollRate = THREE.MathUtils.degToRad(FLIGHT.rollRate) * (0.35 + 0.65 * authority);
  const pitchRate = THREE.MathUtils.degToRad(FLIGHT.pitchRate) * (0.3 + 0.7 * authority);
  state.roll = approach(state.roll, targetRoll, rollRate * dt);
  state.pitch = approach(state.pitch, targetPitch, pitchRate * dt);
  if (state.onGround) {
    state.pitch = Math.max(0, state.pitch);
    state.roll *= 1 - Math.min(1, 6 * dt);
  }

  // Coordinated turn: bank turns the nose; rudder adds a little direct yaw.
  // Positive roll banks left (right wing rises), so the heading grows. The
  // 3.0 factor keeps turns game-quick at cruise speed instead of airliner-slow.
  const turnRate = speed > 4 ? (3.0 * 9.8 * Math.tan(state.roll)) / Math.max(speed, 12) : 0;
  state.heading += turnRate * dt;
  state.heading -= THREE.MathUtils.degToRad(FLIGHT.yawRate) * input.rudder * authority * dt;

  // Forces along the nose.
  const forward = forwardVector(state);
  const thrust = (FLIGHT.accel * state.throttle + (input.boost ? FLIGHT.boostAccel : 0)) * (state.onGround ? 1.15 : 1);
  state.velocity.addScaledVector(forward, thrust * dt);
  // Quadratic drag caps the speed: full throttle levels out near 100 m/s.
  if (speed > 0.1) {
    const dragK = 0.0026 * (input.brake ? 5 : 1);
    const dragDecel = Math.min(dragK * speed * speed * dt, speed);
    state.velocity.addScaledVector(state.velocity, -dragDecel / speed);
  }
  if (input.brake) state.velocity.multiplyScalar(Math.max(0, 1 - (FLIGHT.brake / Math.max(speed, 1)) * dt));

  // Weathercock stability: the airframe pulls its velocity onto its nose.
  // Without this the jet skids sideways through every turn and never goes
  // where it points.
  {
    const fwd = forwardVector(state);
    const along = state.velocity.dot(fwd);
    const lateral = state.velocity.clone().addScaledVector(fwd, -along);
    lateral.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
    state.velocity.copy(fwd).multiplyScalar(along).add(lateral);
  }

  // Lift holds the jet up once it is flying; below stall speed it sinks.
  // On the ground the strip holds it up: no sink while it is rolling.
  if (!state.onGround) {
    const lift = THREE.MathUtils.clamp(speed / FLIGHT.stallSpeed, 0, 1) * Math.cos(state.roll);
    state.velocity.y -= FLIGHT.lift * (1 - lift) * dt;
    state.velocity.y -= 1.6 * dt;
  }

  state.position.addScaledVector(state.velocity, dt);
  state.verticalSpeed = state.velocity.y;

  // Fuel: throttle burns it, boost burns it faster, rings top it up.
  const burn = FUEL.burnIdle + (FUEL.burnFull - FUEL.burnIdle) * state.throttle + (input.boost ? FLIGHT.boostFuel : 0);
  state.fuel = Math.max(0, state.fuel - burn * dt);
  if (state.fuel <= 0 && state.throttle > 0.25) state.throttle = 0.25;

  // Soft ceiling.
  if (state.position.y > 600) {
    state.position.y = 600;
    state.velocity.y = Math.min(0, state.velocity.y);
  }

  // Ground and water. The 1.65 contact band (a hair above the 1.6 gear height)
  // keeps binary rounding from flickering the jet between ground and air.
  const ground = heightAt(state.position.x, state.position.z);
  const clearance = state.position.y - ground;
  if (clearance <= 1.65) {
    if (state.onGround) {
      // Rolling: rotate and lift off once there is flying speed and nose-up.
      if (speed > FLIGHT.stallSpeed * 1.05 && state.pitch > THREE.MathUtils.degToRad(2)) {
        state.onGround = false;
        state.velocity.y = Math.max(state.velocity.y, 3);
        state.position.y = ground + 2.5;
        return null;
      }
      state.position.y = ground + 1.6;
      state.velocity.y = 0;
      // Rolling resistance: a jet that lands stays landed unless it throttles up.
      state.velocity.multiplyScalar(Math.max(0, 1 - 0.6 * dt));
      state.speed = state.velocity.length();
      return null;
    }
    const overRunway =
      Math.abs(state.position.x - RUNWAY.x) < RUNWAY.length / 2 + 10 &&
      Math.abs(state.position.z - RUNWAY.z) < RUNWAY.width / 2 + 14;
    const gentle =
      Math.abs(state.verticalSpeed) < 8 &&
      Math.abs(THREE.MathUtils.radToDeg(state.roll)) < 14 &&
      Math.abs(THREE.MathUtils.radToDeg(state.pitch)) < 12 &&
      speed < 95;
    if (overRunway && gentle) {
      state.position.y = ground + 1.6;
      state.velocity.set(0, 0, 0);
      state.onGround = true;
      state.pitch = 0;
      state.roll = 0;
      return 'landed';
    }
    if (ground <= 0.6) return 'crashed-water';
    if (Math.abs(state.verticalSpeed) > 14 || speed > 110) return 'crashed-terrain';
    state.damage += DAMAGE.hardLanding;
    state.position.y = ground + 1.6;
    state.velocity.multiplyScalar(0.25);
    state.velocity.y = 0;
    state.onGround = true;
    state.pitch = 0;
    state.roll = 0;
    return state.damage >= DAMAGE.max ? 'crashed-hard' : 'landed-hard';
  }
  state.onGround = false;
  return null;
}

function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

/** Heading in degrees, 0-360, compass style (0 = north, 90 = east). */
export function headingDegrees(state) {
  const deg = -THREE.MathUtils.radToDeg(state.heading);
  return ((deg % 360) + 360) % 360;
}
