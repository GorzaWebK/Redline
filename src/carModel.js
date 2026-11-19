// The car, built from shapes in code: a wedge body, glass cabin, rear wing,
// lights and four wheels that spin and steer. Local axes: x forward, y up, z right.

import * as THREE from 'three';

export const PAINTS = [
  { id: 'red', name: 'Racing Red', color: 0xd8261c },
  { id: 'white', name: 'Pearl White', color: 0xeef0f2 },
  { id: 'black', name: 'Midnight', color: 0x1a1c22 },
  { id: 'blue', name: 'Cobalt', color: 0x1f5fd6 },
  { id: 'yellow', name: 'Taxi Yellow', color: 0xf2c418 },
  { id: 'green', name: 'Heritage Green', color: 0x1f6b43 },
  { id: 'orange', name: 'Papaya', color: 0xff7a1a },
  { id: 'silver', name: 'Silver Arrow', color: 0xb8bec8 },
  { id: 'purple', name: 'Ultraviolet', color: 0x6b2fd6 },
  { id: 'teal', name: 'Lagoon', color: 0x14a6a0 },
  { id: 'pink', name: 'Bubblegum', color: 0xff6fb5 },
  { id: 'gold', name: 'Gold Leaf', color: 0xd9a82b, metal: true },
  { id: 'carbon', name: 'Carbon', color: 0x2c3036, metal: true },
  { id: 'neon', name: 'Neon', color: 0x39ff6a },
  { id: 'chrome', name: 'Chrome', color: 0xe4ebf2, metal: true },
];

// body shapes: side profiles (x forward, y up), widths, wheel spots and extras
const SHAPES = {
  gt: {
    body: [[-2.15, 0.3], [2.02, 0.3], [2.22, 0.42], [2.16, 0.6], [1.0, 0.8], [-1.75, 0.9], [-2.16, 0.86], [-2.2, 0.52]], width: 1.78,
    cabin: [[1.02, 0.79], [0.18, 1.2], [-1.0, 1.23], [-1.62, 0.89]], cabinW: 1.42, roof: [-0.42, 1.27, 1.0],
    wheels: { front: 1.3, rear: -1.3, track: 0.86, r: 0.36 },
    wing: { x: -1.98, y: 1.2, w: 1.86 }, stripe: [1.55, 0.72, -0.16],
    lights: { head: [2.17, 0.56, 0.6], tail: [-2.22, 0.72, 0.58] }, len: 2.2,
  },
  hatch: {
    body: [[-1.85, 0.3], [1.82, 0.3], [1.98, 0.45], [1.9, 0.68], [1.05, 0.86], [-1.7, 0.95], [-1.9, 0.9], [-1.92, 0.5]], width: 1.72,
    cabin: [[1.08, 0.85], [0.42, 1.38], [-1.55, 1.42], [-1.82, 0.93]], cabinW: 1.5, roof: [-0.55, 1.45, 1.75],
    wheels: { front: 1.2, rear: -1.25, track: 0.82, r: 0.33 },
    wing: { x: -1.78, y: 1.47, w: 1.4, small: true }, stripe: null,
    lights: { head: [1.95, 0.62, 0.58], tail: [-1.93, 0.8, 0.6] }, len: 1.95,
  },
  muscle: {
    body: [[-2.35, 0.32], [2.3, 0.32], [2.42, 0.48], [2.38, 0.78], [0.75, 0.88], [-1.6, 0.92], [-2.35, 0.9], [-2.4, 0.55]], width: 1.92,
    cabin: [[0.78, 0.87], [0.05, 1.28], [-1.05, 1.3], [-1.75, 0.92]], cabinW: 1.5, roof: [-0.5, 1.33, 1.1],
    wheels: { front: 1.45, rear: -1.45, track: 0.92, r: 0.38 },
    wing: { x: -2.25, y: 0.98, w: 1.7, small: true }, stripe: 'double',
    lights: { head: [2.4, 0.66, 0.66], tail: [-2.42, 0.76, 0.62] }, len: 2.4, scoop: true,
  },
  hyper: {
    body: [[-2.2, 0.26], [2.15, 0.26], [2.35, 0.33], [2.2, 0.46], [0.9, 0.66], [-1.4, 0.78], [-2.2, 0.76], [-2.25, 0.45]], width: 1.9,
    cabin: [[0.95, 0.64], [0.05, 1.04], [-0.75, 1.06], [-1.45, 0.78]], cabinW: 1.3, roof: [-0.35, 1.1, 0.8],
    wheels: { front: 1.35, rear: -1.3, track: 0.9, r: 0.36 },
    wing: { x: -2.05, y: 1.25, w: 2.0, tall: true }, stripe: [1.45, 0.58, -0.1],
    lights: { head: [2.25, 0.42, 0.62], tail: [-2.26, 0.62, 0.6] }, len: 2.3, fins: true,
  },
};

