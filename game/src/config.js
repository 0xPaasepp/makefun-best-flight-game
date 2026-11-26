// AURELIA RING RUN — tuning constants. One place for every number the flight
// model, the world and the HUD agree on, so a tweak here retunes the whole game.
export const STEP = 1 / 60;
export const GRAVITY = 9.8;
export const SEA_LEVEL = 0;
export const WORLD_SIZE = 4200;

// Flight model (units are metres, metres per second, degrees).
export const FLIGHT = {
  maxSpeed: 145,
  stallSpeed: 26,
  cruiseSpeed: 78,
  accel: 26,
  drag: 0.055,
  turnBleed: 0.35,
  pitchRate: 42,
  rollRate: 95,
  yawRate: 26,
  lift: 13.5,
  climbPenalty: 0.55,
  brake: 34,
  boostAccel: 22,
  boostFuel: 2.4,
};

// Fuel and damage: a sortie is a decision, not a timer.
export const FUEL = {
  capacity: 100,
  burnIdle: 0.3,
  burnFull: 0.9,
  ringBonus: 8,
  landingRefuel: 100,
};
export const DAMAGE = {
  max: 100,
  hardLanding: 34,
  crash: 100,
  scrape: 12,
};

// The course: eight rings, then a landing. Ring positions are hand-placed over
// the islands so the course reads as a tour, not a random scatter.
export const RING_RADIUS = 24;
export const RING_POINTS = 100;
export const RING_FUEL_BONUS = 8;
export const LANDING_BONUS = 250;
export const TIME_BONUS_RATE = 2;

// Runway: a coastal strip on the main island, heading east (090).
export const RUNWAY = {
  x: 0,
  z: 620,
  heading: 90,
  length: 640,
  width: 46,
  elevation: 2,
};

// Colours: one warm late-afternoon palette for sky, sea, land and paint.
export const PALETTE = {
  skyTop: 0x2f6fb4,
  skyBottom: 0xf7c98a,
  sun: 0xffe3b3,
  sea: 0x1d6f8f,
  seaDeep: 0x14506e,
  sand: 0xe8d29a,
  grass: 0x5d9b4a,
  forest: 0x3d7a35,
  rock: 0x8a7f74,
  snow: 0xf2f4f6,
  asphalt: 0x2e3138,
  ring: 0xffb020,
  ringNext: 0xffcf4d,
  jetBody: 0xdfe6ee,
  jetAccent: 0xe2483d,
  jetCanopy: 0x1c2f4a,
};
