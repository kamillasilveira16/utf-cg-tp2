import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PIRANHA_SITES, groundHeight } from './island.js';

// ----------------------------------------------------------------------------------------------------------
// PLANTAS CARNÍVORAS (requisito obrigatório: objeto desenhado de forma HIERÁRQUICA)
//
// O modelo (troféu do Smash Bros. Brawl) vem como uma peça só, parada, com a boca aberta. Aqui ele é cortado em
// partes e as partes são montadas numa árvore de grupos do THREE.js. Um filho herda a posição e a rotação do pai,
// então girar um grupo move tudo o que está "pendurado" nele:
//
//   planta ─ estrutura FIXA: o cano verde e as folhas
//   └─ caule[0] ─ gira na boca do cano (balanço)
//      └─ caule[1] ─ gira
//         └─ caule[2] ─ gira
//            └─ cabeça ─ acompanha o caule (herda o balanço dele)
//               ├─ mandíbula de cima  ─ gira na dobradiça de trás da boca (mordida)
//               └─ mandíbula de baixo ─ gira na mesma dobradiça
//
// Medidas nas unidades do modelo: +Y para cima e a boca virada para -X.
// ----------------------------------------------------------------------------------------------------------

const BASE = new URL('../assets/piranha/', import.meta.url).href;

const HEIGHT = 3.2;   // altura da planta no mundo, do pé do cano ao topo da cabeça (o Mario tem 1,4)
const SINK = 0.1;     // afunda um pouco o cano no chão (o terreno pode ser inclinado)

// pontos de articulação (unidades do modelo), medidos na linha central do caule e na boca
const PIVOTS = {
  stem0: new THREE.Vector3(-0.2, 6.4, 0.0),   // boca do cano
  stem1: new THREE.Vector3(0.27, 9.4, -0.52), // primeira curva do caule
  stem2: new THREE.Vector3(1.7, 11.6, -0.44), // segunda curva
  head: new THREE.Vector3(0.61, 13.9, -0.1),  // onde o caule entra na cabeça
  hinge: new THREE.Vector3(-0.2, 13.0, 0.9),  // dobradiça da boca (eixo Z), no fundo da boca
};
const STEM_SPLIT = [9.4, 11.6]; // alturas que dividem o caule em 3 segmentos

const FIXED = ['mat1', 'mat4', 'mat5', 'mat6', 'mat7']; // folhas e cano
const STEM = ['mat12', 'mat13', 'mat14'];
const TONGUE = 'mat16';

// a mordida: o modelo vem com a boca aberta; fechar = girar cada mandíbula em direção à outra
const CLOSE_UPPER = 0.42; // rad (a de cima desce)
const CLOSE_LOWER = 0.46; // rad (a de baixo sobe)
const BITE_PERIOD = 1.8;  // segundos por mordida
const SWAY = 0.2;         // balanço de um lado para o outro: rad em cada um dos 3 segmentos do caule (somam)
const SWAY_SPEED = 1.1;   // velocidade do balanço (rad/s)

// em qual parte fica cada triângulo (pelo material e pela posição do centro dele)
function partOf(materialName, c) {
  if (FIXED.includes(materialName)) return 'fixed';
  if (STEM.includes(materialName)) return c.y < STEM_SPLIT[0] ? 'stem0' : c.y < STEM_SPLIT[1] ? 'stem1' : 'stem2';
  if (materialName === TONGUE) return 'lower';
  return c.y > PIVOTS.hinge.y ? 'upper' : 'lower'; // cabeça: acima da linha da dobradiça = mandíbula de cima
}

// corta uma malha (sem índice, como o OBJLoader entrega) em várias, uma por parte
function splitMesh(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, attrs = Object.keys(g.attributes);
  const out = {}, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, i + k));
    const part = partOf(mesh.material.name, c.divideScalar(3));
    const arrays = (out[part] ??= Object.fromEntries(attrs.map((a) => [a, []])));
    for (const a of attrs) {
      const attr = g.attributes[a];
      for (let k = 0; k < 3; k++) for (let j = 0; j < attr.itemSize; j++) arrays[a].push(attr.array[(i + k) * attr.itemSize + j]);
    }
  }
  return Object.entries(out).map(([part, arrays]) => {
    const geo = new THREE.BufferGeometry();
    for (const a of attrs) geo.setAttribute(a, new THREE.Float32BufferAttribute(arrays[a], g.attributes[a].itemSize));
    return { part, geo };
  });
}

