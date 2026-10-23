import * as THREE from 'three';
import { mat, mesh, rand, hash3, colorFaces, rock, vcMat } from './utils.js';

// fator de escala da ilha (1 = tamanho original). A ilha inteira é escalada por igual,
// então as proporções entre suas partes não mudam. Câmeras e trajeto do Mario acompanham.
export const ISLAND_SCALE = 6.5;

// contorno ondulado da borda (raio em função do ângulo)
const outline = (t) => 5 + 0.25 * Math.sin(5 * t) + 0.15 * Math.sin(9 * t + 1) + 0.1 * Math.sin(13 * t + 2);

// laje com o contorno ondulado, extrudada e com chanfro
function slabGeo(grow, depth, bevel) {
  const s = new THREE.Shape();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2, r = outline(t) + grow;
    const x = Math.cos(t) * r, y = Math.sin(t) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2); // extrusão passa a crescer em +Y
  return g;
}

// perfil da parte rochosa: [raio, y relativo ao topo da rocha]
const PROFILE = [[4.55, 0], [4.8, -0.6], [4.3, -1.7], [3.5, -2.9], [2.6, -4.1], [1.6, -5.1], [0.7, -5.9], [0, -6.4]];
const ROCK_TOP = -0.9;

function profileR(d) { // raio do perfil a uma profundidade d abaixo do topo
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const y0 = -PROFILE[i][1], y1 = -PROFILE[i + 1][1];
    if (d >= y0 && d <= y1) return THREE.MathUtils.lerp(PROFILE[i][0], PROFILE[i + 1][0], (d - y0) / (y1 - y0));
  }
  return 0;
}

function buildRockyBase(group) {
  const pts = PROFILE.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const top = y < -0.1;
    const f = 1 + (hash3(x, y, z, 1) - 0.5) * (top ? 0.4 : 0.1);
    y += top ? (hash3(x, y, z, 2) - 0.5) * 0.6 : 0;
    p.setXYZ(i, x * f, y, z * f);
  }
  const col = new THREE.Color(0x5a3829);
  const body = new THREE.Mesh(colorFaces(g, (c, cen) => {
    const t = THREE.MathUtils.clamp(-cen.y / 6.4, 0, 1);
    c.set(0xa86a4a).lerp(col, t).offsetHSL(0, 0, (rand() - 0.5) * 0.14);
    if (rand() < 0.12) c.multiplyScalar(0.75); // frestas escuras
  }), vcMat({ side: THREE.DoubleSide }));
  body.position.y = ROCK_TOP;
  group.add(body);

  // blocos salientes: anel junto da borda (mais detalhe) + espalhados pelo corpo + pontas penduradas
  const chunk = (d, size, rScale, color) => {
    const a = rand() * Math.PI * 2, r = profileR(d) * rScale;
    const m = rock(size, color);
    m.position.set(Math.cos(a) * r, ROCK_TOP - d, Math.sin(a) * r);
    m.scale.set(1, 0.8 + rand() * 0.7, 1);
    m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    group.add(m);
  };
  for (let i = 0; i < 16; i++) chunk(0.1 + rand() * 1.1, 0.35 + rand() * 0.35, 1.0, 0xb06f4e);
  for (let i = 0; i < 16; i++) chunk(1 + rand() * 4.2, 0.35 + rand() * 0.6, 0.93, 0x8f573f);
  for (let i = 0; i < 5; i++) {
    const m = rock(0.3 + rand() * 0.2, 0x6b4332);
    m.position.set((rand() - 0.5) * 1.2, ROCK_TOP - 6 - rand() * 0.6, (rand() - 0.5) * 1.2);
    m.scale.y = 1.8;
    group.add(m);
  }
}

function buildFloatingRocks(parent) {
  const rocks = [];
  for (let i = 0; i < 8; i++) {
    const m = rock(0.2 + rand() * 0.35, 0x8a5040, { jitter: 0.35 });
    const a = rand() * Math.PI * 2, r = 1 + rand() * 3.5;
    m.position.set(Math.cos(a) * r, -7.3 - rand() * 2.5, Math.sin(a) * r);
    m.userData = { y0: m.position.y, ph: rand() * 6, sp: 0.3 + rand() * 0.6 };
    parent.add(m);
    rocks.push(m);
  }
  return rocks;
}

function buildPond(parent) {
  const rim = mesh(new THREE.RingGeometry(1.2, 1.5, 7, 1), 0x9a8c80, [-0.8, 0.03, 1.2]);
  rim.rotation.x = -Math.PI / 2;
  const water = mesh(new THREE.CircleGeometry(1.3, 24), 0x4fb4ff, [-0.8, 0.04, 1.2],
    { transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  water.rotation.x = -Math.PI / 2;
  parent.add(rim, water);
  return water;
}

export function createIsland() {
  const group = new THREE.Group();          // fica sem escala: o Mario é filho dele
  const body = new THREE.Group();           // a ilha em si, escalada por igual
  body.scale.setScalar(ISLAND_SCALE);
  group.add(body);

  // tampa de grama (borda ondulada + chanfro) e camada de terra
  const grass = new THREE.Mesh(slabGeo(0.1, 0.3, 0.1), mat(0x6cc644));
  grass.position.y = -0.4;                       // topo em y = 0
  const dirt = new THREE.Mesh(slabGeo(-0.15, 0.35, 0.08), mat(0x8b5a3c));
  dirt.position.y = -0.88;
  body.add(grass, dirt);

  buildRockyBase(body);
  const water = buildPond(body);
  const floating = buildFloatingRocks(body);

  return {
    group,
    update(t) {
      floating.forEach((r) => {
        r.position.y = r.userData.y0 + Math.sin(t + r.userData.ph) * 0.2;
        r.rotation.y = t * r.userData.sp;
      });
      water.material.opacity = 0.82 + Math.sin(t * 2) * 0.05;
    },
  };
}