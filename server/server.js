// Traveler online: who else is flying near the same star.
// Rooms are places (the Solar System, the black hole, a star of someone's birth year), up to CAP ships per room —
// a crowded place splits into copies. The server knows only a number-callsign, a colour, the space and where the
// ship is; no names, no dates, no text. Signs are a fixed set (four, plus a birthday notice).
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8090;
const CAP = 24, TICK = 200, SIGN_GAP = 1500, PER_IP = 6;
const STARS = ['alphaCen', 'barnard', 'sirius', 'epsEri', 'procyon', 'tauCet', 'altair', 'etaCas', 'vega', 'fomalhaut', 'pollux', 'arcturus',
  'capella', 'alderamin', 'castor', 'menkent', 'aldebaran', 'hamal', 'alphecca', 'regulus', 'merak', 'alcor', 'denebKaitos'];
const SPACES = new Set(['sol', 'hole', ...STARS]);
const SIGNS = new Set(['wave', 'lights', 'fire', 'follow', 'bday']);
const ORIGIN = /^(https:\/\/traveler\.tomerisr\.org\.il|https:\/\/cosmos\.tomerisr\.org\.il|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;

const rooms = new Map(); // key -> Set(client)
const ipCount = new Map();
let nextId = 1;

function roomFor(space) {
  for (let n = 1; ; n++) {
    const key = space + '#' + n; let r = rooms.get(key);
    if (!r) { r = new Set(); rooms.set(key, r); }
    if (r.size < CAP) return key;
  }
}
const send = (c, m) => { if (c.ws.readyState === 1) c.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
function toRoom(key, m, except) { const r = rooms.get(key); if (!r) return; const s = JSON.stringify(m); for (const c of r) if (c !== except) send(c, s); }
function leave(c) {
  if (!c.room) return; const r = rooms.get(c.room);
  if (r) { r.delete(c); if (!r.size) rooms.delete(c.room); }
  toRoom(c.room, { t: 'leave', id: c.id }); c.room = null;
}
function enter(c, space) {
  leave(c); c.space = space; c.s = null; c.dirty = false; c.room = roomFor(space); const r = rooms.get(c.room);
  send(c, { t: 'room', space, others: [...r].map(o => ({ id: o.id, n: o.n, hue: o.hue, s: o.s })) });
  r.add(c); toRoom(c.room, { t: 'join', id: c.id, n: c.n, hue: c.hue }, c);
}
// position (units of 1000 km, up to ~1e12 for far escapes), rotation quaternion, throttle
function cleanState(a) {
  if (!Array.isArray(a) || a.length !== 8 || !a.every(Number.isFinite)) return null;
  const s = a.slice(); for (let i = 0; i < 3; i++) s[i] = Math.max(-1e12, Math.min(1e12, s[i]));
  for (let i = 3; i < 8; i++) s[i] = Math.max(-1, Math.min(1, s[i]));
  return s.map((v, i) => i < 3 ? +v.toPrecision(12) : +v.toFixed(4));
}

const server = http.createServer((req, res) => {
  if (req.url === '/stats') {
    const by = {}; for (const [k, r] of rooms) { const sp = k.split('#')[0]; by[sp] = (by[sp] || 0) + r.size; }
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ online: wss.clients.size, by })); return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('traveler online');
});
const wss = new WebSocketServer({ server, path: '/fly', maxPayload: 1024 });
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  if (!ORIGIN.test(origin)) { ws.close(1008, 'origin'); return; }
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if ((ipCount.get(ip) || 0) >= PER_IP) { ws.close(1008, 'busy'); return; }
  ipCount.set(ip, (ipCount.get(ip) || 0) + 1);
  const c = { ws, id: nextId++, n: 100 + Math.floor(Math.random() * 900), hue: Math.floor(Math.random() * 360), room: null, space: null, s: null, dirty: false, lastSign: 0 };
  send(c, { t: 'hi', id: c.id, n: c.n, hue: c.hue });
  ws.alive = true; ws.on('pong', () => ws.alive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'go' && SPACES.has(m.space)) enter(c, m.space);
    else if (m.t === 'st' && c.room) { const s = cleanState(m.s); if (s) { c.s = s; c.dirty = true; } }
    else if (m.t === 'sign' && c.room && SIGNS.has(m.k)) {
      const now = Date.now(); if (now - c.lastSign < SIGN_GAP) return; c.lastSign = now;
      toRoom(c.room, { t: 'sign', id: c.id, k: m.k, to: Number.isInteger(m.to) ? m.to : 0 }, c);
    }
  });
  ws.on('close', () => { leave(c); const n = (ipCount.get(ip) || 1) - 1; if (n > 0) ipCount.set(ip, n); else ipCount.delete(ip); });
});
// positions go out in batches, five times a second
// (a ship that just changed place has no position yet: it is never sent until it reports one)
setInterval(() => {
  for (const [key, r] of rooms) {
    try {
      const moved = []; for (const c of r) if (c.dirty && c.s) { moved.push([c.id, ...c.s]); c.dirty = false; }
      if (moved.length && r.size > 1) toRoom(key, { t: 'sts', a: moved });
    } catch (e) { console.error('tick', key, e.message); }
  }
}, TICK);
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 30000);
server.listen(PORT, () => console.log('traveler online on', PORT));
