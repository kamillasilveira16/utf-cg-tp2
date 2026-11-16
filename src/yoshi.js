import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import {
  PEACH_SITE, CAPTAIN_TOAD_SITE, LUIGI_CHAR_SITE, groundHeight, clampToIsland,
  collideWithCastle, collideWithToadHouse, collideWithLuigiHouse, collideWithPeach, collideWithCaptainToad,
  collideWithLuigi, collideWithPiranhas, collideWithFlag, collideWithTrees,
} from './island.js';

// ----------------------------------------------------------------------------------------------------------
// YOSHI: o personagem que "habita" o diorama (requisito obrigatório "Personagem")
//
// - A tecla P alterna entre 3 poses, cada uma ao lado de um personagem e com posição, orientação e postura
//   próprias. Em cada uma ele IMITA quem está do lado: (1) acenando como a Peach, (2) dando o passo animado do
//   Capitão Toad, de punho para cima, (3) assustado como o Luigi, com as mãos abertas na frente do rosto.
// - Ao trocar de pose, ele corre até o próximo lugar com velocidade constante, desviando das construções e dos
//   personagens. A velocidade é escolhida para que o trajeto mais longo entre dois lugares leve MAX_TRIP segundos.
// - A corrida é animada por código, girando os ossos do esqueleto do modelo (como a do Mario).
// ----------------------------------------------------------------------------------------------------------

const BASE = new URL('../assets/yoshi/', import.meta.url).href;

const FIST_AXIS = new THREE.Vector3(0, 0, 1); // eixo em que os dedos dobram (eixo local dos ossos dos dedos)
const HEIGHT = 1.6;        // altura do Yoshi no mundo (o Mario tem 1,4)
const MODEL_HEIGHT = 19.2; // altura do modelo, do pé ao topo dos olhos (unidades do modelo)
const RADIUS = 0.5;        // raio de colisão (círculo no chão)
const MAX_TRIP = 4.8;      // segundos para percorrer o trajeto mais longo entre dois lugares (o pedido é até 5 s)
const RUN_CYCLE_MAX = 3.2; // passadas completas por segundo, no máximo

// partes do modelo que ficam à mostra; o arquivo traz várias expressões sobrepostas (olhos, bocas, um ovo...)
const SHOW = new Set(['yoshi_body_VIS_O_OBJ', 'fullhand', 'Yoshi_FaceN_VIS_O_OBJ', 'Yoshi_Mouth_VIS_O_OBJ',
  'Yoshi_Openblink_VIS_O_OBJ', 'Yoshi_Eye_VIS_O_OBJ', 'Yoshi_Eye_VIS_O_OBJ_Layer_2']);
const MOUTH = 'Yoshi_Mouth_VIS_O_OBJ', MOUTH_OPEN = 'Yoshi_HeavyOuch_Mouth_VIS_O_OBJ'; // boca normal / aberta (susto)

// ----------------------------------------------------------------------------------------------------------
// POSES (mesmo esquema de luigi.js). Eixos do Yoshi: +X = ESQUERDA dele, +Y = cima, +Z = frente.
//   { dir: [x, y, z] }  direção para onde o osso aponta.   [x, y, z]  rotação em radianos sobre a pose de T.
//   { dir, palm: [x, y, z] }  (antebraços) também gira o antebraço em torno dele mesmo, até a palma da mão olhar
//                             para a direção `palm`.
// ----------------------------------------------------------------------------------------------------------
const BONES = { // nome na pose: [osso, osso seguinte]; ordem importa: pai antes do filho
  waist: ['WaistN', null], head: ['HeadN', null], tail: ['TailN', null],
  thighL: ['LLegJ', 'LKneeJ'], shinL: ['LKneeJ', 'LFootJ'], footL: ['LFootJ', 'LToeN'],
  thighR: ['RLegJ', 'RKneeJ'], shinR: ['RKneeJ', 'RFootJ'], footR: ['RFootJ', 'RToeN'],
  upperL: ['LShoulderJ', 'LArmJ'], foreL: ['LArmJ', 'LHandN'],
  upperR: ['RShoulderJ', 'RArmJ'], foreR: ['RArmJ', 'RHandN'],
};
const FEET = ['LFootJ', 'LToeN', 'RFootJ', 'RToeN'];
const FINGERS = (side) => ['Index', 'Middle', 'Ring'].flatMap((f) => [1, 2, 3].map((k) => `${side}${f}${k}N`)); // punho // ossos usados para apoiar os pés no chão durante a corrida

