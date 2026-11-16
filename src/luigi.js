import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { LUIGI_CHAR_SITE as SITE, standHeight } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/luigi/', import.meta.url).href;

// qual das 4 mãos mostrar de cada lado: 0 = punho fechado, 1 = aberta e reta, 2 = aberta com os dedos abertos,
// 3 = relaxada (dedos dobrados). A direita fica aberta para o aceno.
const HAND_L = 3, HAND_R = 1;
// EXPRESSÕES. O modelo tem uma boca só (aberta), então a expressão muda pelas sobrancelhas e pelo tamanho da íris:
//   eyebrow  qual das 2 sobrancelhas mostrar: 0 = normal, 1 = preocupada (pontas internas levantadas)
//   pupil    tamanho da íris (1 = original; menor que 1 = olhos arregalados, de susto)
export const FACES = {
  normal: { eyebrow: 0, pupil: 1 },
  scared: { eyebrow: 1, pupil: 0.6 },
};
export const DEFAULT_FACE = 'scared';

// ----------------------------------------------------------------------------------------------------------
// POSES (mesmo esquema do Capitão Toad, ver captaintoad.js)
//
// O modelo vem de braços abertos (pose de T). Cada osso da pose pode ser:
//   { dir: [x, y, z] }  a DIREÇÃO para onde o osso aponta, nos eixos do modelo: +X = ESQUERDA dele, +Y = cima,
//                       +Z = frente (para onde ele olha). Não precisa ter comprimento 1.
//   { dir, palm }       como acima, mais para onde a PALMA da mão fica virada (antebraço e mão). Na pose de T a
//                       palma está virada para baixo; com `palm` dá para girar o antebraço e a mão em volta deles.
//   [x, y, z]           uma rotação em RADIANOS sobre a pose de T (bom para a cabeça).
// Tudo é ABSOLUTO. Ossos fora da pose voltam ao original. Depois de cada pose o pé mais baixo encosta no chão.
// Uma pose também pode escolher as mãos: hands: { L: 2, R: 2 } (números das variantes, ver HAND_L/HAND_R).
// ----------------------------------------------------------------------------------------------------------
const BONES = { // nome na pose: [osso, osso seguinte (a ponta)]; ordem importa: pai antes do filho
  head:   ['joint16', 'joint25'],
  upperL: ['joint3', 'joint18'],  foreL: ['joint18', 'joint20'], handL: ['joint20', null], // braço, antebraço e mão esq.
  upperR: ['joint5', 'joint22'],  foreR: ['joint22', 'joint24'], handR: ['joint24', null], // braço, antebraço e mão dir.
  thighL: ['joint8', 'joint9'],   shinL: ['joint9', 'joint10'],   footL: ['joint10', 'joint11'], // perna esquerda
  thighR: ['joint12', 'joint13'], shinR: ['joint13', 'joint14'], footR: ['joint14', 'joint15'], // perna direita
};

// ossos dos pés e a que altura (em unidades do modelo, antes da escala) a sola fica abaixo de cada um
const SOLE_BONES = [['joint10', 0.326], ['joint11', 0.196], ['joint14', 0.326], ['joint15', 0.196]];

export const POSES = {
  tpose: {}, // como o modelo vem: braços abertos

  // em pé, braços caídos ao lado do corpo
  relaxed: {
    upperL: { dir: [0.35, -1, 0.05] }, foreL: { dir: [0.25, -1, 0.2] },
    upperR: { dir: [-0.35, -1, 0.05] }, foreR: { dir: [-0.25, -1, 0.2] },
  },

  // mão direita acenando
  wave: {
    upperL: { dir: [0.35, -1, 0.05] }, foreL: { dir: [0.25, -1, 0.2] },
    upperR: { dir: [-1, 0.3, 0.1] }, foreR: { dir: [-0.25, 1, 0.15] },
    head: [0, -0.15, 0],
  },

  // assustado: mãos abertas na frente do rosto (sem encostar), palmas viradas para o rosto, dedos para cima
  scared: {
    upperL: { dir: [0.57, -0.16, 0.8] }, foreL: { dir: [0.11, 0.41, 0.91], palm: [-0.3, -0.4, -0.85] },
    handL: { dir: [-0.22, 1, -0.05], palm: [-0.45, 0, -1] },
    upperR: { dir: [-0.57, -0.16, 0.8] }, foreR: { dir: [-0.11, 0.41, 0.91], palm: [0.3, -0.4, -0.85] },
    handR: { dir: [0.22, 1, -0.05], palm: [0.45, 0, -1] },
    head: [-0.12, 0, 0],
    hands: { L: 2, R: 2 },
  },
};

