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
];

const WHEEL_R = 0.36;

function extrude(points, depth, bevel) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Build a car. ghost = see-through copy for replays. */
export function buildCar({ color = 0xd8261c, ghost = false, ghostColor = 0x5ff0ff } = {}) {
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
  const mats = [paint, dark, glass, rimMat, tyreMat, head, tail];

  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(g(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    parent.add(m);
    return m;
  };

  // body: side profile extruded across the width
  add(extrude([[-2.15, 0.3], [2.02, 0.3], [2.22, 0.42], [2.16, 0.6], [1.0, 0.8], [-1.75, 0.9], [-2.16, 0.86], [-2.2, 0.52]], 1.78, 0.07), paint);
  // cabin
  add(extrude([[1.02, 0.79], [0.18, 1.2], [-1.0, 1.23], [-1.62, 0.89]], 1.42, 0.05), glass);
  add(new THREE.BoxGeometry(1.0, 0.05, 1.3), paint, -0.42, 1.27, 0); // roof panel
  // dark trim: splitter, skirts, diffuser
  add(new THREE.BoxGeometry(0.4, 0.08, 1.9), dark, 2.05, 0.28, 0);
  add(new THREE.BoxGeometry(2.4, 0.12, 0.08), dark, 0, 0.32, 0.95);
  add(new THREE.BoxGeometry(2.4, 0.12, 0.08), dark, 0, 0.32, -0.95);
  add(new THREE.BoxGeometry(0.35, 0.18, 1.6), dark, -2.12, 0.36, 0);
  // rear wing
  add(new THREE.BoxGeometry(0.42, 0.06, 1.86), paint, -1.98, 1.2, 0);
  add(new THREE.BoxGeometry(0.14, 0.3, 0.06), dark, -1.95, 1.04, 0.52);
  add(new THREE.BoxGeometry(0.14, 0.3, 0.06), dark, -1.95, 1.04, -0.52);
  // racing stripe and lights
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 });
  mats.push(stripe);
  add(new THREE.BoxGeometry(1.15, 0.02, 0.32), stripe, 1.55, 0.72, 0).rotation.z = -0.16;
  add(new THREE.BoxGeometry(0.06, 0.12, 0.42), head, 2.17, 0.56, 0.6);
  add(new THREE.BoxGeometry(0.06, 0.12, 0.42), head, 2.17, 0.56, -0.6);
  add(new THREE.BoxGeometry(0.06, 0.1, 0.5), tail, -2.22, 0.72, 0.58);
  add(new THREE.BoxGeometry(0.06, 0.1, 0.5), tail, -2.22, 0.72, -0.58);

  // wheels: pivot (steers) > spin (rolls)
  const tyreGeo = g(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 20).rotateX(Math.PI / 2));
  const rimGeo = g(new THREE.CylinderGeometry(0.23, 0.23, 0.32, 12).rotateX(Math.PI / 2));
  const spokeGeo = g(new THREE.BoxGeometry(0.42, 0.07, 0.33));
  const wheels = [];
  for (const [x, z, front] of [[1.3, 0.86, true], [1.3, -0.86, true], [-1.3, 0.86, false], [-1.3, -0.86, false]]) {
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