const ARM_DOWN_L = { upperL: { dir: [0.45, -1, 0.1] }, foreL: { dir: [0.3, -1, 0.35] } };
const ARM_DOWN_R = { upperR: { dir: [-0.45, -1, 0.1] }, foreR: { dir: [-0.3, -1, 0.35] } };

export const POSES = {
  // 1) como a Peach: braço direito levantado ao lado da cabeça, mão aberta virada para a frente, acenando
  wave: {
    ...ARM_DOWN_L,
    upperR: { dir: [-1, 0.5, 0.1] }, foreR: { dir: [-0.3, 1, 0.05], palm: [0, 0, 1] },
    head: [0, -0.15, 0.08],
  },

  // 2) como o Capitão Toad: passo animado, punho direito para cima na frente do corpo, braço esquerdo para trás,
  //    joelho esquerdo levantado para a frente (sola à mostra) e o pé direito no chão
  stride: {
    upperR: { dir: [-0.85, -0.3, 0.45] }, foreR: { dir: [-0.2, 1, 0.3], palm: [1, 0, 0] },
    upperL: { dir: [0.85, -0.5, -0.3] }, foreL: { dir: [0.7, -0.55, -0.45] },
    thighL: { dir: [0.1, -0.15, 1] }, shinL: { dir: [0.05, -0.85, 0.5] }, footL: { dir: [0, 0.6, 0.8] },
    head: [-0.05, -0.15, 0], tail: [0, -0.3, 0],
    fist: 'R',
  },

  // 3) como o Luigi: assustado, as duas mãos abertas na frente do rosto com as palmas viradas para ele, boca aberta
  scared: {
    upperL: { dir: [0.35, 0.1, 1] }, foreL: { dir: [-0.15, 1, 0.45], palm: [0, -0.2, -1] },
    upperR: { dir: [-0.35, 0.1, 1] }, foreR: { dir: [0.15, 1, 0.45], palm: [0, -0.2, -1] },
    head: [-0.2, 0, 0], waist: [-0.1, 0, 0], tail: [0.3, 0, 0],
    mouthOpen: true,
  },
};

// corrida: pose que muda com a fase do passo (phase em radianos; 2π = dois passos)
function runPose(phase) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const leg = (sw, cs) => { // ângulo da coxa (+ = para a frente) e dobra do joelho
    const a = 0.75 * sw, bend = 0.25 + 1.1 * Math.max(0, cs), sh = a - bend;
    return {
      thigh: { dir: [0, -Math.cos(a), Math.sin(a)] },
      shin: { dir: [0, -Math.cos(sh), Math.sin(sh)] },
      foot: { dir: [0, Math.sin(sh) - 0.15, Math.cos(sh)] },
    };
  };
  const L = leg(s, c), R = leg(-s, -c);
  return {
    waist: [0.25, 0.15 * s, 0], head: [-0.2, -0.12 * s, 0], tail: [0.15, 0.45 * s, 0],
    thighL: L.thigh, shinL: L.shin, footL: L.foot, thighR: R.thigh, shinR: R.shin, footR: R.foot,
    upperL: { dir: [0.5, -0.8, -0.65 * s] }, foreL: { dir: [0.3, -0.15, 1] },  // braços balançam ao contrário
    upperR: { dir: [-0.5, -0.8, 0.65 * s] }, foreR: { dir: [-0.3, -0.15, 1] }, // das pernas do mesmo lado
  };
}

// ----------------------------------------------------------------------------------------------------------
// Lugares e trajetos
// ----------------------------------------------------------------------------------------------------------
const OBSTACLES = [collideWithCastle, collideWithToadHouse, collideWithLuigiHouse, collideWithPeach,
  collideWithCaptainToad, collideWithLuigi, collideWithPiranhas, collideWithFlag, collideWithTrees];

const _p = new THREE.Vector3();
function isFree(x, z, r) {
  for (const f of OBSTACLES) {
    _p.set(x, 0, z); f(_p, r);
    if (Math.abs(_p.x - x) > 1e-6 || Math.abs(_p.z - z) > 1e-6) return false;
  }
  _p.set(x, 0, z); clampToIsland(_p, r);
  return Math.abs(_p.x - x) < 1e-6 && Math.abs(_p.z - z) < 1e-6;
}