export const DEFAULT_POSE = 'scared';

// orientação de um objeto no espaço do modelo (produto dos quaternions locais da raiz até ele)
function quatInRoot(root, obj, out) {
  out.identity();
  for (let o = obj; o && o !== root; o = o.parent) out.premultiply(o.quaternion);
  return out;
}

// posição de um objeto no espaço do modelo
const _inv = new THREE.Matrix4();
function posInRoot(root, obj, out) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  return out.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(_inv);
}

// aplica uma pose (nome em POSES ou o próprio objeto) ao modelo; pode ser chamada quantas vezes quiser
export function setPose(model, pose = DEFAULT_POSE) {
  const def = typeof pose === 'string' ? POSES[pose] : pose;
  if (!def) throw new Error(`Pose desconhecida: '${pose}'. Poses disponíveis: ${Object.keys(POSES).join(', ')}`);

  const bones = {};
  for (const [key, [boneName, tipName]] of Object.entries(BONES)) {
    const bone = model.getObjectByName(boneName), tip = tipName && model.getObjectByName(tipName);
    if (!bone || (tipName && !tip)) throw new Error(`Osso '${boneName}' ou '${tipName}' não encontrado no modelo do Luigi`);
    bones[key] = bone;
  }
  // na primeira vez guarda a pose original (de T) de cada osso: orientação e direção em que ele aponta
  if (!model.userData.restSaved) {
    const restPalm = new THREE.Vector3(0, -1, 0).applyQuaternion(model.quaternion.clone().invert()); // palma para baixo
    for (const [key, [, tipName]] of Object.entries(BONES)) {
      const bone = bones[key];
      // direção do osso: até o osso seguinte; sem osso seguinte (mãos), a mesma do pai até ele
      const from = tipName ? bone : bone.parent, to = tipName ? model.getObjectByName(tipName) : bone;
      const dir = posInRoot(model, to, new THREE.Vector3()).sub(posInRoot(model, from, new THREE.Vector3())).normalize();
      const palm = restPalm.clone().addScaledVector(dir, -restPalm.dot(dir)).normalize();
      bone.userData.rest = { local: bone.quaternion.clone(), world: quatInRoot(model, bone, new THREE.Quaternion()), dir, palm };
    }
    model.userData.restSaved = true;
  }

  // O modelo é Z-para-cima por dentro e o ColladaLoader o deita com uma rotação (model.quaternion). As poses são
  // escritas com Y para cima, então as direções e rotações são passadas para o espaço interno do modelo.
  const toInner = model.quaternion.clone().invert(), fromInner = model.quaternion;
  const parentQ = new THREE.Quaternion(), delta = new THREE.Quaternion(), target = new THREE.Vector3();
  for (const [key, bone] of Object.entries(bones)) { // pai antes do filho (ordem de BONES)
    const rest = bone.userData.rest, entry = def[key];
    if (!entry) { bone.quaternion.copy(rest.local); continue; } // osso fora da pose: volta ao original
    if (Array.isArray(entry)) { // rotação nos eixos Y-para-cima -> mesma rotação no espaço interno
      delta.setFromEuler(new THREE.Euler(entry[0], entry[1], entry[2], 'XYZ'));
      delta.premultiply(toInner).multiply(fromInner);
    } else if (entry.palm) { // direção + palma: gira a base (direção, palma) de repouso para a base pedida
      const d1 = target.fromArray(entry.dir).applyQuaternion(toInner).normalize();
      const p1 = new THREE.Vector3().fromArray(entry.palm).applyQuaternion(toInner);
      p1.addScaledVector(d1, -p1.dot(d1)).normalize();
      const basis = (d, pm) => new THREE.Matrix4().makeBasis(d, pm, new THREE.Vector3().crossVectors(d, pm));
      const rot = basis(d1, p1).multiply(basis(rest.dir, rest.palm).transpose());
      delta.setFromRotationMatrix(rot);
    } else delta.setFromUnitVectors(rest.dir, target.fromArray(entry.dir).applyQuaternion(toInner).normalize());
    quatInRoot(model, bone.parent, parentQ);
    bone.quaternion.copy(parentQ.invert()).multiply(delta.multiply(rest.world));
  }
  model.updateMatrixWorld(true);
  showHands(model, def.hands);
  fitToGround(model);
}

