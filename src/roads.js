import * as THREE from 'three';
import { ROADS, ROAD_WIDTH, ROAD_LIFT, PLAZA_RADIUS, groundHeight } from './island.js';

// ----------------------------------------------------------------------------------------------------------
// ESTRADAS DE TERRA: faixas que seguem o relevo, montadas a partir das linhas centrais de island.js (ROADS), mais a
// pracinha redonda no centro. Cada faixa tem 4 vértices na largura: as duas bordas saem um pouco esverdeadas, como
// terra misturada com grama, e o miolo é cor de terra. A largura varia um pouco ao longo do caminho (borda irregular).
// Ficam um tiquinho acima do terreno e com polygonOffset, para não "piscar" disputando o z-buffer com a grama.
// Na pracinha, a ordem (de baixo para cima) é: borda esverdeada da praça, estradas, miolo de terra da praça. As
// estradas começam dentro da praça, então o encontro delas fica escondido embaixo do miolo.
// ----------------------------------------------------------------------------------------------------------

const LIFT = ROAD_LIFT;                // altura acima do chão (os personagens pisam nessa altura: standHeight)
const DIRT = new THREE.Color(0xd9b277); // miolo
const EDGE = new THREE.Color(0xa9b55a); // borda: terra com grama
const EDGE_EXTRA = 0.35;               // largura da borda esverdeada, além da largura da estrada

// largura que oscila devagar ao longo do caminho (s = distância percorrida)
const wobble = (s, seed) => 1 + 0.08 * Math.sin(s * 1.3 + seed) + 0.05 * Math.sin(s * 3.7 + seed * 2);

function stripGeometry(pts, seed) {
  const pos = [], col = [], idx = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz);
    const nx = -tz / tl, nz = tx / tl; // perpendicular ao caminho
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const half = (ROAD_WIDTH / 2) * wobble(s, seed);
    for (const [o, c] of [[-(half + EDGE_EXTRA), EDGE], [-half, DIRT], [half, DIRT], [half + EDGE_EXTRA, EDGE]]) {
      const x = pts[i].x + nx * o, z = pts[i].z + nz * o;
      pos.push(x, groundHeight(x, z) + LIFT, z);
      col.push(c.r, c.g, c.b);
    }
    if (i) {
      const p = (i - 1) * 4, q = i * 4;
      for (let k = 0; k < 3; k++) idx.push(p + k, p + k + 1, q + k + 1, p + k, q + k + 1, q + k);
    }
  }
  return finish(pos, col, idx);
}

// pracinha: o miolo (terra, raio PLAZA_RADIUS) ou só o anel da borda esverdeada em volta dele
function plazaGeometry(edge) {
  const out = 1 + EDGE_EXTRA / PLAZA_RADIUS;
  const NS = 48, RINGS = edge ? [[1, DIRT], [out, EDGE]] : [[0, DIRT], [0.5, DIRT], [0.85, DIRT], [1, DIRT]];
  const pos = [], col = [], idx = [];
  for (const [f, c] of RINGS) {
    for (let j = 0; j < NS; j++) {
      const a = (j / NS) * Math.PI * 2, r = PLAZA_RADIUS * f * (f ? 1 + 0.04 * Math.sin(a * 5) : 1);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, groundHeight(x, z) + LIFT * (edge ? 0.7 : 1.3), z); // borda abaixo das estradas, miolo acima
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 1; r < RINGS.length; r++) {
    for (let j = 0; j < NS; j++) {
      const a = (r - 1) * NS + j, b = (r - 1) * NS + ((j + 1) % NS), c = r * NS + j, d = r * NS + ((j + 1) % NS);
      idx.push(a, d, c, a, b, d);
    }
  }
  return finish(pos, col, idx);
}

function finish(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// polygonOffset negativo puxa a malha para a frente no z-buffer; quanto mais negativo, mais "por cima" ela fica.
// O "factor" fica pequeno (-1): ele cresce quando a superfície é vista de lado (câmera baixa ou de longe) e, grande,
// fazia a estrada ser desenhada por cima dos pés de quem está nela. A ordem entre as camadas vem do "units".
const layer = (k) => new THREE.MeshPhongMaterial({
  vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 * k,
});

export function createRoads() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(plazaGeometry(true), layer(2)));  // borda da praça: embaixo das estradas
  const roadMat = layer(4);
  ROADS.forEach((pts, i) => {
    const from = pts.findIndex((p) => Math.hypot(p.x, p.z) > PLAZA_RADIUS * 0.6); // começa dentro da praça
    group.add(new THREE.Mesh(stripGeometry(pts.slice(Math.max(from - 1, 0)), i * 1.7), roadMat));
  });
  group.add(new THREE.Mesh(plazaGeometry(false), layer(6))); // miolo da praça: por cima do começo das estradas
  return group;
}