// lugar livre ao lado de um personagem (tenta à direita e à esquerda dele, cada vez um pouco mais longe)
function spotBeside(site, r) {
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  for (const d of [1.5, 1.9, 2.4, 3.0]) {
    for (const [lx, lz] of [[-d, 0.2], [d, 0.2], [-d, 0.8], [d, 0.8]]) { // -x = direita do personagem
      const x = site.x + lx * c + lz * s, z = site.z - lx * s + lz * c;
      if (isFree(x, z, r)) return { x, z };
    }
  }
  throw new Error('Não achei lugar livre para o Yoshi ao lado de um personagem');
}

// cada pose fica ao lado de quem ela imita, olhando para o mesmo lado que ele
const SPOTS = [
  { ...spotBeside(PEACH_SITE, RADIUS + 0.15), yaw: PEACH_SITE.yaw, pose: 'wave', radius: RADIUS },
  { ...spotBeside(CAPTAIN_TOAD_SITE, RADIUS + 0.25), yaw: CAPTAIN_TOAD_SITE.yaw, pose: 'stride', radius: 0.6 },
  { ...spotBeside(LUIGI_CHAR_SITE, RADIUS + 0.15), yaw: LUIGI_CHAR_SITE.yaw, pose: 'scared', radius: RADIUS },
];

// trajeto: em linha reta se der; senão, por pontos de passagem espalhados pela ilha (menor caminho entre eles)
function segmentFree(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
  for (let i = 1; i < n; i++) if (!isFree(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, RADIUS)) return false;
  return true;
}
const WAYPOINTS = [];
for (const r of [5, 10, 15, 20, 25]) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isFree(x, z, RADIUS + 0.4)) WAYPOINTS.push({ x, z });
  }
}
const wpEdges = WAYPOINTS.map((a, i) => WAYPOINTS.map((b, j) => (i !== j && segmentFree(a, b) ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity)));

function findPath(from, to) {
  if (segmentFree(from, to)) return [from, to];
  const n = WAYPOINTS.length, S = n, T = n + 1; // nós: pontos de passagem, origem (S) e destino (T)
  const nodes = [...WAYPOINTS, from, to];
  const cost = (i, j) => {
    if (i < n && j < n) return wpEdges[i][j];
    if ((i === S && j === T) || (i === T && j === S)) return Infinity;
    return segmentFree(nodes[i], nodes[j]) ? Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) : Infinity;
  };
  const dist = new Array(n + 2).fill(Infinity), prev = new Array(n + 2).fill(-1), done = new Array(n + 2).fill(false);
  dist[S] = 0;
  for (;;) { // Dijkstra
    let u = -1;
    for (let i = 0; i < n + 2; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === T) break;
    done[u] = true;
    for (let v = 0; v < n + 2; v++) {
      if (done[v]) continue;
      const w = cost(u, v);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  if (dist[T] === Infinity) return [from, to]; // sem caminho livre: vai reto
  const path = [];
  for (let v = T; v >= 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}
const pathLength = (path) => path.reduce((s, p, i) => (i ? s + Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) : 0), 0);

// velocidade constante: o trajeto mais longo entre dois lugares leva MAX_TRIP segundos
let longest = 0;
for (let i = 0; i < SPOTS.length; i++) for (let j = 0; j < SPOTS.length; j++) if (i !== j) longest = Math.max(longest, pathLength(findPath(SPOTS[i], SPOTS[j])));
export const YOSHI_SPEED = longest / MAX_TRIP;
export const YOSHI_SPOTS = SPOTS;

// ----------------------------------------------------------------------------------------------------------
// Esqueleto
// ----------------------------------------------------------------------------------------------------------
function quatInRoot(root, obj, out) {
  out.identity();
  for (let o = obj; o && o !== root; o = o.parent) out.premultiply(o.quaternion);
  return out;
}
const _inv = new THREE.Matrix4();
function posInRoot(root, obj, out) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  return out.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(_inv);
}