// mostra uma variante de mão de cada lado (as da pose, se ela escolher; senão HAND_L/HAND_R)
function showHands(model, hands = {}) {
  const want = { L: hands.L ?? HAND_L, R: hands.R ?? HAND_R };
  model.traverse((o) => {
    const m = o.isMesh && o.name.match(/^Hand([LR])(\d+)__/);
    if (m) o.visible = +m[2] === want[m[1]];
  });
}

// sobe/desce o modelo para que o ponto mais baixo das solas fique no chão (y = 0 do grupo do modelo)
const _v = new THREE.Vector3();
function fitToGround(model) {
  const holder = model.parent; // grupo sem escala própria: as medidas ficam nas unidades do modelo
  holder.position.y = 0;
  let lowest = Infinity;
  for (const [name, sole] of SOLE_BONES) lowest = Math.min(lowest, posInRoot(holder, model.getObjectByName(name), _v).y - sole);
  holder.position.y = -lowest;
  holder.updateMatrixWorld(true);
}

// aplica uma expressão (nome em FACES ou o próprio objeto); pode ser chamada quantas vezes quiser
export function setFace(model, face = DEFAULT_FACE) {
  const def = typeof face === 'string' ? FACES[face] : face;
  if (!def) throw new Error(`Expressão desconhecida: '${face}'. Expressões disponíveis: ${Object.keys(FACES).join(', ')}`);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const brow = o.name.match(/^EyeBrow(\d+)__/);
    if (brow) o.visible = +brow[1] === def.eyebrow;
    if (/^EyePupil__/.test(o.name)) {
      // A íris está no centro da textura da pupila, cercada de pixels transparentes. Repetir a textura mais vezes a
      // partir do centro deixa a íris menor; ClampToEdge estica a borda transparente em vez de repetir a íris.
      for (const m of [].concat(o.material)) {
        if (!m.map) continue;
        m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
        m.map.center.set(0.5, 0.5);
        m.map.repeat.setScalar(1 / def.pupil);
        m.map.needsUpdate = true;
      }
    }
  });
}

export async function loadLuigi() {
  // o .dae cita as texturas com maiúsculas ("LuigiBody_alb.png"), mas os arquivos estão em minúsculo
  // (o GitHub Pages diferencia maiúsculas de minúsculas)
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => url.replace(/[^/\\]+\.png$/i, (f) => f.toLowerCase()));
  // o .dae está em polegadas e com Z para cima: o ColladaLoader converte para Y para cima (frente em +Z)
  const collada = await new ColladaLoader(manager).loadAsync(BASE + 'luigi.dae');
  const model = collada.scene;

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // malha com esqueleto muda de forma: o volume original não vale
    // o arquivo traz as variantes sobrepostas: mostra só uma mão de cada lado e uma sobrancelha; pálpebras escondidas
    if (/^Eyelid/.test(o.name)) o.visible = false;
    [].concat(o.material).forEach((m) => {
      // a pupila é um PNG com fundo transparente: recorta os pixels transparentes em vez de misturar
      m.alphaTest = 0.5;
      m.transparent = false;
      m.needsUpdate = true;
    });
  });

  setFace(model, DEFAULT_FACE);

  const holder = new THREE.Group(); // sobe/desce o modelo para os pés tocarem o chão (ver fitToGround)
  holder.add(model);
  setPose(model, DEFAULT_POSE);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y; // altura do modelo na pose atual (com o chapéu)

  const luigi = new THREE.Group();
  luigi.add(holder);
  luigi.scale.setScalar(SITE.height / height);
  luigi.rotation.y = SITE.yaw; // a frente do modelo é +Z
  luigi.position.set(SITE.x, standHeight(SITE.x, SITE.z), SITE.z); // em cima da estrada
  // para trocar depois de carregado: luigi.userData.setPose('relaxed') e luigi.userData.setFace('normal')
  luigi.userData.setPose = (pose) => setPose(model, pose);
  luigi.userData.setFace = (face) => setFace(model, face);
  return luigi;
}
