// Traveler: fly a shuttle through the real-scale Solar System.
// Scale: 1 unit = 1000 km, distances and radii are real. Floating origin: the ship sits at (0,0,0) on the GPU,
// world positions live in JS doubles and every object is drawn relative to the ship.
import * as THREE from 'three';
import { I18N } from './i18n.js';
import { chart, wheelSVG, zonedToUtc, findCity, SIGNS, SIGN_GLYPH, GLYPH } from './birth.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const touch = matchMedia('(pointer: coarse)').matches;
let mob = innerWidth < 760;

/* ================= language ================= */
const LANGS = ['ru', 'en'];
// ?lang=ru|en|he from the main site; Hebrew lands in English, the home link goes back to /he/
const QS = new URLSearchParams(location.search), qLang = QS.get('lang');
let lang = (qLang && (qLang === 'he' ? 'en' : qLang)) || ls.get('trav-lang') || ((navigator.language || '').slice(0, 2) === 'ru' ? 'ru' : 'en');
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
  uniforms: { uTime: { value: 0 }, uNear: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: 0 } },
  vertexShader: LDV[0] + `varying vec3 vP;varying vec3 vN;varying vec3 vV;void main(){vP=position/${sunR.toFixed(2)};vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;` + LDV[1] + `}`,
  fragmentShader: NOISE + LDF[0] + `uniform float uTime,uNear,uTintK;uniform vec3 uTint;varying vec3 vP;varying vec3 vN;varying vec3 vV;
    void main(){` + LDF[1] + `vec3 p=normalize(vP);float n=fbm(p*2.2+vec3(0.,uTime*.02,uTime*.01));float g=snoise(p*18.+uTime*.08);float gr=snoise(p*90.+uTime*.2);
    float v=n*.75+g*.18+gr*.07;if(uNear>.01){float c=1.-abs(snoise(p*700.+uTime*.3));v+=(c*c-.5)*.35*uNear+snoise(p*2600.)*.08*uNear;}vec3 col=mix(vec3(1.,.36,.04),vec3(1.,.84,.45),smoothstep(-.35,.45,v));col+=vec3(1.,.96,.82)*pow(max(v,0.),2.)*.9;
    float mu=max(dot(vN,vV),0.);col*=.5+.5*pow(mu,.42);col+=vec3(1.,.6,.2)*pow(1.-mu,3.)*.5;col=mix(col,uTint*dot(col,vec3(.3,.45,.25))*1.6,uTintK);gl_FragColor=vec4(col*1.3,1.);}`,
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
const SOL = [sunBody, P.mercury, P.venus, P.earth, P.moon, P.mars, P.jupiter, P.saturn, P.uranus, P.neptune];
// Sagittarius A*, the black hole at the centre of the Galaxy: 4.3 million Suns, horizon radius 12.7 million km.
// It lives in its own space (we jump there): the hole sits at the origin, its disc lies in the y = 0 plane.
const RS = 12698, HOLE = { id: 'hole', R: RS, pos: V() };
// Stars of the birth years (the same list as on «Ты — пассажир»): the star whose light has been flying to Earth for
// as long as you have lived. Each one is a place of its own; your star-age peers fly there.
// id, distance (ly), spectral class, radius (Suns), surface temperature (K), colour
const STARS = [
  ['alphaCen', 4.37, 'G2V', 1.22, 5790, [255, 226, 170]], ['barnard', 5.96, 'M4V', .196, 3134, [255, 150, 110]],
  ['sirius', 8.6, 'A1V', 1.71, 9940, [200, 220, 255]], ['epsEri', 10.5, 'K2V', .735, 5084, [255, 200, 140]],
  ['procyon', 11.46, 'F5IV', 2.05, 6530, [245, 240, 230]], ['tauCet', 11.9, 'G8V', .79, 5344, [255, 220, 160]],
  ['altair', 16.7, 'A7V', 1.8, 7550, [220, 230, 255]], ['etaCas', 19.4, 'G0V', 1.04, 5973, [255, 230, 180]],
  ['vega', 25, 'A0V', 2.5, 9600, [190, 210, 255]], ['fomalhaut', 25.1, 'A3V', 1.84, 8590, [205, 220, 255]],
  ['pollux', 33.8, 'K0III', 9.1, 4586, [255, 190, 120]], ['arcturus', 36.7, 'K1.5III', 25.4, 4286, [255, 175, 100]],
  ['capella', 42.9, 'G3III', 12, 4970, [255, 225, 160]], ['alderamin', 49, 'A8V', 2.3, 7740, [225, 232, 255]],
  ['castor', 51, 'A1V', 2.4, 10300, [205, 220, 255]], ['menkent', 58.8, 'K0III', 10.9, 4980, [255, 195, 130]],
  ['aldebaran', 65.3, 'K5III', 44, 3900, [255, 160, 90]], ['hamal', 66, 'K2III', 14.9, 4480, [255, 185, 120]],
  ['alphecca', 75, 'A1IV', 3, 9700, [210, 225, 255]], ['regulus', 79.3, 'B8IV', 4.2, 12460, [185, 205, 255]],
  ['merak', 79.7, 'A1V', 3, 9380, [210, 225, 255]], ['alcor', 81.7, 'A5V', 1.8, 8000, [220, 230, 255]],
  ['denebKaitos', 96.3, 'K0III', 16.8, 4800, [255, 195, 130]],
];
const starById = id => STARS.find(s => s[0] === id);
// age in years -> the star whose distance in light years is closest; younger than ~2 years — still the Sun
const starForAge = y => { const s = STARS.reduce((b, x) => Math.abs(x[1] - y) < Math.abs(b[1] - y) ? x : b); return Math.abs(s[1] - y) < y ? s : null; };
const STARB = { id: 'star', R: sunR, pos: V(), grp: sun, T: 5772 };
let curStar = null;
let space = 'sol', ALL = SOL;

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
  g.scale.setScalar(SHIP / 37); ship.add(g); ship.userData.flames = flames; ship.userData.model = g;
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
  camQ.copy(st.quat); st.vel.set(0, 0, 0); st.thr = 0; st.auto = st.aim = null; st.hull = 1; st.dead = false; jitter();
}
// a random spot within ~400 km of the harbour, so arrivals don't sit inside each other but still see each other
function jitter() { st.pos.add(V(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(.8)); }
// at a star: the harbour is where the hull sits at about 90 °C, on a direction fixed for that star
function startAtStar() {
  const s = curStar, d = STARB.R * Math.max(25, .5 * (s[4] / 365) ** 2), a = [...s[0]].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 628 / 100;
  const dir = V(Math.cos(a), .12, Math.sin(a)).normalize(), side = V(0, 1, 0).cross(dir).normalize();
  st.pos.copy(dir).multiplyScalar(d);
  st.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(st.pos, V().addScaledVector(side, d * .35), V(0, 1, 0))); camQ.copy(st.quat);
  st.vel.set(0, 0, 0); st.thr = 0; st.auto = st.aim = null; st.hull = 1; st.dead = false; jitter();
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
  let vmax = clamp(Math.max(alt, 0) * .9, .0004, 6e5);
  const os = nearestOther(); if (os && os[1] < alt) vmax = Math.min(vmax, Math.max(os[1] * .9, .02));
  if (st.auto) {
    const tg = st.auto, dist = tg.pos.distanceTo(st.pos), park = tg.R * (tg.id === 'sun' || tg.id === 'star' ? Math.max(15, .5 * ((tg.T || 5772) / 1000) ** 2) : tg.id === 'hole' ? 6 : tg.id === 'ship' ? 3 : tg.id === 'saturn' ? 4.2 : 3.2), left = dist - park;
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
    const d = st.pos.distanceTo(b.pos), floor = b.id === 'hole' ? b.R + HOLE_FLOOR : b.R * (b.id === 'sun' ? 1.05 : 1.0015) + SHIP;
    if (d < floor) { tmp.subVectors(st.pos, b.pos).normalize(); st.pos.copy(b.pos).addScaledVector(tmp, floor); const vr = st.vel.dot(tmp); if (vr < 0) st.vel.addScaledVector(tmp, -vr); }
  }
  return [nb, alt];
}