function makeRig(model) {
  // O modelo é Z-para-cima por dentro e o ColladaLoader o deita com uma rotação (model.quaternion); as poses são
  // escritas com Y para cima, então direções e rotações são passadas para o espaço interno do modelo.
  const toInner = model.quaternion.clone().invert(), fromInner = model.quaternion.clone();
  const bones = {};
  for (const [key, [boneName, tipName]] of Object.entries(BONES)) {
    const bone = model.getObjectByName(boneName);
    if (!bone) throw new Error(`Osso '${boneName}' não encontrado no modelo do Yoshi`);
    const tip = tipName && model.getObjectByName(tipName);
    const dir = tip ? posInRoot(model, tip, new THREE.Vector3()).sub(posInRoot(model, bone, new THREE.Vector3())).normalize() : null;
    bone.userData.rest = { local: bone.quaternion.clone(), world: quatInRoot(model, bone, new THREE.Quaternion()), dir };
    // palma da mão na pose de T: virada para baixo (só usada nos antebraços)
    if (key === 'foreL' || key === 'foreR') bone.userData.rest.palm = new THREE.Vector3(0, -1, 0).applyQuaternion(toInner);
    bones[key] = bone;
  }
  const parentQ = new THREE.Quaternion(), delta = new THREE.Quaternion(), target = new THREE.Vector3();
  const twist = new THREE.Quaternion(), have = new THREE.Vector3(), want = new THREE.Vector3();
  return function apply(def) {
    for (const [key, bone] of Object.entries(bones)) { // pai antes do filho (ordem de BONES)
      const rest = bone.userData.rest, entry = def[key];
      if (!entry) { bone.quaternion.copy(rest.local); continue; }
      if (Array.isArray(entry)) {
        delta.setFromEuler(new THREE.Euler(entry[0], entry[1], entry[2], 'XYZ')).premultiply(toInner).multiply(fromInner);
      } else {
        delta.setFromUnitVectors(rest.dir, target.fromArray(entry.dir).applyQuaternion(toInner).normalize());
        if (entry.palm && rest.palm) { // gira em torno do próprio osso até a palma olhar para `palm`
          have.copy(rest.palm).applyQuaternion(delta).projectOnPlane(target).normalize();
          want.fromArray(entry.palm).applyQuaternion(toInner).projectOnPlane(target).normalize();
          delta.premultiply(twist.setFromUnitVectors(have, want));
        }
      }
      quatInRoot(model, bone.parent, parentQ);
      bone.quaternion.copy(parentQ.invert()).multiply(delta.multiply(rest.world));
    }
    model.updateMatrixWorld(true);
  };
}

// ponto mais baixo das malhas visíveis, no espaço de `space` (unidades do modelo)
const _v = new THREE.Vector3(), _sInv = new THREE.Matrix4();
function lowestPoint(model, space, step = 3) {
  space.updateMatrixWorld(true);
  _sInv.copy(space.matrixWorld).invert();
  let lo = Infinity;
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    o.skeleton.update();
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += step) {
      o.applyBoneTransform(i, _v.fromBufferAttribute(p, i));
      _v.applyMatrix4(o.matrixWorld).applyMatrix4(_sInv);
      if (_v.y < lo) lo = _v.y;
    }
  });
  return lo;
}

// ----------------------------------------------------------------------------------------------------------
let current = null; // posição atual e raio, para a colisão com o Mario
export function collideWithYoshi(pos, radius = 0.35) {
  if (!current) return pos;
  const dx = pos.x - current.x, dz = pos.z - current.z, d = Math.hypot(dx, dz), min = current.radius + radius;
  if (d >= min) return pos;
  if (d > 1e-6) { pos.x = current.x + (dx / d) * min; pos.z = current.z + (dz / d) * min; } else pos.x = current.x + min;
  return pos;
}

