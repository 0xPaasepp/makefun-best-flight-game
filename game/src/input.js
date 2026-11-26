// Keyboard + mouse. Arrows fly the jet (pitch/roll), W/S work the throttle,
// A/D rudder, Space brakes, Shift boosts, and the mouse steers by where it
// points. P pauses, R restarts, M mutes, Enter starts.
export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false };
  const pressed = new Set();

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouse.active = true;
  }
  function onMouseLeave() {
    mouse.active = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  function stick() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft')) roll += 1;
    if (keys.has('ArrowRight')) roll -= 1;
    if (mouse.active) {
      // Mouse steers gently: it blends in, never overrides the keys outright.
      roll += clamp(-mouse.x, -1, 1) * 0.7;
      pitch += clamp(-mouse.y, -1, 1) * 0.5;
    }
    return {
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      rudder: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      throttleUp: keys.has('KeyW'),
      throttleDown: keys.has('KeyS'),
      brake: keys.has('Space'),
      boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
  }

  return {
    stick,
    /** True once when the key was pressed since the last call. */
    consume(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    pausedKey: () => pressed.has('KeyP'),
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
