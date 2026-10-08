// Traveler: fly a shuttle through the real-scale Solar System.
// Scale: 1 unit = 1000 km, distances and radii are real. Floating origin: the ship sits at (0,0,0) on the GPU,
// world positions live in JS doubles and every object is drawn relative to the ship.
import * as THREE from 'three';
import { I18N } from './i18n.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const touch = matchMedia('(pointer: coarse)').matches;
let mob = innerWidth < 760;

/* ================= language ================= */
const LANGS = ['ru', 'en'];
let lang = ls.get('trav-lang') || ((navigator.language || '').slice(0, 2) === 'ru' ? 'ru' : 'en');
if (!LANGS.includes(lang)) lang = 'en';
let D = I18N[lang];
const t = (k, v) => { let s = D[k] ?? I18N.ru[k] ?? k; if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
const fmt = (n, d = 0) => n.toLocaleString(D._locale, { maximumFractionDigits: d, minimumFractionDigits: d });

/* ================= bodies (NASA elements, J2000) ================= */
const AU = 149597.87, DAY = 864e5, J2000 = Date.UTC(2000, 0, 1, 12), SPIN = 600;
// id, radius (units), a (AU), period (days), mean longitude J2000, eccentricity, longitude of perihelion, axial tilt, rotation (h), atmosphere colour, atmosphere strength
const PLANETS = [
  ['mercury', 2.4397, .387, 87.969, 252.25, .2056, 77.46, .03, 1407.6, null, 0],
  ['venus', 6.0518, .723, 224.701, 181.98, .0068, 131.53, 177.4, -5832.5, [1, .86, .55], .9],
  ['earth', 6.371, 1, 365.2425, 100.46, .0167, 102.94, 23.44, 23.93, [.32, .62, 1], 1],
  ['mars', 3.3895, 1.524, 686.98, 355.45, .0934, 336.04, 25.19, 24.62, [1, .6, .38], .45],
  ['jupiter', 69.911, 5.203, 4332.59, 34.40, .0484, 14.75, 3.13, 9.93, [.95, .85, .7], .5],
  ['saturn', 58.232, 9.537, 10759.22, 49.94, .0539, 92.43, 26.73, 10.66, [.95, .88, .7], .5],
  ['uranus', 25.362, 19.19, 30688.5, 313.23, .0473, 170.96, 97.77, -17.24, [.6, .9, .95], .6],
  ['neptune', 24.622, 30.07, 60182, 304.88, .0086, 44.97, 28.32, 16.11, [.4, .6, 1], .6],
];
const kep = (M, e) => { let E = M; for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; };
function helio(p, days, out) {
  const [, , a, period, L0, e, w0] = p, w = w0 * Math.PI / 180;
  const M = ((L0 - w0) + 360 / period * days) * Math.PI / 180, E = kep(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = a * AU * (1 - e * Math.cos(E)), lon = nu + w;
  return out.set(Math.cos(lon) * r, 0, -Math.sin(lon) * r);
}

/* ================= renderer ================= */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const PR = Math.min(devicePixelRatio || 1, mob ? 1.75 : 2);
renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(mob ? 68 : 58, innerWidth / innerHeight, 1e-5, 2e9);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const loader = new THREE.TextureLoader();
const tex = (f, wrap) => { const x = loader.load('/tex/' + f); x.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (wrap) x.wrapS = THREE.RepeatWrapping; return x; };

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*snoise(p);p*=2.07;a*=.5;}return f;}`;
const LDV = ['\n#include <common>\n#include <logdepthbuf_pars_vertex>\n', '\n#include <logdepthbuf_vertex>\n'];
const LDF = ['\n#include <logdepthbuf_pars_fragment>\n', '\n#include <logdepthbuf_fragment>\n'];

/* ================= sky ================= */
const sky = new THREE.Mesh(new THREE.SphereGeometry(1e8, 64, 32), new THREE.MeshBasicMaterial({ map: tex('milky_way.jpg'), side: THREE.BackSide, depthWrite: false, color: 0x8a8aa0 }));
sky.rotation.set(1.05, 0, .4); sky.renderOrder = -1; scene.add(sky);

/* ================= Sun ================= */
const sunR = 696.34;
const sun = new THREE.Mesh(new THREE.SphereGeometry(sunR, 96, 64), new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uNear: { value: 0 } },
  vertexShader: LDV[0] + `varying vec3 vP;varying vec3 vN;varying vec3 vV;void main(){vP=position/${sunR.toFixed(2)};vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;` + LDV[1] + `}`,
  fragmentShader: NOISE + LDF[0] + `uniform float uTime,uNear;varying vec3 vP;varying vec3 vN;varying vec3 vV;
    void main(){` + LDF[1] + `vec3 p=normalize(vP);float n=fbm(p*2.2+vec3(0.,uTime*.02,uTime*.01));float g=snoise(p*18.+uTime*.08);float gr=snoise(p*90.+uTime*.2);
    float v=n*.75+g*.18+gr*.07;if(uNear>.01){float c=1.-abs(snoise(p*700.+uTime*.3));v+=(c*c-.5)*.35*uNear+snoise(p*2600.)*.08*uNear;}vec3 col=mix(vec3(1.,.36,.04),vec3(1.,.84,.45),smoothstep(-.35,.45,v));col+=vec3(1.,.96,.82)*pow(max(v,0.),2.)*.9;
    float mu=max(dot(vN,vV),0.);col*=.5+.5*pow(mu,.42);col+=vec3(1.,.6,.2)*pow(1.-mu,3.)*.5;gl_FragColor=vec4(col*1.3,1.);}`,
}));
scene.add(sun);
function glowTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
}
const spriteMat = (map, o = {}) => new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, ...o });
const sunGlow = new THREE.Sprite(spriteMat(glowTex([[0, 'rgba(255,236,200,1)'], [.12, 'rgba(255,190,110,.6)'], [.4, 'rgba(255,130,50,.12)'], [1, 'rgba(255,100,30,0)']])));
sunGlow.scale.setScalar(sunR * 9); scene.add(sunGlow);
// a fixed-size star so the Sun stays visible from Neptune
const sunStar = new THREE.Sprite(spriteMat(glowTex([[0, 'rgba(255,250,235,1)'], [.15, 'rgba(255,220,160,.7)'], [1, 'rgba(255,180,90,0)']]), { sizeAttenuation: false }));
sunStar.scale.setScalar(.09); scene.add(sunStar);
const sunLight = new THREE.PointLight(0xfff4e6, 1.25, 0, 0); scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x3a4060, .35));

/* ================= planets ================= */
// Close-up relief is drawn in code: a height field (craters + fine noise) turned into lighting with screen-space
// derivatives, so it costs one evaluation per pixel and fades in only when you are near the surface.
const RELIEF = `
vec3 h33(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float craters(vec3 p){float h=0.;vec3 i=floor(p),f=fract(p);
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 c=vec3(x,y,z);vec3 r=h33(i+c);if(r.z<.45)continue;
    float R=.18+.32*r.x*r.x;float d=length(c+r-f)/R;if(d>1.6)continue;
    h+=R*((d<1.?(d*d-1.)*.55:0.)+exp(-(d-1.)*(d-1.)*22.)*.22);}
  return h;}