async function loadModel() {
  const materials = await new MTLLoader().setPath(BASE).loadAsync('piranha.mtl');
  materials.preload();
  const obj = await new OBJLoader().setMaterials(materials).setPath(BASE).loadAsync('piranha.obj');
  const pieces = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material.side = THREE.DoubleSide; // folhas, lábios e dentes são finos
    for (const p of splitMesh(o)) pieces.push({ ...p, material: o.material });
  });
  return pieces;
}

// monta uma planta a partir das partes já cortadas (as geometrias e materiais são compartilhados entre as 3 plantas)
function buildPlant(pieces, phase) {
  const root = new THREE.Group();                 // escala e lugar na ilha
  const plant = new THREE.Group();                // unidades do modelo
  plant.scale.setScalar(HEIGHT / 17.73);          // o modelo tem 17,73 de altura
  plant.position.y = 1.08 * plant.scale.y;        // o pé do cano (y = -1,08) no chão
  root.add(plant);

  // árvore de grupos; cada um fica no seu ponto de articulação, relativo ao pai
  const node = (parent, pivot, parentPivot) => {
    const n = new THREE.Group();
    n.position.subVectors(pivot, parentPivot);
    parent.add(n);
    return n;
  };
  const zero = new THREE.Vector3();
  const stem0 = node(plant, PIVOTS.stem0, zero);
  const stem1 = node(stem0, PIVOTS.stem1, PIVOTS.stem0);
  const stem2 = node(stem1, PIVOTS.stem2, PIVOTS.stem1);
  const head = node(stem2, PIVOTS.head, PIVOTS.stem2);
  const upper = node(head, PIVOTS.hinge, PIVOTS.head);
  const lower = node(head, PIVOTS.hinge, PIVOTS.head);
  const nodes = { fixed: [plant, zero], stem0: [stem0, PIVOTS.stem0], stem1: [stem1, PIVOTS.stem1], stem2: [stem2, PIVOTS.stem2], upper: [upper, PIVOTS.hinge], lower: [lower, PIVOTS.hinge] };

  // cada pedaço vai para o seu grupo, deslocado para que a articulação do grupo seja a origem
  for (const { part, geo, material } of pieces) {
    const [parent, pivot] = nodes[part];
    const m = new THREE.Mesh(geo, material);
    m.position.copy(pivot).negate();
    parent.add(m);
  }

  const stem = [stem0, stem1, stem2];
  return {
    group: root,
    update(t) {
      const tt = t + phase;
      // mordida: boca aberta (como no modelo), fecha de uma vez ("nhac"), segura um pouco e abre devagar
      const u = (tt / BITE_PERIOD) % 1;
      const close = u < 0.08 ? u / 0.08 : u < 0.25 ? 1 : u < 0.6 ? 1 - THREE.MathUtils.smoothstep(u, 0.25, 0.6) : 0;
      upper.rotation.z = close * CLOSE_UPPER;   // gira em volta da dobradiça: a ponta desce
      lower.rotation.z = -close * CLOSE_LOWER;  // a ponta sobe
      // bote: inclina a cabeça para a frente (-X) na hora da mordida
      const lunge = 0.1 * close;
      // balanço contínuo; cada segmento um pouco atrasado em relação ao de baixo (efeito de "mola").
      // rotation.x = de um lado para o outro (a boca aponta para -X); rotation.z = para a frente e para trás
      stem.forEach((joint, k) => {
        joint.rotation.z = 0.06 * Math.sin(tt * 1.1 - k * 0.7) + lunge * (k === 0 ? 0.3 : 0.6);
        joint.rotation.x = SWAY * Math.sin(tt * SWAY_SPEED - k * 0.6);
      });
      head.rotation.y = 0.12 * Math.sin(tt * 0.8); // a cabeça olha um pouco para os lados
    },
  };
}

// as plantas da ilha, nos lugares de PIRANHA_SITES (island.js)
export async function loadPiranhaPlants() {
  const pieces = await loadModel();
  const group = new THREE.Group();
  const plants = PIRANHA_SITES.map((site, i) => {
    const p = buildPlant(pieces, i * 0.61); // se houver mais de uma: fases diferentes, não mordem todas juntas
    p.group.position.set(site.x, groundHeight(site.x, site.z) - SINK, site.z);
    p.group.rotation.y = site.yaw;
    group.add(p.group);
    return p;
  });
  return { group, update: (t) => plants.forEach((p) => p.update(t)) };
}
