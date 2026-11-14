import * as THREE from 'three';
import { mat, rand, hash3, colorFaces, rock, vcMat } from './utils.js';

// fator de escala da ilha (1 = tamanho original). A ilha inteira é escalada por igual,
// então as proporções entre suas partes não mudam. Câmeras e trajeto do Mario acompanham.
export const ISLAND_SCALE = 6.5;

// contorno ondulado da borda (raio em função do ângulo)
const outline = (t) => 5 + 0.25 * Math.sin(5 * t) + 0.15 * Math.sin(9 * t + 1) + 0.1 * Math.sin(13 * t + 2);

// mantém um ponto (x, z do mundo) dentro da grama da ilha, deixando uma margem até a borda
export function clampToIsland(pos, margin = 0.5) {
  const t = Math.atan2(-pos.z, pos.x); // a forma foi extrudada e girada: o ângulo do mundo é invertido em z
  const maxR = (outline(t) + 0.1) * ISLAND_SCALE - margin; // +0.1: a grama sobra um pouco do contorno
  const r = Math.hypot(pos.x, pos.z);
  if (r > maxR) { pos.x *= maxR / r; pos.z *= maxR / r; }
  return pos;
}

// ---------------------------------------------------------------------------------------------
// Relevo. Os morros são "montinhos" suaves (gaussianas) somados. Medidas em unidades locais da ilha
// (antes da escala): x, z = centro; r = largura do morro; h = altura no topo. A altura vai a zero
// perto da borda, para o terreno encontrar a lateral da ilha sem degrau.
// ---------------------------------------------------------------------------------------------
const HILLS = [
  { x: -1.9, z: -1.4, r: 2.0, h: 0.75, name: 'peach' },
  { x:  2.3, z:  1.1, r: 1.4, h: 0.48, name: '' },
  { x: -0.2, z:  2.9, r: 1.1, h: 0.34, name: 'luigi' },
  { x:  3.0, z: -2.3, r: 1.2, h: 0.29, name: 'toad' },
  { x: -3.0, z:  1.8, r: 1.0, h: 0.21, name: '' },
];

// soma dos morros (sem platô nem borda)
function hillSum(x, z) {
  let h = 0;
  for (const m of HILLS) {
    const dx = x - m.x, dz = z - m.z;
    h += m.h * Math.exp(-(dx * dx + dz * dz) / (m.r * m.r));
  }
  return h;
}

// Castelo da Peach: no morro marcado com name: 'peach', virado para o centro da ilha.
// width/depth em unidades do MUNDO (o castelo é escalado para ter essa largura; ver castle.js).
const PEAK = HILLS.find((h) => h.name === 'peach');
const CASTLE_WIDTH = 15;
export const CASTLE_SITE = {
  x: PEAK.x * ISLAND_SCALE,
  z: PEAK.z * ISLAND_SCALE,
  yaw: Math.atan2(-PEAK.x, -PEAK.z),          // frente (+Z do modelo) apontando para o centro da ilha
  width: CASTLE_WIDTH,
  depth: CASTLE_WIDTH * (202.3 / 265.3),       // proporção do modelo (largura x profundidade)
};

// Colisão do castelo. Ele é só decorativo: o Mario não entra. São retângulos alinhados ao castelo
// que cobrem as paredes, medidos na planta do modelo (formato de "H": ala de trás, corpo central e
// ala da frente; as reentrâncias laterais ficam livres). Coordenadas normalizadas pela largura do
// castelo, com origem no centro: u = direita, v = frente (+Z do modelo, onde fica a porta).
// Para ver as caixas na tela, abra a página com ?colliders no endereço.
const CASTLE_BOXES_UV = [
  { u0: -0.5,   u1: 0.5,   v0: -0.381, v1: -0.18  }, // ala de trás
  { u0: -0.323, u1: 0.319, v0: -0.18,  v1: 0.135  }, // corpo central
  { u0: -0.5,   u1: 0.5,   v0: 0.135,  v1: 0.381  }, // ala da frente
];
// mesmos retângulos em unidades do mundo, no referencial do castelo (x = direita, z = frente)
export const CASTLE_COLLIDERS = CASTLE_BOXES_UV.map((b) => ({
  x0: b.u0 * CASTLE_WIDTH, x1: b.u1 * CASTLE_WIDTH, z0: b.v0 * CASTLE_WIDTH, z1: b.v1 * CASTLE_WIDTH,
}));