/* ================= heat near the Sun ================= */
// equilibrium temperature of a body in sunlight: T = 5772 K * sqrt(R_sun / 2d). 5 °C at Earth's distance.
// The shuttle's leading edges (reinforced carbon-carbon) survive about 1 600 °C.
const MELT = 1600;
const heatBody = () => curStar ? STARB : sunBody;
const hullTemp = () => { const b = heatBody(); return (curStar ? curStar[4] : 5772) * Math.sqrt(b.R / (2 * Math.max(st.pos.distanceTo(b.pos), b.R))) - 273; };
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
  const d = st.pos.distanceTo(heatBody().pos) - heatBody().R;
  $('deadP').textContent = t('deadP', { d: distFmt(d), t: `${fmt(Math.round(T))} °C` });
  setTimeout(() => { $('dead').hidden = false; }, 1700);
}
function boomStep(dt) {
  if (!boom.visible) return; boomT += dt;
  for (let i = 0; i < BOOM * 3; i++) boomPos[i] += boomVel[i] * dt;
  boom.material.opacity = Math.max(0, 1 - boomT / 3.5); boomGeo.attributes.position.needsUpdate = true;
  if (boomT > 3.6) boom.visible = false;
}
$('bRespawn').onclick = () => { $('dead').hidden = true; boom.visible = false; ship.visible = true; if (curStar) startAtStar(); else startNearEarth(); };

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
for (const b of [...SOL, HOLE, STARB]) { const el = document.createElement('div'); el.className = 'lbl'; labelsEl.appendChild(el); el.onclick = () => startAuto(b); b.lbl = el; }
const proj = V();
const bodyName = b => b.id === 'con' ? conName(natal?.sunCon) : b.id === 'star' ? D.stars[curStar[0]][0] : b.id === 'ship' ? t('shipN', { n: b.n }) : D.bodies[b.id];
function distFmt(u) {
  const km = u * 1000;
  if (km < 1) return `${fmt(Math.max(0, km * 1000), km < .01 ? 1 : 0)} ${t('m')}`;
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
  el.lastChild.textContent = bodyName(b); el.classList.toggle('aim', st.aim === b);
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
    el.textContent = `${bodyName(b)} · ${distFmt(d)}`;
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
  let f = D.facts[b.id];
  if (b.id === 'star') { const s = curStar; f = [s[2], t('lyN', { n: fmt(s[1], 1) }), t('radN', { n: fmt(s[3], s[3] < 10 ? 2 : 0) }), `${fmt(s[4])} K`,
    `${D.stars[s[0]][1][0].toUpperCase() + D.stars[s[0]][1].slice(1)}. ` + t('starLight', { n: `${fmt(s[1], 1)} ${plural(Math.round(s[1]), D.uYear)}` })]; }
  $('cName').textContent = bodyName(b);
  const keys = b.id === 'star' ? ['fType', 'fDist', 'fRad', 'fTemp'] : b.id === 'hole' ? ['fHorizon', 'fMass', 'fDist', 'fDisk'] : ['fDiam', 'fDay', 'fYear', 'fG', 'fTemp', 'fMoons'];
  let bd = '';
  const pl = PLANETS.find(x => x[0] === b.id);
  if (pl && birth.date) { const age = ageDays() / pl[3], next = (Math.floor(age) + 1 - age) * pl[3];
    bd = `<dt class="bd">${t('bdHere')}</dt><dd class="bd">${fmt(age, age < 10 ? 1 : 0)} ${plural(age < 10 ? age : Math.round(age), D.uYear)}</dd><dt class="bd">${t('bdNextHere')}</dt><dd class="bd">${next < 1 ? t('todayBd') : t('inDays', { n: fmt(Math.ceil(next)), date: new Date(Date.now() + next * DAY).toLocaleDateString(D._locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</dd>`; }
  $('cFacts').innerHTML = keys.map((k, i) => f[i] && f[i] !== '—' ? `<dt>${t(k)}</dt><dd>${f[i]}</dd>` : '').join('') + bd;
  $('cFact').textContent = f[keys.length]; $('card').hidden = false;
}
function hud(nb, alt) {
  $('hSpeed').textContent = speedFmt(st.vel.length());
  $('hNearK').textContent = `${t('near')}: ${bodyName(nb)}`;
  $('hAlt').textContent = `${distFmt(alt)} ${t(nb.id === 'hole' ? 'altH' : 'alt')}`;
  if (space === 'hole') { $('hTime').textContent = spanFmt(3600 * dil()); $('hEarth').textContent = spanFmt(earthSec); }
  $('bAim').textContent = t('aimBtn', { name: bodyName(nb) });
  showCard(alt < nb.R * 4 ? nb : null);
  setThrUi();
}
function updateAutoUi() { $('hAuto').hidden = !st.auto; if (st.auto) $('hAutoT').textContent = t('autopilot', { name: bodyName(st.auto) }); }
function startAuto(b) { $('menu').hidden = true; st.auto = b; st.aim = null; updateAutoUi(); }
$('hAutoX').onclick = () => { st.auto = null; updateAutoUi(); };
function buildMenu() {
  $('menuList').innerHTML = '';
  const add = (name, sub, fn, cls) => { const btn = document.createElement('button'); btn.type = 'button'; if (cls) btn.className = cls; btn.innerHTML = `${name}<span>${sub}</span>`; btn.onclick = () => { $('menu').hidden = true; fn(); }; $('menuList').appendChild(btn); };
  const head = s => { const h = document.createElement('h3'); h.textContent = s; $('menuList').appendChild(h); };
  for (const b of ALL) add(bodyName(b), distFmt(b.pos.distanceTo(st.pos) - b.R), () => startAuto(b));
  const near = [...others.values()].filter(o => o.seen).sort((a, b) => a.pos.distanceToSquared(st.pos) - b.pos.distanceToSquared(st.pos)).slice(0, 6);
  if (near.length) { head(t('ships')); for (const o of near) add(bodyName(o), distFmt(o.pos.distanceTo(st.pos)), () => startAuto(o), 'ship'); }
  if (myStar && space !== myStar[0]) add(t('myStar', { name: D.stars[myStar[0]][0] }), t('jumpStar', { ly: fmt(myStar[1], 1) }), () => warp(myStar[0]), 'jump');
  if (space !== 'sol') add(t('home'), t('jumpHome'), () => warp('sol'), 'jump');
  if (space !== 'hole') add(D.bodies.hole, t('jumpHole'), () => warp('hole'), 'jump');
}
$('card').onclick = () => $('card').classList.toggle('open');
$('bWhere').onclick = () => { buildMenu(); $('menu').hidden = false; };
$('menu').addEventListener('click', e => { if (e.target.id === 'menu') $('menu').hidden = true; });
$('bStop').onclick = () => { st.auto = st.aim = null; st.thr = 0; updateAutoUi(); };
$('bAim').onclick = () => { const [nb] = nearest(); st.aim = nb; st.auto = null; updateAutoUi(); };

