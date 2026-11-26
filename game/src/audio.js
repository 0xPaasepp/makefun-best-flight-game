// Synthesised sound, no audio files: an engine hum that follows the throttle,
// wind that follows the speed, a chime for each ring, a thud for touchdown and
// a beep for warnings. Everything starts on the first user gesture.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function start() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
    engineOsc.start();

    const noiseLength = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(ctx.destination);
    noise.start();
  }

  function tone(freq, duration, type, volume, when = 0) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + when;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    start,
    toggleMute() {
      muted = !muted;
      if (ctx) ctx.resume?.();
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Call every frame with the flight state. */
    update(state) {
      if (!ctx || muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const target = state.onGround ? 0.02 : 0.05 + 0.075 * state.throttle;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + 95 * state.throttle, ctx.currentTime, 0.1);
      const wind = Math.min(1, state.speed / 130);
      windGain.gain.setTargetAtTime(wind * 0.11, ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(500 + 900 * wind, ctx.currentTime, 0.15);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.5, 'sine', 0.12, 0.09);
    },
    land() {
      tone(140, 0.3, 'sine', 0.25);
      tone(523, 0.3, 'sine', 0.1, 0.05);
      tone(784, 0.45, 'sine', 0.1, 0.14);
    },
    crash() {
      tone(90, 0.7, 'sawtooth', 0.22);
      tone(55, 0.9, 'square', 0.14, 0.1);
    },
    warn() {
      tone(1100, 0.12, 'square', 0.06);
    },
    click() {
      tone(660, 0.08, 'sine', 0.08);
    },
  };
}
