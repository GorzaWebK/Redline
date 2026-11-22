// Network transports (shared with Foundry Arena). Online races are peer-to-peer with one player hosting:
// every other player holds a single connection to the host.
//
//   peer   WebRTC data channels via PeerJS. Browsers find each other through a
//          signalling server (PeerJS's free public one by default); game data
//          then flows directly between the players.
//   local  BroadcastChannel between tabs of the same browser. No network at
//          all - handy for development (?net=local).
//
// Both expose the same tiny interface:
//   host(code)  -> Promise<{ code, onConnection, close() }>
//   join(code)  -> Promise<conn>
//   conn = { send(obj), close(), onMessage, onClose }

let PeerCls = null; // PeerJS, loaded the first time it's needed
const loadPeer = async () => (PeerCls ||= (await import('peerjs')).Peer);

const PREFIX = 'redline-race-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I)

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return s;
}

export function cleanRoomCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// ------------------------------------------------------------------ PeerJS

function peerOptions() {
  // Optional self-hosted signalling server: ?peerhost=example.com&peerport=443&peersecure=1
  const q = new URLSearchParams(location.search);
  const host = q.get('peerhost');
  if (!host) return {};
  return {
    host,
    port: parseInt(q.get('peerport') || '9000', 10),
    path: q.get('peerpath') || '/',
    secure: q.get('peersecure') === '1',
  };
}

function wrapPeerConn(dc) {
  const conn = {
    id: dc.peer,
    open: true,
    onMessage: null,
    onClose: null,
    send(obj) { if (conn.open && dc.open) dc.send(obj); },
    close() { conn.open = false; try { dc.close(); } catch (e) { /* already gone */ } },
  };
  const closed = () => {
    if (!conn.open) return;
    conn.open = false;
    if (conn.onClose) conn.onClose();
  };
  dc.on('data', (d) => { if (conn.onMessage) conn.onMessage(d); });
  dc.on('close', closed);
  dc.on('error', closed);
  // a vanished peer doesn't always fire 'close' promptly: watch the ICE state too
  const pc = dc.peerConnection;
  if (pc) {
    pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') closed();
    });
  }
  return conn;
}

const peerTransport = {
  /** `remake`: where a new code comes from if this one is taken. `retries`: how many times. */
  async host(code, remake = makeRoomCode, retries = 4) {
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryCode = (c) => {
        const peer = new Peer(PREFIX + c, peerOptions());
        const room = {
          code: c,
          onConnection: null,
          close() { peer.destroy(); },
        };
        let opened = false;
        peer.on('open', () => { opened = true; resolve(room); });
        peer.on('connection', (dc) => {
          let announced = false; // exactly one session per data channel
          const announce = () => {
            if (announced) return;
            announced = true;
            if (room.onConnection) room.onConnection(wrapPeerConn(dc));
          };
          if (dc.open) announce(); else dc.on('open', announce);
        });
        // lost the signalling server: existing players are unaffected, but
        // reconnect so new ones can still find the room
        peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 2000); });
        peer.on('error', (err) => {
          if (opened) return;
          peer.destroy();
          if (err.type === 'unavailable-id' && attempts++ < retries) tryCode(remake());
          else reject(new Error(err.type === 'unavailable-id' ? 'Could not reserve a room code.' : 'Could not reach the matchmaking server.'));
        });
      };
      tryCode(code);
    });
  },

  async join(code) {
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      let done = false;
      const fail = (msg) => { if (done) return; done = true; peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Timed out connecting to the room.'), 15000);
      peer.on('error', (err) => {
        fail(err.type === 'peer-unavailable' ? `Room ${code} was not found.` : 'Could not reach the matchmaking server.');
      });
      let dialled = false;
      peer.on('open', () => {
        if (dialled) return; // 'open' fires again if the signalling link reconnects
        dialled = true;
        const dc = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        dc.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const conn = wrapPeerConn(dc);
          const close = conn.close;
          conn.close = () => { close(); peer.destroy(); };
          resolve(conn);
        });
        dc.on('error', () => fail('Connection to the host failed.'));
      });
    });
  },
};
// ------------------------------------------------------------------ BroadcastChannel (same browser, for development)

