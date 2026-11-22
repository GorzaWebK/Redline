// Online races: up to 8 players, one hosting. Everyone drives their own car on
// their own computer and sends where it is 20 times a second; the host passes
// each player's messages on to everyone else. Cars don't collide online (each
// player's physics is their own), so nobody's lag can knock you off.
//
// Messages (JSON):
//   player -> host:  hello { name, car, paint } · s { state } · fin { time }
//   host -> players: room { players, track, laps, racing } · start { track, laps }
//                    s { id, state } · fin { id, time } · left { id } · no { why }

import { getTransport, makeRoomCode, cleanRoomCode } from './transport.js';

export const MAX_PLAYERS = 8;
const DELAY = 120; // ms: remote cars are drawn this far in the past, smoothly between updates

export class NetRace {
  constructor() {
    this.players = new Map(); // id -> { id, name, car, paint, samples, fin }
    this.me = null;
    this.isHost = false;
    this.track = 1; this.laps = 3; this.racing = false;
    this.on = {}; // room, start, fin, left, closed: callbacks
  }

  /** Host a room. me = { name, car, paint }. */
  static async host(me, track, laps) {
    const n = new NetRace();
    n.isHost = true;
    n.track = track; n.laps = laps;
    n.room = await getTransport().host(makeRoomCode());
    n.code = n.room.code;
    n.meId = 'host';
    n.players.set('host', { id: 'host', ...me, samples: [], fin: 0 });
    n.conns = new Map();
    n.room.onConnection = (conn) => {
      conn.onMessage = (m) => n.fromPlayer(conn, m);
      conn.onClose = () => n.dropPlayer(conn.id);
    };
    return n;
  }

