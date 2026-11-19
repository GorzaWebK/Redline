// Keyboard, gamepad and touch. Steering on a keyboard (or the touch buttons) is
// all-or-nothing; the car eases the wheels in itself (see car.js). A gamepad
// gives analogue steering and pedals; on a phone you can also steer by tilting.
export class Input {
  constructor() {
    this.keys = new Set();
    this.handlers = {}; // key(code)
    this.padPrev = [];
    // on-screen touch buttons
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
    this.touchUsed = false;
    this.autoGas = false; // touch: accelerate unless braking
    // tilt steering
    this.tiltOn = false;
    this.tiltInvert = false;
    this.tiltRaw = 0;
    this.tiltCentre = 0;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null) return;
      const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      // landscape: tilting the phone like a steering wheel changes beta
      this.tiltRaw = ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma;
    });
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.handlers.key?.(e.code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** A touch button: held while a finger is on it (several fingers at once work). */
  bindTouch(el, key) {
    const down = (e) => { e.preventDefault(); this.touch[key] = true; this.touchUsed = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } };
    const up = () => { this.touch[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Make the current tilt "straight ahead". */
  centreTilt() { this.tiltCentre = this.tiltRaw; }

  /** Current controls: { throttle 0..1, brake 0..1, steer -1..1 (+ right), handbrake }. */
  read() {
    const k = this.keys, T = this.touch;
    let throttle = k.has('KeyW') || k.has('ArrowUp') || T.gas ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') || T.brake ? 1 : 0;
    let handbrake = k.has('Space') || T.drift;
    let steer = (k.has('KeyD') || k.has('ArrowRight') || T.right ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') || T.left ? 1 : 0);
    if (this.touchUsed && this.autoGas && !brake) throttle = 1;
    if (this.tiltOn && !T.left && !T.right) {
      const v = (this.tiltRaw - this.tiltCentre) / 22;
      steer = Math.max(-1, Math.min(1, Math.abs(v) < 0.06 ? 0 : v)) * (this.tiltInvert ? -1 : 1);
    }
    const p = this.pad();
    if (p) {
      const ax = p.axes[0] || 0;
      const dz = 0.12;
      if (Math.abs(ax) > dz) steer = Math.sign(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.4);
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      if (rt > 0.05 || p.buttons[0]?.pressed) throttle = Math.max(throttle, p.buttons[0]?.pressed ? 1 : rt);
      if (lt > 0.05 || p.buttons[1]?.pressed) brake = Math.max(brake, p.buttons[1]?.pressed ? 1 : lt);
      if (p.buttons[2]?.pressed) handbrake = true;
    }
    return { throttle, brake, steer, handbrake };
  }

  /** Vibrate the gamepad (if it can): strength 0..1, for ms. */
  rumble(strength, ms = 120) {
    const p = this.pad(), act = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
    if (!act || strength <= 0) return;
    try {
      if (act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) });
      else if (act.pulse) act.pulse(Math.min(1, strength), ms);
    } catch { /* not supported */ }
  }

  /** Tilt steering on iPhones needs permission (asked from a tap). Resolves true if allowed. */
  async askTilt() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
    }
    return !!D;
  }

  /** Gamepad buttons pressed since last frame, mapped to keys: Start = Escape, Y = R, Back = C, RB = V. (X is the handbrake.) */
  pollPad() {
    const p = this.pad();
    if (!p) return;
    const map = { 9: 'Escape', 3: 'KeyR', 8: 'KeyC', 5: 'KeyV' };
    for (const [b, code] of Object.entries(map)) {
      const down = !!p.buttons[b]?.pressed;
      if (down && !this.padPrev[b]) this.handlers.key?.(code, { pad: true });
      this.padPrev[b] = down;
    }
  }
}
