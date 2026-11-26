// The Kitehawk Mk.III: a little swept-wing jet built from primitives, with a
// glass canopy, red wingtip stripes, nav lights and a glowing exhaust. One
// group, posed by the flight model every frame.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function buildAircraft() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.jetBody, roughness: 0.35, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.jetAccent, roughness: 0.4, metalness: 0.4 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: PALETTE.jetCanopy, roughness: 0.15, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.3 });

  // Fuselage: nose cone + body + tail cone, nose toward -Z (forward).
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 4.2, 12), accentMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -5.4);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 6.4, 12), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, -1.2);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.35, 2.6, 12), bodyMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.1, 3.2);
  group.add(nose, body, tail);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), canopyMat);
  canopy.scale.set(0.85, 0.62, 1.9);
  canopy.position.set(0, 0.85, -2.2);
  group.add(canopy);

  // Swept main wings and tailplanes.
  function wing(span, chord, sweep, y, z, mat) {
    const geo = new THREE.BoxGeometry(span, 0.18, chord);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, y, z);
    mesh.rotation.y = sweep;
    return mesh;
  }
  const mainWing = wing(13.5, 3.4, 0.32, -0.15, 0.6, bodyMat);
  const tailplane = wing(5.4, 1.8, 0.4, 0.25, 3.9, bodyMat);
  group.add(mainWing, tailplane);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 2.6), accentMat);
  fin.position.set(0, 1.35, 3.6);
  fin.rotation.x = -0.35;
  group.add(fin);

  // Red wingtip stripes.
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 3.0), accentMat);
    tip.position.set(side * 6.4, -0.15, 0.9);
    tip.rotation.y = side * 0.32;
    group.add(tip);
  }

  // Engine nozzle + glow, and wingtip nav lights.
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.0, 12), darkMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.1, 4.6);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff9a2e }),
  );
  glow.scale.set(1, 1, 2.2);
  glow.position.set(0, 0.1, 5.1);
  group.add(nozzle, glow);

  const navMatL = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const navMatR = new THREE.MeshBasicMaterial({ color: 0x35e065 });
  for (const [side, mat] of [[-1, navMatL], [1, navMatR]]) {
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
    nav.position.set(side * 6.85, -0.15, 1.1);
    group.add(nav);
  }

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return { group, glow };
}

/** Pose the jet from the flight state: position, heading, pitch and bank. */
export function poseAircraft(aircraft, state) {
  aircraft.group.position.copy(state.position);
  aircraft.group.rotation.order = 'YXZ';
  aircraft.group.rotation.y = state.heading;
  aircraft.group.rotation.x = state.pitch;
  aircraft.group.rotation.z = state.roll;
  const flicker = 0.75 + 0.25 * Math.sin(performance.now() / 47) * state.throttle;
  aircraft.glow.scale.set(flicker, flicker, 1.6 + 1.4 * state.throttle);
}