  /** Join a room by its code. */
  static async join(code, me) {
    const n = new NetRace();
    n.code = cleanRoomCode(code);
    n.conn = await getTransport().join(n.code);
    n.meId = null;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { n.conn.close(); reject(new Error('The host did not answer.')); }, 8000);
      n.conn.onMessage = (m) => {
        if (m && m.t === 'no') { clearTimeout(timer); n.conn.close(); reject(new Error(m.why)); return; }
        if (m && m.t === 'room' && !n.meId) { clearTimeout(timer); n.meId = m.you; n.fromHost(m); resolve(n); return; }
        n.fromHost(m);
      };
      n.conn.onClose = () => { clearTimeout(timer); if (!n.meId) reject(new Error('The host left.')); else n.on.closed?.('The host left the room.'); };
      n.conn.send({ t: 'hello', ...me });
    });
  }

  get list() { return [...this.players.values()]; }
  roomMsg(you) { return { t: 'room', you, track: this.track, laps: this.laps, racing: this.racing, players: this.list.map(({ id, name, car, paint }) => ({ id, name, car, paint })) }; }
  broadcast(m, except = null) { for (const [id, c] of this.conns) if (id !== except) c.send(m); }
  sendRoom() { for (const [id, c] of this.conns) c.send(this.roomMsg(id)); this.on.room?.(); }

  // ---- host side
  fromPlayer(conn, m) {
    if (!m || typeof m !== 'object') return;
    const id = conn.id;
    if (m.t === 'hello') {
      if (this.players.size >= MAX_PLAYERS) { conn.send({ t: 'no', why: 'That room is full.' }); setTimeout(() => conn.close(), 300); return; }
      if (this.racing) { conn.send({ t: 'no', why: 'That room is in the middle of a race. Try again in a minute.' }); setTimeout(() => conn.close(), 300); return; }
      this.conns.set(id, conn);
      this.players.set(id, { id, name: clean(m.name), car: m.car, paint: m.paint, samples: [], fin: 0 });
      this.sendRoom();
    } else if (!this.players.has(id)) {
      return;
    } else if (m.t === 's' && m.s) {
      this.addSample(id, m.s);
      this.broadcast({ t: 's', id, s: m.s }, id);
    } else if (m.t === 'fin' && typeof m.time === 'number') {
      this.players.get(id).fin = m.time;
      this.broadcast({ t: 'fin', id, time: m.time }, id);
      this.on.fin?.(id);
      this.checkDone();
    }
  }
  dropPlayer(id) {
    if (!this.players.delete(id)) return;
    this.conns.delete(id);
    this.broadcast({ t: 'left', id });
    this.on.left?.(id);
    this.sendRoom();
    this.checkDone();
  }
  /** Host: change the circuit or laps before a race. */
  setRace(track, laps) { this.track = track; this.laps = laps; this.sendRoom(); }
  /** Host: everyone starts now. */
  start() {
    this.racing = true;
    for (const p of this.players.values()) { p.fin = 0; p.samples = []; }
    this.broadcast({ t: 'start', track: this.track, laps: this.laps });
    this.on.start?.();
  }
  checkDone() { if (this.isHost && this.racing && this.list.every((p) => p.fin)) { this.racing = false; this.sendRoom(); } }

  // ---- player side
  fromHost(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'room') {
      this.track = m.track; this.laps = m.laps; this.racing = m.racing;
      const keep = this.players;
      this.players = new Map(m.players.map((p) => [p.id, { ...p, samples: keep.get(p.id)?.samples || [], fin: keep.get(p.id)?.fin || 0 }]));
      this.on.room?.();
    } else if (m.t === 'start') {
      this.track = m.track; this.laps = m.laps; this.racing = true;
      for (const p of this.players.values()) { p.fin = 0; p.samples = []; }
      this.on.start?.();
    } else if (m.t === 's' && this.players.has(m.id)) {
      this.addSample(m.id, m.s);
    } else if (m.t === 'fin' && this.players.has(m.id)) {
      this.players.get(m.id).fin = m.time;
      this.on.fin?.(m.id);
    } else if (m.t === 'left') {
      this.players.delete(m.id);
      this.on.left?.(m.id);
    }
  }

  // ---- both
  /** Where my car is: { x, y, z, h, pitch, u, steer, progress } (call ~20 times a second while racing). */
  sendState(s) {
    const st = { x: r2(s.x), y: r2(s.y), z: r2(s.z), h: r3(s.h), p: r3(s.pitch || 0), u: r2(s.u), st: r3(s.steer || 0), pr: r2(s.progress) };
    if (this.isHost) this.broadcast({ t: 's', id: 'host', s: st });
    else this.conn.send({ t: 's', s: st });
    const me = this.players.get(this.meId);
    if (me) me.progress = s.progress;
  }
  finish(time) {
    const me = this.players.get(this.meId);
    if (me) me.fin = time;
    if (this.isHost) { this.broadcast({ t: 'fin', id: 'host', time }); this.on.fin?.('host'); this.checkDone(); } else this.conn.send({ t: 'fin', time });
  }
  addSample(id, s) {
    const p = this.players.get(id);
    if (!p || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return;
    p.samples.push({ at: performance.now(), ...s });
    if (p.samples.length > 30) p.samples.shift();
    p.progress = s.pr;
  }
  /** A remote car's pose now (drawn a little in the past, between two updates), or null. */
  pose(id, now = performance.now()) {
    const sm = this.players.get(id)?.samples;
    if (!sm || !sm.length) return null;
    const t = now - DELAY;
    let a = sm[0], b = sm[sm.length - 1];
    for (let i = sm.length - 1; i > 0; i--) if (sm[i - 1].at <= t) { a = sm[i - 1]; b = sm[i]; break; }
    const k = b.at > a.at ? Math.max(0, Math.min(1.2, (t - a.at) / (b.at - a.at))) : 1;
    let dh = b.h - a.h; dh -= Math.PI * 2 * Math.round(dh / (Math.PI * 2));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, h: a.h + dh * k, pitch: b.p, speed: b.u, steer: b.st };
  }
  close() {
    if (this.isHost) { for (const c of this.conns.values()) c.close(); this.room.close(); } else this.conn?.close();
    this.on = {};
  }
}

const clean = (s) => String(s || 'Driver').replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 16) || 'Driver';
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
