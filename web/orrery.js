// The overview: the Solar System from outside on any day — planets on their real orbits (Astronomy Engine),
// sizes enlarged so they can be seen, the zodiac constellations around, and the Earth → Sun line that shows
// which constellation the Sun stands in that day. Time can run, rewind and jump to your birthday.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { helioAU, moonGeoAU, skyAt, SIGNS, SIGN_GLYPH } from './birth.js';

const IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const SIZE = { mercury: .045, venus: .07, earth: .075, mars: .055, jupiter: .26, saturn: .22, uranus: .14, neptune: .14 };
const PERIOD = { mercury: 87.969, venus: 224.701, earth: 365.256, mars: 686.98, jupiter: 4332.59, saturn: 10759.22, uranus: 30688.5, neptune: 60182 };
const DAY = 864e5, CON_R = 300, SIGN_R = 42;

export function makeOrrery({ renderer, tex, eqDir, sky, labelsEl, txt, onPick }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .01, 5000);
  camera.position.set(0, 4.5, 10.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = .6; controls.maxDistance = 140; controls.enabled = false;
  scene.add(new THREE.AmbientLight(0x404660, .5));
  const light = new THREE.PointLight(0xfff1dd, 2.2, 0, 0); scene.add(light);
  const glow = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); };
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.16, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffd38a })); scene.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow([[0, 'rgba(255,230,180,1)'], [.25, 'rgba(255,180,90,.45)'], [1, 'rgba(255,120,40,0)']]), blending: THREE.AdditiveBlending, depthWrite: false })); sunGlow.scale.setScalar(.75); scene.add(sunGlow);

  // planets, their orbits, and labels
  const P = {};
  for (const id of IDS) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(SIZE[id], 40, 24), new THREE.MeshStandardMaterial({ map: tex(id === 'earth' ? 'earth_day.jpg' : id + '.jpg'), roughness: 1, metalness: 0 }));
    scene.add(m);
    if (id === 'saturn') { const r = new THREE.Mesh(new THREE.RingGeometry(SIZE.saturn * 1.3, SIZE.saturn * 2.3, 64), new THREE.MeshBasicMaterial({ color: 0xd8c39a, transparent: true, opacity: .55, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2 + .47; m.add(r); }
    const lbl = document.createElement('div'); lbl.className = 'ov-lbl'; labelsEl.appendChild(lbl); lbl.onclick = () => onPick(id);
    P[id] = { m, lbl, orbit: null };
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(.022, 24, 16), new THREE.MeshStandardMaterial({ map: tex('moon.jpg') })); scene.add(moon);
  function orbits(when) {
    for (const id of IDS) {
      const pts = []; for (let i = 0; i <= 240; i++) pts.push(new THREE.Vector3(...helioAU(id, when + PERIOD[id] * DAY * i / 240)));
      if (P[id].orbit) { scene.remove(P[id].orbit); P[id].orbit.geometry.dispose(); }
      P[id].orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: id === 'earth' ? 0x5f8fd0 : 0x3a3f7a, transparent: true, opacity: id === 'earth' ? .9 : .6 }));
      scene.add(P[id].orbit);
    }
  }

  // the sky around: stars, constellation lines (zodiac brighter), and the 12 signs as a ring in the ecliptic
  const skyG = new THREE.Group(); scene.add(skyG);
  const conL = [];
  {
    const s = sky.stars, n = s.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { eqDir(s[i * 4], s[i * 4 + 1], v).multiplyScalar(CON_R * 1.4); pos.set([v.x, v.y, v.z], i * 3); const b = Math.max(.25, 1 - s[i * 4 + 2] / 7); col.set([b, b, b * 1.05], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    skyG.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false })));
    // (the constellation lines are left out here: seen from outside the system they only cross the view)
    const seg = ids => { const out = []; for (const id of ids) for (const l of sky.lines[id]) for (let i = 0; i + 3 < l.length; i += 2) out.push(...eqDir(l[i], l[i + 1]).multiplyScalar(CON_R).toArray(), ...eqDir(l[i + 2], l[i + 3]).multiplyScalar(CON_R).toArray()); return new THREE.Float32BufferAttribute(out, 3); };
    const ZOD = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Oph', 'Sgr', 'Cap', 'Aqr', 'Psc'];
    for (const id of ZOD) { const el = document.createElement('div'); el.className = 'ov-con'; labelsEl.appendChild(el); const d = eqDir(sky.names[id][3], sky.names[id][4]); d.y = 0; conL.push({ id, el, p: d.normalize().multiplyScalar(SIGN_R * 1.3) }); }
    // the signs: 12 equal sectors of 30° from the spring point — where astrology says the Sun is
    const ring = []; for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180; ring.push(Math.cos(a) * SIGN_R, 0, -Math.sin(a) * SIGN_R, Math.cos(a) * SIGN_R * 1.06, 0, -Math.sin(a) * SIGN_R * 1.06); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    skyG.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: .45 })));
    const circ = []; for (let i = 0; i <= 180; i++) { const a = i / 180 * Math.PI * 2; circ.push(new THREE.Vector3(Math.cos(a) * SIGN_R, 0, -Math.sin(a) * SIGN_R)); }
    skyG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: .3 })));
    for (let i = 0; i < 12; i++) { const a = (i * 30 + 15) * Math.PI / 180, el = document.createElement('div'); el.className = 'ov-sign'; el.textContent = SIGN_GLYPH[i]; labelsEl.appendChild(el); conL.push({ sign: i, el, p: new THREE.Vector3(Math.cos(a) * SIGN_R * 1.12, 0, -Math.sin(a) * SIGN_R * 1.12) }); }
  }
  // Earth → Sun → on to the constellation behind it
  const sunLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xffb454, dashSize: .3, gapSize: .2, transparent: true, opacity: .85 }));
  scene.add(sunLine);
  const sunTag = document.createElement('div'); sunTag.className = 'ov-suntag'; labelsEl.appendChild(sunTag);

  let date = Date.now(), speed = 0, info = null, infoAt = 0, last = date, dirty = true;
  const v = new THREE.Vector3(), pr = new THREE.Vector3();
  function place() {
    for (const id of IDS) P[id].m.position.set(...helioAU(id, date));
    const e = P.earth.m.position, mg = moonGeoAU(date);
    moon.position.set(e.x + mg[0] * 45, e.y + mg[1] * 45, e.z + mg[2] * 45);
    for (const id of IDS) P[id].m.rotation.y = (date / 3.6e6 / 24) * Math.PI * 2 * (id === 'venus' ? -.004 : 1);
    v.copy(e).negate().normalize().multiplyScalar(SIGN_R * 1.3).add(e);
    sunLine.geometry.setFromPoints([e.clone(), v.clone()]); sunLine.computeLineDistances();
  }
  function project(p, el, off = [0, 0]) {
    pr.copy(p).project(camera);
    if (pr.z > 1 || Math.abs(pr.x) > 1.05 || Math.abs(pr.y) > 1.05) { el.style.opacity = 0; return false; }
    el.style.opacity = 1; el.style.transform = `translate(${(pr.x * .5 + .5) * innerWidth + off[0]}px,${(-pr.y * .5 + .5) * innerHeight + off[1]}px) translate(-50%,-50%)`; return true;
  }
  function labels() {
    const T = txt();
    if (!info || performance.now() - infoAt > 250 || dirty) { info = skyAt(date); infoAt = performance.now(); dirty = false; }
    const at = Object.fromEntries(info.map(x => [x.id, x]));
    for (const id of IDS) { const l = P[id].lbl; if (project(P[id].m.position, l, [0, -18])) l.textContent = T.body(id); }
    for (const c of conL) { if (project(c.p, c.el)) { if (c.id) { c.el.textContent = T.con(c.id); c.el.classList.toggle('sun', at.sun.con === c.id); } else c.el.classList.toggle('sun', at.sun.sign === c.sign); } }
    if (project(v, sunTag, [0, -26])) sunTag.textContent = T.sunIn(at.sun.con, at.sun.sign);
    return info;
  }
  return {
    scene, camera, controls,
    get date() { return date; }, set date(x) { date = x; dirty = true; },
    get speed() { return speed; }, set speed(x) { speed = x; },
    open(when) { date = when; dirty = true; orbits(date); last = date; controls.enabled = true; labelsEl.hidden = false; },
    close() { controls.enabled = false; labelsEl.hidden = true; speed = 0; },
    frame(dt) {
      if (speed) { date += speed * DAY * dt; dirty = true; }
      // re-draw orbits now and then: over centuries they drift
      if (Math.abs(date - last) > 3650 * DAY) { orbits(date); last = date; }
      place(); light.position.set(0, 0, 0); controls.update();
      renderer.render(scene, camera);
      return labels();
    },
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    focus(id) { const p = id === 'sun' ? new THREE.Vector3() : P[id].m.position; controls.target.copy(p); },
  };
}