const localTransport = {
  /** Like PeerJS, a code can only be held once: ask whether anyone has it first. */
  host(code, remake = makeRoomCode, retries = 4) {
    return new Promise((resolve, reject) => {
      const probe = new BroadcastChannel(PREFIX + code);
      const me = 'p' + Math.random().toString(36).slice(2, 10);
      const ticket = Math.random();
      let taken = false;
      probe.onmessage = (ev) => {
        const m = ev.data;
        if (!m) return;
        if (m.k === 'here' && m.to === me) taken = true;
        // two tabs claiming at the same moment: the higher ticket wins
        if (m.k === 'claim' && m.from !== me) { if (m.ticket > ticket) taken = true; else probe.postMessage({ k: 'claim', from: me, ticket }); }
      };
      probe.postMessage({ k: 'anyone', to: 'host', from: me });
      probe.postMessage({ k: 'claim', from: me, ticket });
      setTimeout(() => {
        probe.close();
        if (!taken) { resolve(localTransport._host(code)); return; }
        if (retries > 0) localTransport.host(remake(), remake, retries - 1).then(resolve, reject);
        else reject(new Error('Could not reserve a room code.'));
      }, 500);
    });
  },

  _host(code) {
    const ch = new BroadcastChannel(PREFIX + code);
    const conns = new Map();
    const room = {
      code,
      onConnection: null,
      close() { ch.postMessage({ k: 'bye', to: '*' }); ch.close(); },
    };
    ch.onmessage = (ev) => {
      const m = ev.data;
      if (m.to !== 'host') return;
      if (m.k === 'anyone') { ch.postMessage({ k: 'here', to: m.from }); return; }
      if (m.k === 'hello') {
        const conn = {
          id: m.from, open: true, onMessage: null, onClose: null,
          send(obj) { if (conn.open) ch.postMessage({ k: 'data', to: m.from, d: JSON.stringify(obj) }); },
          close() { if (conn.open) { conn.open = false; ch.postMessage({ k: 'bye', to: m.from }); conns.delete(m.from); } },
        };
        conns.set(m.from, conn);
        ch.postMessage({ k: 'ack', to: m.from });
        if (room.onConnection) room.onConnection(conn);
      } else if (m.k === 'data') {
        const c = conns.get(m.from);
        if (c && c.onMessage) c.onMessage(JSON.parse(m.d));
      } else if (m.k === 'bye') {
        const c = conns.get(m.from);
        if (c && c.open) { c.open = false; conns.delete(m.from); if (c.onClose) c.onClose(); }
      }
    };
    return room;
  },

  join(code) {
    return new Promise((resolve, reject) => {
      const ch = new BroadcastChannel(PREFIX + code);
      const me = 'c' + Math.random().toString(36).slice(2, 10);
      let ready = false;
      const conn = {
        id: 'host', open: true, onMessage: null, onClose: null,
        send(obj) { if (conn.open) ch.postMessage({ k: 'data', to: 'host', from: me, d: JSON.stringify(obj) }); },
        close() { if (conn.open) { conn.open = false; ch.postMessage({ k: 'bye', to: 'host', from: me }); ch.close(); } },
      };
      const timer = setTimeout(() => { if (!ready) { ch.close(); reject(new Error(`Room ${code} was not found.`)); } }, 2500);
      ch.onmessage = (ev) => {
        const m = ev.data;
        if (m.to !== me && m.to !== '*') return;
        if (m.k === 'ack') { ready = true; clearTimeout(timer); resolve(conn); }
        else if (m.k === 'data') { if (conn.onMessage) conn.onMessage(JSON.parse(m.d)); }
        else if (m.k === 'bye' && conn.open) { conn.open = false; ch.close(); if (conn.onClose) conn.onClose(); }
      };
      ch.postMessage({ k: 'hello', to: 'host', from: me });
    });
  },
};

export function getTransport() {
  return new URLSearchParams(location.search).get('net') === 'local' ? localTransport : peerTransport;
}
