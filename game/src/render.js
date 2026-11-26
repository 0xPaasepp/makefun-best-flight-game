// The camera and the light: a golden-hour sun, soft shadows, sea fog, and a
// chase camera that sits behind the jet, eases into banks and never fights
// the pilot. The cockpit read-outs live in the DOM (hud.js), not in 3D.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { forwardVector } from './physics.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8c49a, 900, 5200);

  // Golden-hour sky: a big gradient dome, sun low in the west.
  const skyGeo = new THREE.SphereGeometry(9000, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; void main(){ float t = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(t, 0.8)), 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-2600, 1500, -1800);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 8000;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 2;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85));

  // The sun disc itself, so the sky has a place to look at.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(180, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false }),
  );
  sunDisc.position.set(-5200, 2600, -3600);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 12000);
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function update(state, dt) {
    const forward = forwardVector(state);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    // Chase position: behind and above the jet, swung out by the bank.
    desired.copy(state.position).addScaledVector(forward, -26).addScaledVector(up, 8.5);
    desired.addScaledVector(right, -state.roll * 6);
    const k = 1 - Math.exp(-dt * 5.5);
    camPos.lerp(desired, k);
    camera.position.copy(camPos);
    lookAt.copy(state.position).addScaledVector(forward, 55).addScaledVector(up, 2);
    camTarget.lerp(lookAt, 1 - Math.exp(-dt * 8));
    camera.up.set(Math.sin(state.roll) * 0.15, 1, 0).normalize();
    camera.lookAt(camTarget);
    // The shadow frustum follows the jet.
    sun.position.set(state.position.x - 900, state.position.y + 500, state.position.z - 620);
    sun.target.position.copy(state.position);
    sun.target.updateMatrixWorld();
  }

  function snap(state) {
    const forward = forwardVector(state);
    camPos.copy(state.position).addScaledVector(forward, -26).add(new THREE.Vector3(0, 8.5, 0));
    camTarget.copy(state.position).addScaledVector(forward, 55);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  /** Showcase angle for the title screen: the jet parked on the strip, seen
   * from the front quarter with the runway running away ahead of it. The jet
   * sits left of the title card, not behind it. */
  function snapShowcase(state) {
    camPos.set(state.position.x - 36, state.position.y + 7, state.position.z - 42);
    camTarget.set(state.position.x + 120, state.position.y, state.position.z + 10);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTarget);
  }

  return { renderer, scene, camera, resize, update, snap, snapShowcase };
}