vec3 bumpN(vec3 P,vec3 N,float h){vec3 sx=dFdx(P),sy=dFdy(P);vec3 r1=cross(sy,N),r2=cross(N,sx);float det=dot(sx,r1);
  vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);return normalize(abs(det)*N-g);}`;
const planetFrag = (earth) => NOISE + RELIEF + LDF[0] + `
  uniform sampler2D uMap;${earth ? 'uniform sampler2D uNight;' : ''}uniform vec3 uSun;uniform vec3 uAtm;uniform float uAtmK,uDetail,uBump,uAmp,uFreq,uCrater,uR;uniform vec3 uStretch;
  varying vec3 vObj;varying vec3 vWN;varying vec3 vWP;varying vec2 vUv;
  void main(){` + LDF[1] + `
    vec3 base=texture2D(uMap,vUv).rgb;vec3 N=normalize(vWN);
    if(uDetail>.01){
      vec3 p=vObj*uStretch;float h=0.;
      if(uCrater>0.){float c1=craters(p*uFreq*.35)/(uFreq*.35),c2=craters(p*uFreq*1.3+7.)/(uFreq*1.3);h+=(c1+c2*.8)*uCrater;base*=1.+(c1*uFreq*.35+c2*uFreq*1.3*.6)*.18*uDetail;}
      float n=fbm(p*uFreq*2.)*.6;h+=n/(uFreq*2.)*uBump*.6;
      base*=1.+n*uAmp*uDetail;
      N=normalize(mix(N,bumpN(vWP,N,h*uR),uDetail));
    }
    vec3 L=normalize(uSun-vWP);vec3 Vd=normalize(cameraPosition-vWP);float d=dot(N,L);float dg=dot(normalize(vWN),L);
    float lit=max(d,0.)*smoothstep(-.12,.08,dg);
    vec3 col=base*(.035+lit*1.15);
    ${earth ? `float ocean=smoothstep(.02,.12,base.b-base.r);vec3 H=normalize(L+Vd);col+=pow(max(dot(normalize(vWN),H),0.),60.)*ocean*lit*vec3(1.,.92,.75)*.6;
    float city=texture2D(uNight,vUv).r;col+=vec3(1.,.68,.34)*pow(city,1.5)*(1.-smoothstep(-.25,.05,dg))*1.6;` : ''}
    float rim=pow(1.-max(dot(normalize(vWN),Vd),0.),3.);col+=uAtm*rim*uAtmK*smoothstep(-.25,.35,dg);
    gl_FragColor=vec4(col,1.);}`;
const planetVert = LDV[0] + `varying vec3 vObj;varying vec3 vWN;varying vec3 vWP;varying vec2 vUv;
  void main(){vUv=uv;vObj=normalize(position);vWN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;` + LDV[1] + `}`;
const atmMat = (col, k) => new THREE.ShaderMaterial({
  uniforms: { uSun: { value: V() }, uCol: { value: new THREE.Color(...col) }, uK: { value: k } }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  vertexShader: LDV[0] + `varying vec3 vWN;varying vec3 vWP;void main(){vWN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;` + LDV[1] + `}`,
  fragmentShader: LDF[0] + `uniform vec3 uSun,uCol;uniform float uK;varying vec3 vWN;varying vec3 vWP;void main(){` + LDF[1] + `vec3 Vd=normalize(cameraPosition-vWP);float i=pow(clamp(.74+dot(vWN,Vd),0.,1.),4.);
    float day=clamp(dot(-vWN,normalize(uSun-vWP))*.8+.45,0.,1.);gl_FragColor=vec4(uCol*i*day*1.5*uK,i*day*uK);}`,
});
// procedural detail per body: [frequency, bump, colour amplitude, stretch (bands for gas giants)]
// [frequency, relief, colour amplitude, band stretch, craters]
const DETAIL = { mercury: [40, .5, .05, 1, 1], venus: [12, .05, .03, 1, 0], earth: [40, .18, .04, 1, 0], moon: [40, .5, .05, 1, 1], mars: [40, .5, .06, 1, .55], jupiter: [10, .02, .05, 7, 0], saturn: [10, .02, .04, 7, 0], uranus: [8, .01, .03, 6, 0], neptune: [8, .01, .04, 6, 0] };
// sharper maps, loaded only when you fly close
const HIRES = { earth: ['earth_day_4k.jpg', 'earth_night_4k.jpg'], moon: ['moon_4k.jpg'], mars: ['mars_4k.jpg'], mercury: ['mercury_4k.jpg'], jupiter: ['jupiter_4k.jpg'], saturn: ['saturn_4k.jpg'] };
const bodies = [];
function makeBody(id, R, map, o = {}) {
  const grp = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = (o.tilt || 0) * Math.PI / 180; grp.add(tilt); scene.add(grp);
  const [fq, bump, amp, str, crat] = DETAIL[id];
  const u = { uMap: { value: tex(map, true) }, uSun: { value: V() }, uAtm: { value: new THREE.Color(...(o.atm || [0, 0, 0])) }, uAtmK: { value: o.atmK || 0 },
    uDetail: { value: 0 }, uBump: { value: bump }, uAmp: { value: amp }, uFreq: { value: fq }, uStretch: { value: V(1, str, 1) }, uCrater: { value: crat }, uR: { value: R } };
  if (o.night) u.uNight = { value: tex(o.night, true) };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 96), new THREE.ShaderMaterial({ uniforms: u, vertexShader: planetVert, fragmentShader: planetFrag(!!o.night) }));
  tilt.add(mesh);
  const b = { id, R, grp, tilt, mesh, pos: V(), rotH: o.rotH || 24, atms: [] };
  if (o.atm && o.atmK) { const a = new THREE.Mesh(new THREE.SphereGeometry(R * (o.atmScale || 1.025), 96, 64), atmMat(o.atm, o.atmK)); grp.add(a); b.atms.push(a); }
  // a fixed-size dot so far planets don't vanish
  b.dot = new THREE.Sprite(spriteMat(glowTex([[0, 'rgba(255,255,255,1)'], [.3, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]), { sizeAttenuation: false, opacity: .85 }));
  b.dot.scale.setScalar(.012); grp.add(b.dot);
  bodies.push(b); return b;
}
const P = {};
for (const p of PLANETS) {
  const [id, R, , , , , , tilt, rotH, atm, atmK] = p;
  P[id] = makeBody(id, R, id === 'earth' ? 'earth_day.jpg' : id === 'venus' ? 'venus.jpg' : id + '.jpg', { tilt, rotH, atm, atmK, night: id === 'earth' ? 'earth_night.jpg' : null, atmScale: id === 'earth' ? 1.025 : id === 'venus' ? 1.03 : 1.02 });
  P[id].el = p;
}
P.moon = makeBody('moon', 1.7374, 'moon.jpg', { tilt: 6.7, rotH: 655.7 });
// Earth clouds: their own shell, so they float above the ground when you are close
const clouds = new THREE.Mesh(new THREE.SphereGeometry(6.371 * 1.006, 128, 96), new THREE.ShaderMaterial({
  uniforms: { uMap: { value: tex('earth_clouds.jpg', true) }, uSun: { value: V() } }, transparent: true, depthWrite: false,
  vertexShader: planetVert,
  fragmentShader: LDF[0] + `uniform sampler2D uMap;uniform vec3 uSun;varying vec3 vObj;varying vec3 vWN;varying vec3 vWP;varying vec2 vUv;void main(){` + LDF[1] + `
    float c=texture2D(uMap,vUv).r;float d=dot(normalize(vWN),normalize(uSun-vWP));float lit=max(d,0.)*smoothstep(-.12,.08,d);
    gl_FragColor=vec4(vec3(1.)*(.03+lit*1.05),smoothstep(.15,.85,c)*.92);}`,
}));
P.earth.tilt.add(clouds);
// Saturn's rings: real radii (C ring 74 500 km to F ring 140 200 km), lit, with the planet's shadow
const ringIn = 74.5, ringOut = 140.2;
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: tex('saturn_ring.png') }, uSun: { value: V() }, uC: { value: V() }, uR: { value: 58.232 } }, side: THREE.DoubleSide, transparent: true, depthWrite: false,
  vertexShader: LDV[0] + `varying vec3 vP;varying vec3 vWP;void main(){vP=position;vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;` + LDV[1] + `}`,
  fragmentShader: LDF[0] + `uniform sampler2D uMap;uniform vec3 uSun,uC;uniform float uR;varying vec3 vP;varying vec3 vWP;void main(){` + LDF[1] + `
    float u=(length(vP.xy)-${ringIn.toFixed(1)})/${(ringOut - ringIn).toFixed(1)};vec4 c=texture2D(uMap,vec2(u,.5));
    vec3 L=normalize(uSun-vWP);vec3 oc=vWP-uC;float b=dot(oc,L);float h=dot(oc,oc)-b*b;float sh=(b<0.&&h<uR*uR)?.08:1.;
    gl_FragColor=vec4(c.rgb*(.15+.95*sh),c.a*.95);}`,
});
const rings = new THREE.Mesh(new THREE.RingGeometry(ringIn, ringOut, 256, 1), ringMat); rings.rotation.x = -Math.PI / 2; P.saturn.tilt.add(rings);
const sunBody = { id: 'sun', R: sunR, pos: V(), grp: sun };
const ALL = [sunBody, P.mercury, P.venus, P.earth, P.moon, P.mars, P.jupiter, P.saturn, P.uranus, P.neptune];

function placeBodies(now) {
  const days = (now - J2000) / DAY;
  for (const p of PLANETS) helio(p, days, P[p[0]].pos);
  // the Moon: mean motion around Earth, 384 400 km
  const lm = (218.316 + 13.176396 * days) * Math.PI / 180;
  P.moon.pos.set(Math.cos(lm) * 384.4, Math.sin(lm) * 384.4 * .09, -Math.sin(lm) * 384.4).add(P.earth.pos);
  for (const b of bodies) b.mesh.rotation.y = ((now / 3.6e6) * SPIN / b.rotH % 1) * Math.PI * 2;
  clouds.rotation.y = P.earth.mesh.rotation.y * 1.04;
}

/* ================= shuttle (built from primitives, ~37 m, drawn at 1:250 so it stays visible) ================= */
const SHIP = 37 * 250 / 1e6; // units
const ship = new THREE.Group(); scene.add(ship);
(function buildShuttle() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: .7, metalness: .05 }),
    dark = new THREE.MeshStandardMaterial({ color: 0x23252c, roughness: .8 }), grey = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: .5, metalness: .5 });
  const prof = [[0, 0], [.9, .25], [1.6, .9], [2, 2.2], [2.15, 6], [2.15, 30], [2, 33]].map(([r, z]) => new THREE.Vector2(r, z));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), white); body.rotation.x = Math.PI / 2; body.position.z = -16.5; g.add(body);
  const nose = new THREE.Mesh(new THREE.LatheGeometry(prof.slice(0, 4), 32), dark); nose.rotation.x = Math.PI / 2; nose.position.z = -16.55; nose.scale.setScalar(1.01); g.add(nose);
  const wing = new THREE.Shape(); wing.moveTo(0, -4); wing.lineTo(12, 13); wing.lineTo(12, 15.5); wing.lineTo(0, 15.5);
  const wg = new THREE.ExtrudeGeometry(wing, { depth: .5, bevelEnabled: false });
  for (const s of [1, -1]) { const w = new THREE.Mesh(wg, white); w.rotation.x = Math.PI / 2; w.scale.x = s; w.position.set(0, -1.2, 0); g.add(w);
    const under = new THREE.Mesh(wg, dark); under.rotation.x = Math.PI / 2; under.scale.set(s, 1, .3); under.position.set(0, -1.75, 0); g.add(under); }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(9.5, 0); fin.lineTo(9.5, 8.5); fin.lineTo(7, 8.5);
  const f = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: .4, bevelEnabled: false }), white); f.rotation.y = -Math.PI / 2; f.position.set(.2, 1.8, 6.5); g.add(f);
  const bay = new THREE.Mesh(new THREE.BoxGeometry(2.6, .15, 17), grey); bay.position.set(0, 2.1, 1); g.add(bay);
  const flames = [];
  for (const [x, y] of [[0, 1.4], [-1.2, -.3], [1.2, -.3]]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(.6, .95, 1.6, 16, 1, false), grey); n.rotation.x = Math.PI / 2; n.position.set(x, y, 17.2); g.add(n);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(.75, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.rotation.x = Math.PI / 2; fl.position.set(x, y, 20.5); g.add(fl); flames.push(fl);
  }
  g.scale.setScalar(SHIP / 37); ship.add(g); ship.userData.flames = flames;
  const shipLight = new THREE.PointLight(0x9fb4ff, .6, SHIP * 6, 2); shipLight.position.set(0, SHIP * .8, -SHIP * .2); ship.add(shipLight);
})();

/* ================= flight state ================= */
const st = { brake: false, pos: V(), quat: new THREE.Quaternion(), vel: V(), thr: 0, auto: null, aim: null, yaw: 0, pitch: 0, roll: 0, hull: 1, dead: false };
const camQ = new THREE.Quaternion();
placeBodies(Date.now());
function startNearEarth() {
  const e = P.earth.pos, toSun = e.clone().negate().normalize(), side = V(0, 1, 0).cross(toSun).normalize();
  st.pos.copy(e).addScaledVector(toSun.clone().applyAxisAngle(V(0, 1, 0), .9), P.earth.R * 3.4).addScaledVector(V(0, 1, 0), P.earth.R * .5);
  const m = new THREE.Matrix4().lookAt(st.pos, e.clone().addScaledVector(side, P.earth.R * 1.3), V(0, 1, 0)); st.quat.setFromRotationMatrix(m);
  camQ.copy(st.quat); st.vel.set(0, 0, 0); st.thr = 0; st.auto = st.aim = null; st.hull = 1; st.dead = false;
}
startNearEarth();
const fwd = V(), tmp = V(), tmp2 = V(), qd = new THREE.Quaternion(), eul = new THREE.Euler();
function nearest() {
  let best = null, alt = Infinity;
  for (const b of ALL) { const a = b.pos.distanceTo(st.pos) - b.R; if (a < alt) { alt = a; best = b; } }
  return [best, alt];
}
function flyStep(dt) {
  const [nb, alt] = nearest();
  const vmax = clamp(Math.max(alt, 0) * .9, .0004, 6e5);
  if (st.auto) {
    const tg = st.auto, dist = tg.pos.distanceTo(st.pos), park = tg.R * (tg.id === 'sun' ? 15 : tg.id === 'saturn' ? 4.2 : 3.2), left = dist - park;
    tmp.subVectors(tg.pos, st.pos).normalize();
    const m = new THREE.Matrix4().lookAt(V(), tmp, tmp2.set(0, 1, 0).applyQuaternion(st.quat)); qd.setFromRotationMatrix(m);
    st.quat.slerp(qd, 1 - Math.exp(-dt * 2.2));
    fwd.set(0, 0, -1).applyQuaternion(st.quat);
    const facing = fwd.dot(tmp), want = facing > .97 ? Math.min(vmax, Math.max(left, 0) * 1.3) : vmax * .02;
    st.thr = clamp(want / vmax, 0, 1);
    if (left < tg.R * .03 && st.vel.length() < tg.R * .2) { st.auto = null; st.thr = 0; updateAutoUi(); }
  } else if (st.aim) {
    // turn to face a body without flying anywhere
    tmp.subVectors(st.aim.pos, st.pos).normalize();
    qd.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), tmp, V(0, 1, 0)));
    st.quat.slerp(qd, 1 - Math.exp(-dt * 2.6));
    if (fwd.set(0, 0, -1).applyQuaternion(st.quat).dot(tmp) > .9995) st.aim = null;
  } else {
    eul.set(st.pitch * dt, st.yaw * dt, st.roll * dt, 'XYZ'); qd.setFromEuler(eul); st.quat.multiply(qd).normalize();
    // gently level the wings with the plane of the planets, so "up" stays up
    fwd.set(0, 0, -1).applyQuaternion(st.quat);
    if (!st.roll && Math.abs(fwd.y) < .85) { const err = tmp2.set(1, 0, 0).applyQuaternion(st.quat).y; eul.set(0, 0, -err * dt * 1.4); qd.setFromEuler(eul); st.quat.multiply(qd).normalize(); }
  }
  fwd.set(0, 0, -1).applyQuaternion(st.quat);
  tmp.copy(fwd).multiplyScalar(st.thr * vmax);
  st.vel.lerp(tmp, 1 - Math.exp(-dt * (st.brake ? 7 : 3)));
  st.pos.addScaledVector(st.vel, dt);
  // never sink into a body: stay a little above the surface (or the Sun's)
  for (const b of ALL) {
    const d = st.pos.distanceTo(b.pos), floor = b.R * (b.id === 'sun' ? 1.05 : 1.0015) + SHIP;
    if (d < floor) { tmp.subVectors(st.pos, b.pos).normalize(); st.pos.copy(b.pos).addScaledVector(tmp, floor); const vr = st.vel.dot(tmp); if (vr < 0) st.vel.addScaledVector(tmp, -vr); }
  }
  return [nb, alt];
}

/* ================= heat near the Sun ================= */
// equilibrium temperature of a body in sunlight: T = 5772 K * sqrt(R_sun / 2d). 5 °C at Earth's distance.
// The shuttle's leading edges (reinforced carbon-carbon) survive about 1 600 °C.
const MELT = 1600;
const hullTemp = () => 5772 * Math.sqrt(sunR / (2 * Math.max(st.pos.distanceTo(sunBody.pos), sunR))) - 273;
let actx = null, lastBeep = 0;
function beep(f, len = .12, vol = .08) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.value = f;
  g.gain.setValueAtTime(vol, actx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + len); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + len);
}
function heat(dt, now) {
  const T = hullTemp(), danger = THREE.MathUtils.smoothstep(T, 900, 1600);
  if (T > MELT && !st.dead) st.hull = Math.max(0, st.hull - dt * (T - MELT + 150) / 900);
  $('hHullS').hidden = T < 150 && st.hull >= 1;
  $('hHull').textContent = `${fmt(Math.round(T))} °C` + (st.hull < 1 ? ` · ${Math.round(st.hull * 100)}%` : '');
  const a = $('alert');
  if (st.dead || T < 400) a.hidden = true;
  else {
    a.hidden = false; a.className = 'alert ' + (T < 1100 ? 'warn' : 'danger');
    $('alertH').textContent = T < 1100 ? t('heatWarnH') : T < MELT ? t('heatDangerH') : t('heatMeltH');
    $('alertP').textContent = t(T < 1100 ? 'heatWarnP' : T < MELT ? 'heatDangerP' : 'heatMeltP', { t: `${fmt(Math.round(T))} °C`, p: Math.round(st.hull * 100) });
  }
  $('heatfx').style.opacity = st.dead ? 0 : danger;
  if (!st.dead && T >= 1100 && now - lastBeep > (T > MELT ? 260 : 600)) { lastBeep = now; beep(T > MELT ? 1180 : 880); }
  if (!st.dead && st.hull <= 0) explode(T);
  return danger;
}
const BOOM = 900, boomPos = new Float32Array(BOOM * 3), boomVel = new Float32Array(BOOM * 3), boomCol = new Float32Array(BOOM * 3);
const boomGeo = new THREE.BufferGeometry(); boomGeo.setAttribute('position', new THREE.BufferAttribute(boomPos, 3)); boomGeo.setAttribute('color', new THREE.BufferAttribute(boomCol, 3));
const boom = new THREE.Points(boomGeo, new THREE.PointsMaterial({ size: SHIP * .12, map: glowTex([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
boom.visible = false; boom.frustumCulled = false; scene.add(boom); let boomT = 0;
function explode(T) {
  st.dead = true; st.thr = 0; st.auto = st.aim = null; updateAutoUi();
  for (let i = 0; i < BOOM; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u), sp = SHIP * (.3 + Math.random() * Math.random() * 6);
    boomPos.set([0, 0, 0], i * 3); boomVel.set([r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp], i * 3);
    const h = Math.random(); boomCol.set(h < .5 ? [1, .85, .55] : h < .85 ? [1, .45, .12] : [.6, .6, .65], i * 3);
  }
  boomGeo.attributes.position.needsUpdate = boomGeo.attributes.color.needsUpdate = true;
  boom.visible = true; boomT = 0; ship.visible = false;
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = 1; requestAnimationFrame(() => { f.style.transition = ''; f.style.opacity = 0; });
  if (actx) { beep(90, 1.4, .25); beep(55, 2, .2); }
  const d = st.pos.distanceTo(sunBody.pos) - sunR;
  $('deadP').textContent = t('deadP', { d: distFmt(d), t: `${fmt(Math.round(T))} °C` });
  setTimeout(() => { $('dead').hidden = false; }, 1700);
}
function boomStep(dt) {
  if (!boom.visible) return; boomT += dt;
  for (let i = 0; i < BOOM * 3; i++) boomPos[i] += boomVel[i] * dt;
  boom.material.opacity = Math.max(0, 1 - boomT / 3.5); boomGeo.attributes.position.needsUpdate = true;
  if (boomT > 3.6) boom.visible = false;
}
$('bRespawn').onclick = () => { $('dead').hidden = true; boom.visible = false; ship.visible = true; startNearEarth(); };

/* ================= camera ================= */
const camOff = V(0, SHIP * .55, SHIP * 3.3), camLook = V(0, SHIP * .5, -SHIP * 2);
function placeCamera(dt, shake = 0) {
  camQ.slerp(st.quat, 1 - Math.exp(-dt * 5));
  camera.position.copy(camOff).applyQuaternion(camQ);
  if (shake) camera.position.add(tmp.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(SHIP * .06 * shake));
  camera.up.set(0, 1, 0).applyQuaternion(camQ);
  camera.lookAt(tmp.copy(camLook).applyQuaternion(st.quat));
  ship.quaternion.copy(st.quat);
}

/* ================= labels ================= */
const labelsEl = $('labels');
for (const b of ALL) { const el = document.createElement('div'); el.className = 'lbl'; labelsEl.appendChild(el); el.onclick = () => startAuto(b); b.lbl = el; }
const proj = V();
function distFmt(u) {
  const km = u * 1000;
  if (km < 1e6) return `${fmt(Math.max(0, Math.round(km)))} ${t('km')}`;
  if (km < 1.5e9) return `${fmt(km / 1e6, km < 1e7 ? 1 : 0)} ${t('mlnKm')}`;
  return `${fmt(km / 1.496e8, 1)} ${t('au')}`;
}
const vv = V();
function edgeMark(b, show) {
  if (!b.edge) { const el = document.createElement('div'); el.className = 'edge' + (b.id === 'sun' ? ' sun' : ''); el.innerHTML = '<i></i><span></span>'; el.onclick = () => { st.aim = b; st.auto = null; updateAutoUi(); }; labelsEl.appendChild(el); b.edge = el; }
  const el = b.edge; if (!show) { el.style.display = 'none'; return; }
  vv.subVectors(b.pos, st.pos).applyMatrix4(camera.matrixWorldInverse);
  let dx = vv.x, dy = -vv.y; if (Math.hypot(dx, dy) < 1e-9) dy = 1;
  const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const W2 = innerWidth / 2 - 54, Ht = innerHeight / 2 - (mob ? 150 : 96), Hb = innerHeight / 2 - (mob ? 120 : 86);
  const k = Math.min(W2 / Math.max(Math.abs(dx), 1e-6), (dy < 0 ? Ht : Hb) / Math.max(Math.abs(dy), 1e-6));
  el.style.display = ''; el.style.transform = `translate(${innerWidth / 2 + dx * k}px,${innerHeight / 2 + dy * k}px) translate(-50%,-50%)`;
  el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
  el.lastChild.textContent = D.bodies[b.id]; el.classList.toggle('aim', st.aim === b);
}
function drawLabels(nb) {
  // which off-screen bodies get an arrow at the edge: the Sun, the autopilot target, the two nearest
  const near2 = ALL.filter(b => b.id !== 'sun').sort((a, c) => a.pos.distanceToSquared(st.pos) - c.pos.distanceToSquared(st.pos)).slice(0, 2);
  for (const b of ALL) {
    proj.subVectors(b.pos, st.pos).project(camera);
    const onScreen = proj.z <= 1 && Math.abs(proj.x) < .97 && Math.abs(proj.y) < .97;
    edgeMark(b, !onScreen && !st.dead && (b.id === 'sun' || b === st.auto || b === st.aim || near2.includes(b)));
    const d = b.pos.distanceTo(st.pos) - b.R, el = b.lbl;
    // hide a label when that body fills the screen or sits behind the camera
    const big = b.R / Math.max(d, 1e-6) > .35;
    if (proj.z > 1 || big || !onScreen || st.dead) { el.style.opacity = 0; el.style.pointerEvents = 'none'; continue; }
    el.style.opacity = 1; el.style.pointerEvents = 'auto';
    el.textContent = `${D.bodies[b.id]} · ${distFmt(d)}`;
    el.classList.toggle('target', st.auto === b);
    el.style.transform = `translate(${(proj.x * .5 + .5) * innerWidth + 10}px,${(-proj.y * .5 + .5) * innerHeight - 12}px)`;
  }
}

/* ================= HUD, card, menu ================= */
function speedFmt(u) { const kms = u * 1000; if (kms > 299792) return `${fmt(kms / 299792, 1)} ${t('c')}`; if (kms < 1) return `${fmt(kms * 1000)} ${t('mS')}`; return `${fmt(kms, kms < 100 ? 1 : 0)} ${t('kmS')}`; }
let cardFor = null;
function showCard(b) {
  if (cardFor === b) return; cardFor = b;
  if (!b) { $('card').hidden = true; return; }
  const f = D.facts[b.id];
  $('cName').textContent = D.bodies[b.id];
  $('cFacts').innerHTML = ['fDiam', 'fDay', 'fYear', 'fG', 'fTemp', 'fMoons'].map((k, i) => f[i] && f[i] !== '—' ? `<dt>${t(k)}</dt><dd>${f[i]}</dd>` : '').join('');
  $('cFact').textContent = f[6]; $('card').hidden = false;
}
function hud(nb, alt) {
  $('hSpeed').textContent = speedFmt(st.vel.length());
  $('hNearK').textContent = `${t('near')}: ${D.bodies[nb.id]}`;
  $('hAlt').textContent = `${distFmt(alt)} ${t('alt')}`;
  $('bAim').textContent = t('aimBtn', { name: D.bodies[nb.id] });
  showCard(alt < nb.R * 4 ? nb : null);
  setThrUi();
}
function updateAutoUi() { $('hAuto').hidden = !st.auto; if (st.auto) $('hAutoT').textContent = t('autopilot', { name: D.bodies[st.auto.id] }); }
function startAuto(b) { st.auto = b; $('menu').hidden = true; updateAutoUi(); }
$('hAutoX').onclick = () => { st.auto = null; updateAutoUi(); };
function buildMenu() {
  $('menuList').innerHTML = '';
  for (const b of ALL) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.innerHTML = `${D.bodies[b.id]}<span>${distFmt(b.pos.distanceTo(st.pos) - b.R)}</span>`;
    btn.onclick = () => startAuto(b); $('menuList').appendChild(btn);
  }
}
$('card').onclick = () => $('card').classList.toggle('open');
$('bWhere').onclick = () => { buildMenu(); $('menu').hidden = false; };
$('menu').addEventListener('click', e => { if (e.target.id === 'menu') $('menu').hidden = true; });
$('bStop').onclick = () => { st.auto = st.aim = null; st.thr = 0; updateAutoUi(); };
$('bAim').onclick = () => { const [nb] = nearest(); st.aim = nb; st.auto = null; updateAutoUi(); };

/* ================= controls ================= */
// steering: press anywhere on the sky and drag — the offset from where you pressed is the stick
const stick = $('stick'), knob = $('stickKnob'); let sp = null;
canvas.addEventListener('pointerdown', e => { sp = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.hidden = false; knob.style.transform = ''; });
canvas.addEventListener('pointermove', e => {
  if (!sp || e.pointerId !== sp.id) return;
  let dx = (e.clientX - sp.x) / 60, dy = (e.clientY - sp.y) / 60; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  st.yaw = -dx * 1.1; st.pitch = -dy * .9; if (Math.abs(dx) + Math.abs(dy) > .15) { st.aim = null; if (st.auto) { st.auto = null; updateAutoUi(); } }
  knob.style.transform = `translate(${dx * 37}px,${dy * 37}px)`;
});
const endStick = e => { if (sp && e.pointerId === sp.id) { sp = null; st.yaw = st.pitch = 0; stick.hidden = true; } };
canvas.addEventListener('pointerup', endStick); canvas.addEventListener('pointercancel', endStick);
// throttle slider
const track = $('thTrack'); let thDrag = false;
const setFromY = y => { const r = track.getBoundingClientRect(); st.thr = clamp(1 - (y - r.top) / r.height, 0, 1); if (st.auto) { st.auto = null; updateAutoUi(); } };
track.addEventListener('pointerdown', e => { thDrag = true; track.setPointerCapture(e.pointerId); setFromY(e.clientY); });
track.addEventListener('pointermove', e => thDrag && setFromY(e.clientY));
track.addEventListener('pointerup', () => thDrag = false); track.addEventListener('pointercancel', () => thDrag = false);
function setThrUi() { const h = track.clientHeight; $('thFill').style.height = (st.thr * 100) + '%'; $('thKnob').style.bottom = Math.max(0, st.thr * h - 3) + 'px'; }
// gas and brake straight ahead: hold to change speed, the course stays
let holdGas = false, holdBrake = false;
for (const [id, set] of [['bGas', v => holdGas = v], ['bBrake', v => holdBrake = v]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) {} set(true); b.classList.add('on'); if (st.auto) { st.auto = null; updateAutoUi(); } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { set(false); b.classList.remove('on'); });
  b.addEventListener('contextmenu', e => e.preventDefault());
}
canvas.addEventListener('wheel', e => { e.preventDefault(); st.thr = clamp(st.thr - e.deltaY * .0008, 0, 1); if (st.auto) { st.auto = null; updateAutoUi(); } }, { passive: false });
const keys = new Set();
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys.add(e.code); if (e.code === 'Space') { st.thr = 0; st.auto = null; updateAutoUi(); e.preventDefault(); } if (e.code === 'Escape') $('menu').hidden = true; });
addEventListener('keyup', e => keys.delete(e.code));
function keyInput(dt) {
  const k = c => keys.has(c);
  const gas = holdGas || k('KeyW') || k('ArrowUp') || k('ShiftLeft'), brk = holdBrake || k('KeyS') || k('ArrowDown') || k('ControlLeft');
  if ((gas || brk) && st.auto) { st.auto = null; updateAutoUi(); }
  if (gas) st.thr = clamp(st.thr + dt * .55, 0, 1);
  if (brk) st.thr = clamp(st.thr - dt * 1.4, 0, 1);
  st.brake = brk;
  const kb = k('ArrowLeft') || k('ArrowRight') || k('KeyA') || k('KeyD') || k('KeyQ') || k('KeyE');
  if (kb) { st.aim = null; if (st.auto) { st.auto = null; updateAutoUi(); } }
  if (!sp) { st.yaw = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0); st.pitch = 0; }
  st.roll = ((k('KeyA') || k('KeyQ')) ? 1.2 : 0) - ((k('KeyD') || k('KeyE')) ? 1.2 : 0);
}

/* ================= language ================= */
function applyLang(l) {
  lang = l; D = I18N[l]; ls.set('trav-lang', l);
  document.documentElement.lang = l; document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $('introHow').textContent = t(touch ? 'introMob' : 'introDesk');
  [...$('langs').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
  const c = cardFor; cardFor = undefined; showCard(c); updateAutoUi();
}
LANGS.forEach(l => { const b = document.createElement('button'); b.type = 'button'; b.dataset.l = l; b.textContent = I18N[l]._name; b.onclick = () => applyLang(l); $('langs').appendChild(b); });
applyLang(lang);
$('bGo').onclick = () => { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} $('intro').hidden = true; ['hud', 'ctl', 'throttle'].forEach(id => $(id).hidden = false); setThrUi(); };

/* ================= loop ================= */
const uniformsOf = b => b.mesh.material.uniforms;
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  placeBodies(Date.now());
  if (!st.dead) keyInput(dt); else { st.yaw = st.pitch = st.roll = 0; st.thr = 0; }
  const [nb, alt] = st.dead ? nearest() : flyStep(dt);
  const danger = $('hud').hidden ? 0 : heat(dt, now); boomStep(dt);
  // floating origin: everything relative to the ship
  sun.position.subVectors(sunBody.pos, st.pos); sunGlow.position.copy(sun.position); sunStar.position.copy(sun.position); sunLight.position.copy(sun.position);
  sun.material.uniforms.uTime.value = now / 1000; sun.material.uniforms.uNear.value = 1 - THREE.MathUtils.smoothstep(sun.position.length() / sunR, 1.1, 2.5);
  for (const b of bodies) {
    b.grp.position.subVectors(b.pos, st.pos);
    const u = uniformsOf(b), d = b.grp.position.length();
    u.uSun.value.copy(sun.position); u.uDetail.value = 1 - THREE.MathUtils.smoothstep(d / b.R, 1.08, 1.9);
    for (const a of b.atms) a.material.uniforms.uSun.value.copy(sun.position);
    b.dot.material.opacity = THREE.MathUtils.smoothstep(d / b.R, 400, 2000) * .9;
    if (!b.hi && HIRES[b.id] && d / b.R < 4) { b.hi = 1; const [day, night] = HIRES[b.id];
      loader.load('/tex/' + day, x => { x.anisotropy = renderer.capabilities.getMaxAnisotropy(); x.wrapS = THREE.RepeatWrapping; u.uMap.value = x; });
      if (night) loader.load('/tex/' + night, x => { x.wrapS = THREE.RepeatWrapping; u.uNight.value = x; }); }
  }
  clouds.material.uniforms.uSun.value.copy(sun.position);
  ringMat.uniforms.uSun.value.copy(sun.position); ringMat.uniforms.uC.value.copy(P.saturn.grp.position);
  sunStar.material.opacity = THREE.MathUtils.smoothstep(sun.position.length() / sunR, 30, 200);
  sky.position.set(0, 0, 0);
  for (const f of ship.userData.flames) { f.scale.set(1, .15 + st.thr * (1 + Math.random() * .25), 1); f.material.opacity = .25 + st.thr * .7; }
  placeCamera(dt, danger);
  renderer.render(scene, camera);
  if (!$('hud').hidden) { hud(nb, alt); drawLabels(nb); }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { mob = innerWidth < 760; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
requestAnimationFrame(frame);
// for tests: put the ship at k radii from a body and face it
function look(id, k = 3, side = .6, up = .25) {
  const b = ALL.find(x => x.id === id), dir = (b.id === 'sun' ? P.earth.pos.clone() : b.pos.clone().negate()).normalize().applyAxisAngle(V(0, 1, 0), side);
  st.pos.copy(b.pos).addScaledVector(dir, b.R * k).addScaledVector(V(0, 1, 0), b.R * up); st.vel.set(0, 0, 0); st.thr = 0; st.auto = null;
  st.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(st.pos, b.pos.clone().addScaledVector(V(0, 1, 0).cross(dir).normalize(), b.R * .35), V(0, 1, 0))); camQ.copy(st.quat);
}
window.__trav = { st, P, ALL, startAuto, look };