/* ================= black hole ================= */
// You hover on your engines, so your clock runs sqrt(r / (r - rs)) times slower than Earth's.
const HOLE_FLOOR = 3e-6; // 3 m above the horizon: an hour there is about 7 years on Earth (Miller's planet)
const dil = () => { if (space !== 'hole') return 1; const r = st.pos.length(), a = Math.max(r - RS, HOLE_FLOOR); return Math.sqrt((RS + a) / a); };
let earthSec = 0, shipSec = 0;
const plural = (n, f) => { if (lang !== 'ru') return n === 1 ? f[0] : f[1]; if (n % 1) return f[1]; n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? f[2] : m === 1 ? f[0] : m > 1 && m < 5 ? f[1] : f[2]; };
function spanFmt(sec) {
  if (sec < 60) return `${fmt(Math.round(sec))} ${t('uSec')}`;
  if (sec < 3600) return `${fmt(Math.floor(sec / 60))} ${t('uMin')}`;
  if (sec < 86400) { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60 % 60); return `${fmt(h)} ${t('uH')}` + (m ? ` ${fmt(m)} ${t('uMin')}` : ''); }
  const d = sec / 86400;
  if (d < 365.25) { const n = Math.floor(d); return `${fmt(n)} ${plural(n, D.uDay)}`; }
  const y = d / 365.25, n = y < 10 ? Math.floor(y * 10) / 10 : Math.round(y);
  return `${fmt(n, n % 1 ? 1 : 0)} ${plural(n, D.uYear)}`;
}
const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.PlaneGeometry(2, 2);
const bhRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false });
// full-screen ray tracing in Schwarzschild geometry (rs = 1): photons bend as d²x/dt² = -1.5 h² x / r⁵;
// rays that never come within 40 rs only get the weak-field deflection 2 rs / b
const bhMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uRo: { value: V() }, uRt: { value: V() }, uUp: { value: V() }, uFw: { value: V() }, uTan: { value: 1 }, uAsp: { value: 1 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader: `precision highp float;uniform float uTime,uTan,uAsp;uniform vec3 uRo,uRt,uUp,uFw;varying vec2 vUv;
    float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}
    vec3 sky(vec3 d){vec3 c=vec3(0.);
      for(int k=0;k<2;k++){float sc=k==0?90.:220.;vec3 g=d*sc;vec3 i=floor(g);float h=h31(i);
        if(h>(k==0?.985:.975)){vec3 f=fract(g)-.5;float b=smoothstep(.3,.0,length(f))*(h-.97)*40.;c+=b*mix(vec3(1.,.85,.7),vec3(.75,.85,1.),h31(i+3.));}}
      float band=exp(-pow(d.y*2.2+.3*d.x,2.)*2.);c+=vec3(.55,.45,.38)*band*(.06+.16*fb(d.xz*6.+d.y*3.));return c;}
    vec3 diskCol(vec3 p,vec3 dir,float r){
      float t=pow(1./r,.75)*pow(max(1.-sqrt(3./r),0.),.25)*2.1;
      float w=pow(r,-1.5)*.9;float a=-w*uTime;vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;
      float n=.3+.85*fb(vec2(r*2.6+2.2*fb(q*.6),fb(q*1.1)*2.5))*smoothstep(.15,.6,fb(q*2.3+r));
      vec3 v=normalize(vec3(-p.z,0.,p.x))*sqrt(.5/r);float b=length(v);
      float D=1./((1./sqrt(1.-b*b))*(1.-dot(v,-normalize(dir))));float gr=sqrt(1.-1./r);
      float I=t*pow(D*gr,3.)*n;
      vec3 hot=vec3(1.,.95,.86),warm=vec3(1.,.48,.12);vec3 c=mix(warm,hot,clamp(I*.9,0.,1.));
      return c*I*4.2;}
    void main(){
      vec2 uv=vUv*2.-1.;
      vec3 dir=normalize(uFw+uv.x*uTan*uAsp*uRt+uv.y*uTan*uUp);
      vec3 pos=uRo;vec3 col=vec3(0.);float al=0.;bool hole=false,march=true;
      const float RIN=40.;
      if(length(pos)>RIN){
        float tca=-dot(pos,dir);vec3 cp=pos+dir*tca;float b=length(cp);
        if(tca<0.||b>RIN){if(tca>0.)dir=normalize(dir-cp/b*2./b);march=false;}
        else pos=cp-dir*sqrt(RIN*RIN-b*b);
      }
      if(march){vec3 h=cross(pos,dir);float h2=dot(h,h);
        for(int i=0;i<${mob ? 220 : 360};i++){
          float r2=dot(pos,pos);float r=sqrt(r2);
          if(r<1.){hole=true;break;}
          float dt=r<16.?clamp(.045*r,.012,.7):.09*r;
          vec3 acc=-1.5*h2*pos/(r2*r2*r);
          vec3 np=pos+dir*dt;dir+=acc*dt;
          if(pos.y*np.y<0.){vec3 p=mix(pos,np,pos.y/(pos.y-np.y));float rr=length(p.xz);
            if(rr>3.&&rr<13.){float e=smoothstep(3.,3.25,rr)*(1.-smoothstep(8.,13.,rr));float a=clamp(e*.92,0.,1.);
              col+=(1.-al)*a*diskCol(p,dir,rr);al+=(1.-al)*a;if(al>.98)break;}}
          pos=np;if(r>RIN+2.&&dot(pos,dir)>0.)break;}}
      if(!hole)col+=(1.-al)*sky(normalize(dir));
      col=1.-exp(-col*1.4);gl_FragColor=vec4(pow(col,vec3(.9)),1.);}`,
});
const bhScene = new THREE.Scene(), bhQuad = new THREE.Mesh(quad, bhMat); bhQuad.frustumCulled = false; bhScene.add(bhQuad);
const outScene = new THREE.Scene(), outQuad = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: bhRT.texture, depthTest: false, depthWrite: false })); outQuad.frustumCulled = false; outScene.add(outQuad);
function sizeBH() { const k = PR * (mob ? .45 : .7); bhRT.setSize(Math.max(4, Math.round(innerWidth * k)), Math.max(4, Math.round(innerHeight * k))); }
sizeBH();
const solObjs = [sun, sunGlow, sunStar, sky, ...bodies.map(b => b.grp)];
function setSpace(to) {
  const from = space, star = starById(to) || null;
  space = to; curStar = star; ALL = to === 'hole' ? [HOLE] : star ? [STARB] : SOL;
  for (const o of solObjs) o.visible = to !== 'hole';
  for (const b of bodies) b.grp.visible = to === 'sol';
  // the star of this place: size, colour and heat
  const R = star ? sunR * star[3] : sunR, col = star ? new THREE.Color(...star[5].map(v => v / 255)) : new THREE.Color(1, 1, 1);
  STARB.R = R; STARB.T = star ? star[4] : 5772; sun.scale.setScalar(R / sunR); sunGlow.scale.setScalar(R * 9);
  sun.material.uniforms.uTint.value.copy(col); sun.material.uniforms.uTintK.value = star ? .8 : 0;
  sunGlow.material.color.copy(col); sunStar.material.color.copy(col); sunLight.color.set(0xfff4e6).multiply(col);
  for (const b of [...SOL, HOLE, STARB]) { if (b.lbl) { b.lbl.style.opacity = 0; b.lbl.style.pointerEvents = 'none'; } if (b.edge) b.edge.style.display = 'none'; }
  st.auto = st.aim = null; st.thr = 0; st.vel.set(0, 0, 0); updateAutoUi(); cardFor = undefined; showCard(null);
  $('alert').hidden = true; $('heatfx').style.opacity = 0; $('hHullS').hidden = true;
  $('hTimeS').hidden = $('hEarthS').hidden = to !== 'hole'; document.body.classList.toggle('at-hole', to === 'hole');
  if (to === 'hole') {
    // arrive 28 horizon radii out, a little above the disc, looking at the hole
    st.pos.set(RS * 9, RS * 2.2, RS * 26.5); earthSec = shipSec = 0;
    st.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(st.pos, V(), V(0, 1, 0))); camQ.copy(st.quat); jitter();
  } else if (star) startAtStar();
  else startNearEarth();
  if (from === 'hole' && to !== 'hole' && shipSec > 1) toast(t('backP', { ship: spanFmt(shipSec), earth: spanFmt(earthSec) }));
  if (to !== 'sol' && simTime) { simTime = null; $('timeBar').hidden = true; }
  skyGrp.visible = skyOn && to !== 'hole';
  netGo();
}
let warping = false;
function warp(to) {
  if (warping || st.dead) return; warping = true;
  const w = $('warp'), sj = starById(to); $('warpT').textContent = sj ? t('warpStar', { name: D.stars[to][0], ly: fmt(sj[1], 1) }) : t(to === 'hole' ? 'warpHole' : 'warpHome'); w.hidden = false;
  if (actx) { beep(140, 1.1, .05); beep(70, 1.6, .06); }
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('on')));
  setTimeout(() => { setSpace(to); w.classList.remove('on'); setTimeout(() => { w.hidden = true; warping = false; }, 900); }, 1300);
}
let toastT = 0;
function toast(s, btn, fn) {
  const el = $('toast'); el.textContent = s; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, btn ? 12000 : 7000);
  if (btn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = btn; b.onclick = e => { e.stopPropagation(); el.hidden = true; fn(); }; el.appendChild(b); }
}
$('toast').onclick = () => $('toast').hidden = true;