export async function loadYoshi() {
  const collada = await new ColladaLoader().loadAsync(BASE + 'yoshi.dae');
  const model = collada.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // malha com esqueleto muda de forma: o volume original não vale
    o.visible = SHOW.has(o.name) || o.name === MOUTH_OPEN;
    if (o.name === 'Yoshi_Eye_VIS_O_OBJ') { // pupila: PNG com fundo transparente, na mesma superfície do branco do olho
      for (const m of [].concat(o.material)) {
        m.alphaTest = 0.5;
        m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; // desenha "por cima" do branco
      }
      o.renderOrder = 1;
    }
  });

  const yoshi = new THREE.Group();  // lugar na ilha, giro e escala
  const holder = new THREE.Group(); // apoia o corpo no chão (sobe/desce)
  holder.add(model);
  yoshi.add(holder);
  yoshi.scale.setScalar(HEIGHT / MODEL_HEIGHT);

  const apply = makeRig(model);
  // altura das solas abaixo dos ossos dos pés, medida na pose original (para apoiar os pés durante a corrida)
  apply({});
  const restLow = lowestPoint(model, yoshi, 1);
  const soles = FEET.map((n) => [model.getObjectByName(n), posInRoot(yoshi, model.getObjectByName(n), new THREE.Vector3()).y - restLow]);

  function setMouth(open) {
    model.getObjectByName(MOUTH).visible = !open;
    model.getObjectByName(MOUTH_OPEN).visible = open;
  }
  // dedos: dobrados (punho fechado) na mão `fist` ('L' ou 'R'); a outra fica aberta, como no modelo
  const fingers = { L: FINGERS('L').map((n) => model.getObjectByName(n)).filter(Boolean),
    R: FINGERS('R').map((n) => model.getObjectByName(n)).filter(Boolean) };
  for (const b of [...fingers.L, ...fingers.R]) b.userData.restQ = b.quaternion.clone();
  const curl = new THREE.Quaternion();
  function setFist(side) {
    for (const s of ['L', 'R']) {
      for (const b of fingers[s]) {
        b.quaternion.copy(b.userData.restQ);
        if (s === side) b.quaternion.multiply(curl.setFromAxisAngle(FIST_AXIS, 1.2));
      }
    }
  }

  // pose parada: postura + apoiar o ponto mais baixo do corpo no chão
  function setStaticPose(name) {
    const def = POSES[name];
    holder.position.set(0, 0, 0);
    setMouth(!!def.mouthOpen);
    setFist(def.fist);
    apply(def);
    holder.position.y = -lowestPoint(model, yoshi);
  }
  // pose de corrida: apoia o pé mais baixo no chão (mais rápido que procurar o vértice mais baixo a cada quadro)
  function setRunPose(phase) {
    holder.position.set(0, 0, 0);
    setMouth(false);
    setFist(null);
    apply(runPose(phase));
    let lo = Infinity;
    for (const [bone, sole] of soles) lo = Math.min(lo, posInRoot(yoshi, bone, _v).y - sole);
    holder.position.y = -lo;
  }

  // estado
  let spot = 0, path = null, seg = 0, phase = 0;
  const place = (s) => {
    yoshi.position.set(s.x, groundHeight(s.x, s.z), s.z);
    yoshi.rotation.y = s.yaw;
    setStaticPose(s.pose);
    current = { x: s.x, z: s.z, radius: s.radius };
  };
  place(SPOTS[0]);

  return {
    group: yoshi,
    get running() { return path !== null; },
    // tecla P: vai para a próxima pose (se já estiver correndo, muda o destino a partir de onde está)
    nextPose() {
      spot = (spot + 1) % SPOTS.length;
      path = findPath({ x: yoshi.position.x, z: yoshi.position.z }, SPOTS[spot]);
      seg = 1;
    },
    update(dt) {
      if (!path) return;
      let step = YOSHI_SPEED * dt; // distância a andar neste quadro (velocidade constante)
      while (step > 0 && path) {
        const target = path[seg];
        const dx = target.x - yoshi.position.x, dz = target.z - yoshi.position.z, d = Math.hypot(dx, dz);
        if (d <= step) { // chegou neste ponto do trajeto
          yoshi.position.x = target.x; yoshi.position.z = target.z; step -= d; seg++;
          if (seg >= path.length) { path = null; place(SPOTS[spot]); return; }
        } else {
          yoshi.position.x += (dx / d) * step; yoshi.position.z += (dz / d) * step;
          yoshi.rotation.y = Math.atan2(dx, dz); // de frente para onde está indo (+Z do modelo)
          step = 0;
        }
      }
      yoshi.position.y = groundHeight(yoshi.position.x, yoshi.position.z);
      // passadas: acompanham a velocidade, até um limite (acima dele os pés escorregam um pouco, estilo desenho)
      const cycles = Math.min(YOSHI_SPEED / 0.7, RUN_CYCLE_MAX);
      phase += dt * cycles * Math.PI * 2;
      setRunPose(phase);
      current = { x: yoshi.position.x, z: yoshi.position.z, radius: RADIUS };
    },
  };
}