// Empurra um ponto (x, z do mundo) para fora do castelo, tratando o Mario como um círculo de raio
// `radius`. O empurrão sai pela normal da parede, então ele desliza ao longo dela em vez de travar.
export function collideWithCastle(pos, radius = 0.35) {
  const c = Math.cos(CASTLE_SITE.yaw), s = Math.sin(CASTLE_SITE.yaw);
  // mundo -> referencial do castelo (mesma rotação usada em heightLocal)
  const dx = pos.x - CASTLE_SITE.x, dz = pos.z - CASTLE_SITE.z;
  let lx = dx * c - dz * s, lz = dx * s + dz * c;
  let hit = false;
  for (let pass = 0; pass < 2; pass++) { // 2 passadas: um canto entre dois retângulos pode empurrar para o outro
    for (const r of CASTLE_COLLIDERS) {
      const qx = THREE.MathUtils.clamp(lx, r.x0, r.x1), qz = THREE.MathUtils.clamp(lz, r.z0, r.z1); // ponto do retângulo mais perto
      const nx = lx - qx, nz = lz - qz, d = Math.hypot(nx, nz);
      if (d >= radius) continue;
      hit = true;
      if (d > 1e-6) { lx = qx + (nx / d) * radius; lz = qz + (nz / d) * radius; }
      else { // centro já dentro do retângulo (não deveria acontecer): sai pela face mais próxima
        const out = [lx - r.x0, r.x1 - lx, lz - r.z0, r.z1 - lz];
        const k = out.indexOf(Math.min(...out));
        if (k === 0) lx = r.x0 - radius; else if (k === 1) lx = r.x1 + radius;
        else if (k === 2) lz = r.z0 - radius; else lz = r.z1 + radius;
      }
    }
  }
  if (hit) { // referencial do castelo -> mundo
    pos.x = CASTLE_SITE.x + lx * c + lz * s;
    pos.z = CASTLE_SITE.z - lx * s + lz * c;
  }
  return pos;
}

// Casa do Toad: no morro marcado com name: 'toad', virada para o centro da ilha. A origem do modelo é o
// centro da casa; a base redonda (com o caminho na frente) tem 849 x 960 unidades do modelo.
const TOAD_HILL = HILLS.find((h) => h.name === 'toad');
const TOAD_WIDTH = 5.5; // diâmetro da base da casa em unidades do MUNDO (ver toadhouse.js)
const TOAD_SCALE = TOAD_WIDTH / 848.8; // unidades do modelo -> mundo
export const TOAD_SITE = {
  x: TOAD_HILL.x * ISLAND_SCALE,
  z: TOAD_HILL.z * ISLAND_SCALE,
  yaw: Math.atan2(-TOAD_HILL.x, -TOAD_HILL.z), // frente (+Z do modelo: porta e caminho) para o centro da ilha
  width: TOAD_WIDTH,
  depth: TOAD_WIDTH * (960.4 / 848.8),
  scale: TOAD_SCALE,                            // fator de escala do modelo (unidades do modelo -> mundo)
  // colisão: a casa é decorativa e é bloqueada inteira. A forma é a união de dois pedaços, medidos no modelo:
  //  - um círculo com a base redonda toda (raio 424 no modelo; o chapéu sozinho tem 364)
  //  - um retângulo na frente com a escada e o caminho (meia-largura 212, do centro até z = 536 no modelo)
  colliderRadius: 424 * TOAD_SCALE,
  stairs: { halfW: 212 * TOAD_SCALE, zEnd: 536 * TOAD_SCALE },
};