function extrude(points, depth, bevel) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Build a car. kind = gt, hatch, muscle or hyper. ghost = see-through copy for replays. */
export function buildCar({ color = 0xd8261c, ghost = false, ghostColor = 0x5ff0ff, kind = 'gt' } = {}) {
  const S = SHAPES[kind] || SHAPES.gt;
  const WHEEL_R = S.wheels.r;
  const root = new THREE.Group();
  root.rotation.order = 'YZX';
  const body = new THREE.Group();
  root.add(body);
  const geos = [];
  const g = (geo) => { geos.push(geo); return geo; };

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f1622, roughness: 0.12, metalness: 0.5 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.35, metalness: 0.8 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
  const tail = new THREE.MeshBasicMaterial({ color: 0x8a0d0d });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 });
  const mats = [paint, dark, glass, rimMat, tyreMat, head, tail, stripe];

  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(g(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    parent.add(m);
    return m;
  };
  const hw = S.width / 2;

  add(extrude(S.body, S.width, 0.07), paint);
  add(extrude(S.cabin, S.cabinW, 0.05), glass);
  add(new THREE.BoxGeometry(S.roof[2], 0.05, S.cabinW - 0.12), paint, S.roof[0], S.roof[1], 0);
  // dark trim: splitter, skirts, diffuser
  const L = S.len;
  add(new THREE.BoxGeometry(0.4, 0.08, S.width + 0.1), dark, L - 0.15, 0.28, 0);
  add(new THREE.BoxGeometry(L * 1.1, 0.12, 0.08), dark, 0, 0.33, hw + 0.06);
  add(new THREE.BoxGeometry(L * 1.1, 0.12, 0.08), dark, 0, 0.33, -hw - 0.06);
  add(new THREE.BoxGeometry(0.35, 0.18, S.width - 0.2), dark, -L + 0.05, 0.36, 0);
  // rear wing
  const W = S.wing;
  if (W.small) {
    add(new THREE.BoxGeometry(0.3, 0.05, W.w), paint, W.x, W.y, 0);
  } else {
    const up = W.tall ? 0.45 : 0.3;
    add(new THREE.BoxGeometry(W.tall ? 0.5 : 0.42, 0.06, W.w), paint, W.x, W.y, 0);
    add(new THREE.BoxGeometry(0.14, up, 0.06), dark, W.x + 0.03, W.y - up / 2 - 0.02, 0.52);
    add(new THREE.BoxGeometry(0.14, up, 0.06), dark, W.x + 0.03, W.y - up / 2 - 0.02, -0.52);
    if (W.tall) for (const sg of [-1, 1]) add(new THREE.BoxGeometry(0.55, 0.22, 0.04), paint, W.x, W.y + 0.02, sg * W.w / 2);
  }
  // extras
  if (S.scoop) add(new THREE.BoxGeometry(0.7, 0.12, 0.55), dark, 1.3, 0.86, 0);
  if (S.fins) for (const sg of [-1, 1]) add(new THREE.BoxGeometry(1.1, 0.14, 0.05), dark, -0.6, 0.5, sg * (hw + 0.03));
  if (Array.isArray(S.stripe)) add(new THREE.BoxGeometry(1.15, 0.02, 0.32), stripe, S.stripe[0], S.stripe[1], 0).rotation.z = S.stripe[2];
  else if (S.stripe === 'double') for (const sg of [-1, 1]) add(new THREE.BoxGeometry(1.6, 0.02, 0.16), stripe, 1.5, 0.85, sg * 0.18).rotation.z = -0.06;
  const [hx, hy, hz] = S.lights.head, [tx, ty, tz] = S.lights.tail;
  add(new THREE.BoxGeometry(0.06, 0.12, 0.42), head, hx, hy, hz);
  add(new THREE.BoxGeometry(0.06, 0.12, 0.42), head, hx, hy, -hz);
  add(new THREE.BoxGeometry(0.06, 0.1, 0.5), tail, tx, ty, tz);
  add(new THREE.BoxGeometry(0.06, 0.1, 0.5), tail, tx, ty, -tz);

  // wheels: pivot (steers) > spin (rolls)
  const tyreGeo = g(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 20).rotateX(Math.PI / 2));
  const rimGeo = g(new THREE.CylinderGeometry(WHEEL_R * 0.64, WHEEL_R * 0.64, 0.32, 12).rotateX(Math.PI / 2));
  const spokeGeo = g(new THREE.BoxGeometry(WHEEL_R * 1.17, 0.07, 0.33));
  const wheels = [];
  const Wh = S.wheels;
  for (const [x, z, front] of [[Wh.front, Wh.track, true], [Wh.front, -Wh.track, true], [Wh.rear, Wh.track, false], [Wh.rear, -Wh.track, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_R, z);
    root.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    for (const [geo, mat] of [[tyreGeo, tyreMat], [rimGeo, rimMat]]) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = !ghost; spin.add(m);
    }
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(spokeGeo, dark); sp.rotation.z = (k * Math.PI) / 3; spin.add(sp); }
    wheels.push({ pivot, spin, front });
  }

  if (ghost) {
    const gm = new THREE.MeshBasicMaterial({ color: ghostColor, transparent: true, opacity: 0.32, depthWrite: false });
    root.traverse((o) => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
    mats.push(gm);
  }

  let roll = 0, pitch = 0;
  return {
    root, body, wheels,
    setPaint(c, metal = false) { paint.color.setHex(c); paint.metalness = metal ? 0.9 : 0.35; paint.roughness = metal ? 0.22 : 0.32; },
    /** Place the model from a physics state (or an interpolated one). */
    pose(x, y, z, h, pitchRoad = 0) {
      root.position.set(x, y, z);
      root.rotation.set(0, -h, pitchRoad);
    },
    /** Wheels, body lean and lights. */
    animate(dt, { steer = 0, speed = 0, latAcc = 0, longAcc = 0, braking = false }) {
      for (const w of wheels) {
        if (w.front) w.pivot.rotation.y = -steer;
        w.spin.rotation.z -= (speed * dt) / WHEEL_R;
      }
      roll += (Math.max(-0.07, Math.min(0.07, -latAcc * 0.006)) - roll) * Math.min(1, dt * 8);
      pitch += (Math.max(-0.05, Math.min(0.05, longAcc * 0.004)) - pitch) * Math.min(1, dt * 8);
      body.rotation.set(roll, 0, pitch);
      if (!ghost) tail.color.setHex(braking ? 0xff2a1a : 0x8a0d0d);
    },
    dispose() { geos.forEach((x) => x.dispose()); mats.forEach((m) => m.dispose()); },
  };
}