/* ================= online: other shuttles in the same place ================= */
// The server gets only the place (a star id, 'sol' or 'hole') and where your ship is. Never the date or a name.
const NET = QS.get('net') || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'ws://localhost:8090/fly' : 'wss://fly.tomerisr.org.il/fly');
const TICK = 200;
let ws = null, me = null, retry = 0, lastSend = 0, netOn = false;
const others = new Map();
const hueCol = h => new THREE.Color().setHSL(h / 360, .85, .62);
function netGo() { if (ws && ws.readyState === 1 && me) ws.send(JSON.stringify({ t: 'go', space })); for (const id of [...others.keys()]) dropOther(id); }
function connect() {
  netOn = true; try { ws = new WebSocket(NET); } catch (e) { return; }
  ws.onopen = () => { retry = 0; };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (er) { return; }
    if (m.t === 'hi') { me = m; netGo(); }
    else if (m.t === 'room') { for (const o of m.others) addOther(o); }
    else if (m.t === 'join') addOther(m);
    else if (m.t === 'leave') dropOther(m.id);
    else if (m.t === 'sts') for (const a of m.a) { const o = others.get(a[0]); if (o) setState(o, a.slice(1)); }
    else if (m.t === 'sign') gotSign(m);
  };
  ws.onclose = () => { me = null; for (const id of [...others.keys()]) dropOther(id); setTimeout(connect, Math.min(30000, 2000 * ++retry)); };
}
function addOther(o) {
  if (!me || o.id === me.id || others.has(o.id)) return;
  const col = hueCol(o.hue), grp = new THREE.Group();
  const model = ship.userData.model.clone(true), flames = [];
  model.traverse(x => { if (x.isMesh && x.material.blending === THREE.AdditiveBlending) { x.material = x.material.clone(); flames.push(x); } });
  grp.add(model);
  // a fixed-size coloured light, so a shuttle is findable from far away; it also blinks for the "lights" sign
  const dot = new THREE.Sprite(spriteMat(glowTex([[0, 'rgba(255,255,255,1)'], [.3, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]), { sizeAttenuation: false, color: col }));
  dot.scale.setScalar(.016); grp.add(dot);
  grp.visible = false; scene.add(grp);
  const lbl = document.createElement('div'); lbl.className = 'lbl ship'; lbl.style.color = '#' + col.getHexString(); labelsEl.appendChild(lbl);
  const b = { id: 'ship', sid: o.id, n: o.n, hue: o.hue, col, R: SHIP, grp, model, dot, flames, lbl, pos: V(), from: V(), to: V(), q: new THREE.Quaternion(), qt: new THREE.Quaternion(), t0: 0, thr: 0, seen: false, fx: {} };
  lbl.onclick = () => startAuto(b);
  others.set(o.id, b); if (o.s) setState(b, o.s);
}
function dropOther(id) {
  const b = others.get(id); if (!b) return;
  scene.remove(b.grp); b.lbl.remove(); if (b.edge) b.edge.remove();
  if (st.auto === b) { st.auto = null; updateAutoUi(); }
  others.delete(id);
}
function setState(b, s) {
  b.from.copy(b.seen ? b.pos : V(s[0], s[1], s[2])); b.to.set(s[0], s[1], s[2]); b.qt.set(s[3], s[4], s[5], s[6]); b.thr = s[7]; b.t0 = performance.now();
  if (!b.seen) { b.seen = true; b.pos.copy(b.to); b.q.copy(b.qt); b.grp.visible = true; }
}
function nearestOther() {
  let best = null, d = Infinity;
  for (const b of others.values()) if (b.seen) { const x = b.pos.distanceTo(st.pos); if (x < d) { d = x; best = b; } }
  return best ? [best, d] : null;
}
function sendState(now) {
  if (!me || ws.readyState !== 1 || now - lastSend < TICK) return; lastSend = now;
  const q = st.quat; ws.send(JSON.stringify({ t: 'st', s: [st.pos.x, st.pos.y, st.pos.z, q.x, q.y, q.z, q.w, st.dead ? 0 : st.thr] }));
}
const qRoll = new THREE.Quaternion(), ZAX = V(0, 0, 1);
// a sign's look on a ship: wings rock, lights blink, a firework bursts
function signFx(fx, k) { fx[k] = performance.now(); if (k === 'fire') fireworks(fx); }
function shipFx(fx, now, grp, dot) {
  const w = (now - (fx.wave || -1e9)) / 1000, l = (now - (fx.lights || -1e9)) / 1000;
  const roll = w < 1.8 ? Math.sin(w * 9) * .55 * (1 - w / 1.8) : 0;
  if (dot) dot.scale.setScalar(l < 1.6 && Math.floor(l * 4) % 2 === 0 ? .05 : .016);
  return roll;
}
const myFx = {};
function othersStep(now) {
  for (const b of others.values()) {
    if (!b.seen) continue;
    const k = clamp((now - b.t0) / (TICK * 1.1), 0, 1); b.pos.lerpVectors(b.from, b.to, k); b.q.slerp(b.qt, .25);
    b.grp.position.subVectors(b.pos, st.pos);
    const roll = shipFx(b.fx, now, b.grp, b.dot);
    b.model.quaternion.copy(b.q).multiply(qRoll.setFromAxisAngle(ZAX, roll));
    for (const f of b.flames) { f.scale.set(1, .15 + b.thr * (1 + Math.random() * .25), 1); f.material.opacity = .25 + b.thr * .7; }
    b.dot.material.opacity = .35 + .65 * THREE.MathUtils.smoothstep(b.pos.distanceTo(st.pos), SHIP * 20, SHIP * 400);
  }
}
function drawShipLabels() {
  const ns = nearestOther();
  for (const b of others.values()) {
    if (!b.seen || st.dead) { b.lbl.style.opacity = 0; continue; }
    proj.subVectors(b.pos, st.pos).project(camera);
    const on = proj.z <= 1 && Math.abs(proj.x) < .97 && Math.abs(proj.y) < .97;
    edgeMark(b, !on && (b === ns?.[0] || b === st.auto));
    if (b.edge) b.edge.style.color = '#' + b.col.getHexString();
    if (!on) { b.lbl.style.opacity = 0; b.lbl.style.pointerEvents = 'none'; continue; }
    b.lbl.style.opacity = 1; b.lbl.style.pointerEvents = 'auto';
    b.lbl.textContent = `${bodyName(b)}${b.bday ? ' · ★' : ''} · ${distFmt(b.pos.distanceTo(st.pos))}`;
    b.lbl.style.transform = `translate(${(proj.x * .5 + .5) * innerWidth + 10}px,${(-proj.y * .5 + .5) * innerHeight - 12}px)`;
  }
  // signs go to the nearest shuttle; the bar shows while anyone is in this place
  $('signs').hidden = !ns || st.dead || !$('menu').hidden;
  $('hNetS').hidden = !others.size; $('hNet').textContent = fmt(others.size + 1);
  if (ns) $('signTo').textContent = t('signFor', { name: bodyName(ns[0]) });
}
let lastSign = 0;
function sendSign(k) {
  const ns = nearestOther(); if (!ns || !me || performance.now() - lastSign < 1500) return; lastSign = performance.now();
  ws.send(JSON.stringify({ t: 'sign', k, to: ns[0].sid })); signFx(myFx, k);
  if (actx) beep(k === 'fire' ? 520 : 660, .08, .05);
}
for (const [id, k] of [['sWave', 'wave'], ['sLights', 'lights'], ['sFire', 'fire'], ['sFollow', 'follow']]) $(id).onclick = () => sendSign(k);
function gotSign(m) {
  const b = others.get(m.id); if (!b) return;
  signFx(b.fx, m.k);
  const mine = me && m.to === me.id, name = bodyName(b);
  if (m.k === 'bday') { b.bday = true; toast(t('gotBday', { name }), t('sWave'), () => { const ns = b; if (me) { ws.send(JSON.stringify({ t: 'sign', k: 'wave', to: ns.sid })); signFx(myFx, 'wave'); } }); return; }
  if (m.k === 'follow') { if (mine) toast(t('gotFollow', { name }), t('followBtn'), () => startAuto(b)); return; }
  const key = { wave: 'gotWave', lights: 'gotLights', fire: 'gotFire' }[m.k];
  if (mine || m.k === 'fire') toast(t(mine && m.k !== 'fire' ? key : m.k === 'fire' ? key : key + 'All', { name }));
  if (mine && actx) beep(880, .1, .05);
}
// fireworks: a burst of coloured sparks around a shuttle, drawn relative to the ship like everything else
const FW = 260, fireList = [];
function fireworks(fx) {
  const pos = new Float32Array(FW * 3), vel = new Float32Array(FW * 3), col = new Float32Array(FW * 3);
  const base = fx === myFx ? null : [...others.values()].find(b => b.fx === fx);
  const at = base ? base.pos.clone() : st.pos.clone(), c0 = new THREE.Color().setHSL(Math.random(), .9, .65), c1 = new THREE.Color().setHSL(Math.random(), .9, .7);
  for (let i = 0; i < FW; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u), sp = SHIP * (6 + Math.random() * 3);
    vel.set([r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp], i * 3); const c = i % 2 ? c0 : c1; col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  p.frustumCulled = false; scene.add(p); fireList.push({ p, vel, at, t: 0 });
}
function fireStep(dt) {
  for (let i = fireList.length - 1; i >= 0; i--) {
    const f = fireList[i]; f.t += dt; const a = f.p.geometry.attributes.position.array, drag = Math.exp(-dt * 1.2);
    for (let j = 0; j < a.length; j++) { a[j] += f.vel[j] * dt; f.vel[j] *= drag; }
    f.p.geometry.attributes.position.needsUpdate = true; f.p.position.subVectors(f.at, st.pos);
    f.p.material.opacity = Math.max(0, 1 - f.t / 2.6);
    if (f.t > 2.7) { scene.remove(f.p); f.p.geometry.dispose(); f.p.material.dispose(); fireList.splice(i, 1); }
  }
}

/* ================= your birth (date, optional time and city — all stay on this device) ================= */
// the main site may pass ?d=YYYY-MM-DD; it is saved here and removed from the address bar
let birth = (() => { try { return JSON.parse(ls.get('trav-birth')) || {}; } catch (e) { return {}; } })();
if (!birth.date && ls.get('trav-bdate')) birth.date = ls.get('trav-bdate');
if (/^\d{4}-\d{2}-\d{2}$/.test(QS.get('d') || '')) { birth.date = QS.get('d'); QS.delete('d'); try { history.replaceState(null, '', location.pathname + (QS.toString() ? '?' + QS : '')); } catch (e) {} }
const saveBirth = () => ls.set('trav-birth', JSON.stringify(birth));
saveBirth();
// the moment of birth in UTC: with a city — its local time (noon if no time), without — noon on this device's clock
function birthUtc() {
  if (!birth.date) return null; const [y, m, d] = birth.date.split('-').map(Number), [h, mi] = (birth.time || '12:00').split(':').map(Number);
  return birth.city ? zonedToUtc(y, m, d, h, mi, birth.city.tz) : new Date(y, m - 1, d, h, mi).getTime();
}
const ageDays = () => birth.date ? (Date.now() - birthUtc()) / DAY : null;
let myStar = null;
function pickStar() {
  const q = QS.get('star'); if (starById(q)) { myStar = starById(q); return; }
  myStar = birth.date ? starForAge(ageDays() / 365.25) : null;
}
function starHint() { $('starHint').textContent = myStar ? t('starHint', { name: D.stars[myStar[0]][0] }) : t('solHint'); }
$('bdate').value = birth.date || ''; $('bdate').max = new Date().toISOString().slice(0, 10);
$('bdate').addEventListener('change', () => { birth.date = $('bdate').value || undefined; saveBirth(); pickStar(); starHint(); });
pickStar(); if (starById(QS.get('star')) && birth.date) $('bday').hidden = true;

/* ================= my sky: real stars, constellations, the time machine, the honest sign, the chart ================= */
let skyData = null, skyOn = false, simTime = null, natal = null, conLabels = [];
const skyGrp = new THREE.Group(); skyGrp.visible = false; scene.add(skyGrp);
const EPS = 23.4393 * Math.PI / 180;
// J2000 equatorial (RA°, Dec°) -> direction in the game frame, where the ecliptic is the y = 0 plane
function eqDir(ra, dec, out = V()) {
  const a = ra * Math.PI / 180, d = dec * Math.PI / 180, x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  const ye = y * Math.cos(EPS) + z * Math.sin(EPS), ze = -y * Math.sin(EPS) + z * Math.cos(EPS);
  return out.set(x, ze, -ye);
}
const SKY_R = 9e7, ZODIAC = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Oph', 'Sgr', 'Cap', 'Aqr', 'Psc'];
let mineLines = null;
let skyP = null;
const loadSky = () => skyP ||= buildSky();
async function buildSky() {
  const data = await (await fetch('/data/sky.json')).json(); skyData = data;
  const s = skyData.stars, n = s.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), c = new THREE.Color(), v = V();
  for (let i = 0; i < n; i++) {
    eqDir(s[i * 4], s[i * 4 + 1], v).multiplyScalar(SKY_R); pos.set([v.x, v.y, v.z], i * 3);
    const bv = s[i * 4 + 3]; c.setRGB(bv < .3 ? .72 : 1, bv < .3 ? .82 : bv < .9 ? .92 : .74, bv < .3 ? 1 : bv < .9 ? .82 : .52); col.set([c.r, c.g, c.b], i * 3);
    size[i] = Math.max(1.2, 6.2 - s[i * 4 + 2] * .85);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: LDV[0] + `attribute float size;attribute vec3 color;varying vec3 vC;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=size*${PR.toFixed(2)};` + LDV[1] + `}`,
    fragmentShader: LDF[0] + `varying vec3 vC;void main(){` + LDF[1] + `float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vC,smoothstep(.5,.1,d));}` }));
  pts.frustumCulled = false; skyGrp.add(pts);
  const seg = id => { const out = []; for (const l of skyData.lines[id]) for (let i = 0; i + 3 < l.length; i += 2) { out.push(...eqDir(l[i], l[i + 1]).multiplyScalar(SKY_R * .99).toArray(), ...eqDir(l[i + 2], l[i + 3]).multiplyScalar(SKY_R * .99).toArray()); } return out; };
  const lineGeo = ids => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(ids.flatMap(seg), 3)); return g2; };
  const all = new THREE.LineSegments(lineGeo(Object.keys(skyData.lines).filter(k => !ZODIAC.includes(k))), new THREE.LineBasicMaterial({ color: 0x4a5a9a, transparent: true, opacity: .35, depthWrite: false }));
  const zod = new THREE.LineSegments(lineGeo(ZODIAC), new THREE.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: .6, depthWrite: false }));
  for (const l of [all, zod]) { l.frustumCulled = false; skyGrp.add(l); }
  mineLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: .95, depthWrite: false })); mineLines.frustumCulled = false; skyGrp.add(mineLines);
  skyGrp.userData.seg = seg;
  for (const id of ZODIAC) { const el = document.createElement('div'); el.className = 'con'; labelsEl.appendChild(el); conLabels.push({ id, el, dir: eqDir(skyData.names[id][3], skyData.names[id][4]) }); }
  markMine(); return skyData;
}
function markMine() {
  if (!mineLines || !natal) return;
  mineLines.geometry.dispose(); mineLines.geometry = new THREE.BufferGeometry();
  mineLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(skyGrp.userData.seg(natal.sunCon), 3));
}
async function setSky(on) { skyOn = on; if (on) await loadSky(); skyGrp.visible = skyOn && space !== 'hole'; sky.material.color.set(skyOn ? 0x2a2a38 : 0x8a8aa0); }
const conName = id => skyData?.names[id] ? skyData.names[id][lang === 'ru' ? 0 : 1] : id;
const signName = i => D.signs[i];
function drawConLabels() {
  const [nb, alt] = nearest(), close = alt < nb.R * 2.5; // a planet filling the view hides the sky labels behind it
  for (const c of conLabels) {
    const show = skyGrp.visible && !close; proj.copy(c.dir).multiplyScalar(SKY_R).project(camera);
    if (!show || proj.z > 1 || Math.abs(proj.x) > .98 || Math.abs(proj.y) > .98) { c.el.style.opacity = 0; continue; }
    c.el.style.opacity = 1; c.el.textContent = conName(c.id); c.el.classList.toggle('mine', natal?.sunCon === c.id);
    c.el.style.transform = `translate(${(proj.x * .5 + .5) * innerWidth}px,${(-proj.y * .5 + .5) * innerHeight}px) translate(-50%,-50%)`;
  }
}
// turn the ship toward the constellation the Sun stood in when you were born
const CONB = { id: 'con', R: 0, pos: V(), dir: V() };
async function aimSunCon() {
  await setSky(true); const n = skyData.names[natal.sunCon]; eqDir(n[3], n[4], CONB.dir); CONB.pos.copy(st.pos).addScaledVector(CONB.dir, 1e9);
  st.auto = null; st.aim = CONB; updateAutoUi(); $('me').hidden = true;
}
// the time machine: the planets go back to where they were the day you were born
function timeMachine(on) {
  simTime = on ? birthUtc() : null; $('timeBar').hidden = !on;
  if (on) { $('timeT').textContent = t('timeOn', { date: new Date(simTime).toLocaleDateString(D._locale, { day: 'numeric', month: 'long', year: 'numeric' }) }); if (space !== 'sol') setSpace('sol'); setSky(true); }
  $('me').hidden = true;
}
$('timeBack').onclick = () => timeMachine(false);
const moonPhaseName = p => D.phases[Math.round(p / 45) % 8];
function renderMe() {
  if (!skyData) { loadSky().then(renderMe); }
  const box = $('meBody'); natal = birth.date ? chart(birthUtc(), birth.city?.lat, birth.city?.lon) : null; markMine();
  $('meDate').value = birth.date || ''; $('meTime').value = birth.time || ''; $('meCity').value = birth.city?.name || '';
  $('meNote').textContent = birth.city ? t('meCityOk', { city: birth.city.name }) : t('meCityHint');
  if (!natal) { box.innerHTML = `<p class="me-empty">${t('meEmpty')}</p>`; return; }
  const c = natal, sign = c.sun.sign, conId = c.sunCon, same = SIGNS[sign] === conId;
  const honest = t('signIs', { sign: signName(sign) }) + ' ' + (conId === 'Oph' ? t('conOph') : same ? t('conSame', { con: conName(conId) }) : t('conDiff', { con: conName(conId) }));
  const ord = n => lang === 'ru' ? `${Math.floor(n)}°` : `${Math.floor(n)}°`;
  const rows = c.planets.map(p => `<li><b>${GLYPH[p.id]}︎ ${D.pl[p.id]}</b> ${t('inSign', { sign: signName(p.sign) })} ${ord(p.deg)}${p.retro ? ' ℞' : ''}<span>${D.roles[p.id]}: ${D.traits[p.sign]}</span></li>`).join('')
    + (c.asc != null ? `<li><b>ASC ${t('asc')}</b> ${t('inSign', { sign: signName(Math.floor(c.asc / 30)) })} ${ord(c.asc % 30)}<span>${D.roles.asc}: ${D.traits[Math.floor(c.asc / 30)]}</span></li>` : '');
  const days = ageDays(), pb = PLANETS.map(p => {
    const per = p[3], age = days / per, next = (Math.floor(age) + 1 - age) * per, dt = new Date(Date.now() + next * DAY);
    return `<tr><td>${D.bodies[p[0]]}</td><td>${fmt(age, age < 10 ? 1 : 0)}</td><td>${next < 1 ? t('todayBd') : dt.toLocaleDateString(D._locale, { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>`;
  }).join('');
  box.innerHTML = `
    <section><h3>${t('meSign')}</h3><p class="big">${SIGN_GLYPH[sign]} ${signName(sign)}</p><p>${honest}</p><p class="dim">${t('signTrait', { trait: D.traits[sign] })}</p>
      <button type="button" class="btn ghost" id="meAim">${t('meAim', { con: conName(conId) })}</button></section>
    <section><h3>${t('meSky')}</h3>
      <p>${t('moonWas', { phase: moonPhaseName(c.phase), lit: Math.round(c.lit * 100) })}</p>
      ${c.bright ? `<p>${t(c.bright.morning ? 'brightMorning' : 'brightEvening', { name: D.bodies[c.bright.id] })}</p>` : ''}
      <button type="button" class="btn" id="meTime2">${t('timeBtn')}</button></section>
    <section><h3>${t('meChart')}</h3><div class="wheel">${wheelSVG(c, 320)}</div><ul class="pl">${rows}</ul>
      <button type="button" class="btn ghost" id="meSave">${t('saveChart')}</button><p class="dim">${t('astroNote')}</p></section>
    <section><h3>${t('meBd')}</h3><table class="bd"><tr><th></th><th>${t('bdAge')}</th><th>${t('bdNext')}</th></tr>${pb}</table></section>`;
  $('meAim').onclick = aimSunCon; $('meTime2').onclick = () => timeMachine(true); $('meSave').onclick = () => saveChart(c);
}
// the chart as a picture to keep or send: the wheel on a dark card with the date and the honest sign
async function saveChart(c) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = '#04050c'; x.fillRect(0, 0, W, H);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wheelSVG(c, 900)); await img.decode();
  x.drawImage(img, 90, 250, 900, 900);
  x.fillStyle = '#e2dff7'; x.font = '700 64px Unbounded, sans-serif'; x.fillText(t('chartTitle'), 90, 130);
  x.fillStyle = '#9a97c2'; x.font = '500 34px "Golos Text", sans-serif';
  x.fillText(new Date(birthUtc()).toLocaleDateString(D._locale, { day: 'numeric', month: 'long', year: 'numeric' }) + (birth.city ? ' · ' + birth.city.name.split(',')[0] : ''), 90, 195);
  x.fillStyle = '#ffb454'; x.font = '600 36px "Golos Text", sans-serif';
  x.fillText(`☉ ${signName(c.sun.sign)}  ☽ ${signName(c.planets[1].sign)}` + (c.asc != null ? `  ASC ${signName(Math.floor(c.asc / 30))}` : ''), 90, 1230);
  x.fillStyle = '#9a97c2'; x.font = '500 28px "Golos Text", sans-serif'; x.fillText('traveler.tomerisr.org.il', 90, 1290);
  cv.toBlob(async b => {
    const f = new File([b], 'chart.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) {} }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'chart.png'; a.click();
  });
}
$('bMe').onclick = () => { renderMe(); $('me').hidden = false; };
$('meX').onclick = () => $('me').hidden = true;
$('me').addEventListener('click', e => { if (e.target.id === 'me') $('me').hidden = true; });
$('meDate').max = new Date().toISOString().slice(0, 10);
$('meDate').addEventListener('change', () => { birth.date = $('meDate').value || undefined; saveBirth(); pickStar(); renderMe(); });
$('meTime').addEventListener('change', () => { birth.time = $('meTime').value || undefined; saveBirth(); renderMe(); });
let cityT = 0;
$('meCity').addEventListener('input', () => {
  clearTimeout(cityT); const q = $('meCity').value.trim(); $('meCities').innerHTML = '';
  if (q.length < 2) { if (!q && birth.city) { birth.city = undefined; saveBirth(); renderMe(); } return; }
  cityT = setTimeout(async () => {
    let list = []; try { list = await findCity(q, lang); } catch (e) {}
    $('meCities').innerHTML = ''; for (const c of list) { const b = document.createElement('button'); b.type = 'button'; b.textContent = c.name; b.onclick = () => { birth.city = c; saveBirth(); $('meCities').innerHTML = ''; renderMe(); }; $('meCities').appendChild(b); }
  }, 400);
});
// on your birthday: fireworks, and everyone on air hears about it
const isBirthday = () => { if (!birth.date) return false; const n = new Date(); return birth.date.slice(5) === `${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
let bdDone = false;
function celebrate() {
  if (bdDone || !isBirthday()) return; bdDone = true;
  const years = Math.floor(ageDays() / 365.25);
  toast(t('hbd', { n: years })); [0, 700, 1500, 2400].forEach(ms => setTimeout(() => signFx(myFx, 'fire'), ms));
  setTimeout(() => { if (me && ws.readyState === 1) ws.send(JSON.stringify({ t: 'sign', k: 'bday', to: 0 })); }, 3000);
}

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
  starHint(); if (!$('me').hidden) renderMe();
  $('home').href = 'https://cosmos.tomerisr.org.il/' + (qLang === 'he' ? 'he/' : l === 'en' ? 'en/' : '');
}
LANGS.forEach(l => { const b = document.createElement('button'); b.type = 'button'; b.dataset.l = l; b.textContent = I18N[l]._name; b.onclick = () => applyLang(l); $('langs').appendChild(b); });
applyLang(lang);
$('bGo').onclick = () => { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} $('intro').hidden = true; ['hud', 'ctl', 'throttle'].forEach(id => $(id).hidden = false); setThrUi();
  if (!netOn) connect();
  if (QS.get('go') === 'hole') warp('hole'); else if (myStar) setSpace(myStar[0]);
  setTimeout(celebrate, 1500); };

/* ================= loop ================= */
const uniformsOf = b => b.mesh.material.uniforms;
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  placeBodies(simTime ?? Date.now());
  if (!st.dead) keyInput(dt); else { st.yaw = st.pitch = st.roll = 0; st.thr = 0; }
  const [nb, alt] = st.dead ? nearest() : flyStep(dt);
  const danger = $('hud').hidden || space === 'hole' ? 0 : heat(dt, now); boomStep(dt);
  if (space === 'hole' && !$('hud').hidden && !warping) { shipSec += dt; earthSec += dt * dil(); }
  othersStep(now); fireStep(dt); if (!$('hud').hidden && !warping) sendState(now);
  // floating origin: everything relative to the ship
  sun.position.subVectors(sunBody.pos, st.pos); sunGlow.position.copy(sun.position); sunStar.position.copy(sun.position); sunLight.position.copy(sun.position);
  sun.material.uniforms.uTime.value = now / 1000; sun.material.uniforms.uNear.value = 1 - THREE.MathUtils.smoothstep(sun.position.length() / heatBody().R, 1.1, 2.5);
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
  sunStar.material.opacity = THREE.MathUtils.smoothstep(sun.position.length() / heatBody().R, 30, 200);
  sky.position.set(0, 0, 0);
  for (const f of ship.userData.flames) { f.scale.set(1, .15 + st.thr * (1 + Math.random() * .25), 1); f.material.opacity = .25 + st.thr * .7; }
  placeCamera(dt, danger);
  ship.userData.model.quaternion.setFromAxisAngle(ZAX, shipFx(myFx, now));
  if (space === 'hole') {
    // the hole is drawn by the ray tracer, the shuttle on top of it, lit from the disc
    sunLight.position.copy(st.pos).negate();
    camera.updateMatrixWorld(); const e = camera.matrixWorld.elements, u = bhMat.uniforms;
    u.uRt.value.set(e[0], e[1], e[2]); u.uUp.value.set(e[4], e[5], e[6]); u.uFw.value.set(-e[8], -e[9], -e[10]);
    u.uRo.value.copy(st.pos).divideScalar(RS); u.uTime.value = now / 1000;
    u.uTan.value = Math.tan(camera.fov * Math.PI / 360); u.uAsp.value = camera.aspect;
    renderer.setRenderTarget(bhRT); renderer.render(bhScene, qcam); renderer.setRenderTarget(null);
    renderer.render(outScene, qcam); renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, camera); renderer.autoClear = true;
  } else renderer.render(scene, camera);
  CONB.pos.copy(st.pos).addScaledVector(CONB.dir, 1e9);
  if (!$('hud').hidden) { hud(nb, alt); drawLabels(nb); drawShipLabels(); drawConLabels();
    proj.copy(CONB.dir).project(camera); edgeMark(CONB, st.aim === CONB && !(proj.z <= 1 && Math.abs(proj.x) < .97 && Math.abs(proj.y) < .97)); }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { mob = innerWidth < 760; renderer.setSize(innerWidth, innerHeight, false); sizeBH(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
requestAnimationFrame(frame);
// for tests: put the ship at k radii from a body and face it
function look(id, k = 3, side = .6, up = .25) {
  const b = ALL.find(x => x.id === id), dir = (b.id === 'sun' ? P.earth.pos.clone() : b.pos.clone().negate()).normalize().applyAxisAngle(V(0, 1, 0), side);
  st.pos.copy(b.pos).addScaledVector(dir, b.R * k).addScaledVector(V(0, 1, 0), b.R * up); st.vel.set(0, 0, 0); st.thr = 0; st.auto = null;
  st.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(st.pos, b.pos.clone().addScaledVector(V(0, 1, 0).cross(dir).normalize(), b.R * .35), V(0, 1, 0))); camQ.copy(st.quat);
}
// at the hole: put the ship k horizon radii out, h radii above the disc, facing the hole (r = 1 + x)
function holeAt(k = 20, h = 1.5) { st.pos.set(0, RS * h, RS * k); st.vel.set(0, 0, 0); st.thr = 0; st.auto = null; st.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(st.pos, V(), V(0, 1, 0))); camQ.copy(st.quat); }
window.__trav = { st, P, get ALL() { return ALL; }, startAuto, look, warp, setSpace, holeAt, dil, others, sendSign, get me() { return me; }, get space() { return space; } };