// Empurra um ponto (x, z do mundo) para fora de uma casa "círculo + escada" (casa do Toad ou do Luigi),
// tratando o Mario como um círculo de raio `radius`. O empurrão sai pela normal, então ele contorna a casa
// em vez de travar. `site` precisa de x, z, yaw, colliderRadius e stairs { halfW, zEnd }.
function collideRoundHouse(site, pos, radius) {
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  // mundo -> referencial da casa (mesma rotação usada em heightLocal): lx = direita, lz = frente (escada)
  const dx = pos.x - site.x, dz = pos.z - site.z;
  let lx = dx * c - dz * s, lz = dx * s + dz * c;
  const { colliderRadius: R, stairs: st } = site;
  let hit = false;
  for (let pass = 0; pass < 3; pass++) { // várias passadas: no canto entre o círculo e a escada um empurrão pode levar ao outro
    // 1) base redonda
    const d = Math.hypot(lx, lz), min = R + radius;
    if (d < min) {
      hit = true;
      if (d > 1e-6) { lx *= min / d; lz *= min / d; } else lx = min; // exatamente no centro: sai por um lado qualquer
    }
    // 2) escada: retângulo da frente (o lado de trás, z = 0, fica dentro do círculo)
    const qx = THREE.MathUtils.clamp(lx, -st.halfW, st.halfW), qz = THREE.MathUtils.clamp(lz, 0, st.zEnd); // ponto do retângulo mais perto
    const nx = lx - qx, nz = lz - qz, e = Math.hypot(nx, nz);
    if (e < radius) {
      hit = true;
      if (e > 1e-6) { lx = qx + (nx / e) * radius; lz = qz + (nz / e) * radius; }
      else { // centro já dentro do retângulo (não deveria acontecer): sai pela face mais próxima
        const out = [lx + st.halfW, st.halfW - lx, st.zEnd - lz]; // esquerda, direita, frente
        const k = out.indexOf(Math.min(...out));
        if (k === 0) lx = -st.halfW - radius; else if (k === 1) lx = st.halfW + radius; else lz = st.zEnd + radius;
      }
    }
  }
  if (hit) { // referencial da casa -> mundo
    pos.x = site.x + lx * c + lz * s;
    pos.z = site.z - lx * s + lz * c;
  }
  return pos;
}
export const collideWithToadHouse = (pos, radius = 0.35) => collideRoundHouse(TOAD_SITE, pos, radius);

// Casa do Luigi: no morro marcado com name: 'luigi', virada para o centro da ilha. Modelo em .obj com
// ~10 x 11 x 10 unidades; o pivô e a rotação que põem a frente em +Z estão em luigihouse.js.
const LUIGI_HILL = HILLS.find((h) => h.name === 'luigi');
const LUIGI_SCALE = 0.5; // unidades do modelo -> mundo (a casa fica com ~5,6 de altura)
export const LUIGI_SITE = {
  x: LUIGI_HILL.x * ISLAND_SCALE,
  z: LUIGI_HILL.z * ISLAND_SCALE,
  yaw: Math.atan2(-LUIGI_HILL.x, -LUIGI_HILL.z), // frente (+Z do modelo: porta e degraus) para o centro da ilha
  scale: LUIGI_SCALE,
  // colisão: a casa é decorativa e é bloqueada inteira, medida no modelo a partir do pivô (centro das paredes):
  //  - um círculo com as paredes e o beiral do telhado (raio 4,4; as paredes sozinhas têm 3,7)
  //  - um retângulo na frente com a varanda e os degraus (meia-largura 2,9, do centro até z = 5,2)
  colliderRadius: 4.4 * LUIGI_SCALE,
  stairs: { halfW: 2.9 * LUIGI_SCALE, zEnd: 5.2 * LUIGI_SCALE },
};
export const collideWithLuigiHouse = (pos, radius = 0.35) => collideRoundHouse(LUIGI_SITE, pos, radius);

// Platôs: o terreno fica plano sob cada construção (retângulo + margem) e se mistura aos morros em volta.
// Altura do platô = altura do topo do morro, então o morro não cresce nem encolhe.
// x, z, yaw, hw, hd e blend em unidades LOCAIS da ilha; hw = meia-largura, hd = meia-profundidade.
const PLATEAUS = [
  { // castelo
    x: PEAK.x, z: PEAK.z, yaw: CASTLE_SITE.yaw,
    hw: CASTLE_SITE.width / 2 / ISLAND_SCALE + 0.15,
    hd: CASTLE_SITE.depth / 2 / ISLAND_SCALE + 0.17,
    blend: 1.3, // largura da rampa até o morro natural
    h: hillSum(PEAK.x, PEAK.z),
  },
  { // casa do Toad: cobre a base redonda e o caminho da frente
    x: TOAD_HILL.x, z: TOAD_HILL.z, yaw: TOAD_SITE.yaw,
    hw: TOAD_SITE.width / 2 / ISLAND_SCALE + 0.2,
    hd: TOAD_SITE.depth / 2 / ISLAND_SCALE + 0.2,
    blend: 0.8,
    h: hillSum(TOAD_HILL.x, TOAD_HILL.z),
  },
  { // casa do Luigi: cobre o círculo das paredes e a escada da frente
    x: LUIGI_HILL.x, z: LUIGI_HILL.z, yaw: LUIGI_SITE.yaw,
    hw: LUIGI_SITE.colliderRadius / ISLAND_SCALE + 0.15,
    hd: LUIGI_SITE.stairs.zEnd / ISLAND_SCALE + 0.15,
    blend: 0.8,
    h: hillSum(LUIGI_HILL.x, LUIGI_HILL.z),
  },
];

