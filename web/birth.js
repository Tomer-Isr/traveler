// Your birth sky: where the Sun, the Moon and the planets stood when you were born (Astronomy Engine, MIT),
// the honest sign (the constellation the Sun was really in) and a natal chart. Nothing leaves the browser,
// except a city name typed for the ascendant, which goes to the Open-Meteo geocoder.
import * as A from 'astronomy-engine';

export const SIGNS = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
export const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + '︎');
export const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
export const GLYPH = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', asc: 'ASC' };
const AE = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };
const norm = x => ((x % 360) + 360) % 360, RAD = Math.PI / 180;

// geocentric ecliptic longitude of date (the one astrology uses)
function eclLon(id, d) {
  if (id === 'sun') return A.SunPosition(d).elon;
  if (id === 'moon') return A.EclipticGeoMoon(d).lon;
  return A.Ecliptic(A.GeoVector(AE[id], d, true)).elon;
}

export function chart(when, lat, lon) {
  const d = new Date(when), next = new Date(+d + 864e5);
  const planets = BODIES.map(id => {
    const l = norm(eclLon(id, d)), l2 = norm(eclLon(id, next)), dl = ((l2 - l + 540) % 360) - 180;
    return { id, lon: l, sign: Math.floor(l / 30), deg: l % 30, retro: id !== 'sun' && id !== 'moon' && dl < 0 };
  });
  // the constellation the Sun really stood in (IAU boundaries, Ophiuchus included)
  const eq = A.Equator('Sun', d, new A.Observer(0, 0, 0), false, true);
  const sunCon = A.Constellation(eq.ra, eq.dec).symbol;
  const phase = A.MoonPhase(d), lit = (1 - Math.cos(phase * RAD)) / 2;
  // the brightest planet in the night sky that day (far enough from the Sun to be seen)
  let bright = null;
  for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    const e = A.Elongation(AE[id], d).elongation, m = A.Illumination(AE[id], d).mag;
    if (e > 18 && (!bright || m < bright.mag)) bright = { id, mag: m, morning: A.Elongation(AE[id], d).visibility === 'morning' };
  }
  let asc = null, mc = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const th = norm(A.SiderealTime(d) * 15 + lon) * RAD, e = 23.4393 * RAD, f = lat * RAD;
    asc = norm(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(e) + Math.tan(f) * Math.sin(e))) / RAD);
    mc = norm(Math.atan2(Math.sin(th), Math.cos(th) * Math.cos(e)) / RAD);
  }
  return { planets, sun: planets[0], sunCon, phase, lit, bright, asc, mc };
}

// local wall-clock time in an IANA zone -> UTC milliseconds (historical offsets come from the browser's tz data)
export function zonedToUtc(y, mo, da, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const off = t => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(t).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t;
  };
  let t = guess - off(guess); t = guess - off(t); return t;
}

export async function findCity(q, lang) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=${lang}&name=${encodeURIComponent(q)}`);
  const j = await r.json();
  return (j.results || []).map(c => ({ name: [c.name, c.admin1, c.country].filter(Boolean).join(', '), lat: c.latitude, lon: c.longitude, tz: c.timezone }));
}

// the wheel: signs around, planets at their longitudes; the ascendant (if known) on the left, as on a real chart
export function wheelSVG(c, size = 340) {
  const R = size / 2, cx = R, cy = R, start = c.asc ?? 0;
  const pt = (lon, r) => { const a = (180 + (lon - start)) * RAD; return [cx + Math.cos(a) * r, cy - Math.sin(a) * r]; };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" font-family="system-ui,sans-serif">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R - 2}" fill="#070918" stroke="#3a3f7a"/><circle cx="${cx}" cy="${cy}" r="${R - 34}" fill="none" stroke="#3a3f7a"/><circle cx="${cx}" cy="${cy}" r="${R * .36}" fill="none" stroke="#262a55"/>`;
  const el = ['#ff8a5c', '#9fd46b', '#ffd36b', '#7cc4ff'];
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = pt(i * 30, R - 2), [x2, y2] = pt(i * 30, R - 34), [gx, gy] = pt(i * 30 + 15, R - 18);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3a3f7a"/>`;
    s += `<text x="${gx}" y="${gy}" fill="${el[i % 4]}" font-size="17" text-anchor="middle" dominant-baseline="central">${SIGN_GLYPH[i]}</text>`;
  }
  for (let dg = 0; dg < 360; dg += 5) { const [a, b] = pt(dg, R - 34), [e, f] = pt(dg, R - (dg % 30 ? 38 : 42)); s += `<line x1="${a}" y1="${b}" x2="${e}" y2="${f}" stroke="#3a3f7a"/>`; }
  if (c.asc != null) {
    for (const [lon, lab] of [[c.asc, 'ASC'], [c.mc, 'MC']]) { const [a, b] = pt(lon, R - 34), [e, f] = pt(lon, R * .36), [tx, ty] = pt(lon, R * .28); s += `<line x1="${a}" y1="${b}" x2="${e}" y2="${f}" stroke="#ffb454" stroke-dasharray="3 3"/><text x="${tx}" y="${ty}" fill="#ffb454" font-size="10" text-anchor="middle" dominant-baseline="central">${lab}</text>`; }
  }
  // spread planets that sit close together onto inner tracks
  const placed = [];
  for (const p of [...c.planets].sort((a, b) => a.lon - b.lon)) {
    let tr = 0; while (placed.some(q => q.tr === tr && Math.abs(((q.lon - p.lon + 540) % 360) - 180) < 9)) tr++;
    placed.push({ ...p, tr });
  }
  for (const p of placed) {
    const r = R - 56 - p.tr * 22, [x, y] = pt(p.lon, r), [a, b] = pt(p.lon, R - 34), [e, f] = pt(p.lon, R - 40);
    s += `<line x1="${a}" y1="${b}" x2="${e}" y2="${f}" stroke="#e2dff7"/>`;
    s += `<text x="${x}" y="${y}" fill="${p.id === 'sun' ? '#ffb454' : p.id === 'moon' ? '#cfe3ff' : '#e2dff7'}" font-size="${p.id === 'sun' || p.id === 'moon' ? 19 : 16}" text-anchor="middle" dominant-baseline="central">${GLYPH[p.id]}︎</text>`;
    if (p.retro) s += `<text x="${x + 9}" y="${y + 8}" fill="#9a97c2" font-size="8">R</text>`;
  }
  return s + '</svg>';
}
