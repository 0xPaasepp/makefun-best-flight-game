// Aurelia: three islands in a warm sea, a coastal airfield, clouds and sun.
// heightAt is the single source of truth for ground height — the mesh, the
// flight model and the runway all ask it, so the ground you see is the ground
// you can hit.
import * as THREE from 'three';
import { PALETTE, RUNWAY, SEA_LEVEL, WORLD_SIZE } from './config.js';
import { fbmNoise } from './random.js';

const NOISE_SEED = 1337;
const ISLANDS = [
  { x: 0, z: -500, radius: 1500, height: 165 },
  { x: 1750, z: -1100, radius: 720, height: 110 },
  { x: -1550, z: 1150, radius: 640, height: 95 },
];

function islandHeight(x, z) {
  let total = 0;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
    if (d >= 1) continue;
    const falloff = Math.pow(Math.cos((d * Math.PI) / 2), 0.8);
    const detail = 0.55 + 0.45 * fbmNoise(x / 420, z / 420, NOISE_SEED);
    total += island.height * falloff * detail;
  }
  return total;
}

function runwayBlend(x, z) {
  // The flat area is the strip plus a 500 m approach corridor to its west, so
  // the final approach descends over flat ground, not the rising hillside.
  const rectCentreX = RUNWAY.x - 250;
  const rectHalfLength = RUNWAY.length / 2 + 250;
  const dx = Math.max(Math.abs(x - rectCentreX) - rectHalfLength, 0);
  const dz = Math.max(Math.abs(z - RUNWAY.z) - RUNWAY.width / 2, 0);
  const d = Math.sqrt(dx * dx + dz * dz);
  const t = Math.min(Math.max(d / 160, 0), 1);
  return t * t * (3 - 2 * t);
}

/** Ground height in metres at (x, z). The airfield is flattened to runway level. */
export function heightAt(x, z) {
  const raw = islandHeight(x, z);
  // Lowland bumps break up the coastal flats so the terrain reads, not a plain.
  const lowland = Math.min(Math.max((30 - raw) / 30, 0), 1);
  const bumpy = raw + 9 * fbmNoise(x / 130, z / 130, 55) * lowland;
  const blend = runwayBlend(x, z);
  return RUNWAY.elevation + (bumpy - RUNWAY.elevation) * blend;
}

function groundColor(x, z, height, slope, out) {
  if (height < 2.5) return out.setHex(PALETTE.sand);
  if (height < 55) {
    const patch = fbmNoise(x / 70, z / 70, 77);
    return out.setHex(patch > 0.52 ? PALETTE.forest : PALETTE.grass);
  }
  if (height < 105 || slope > 0.55) return out.setHex(PALETTE.rock);
  return out.setHex(PALETTE.snow);
}

function buildTerrainMesh() {
  const segments = 220;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = heightAt(x, z);
    positions.setY(i, Math.max(h, -6));
  }
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i += 1) {
    normal.fromBufferAttribute(normals, i);
    const slope = 1 - normal.dot(up);
    groundColor(positions.getX(i), positions.getZ(i), positions.getY(i), slope, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildOcean() {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE * 2.2, WORLD_SIZE * 2.2, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE.sea,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.94,
  });
  const ocean = new THREE.Mesh(geometry, material);
  ocean.position.y = SEA_LEVEL;
  ocean.receiveShadow = true;
  return ocean;
}

function buildRunway() {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.length, 0.6, RUNWAY.width),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.9 }),
  );
  strip.position.set(RUNWAY.x, RUNWAY.elevation + 0.3, RUNWAY.z);
  strip.receiveShadow = true;
  group.add(strip);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const thresholdMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let x = -RUNWAY.length / 2 + 40; x < RUNWAY.length / 2 - 20; x += 48) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 2.4), dashMat);
    dash.position.set(RUNWAY.x + x, RUNWAY.elevation + 0.7, RUNWAY.z);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let i = -3; i <= 3; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 10), thresholdMat);
      bar.position.set(RUNWAY.x + end * (RUNWAY.length / 2 - 14), RUNWAY.elevation + 0.7, RUNWAY.z + i * 6);
      group.add(bar);
    }
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
  const lightGeo = new THREE.SphereGeometry(1.1, 8, 6);
  for (let x = -RUNWAY.length / 2; x <= RUNWAY.length / 2; x += 80) {
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(RUNWAY.x + x, RUNWAY.elevation + 1.2, RUNWAY.z + side * (RUNWAY.width / 2 + 4));
      group.add(light);
    }
  }
  // Control tower and two hangars beside the strip.
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(14, 42, 14),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 }),
  );
  tower.position.set(RUNWAY.x + 200, RUNWAY.elevation + 21, RUNWAY.z - 78);
  tower.castShadow = true;
  group.add(tower);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(18, 8, 18),
    new THREE.MeshStandardMaterial({ color: PALETTE.jetCanopy, roughness: 0.3, metalness: 0.4 }),
  );
  cab.position.set(RUNWAY.x + 200, RUNWAY.elevation + 46, RUNWAY.z - 78);
  group.add(cab);
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.7, metalness: 0.2 });
  for (const hx of [-180, -120]) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(44, 16, 34), hangarMat);
    hangar.position.set(RUNWAY.x + hx, RUNWAY.elevation + 8, RUNWAY.z + 78);
    hangar.castShadow = true;
    group.add(hangar);
  }
  return group;
}

function buildClouds(random) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x9a9a9a,
    emissiveIntensity: 0.55,
    roughness: 1,
    transparent: true,
    opacity: 0.92,
  });
  for (let i = 0; i < 46; i += 1) {
    const puff = new THREE.Group();
    const blobs = 4 + Math.floor(random.next() * 3);
    for (let b = 0; b < blobs; b += 1) {
      const s = random.range(20, 46);
      const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), material);
      blob.position.set(random.range(-55, 55), random.range(-4, 7), random.range(-20, 20));
      blob.scale.y = 0.5;
      puff.add(blob);
    }
    puff.position.set(random.range(-2000, 2000), random.range(190, 300), random.range(-2000, 2000));
    group.add(puff);
  }
  return group;
}

function buildTrees(random) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.forest, roughness: 1 });
  for (let i = 0; i < 260; i += 1) {
    const x = random.range(-1900, 1900);
    const z = random.range(-1900, 1900);
    const h = heightAt(x, z);
    if (h < 4 || h > 55) continue;
    const s = random.range(0.8, 1.6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * s, 1.2 * s, 6 * s, 6), trunkMat);
    trunk.position.set(x, h + 3 * s, z);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(5 * s, 12 * s, 8), leafMat);
    crown.position.set(x, h + 10 * s, z);
    crown.castShadow = true;
    group.add(trunk, crown);
  }
  return group;
}

/** Build the whole static world and add it to the scene. Returns the clouds group. */
export function buildWorld(scene, random) {
  scene.add(buildTerrainMesh());
  scene.add(buildOcean());
  scene.add(buildRunway());
  scene.add(buildTrees(random));
  const clouds = buildClouds(random);
  scene.add(clouds);
  return { clouds };
}