function heightLocal(x, z) {
  let h = hillSum(x, z);
  for (const p of PLATEAUS) {
    // posição no referencial da construção (rodado por yaw): lx = largura, lz = frente
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const sd = Math.hypot(Math.max(Math.abs(lx) - p.hw, 0), Math.max(Math.abs(lz) - p.hd, 0)); // distância ao retângulo
    const w = 1 - THREE.MathUtils.smoothstep(sd, 0, p.blend); // 1 sob a construção, 0 longe
    h = THREE.MathUtils.lerp(h, p.h, w);
  }
  const u = Math.hypot(x, z) / (outline(Math.atan2(-z, x)) + 0.1); // 0 no centro, 1 na borda da grama
  return h * (1 - THREE.MathUtils.smoothstep(u, 0.84, 0.97));      // zero na borda: emenda com a lateral
}

// altura do chão em um ponto (x, z) do mundo; usada para o Mario andar e pular sobre o relevo
export function groundHeight(x, z) {
  return heightLocal(x / ISLAND_SCALE, z / ISLAND_SCALE) * ISLAND_SCALE;
}

// malha do terreno: grade polar (anéis x segmentos) que segue o contorno ondulado da ilha
function buildTerrain() {
  const NR = 64, NS = 160; // anéis e segmentos
  const pos = [0, heightLocal(0, 0), 0]; // vértice 0 = centro
  for (let i = 1; i <= NR; i++) {
    for (let j = 0; j < NS; j++) {
      const t = (j / NS) * Math.PI * 2;
      const R = (outline(t) + 0.1) * (i / NR);      // +0.1: mesmo contorno da tampa de grama
      const x = Math.cos(t) * R, z = -Math.sin(t) * R; // mesma convenção da laje (girada em X)
      pos.push(x, heightLocal(x, z), z);
    }
  }
  const ring = (i, j) => 1 + (i - 1) * NS + (j % NS); // índice do vértice do anel i (1..NR), segmento j
  const idx = [];
  for (let j = 0; j < NS; j++) idx.push(0, ring(1, j), ring(1, j + 1)); // leque do centro
  for (let i = 2; i <= NR; i++) {
    for (let j = 0; j < NS; j++) {
      const a = ring(i - 1, j), b = ring(i - 1, j + 1), c = ring(i, j), d = ring(i, j + 1);
      idx.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat(0x6cc644, { flatShading: false })); // sombreamento suave: morros arredondados
}

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

export function createIsland() {
  const group = new THREE.Group();          // fica sem escala: o Mario é filho dele
  const body = new THREE.Group();           // a ilha em si, escalada por igual
  body.scale.setScalar(ISLAND_SCALE);
  group.add(body);

  // borda de grama (ondulada + chanfro) e camada de terra
  const grassGeo = slabGeo(0.1, 0.3, 0.1);
  // desenha só a lateral da laje: o topo plano ficaria escondido dentro dos morros
  const sides = grassGeo.groups.find((g) => g.materialIndex === 1);
  grassGeo.clearGroups();
  grassGeo.setDrawRange(sides.start, sides.count);
  const grass = new THREE.Mesh(grassGeo, mat(0x6cc644));
  grass.position.y = -0.4;                       // topo em y = 0
  const dirt = new THREE.Mesh(slabGeo(-0.15, 0.35, 0.08), mat(0x8b5a3c));
  dirt.position.y = -0.88;
  body.add(grass, dirt, buildTerrain());

  buildRockyBase(body);
  const floating = buildFloatingRocks(body);

  return {
    group,
    update(t) {
      floating.forEach((r) => {
        r.position.y = r.userData.y0 + Math.sin(t + r.userData.ph) * 0.2;
        r.rotation.y = t * r.userData.sp;
      });
    },
  };
}