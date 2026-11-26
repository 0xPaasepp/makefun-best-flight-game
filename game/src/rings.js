// The ring course: eight glowing gates over the islands, flown in order, then
// a landing. Each ring is a torus with a light pillar so the next gate reads
// from far away; passing one scores, refuels a little and lights the next.
import * as THREE from 'three';
import { PALETTE, RING_RADIUS, RING_POINTS, RUNWAY } from './config.js';
import { heightAt } from './terrain.js';

const COURSE = [
  { x: 420, z: 620, y: 95 },
  { x: 950, z: 260, y: 130 },
  { x: 1000, z: -650, y: 170 },
  { x: 450, z: -1150, y: 210 },
  { x: -450, z: -1150, y: 220 },
  { x: -1100, z: -600, y: 180 },
  { x: -1150, z: 300, y: 140 },
  { x: -900, z: 620, y: 100 },
];

export function buildRings(scene) {
  const group = new THREE.Group();
  const rings = COURSE.map((spot, index) => {
    const next = COURSE[(index + 1) % COURSE.length];
    const heading = Math.atan2(next.x - spot.x, next.z - spot.z);
    const ringGroup = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 1.5, 12, 40),
      new THREE.MeshStandardMaterial({
        color: PALETTE.ring,
        emissive: PALETTE.ring,
        emissiveIntensity: 0.9,
        roughness: 0.3,
      }),
    );
    ringGroup.add(torus);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 260, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: PALETTE.ring,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pillar.position.y = 130;
    ringGroup.add(pillar);
    const label = makeRingLabel(index + 1);
    label.position.set(0, RING_RADIUS + 12, 0);
    ringGroup.add(label);
    ringGroup.position.set(spot.x, Math.max(spot.y, heightAt(spot.x, spot.z) + 45), spot.z);
    ringGroup.rotation.y = heading;
    group.add(ringGroup);
    return {
      index,
      group: ringGroup,
      torus,
      pillar,
      centre: new THREE.Vector3(spot.x, ringGroup.position.y, spot.z),
      normal: new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)),
      passed: false,
    };
  });
  scene.add(group);
  return rings;
}

function makeRingLabel(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10, 16, 28, 0.72)';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffcf4d';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(16, 16, 1);
  return sprite;
}

/** True when the jet crossed this ring's plane inside its radius this step. */
export function checkRingPass(ring, prevPos, pos) {
  if (ring.passed) return false;
  const prevSide = prevPos.clone().sub(ring.centre).dot(ring.normal);
  const side = pos.clone().sub(ring.centre).dot(ring.normal);
  if (prevSide === 0 || side === 0 || Math.sign(prevSide) === Math.sign(side)) return false;
  const t = prevSide / (prevSide - side);
  const crossing = prevPos.clone().lerp(pos, t);
  return crossing.distanceTo(ring.centre) < RING_RADIUS;
}

export function markRingPassed(ring) {
  ring.passed = true;
  ring.torus.material = new THREE.MeshStandardMaterial({
    color: 0x37d67a,
    emissive: 0x37d67a,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  });
  ring.pillar.material.opacity = 0.03;
}

export function highlightNextRing(rings, nextIndex) {
  rings.forEach((ring, i) => {
    const active = i === nextIndex && !ring.passed;
    ring.torus.scale.setScalar(active ? 1.06 : 1);
    ring.pillar.material.opacity = active ? 0.09 : ring.passed ? 0.02 : 0.04;
  });
}

export function runwayApproachPoint() {
  return new THREE.Vector3(RUNWAY.x - 900, RUNWAY.elevation + 90, RUNWAY.z);
}
