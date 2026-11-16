import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { CAPTAIN_TOAD_SITE as SITE, standHeight } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/captaintoad/', import.meta.url).href;

const MODEL_HEIGHT = 0.357; // altura do modelo (com o capacete) depois que o ColladaLoader converte polegadas em metros
const FACE = 2;             // qual das 6 expressões mostrar: 1 e 4 = boca fechada, 2 e 3 = sorrindo, 5 e 6 = boca em "o"

// ----------------------------------------------------------------------------------------------------------
// POSES
//
// O modelo vem de braços abertos (pose de T), com um esqueleto de ossos genéricos ("jointN"). Uma pose diz, para
// cada osso, como ele fica. Há dois jeitos de escrever cada osso (dá para misturar os dois na mesma pose):
//
//   { dir: [x, y, z] }  a DIREÇÃO para onde o osso aponta (do começo do osso para o começo do próximo), nos eixos do
//                       modelo: +X = ESQUERDA dele, +Y = cima, +Z = frente (para onde ele olha). Não precisa ter
//                       comprimento 1. Ex.: braço direito apontando para a frente e um pouco para fora: [-0.4, 0, 1].
//                       É o jeito mais fácil para braços e pernas.
//   [x, y, z]           uma rotação em RADIANOS aplicada sobre a pose de T, nos mesmos eixos (bom para a cabeça).
//
// Tudo é ABSOLUTO (o antebraço não herda o giro do braço). Ossos que não aparecem na pose voltam ao original, e os
// que não estão em BONES (mãos, dedos dos pés) seguem o osso pai. Depois de cada pose o modelo sobe ou desce para
// o pé mais baixo encostar no chão, então dá para levantar um pé sem ele afundar no chão nem ficar flutuando.
// ----------------------------------------------------------------------------------------------------------
const BONES = { // nome na pose: [osso, osso seguinte (a ponta)]; ordem importa: pai antes do filho
  head:   ['joint15', 'joint16'],
  upperL: ['joint21', 'joint22'], foreL: ['joint22', 'joint23'], // braço e antebraço esquerdos
  upperR: ['joint26', 'joint27'], foreR: ['joint27', 'joint28'], // braço e antebraço direitos
  thighL: ['joint3', 'joint4'], shinL: ['joint4', 'joint5'], footL: ['joint5', 'joint6'],   // perna esquerda
  thighR: ['joint8', 'joint9'], shinR: ['joint9', 'joint10'], footR: ['joint10', 'joint11'], // perna direita
};

// ossos dos pés e a que altura (em metros) a sola fica abaixo de cada um, para apoiar o pé mais baixo no chão
const SOLE_BONES = [['joint5', 0.029], ['joint6', 0.016], ['joint10', 0.029], ['joint11', 0.016]];

export const POSES = {
  tpose: {}, // como o modelo vem: braços abertos

  // em pé, braços caídos ao lado do corpo
  relaxed: {
    upperL: { dir: [0.55, -0.8, 0] }, foreL: { dir: [0.45, -0.85, 0.15] },
    upperR: { dir: [-0.55, -0.8, 0] }, foreR: { dir: [-0.45, -0.85, 0.15] },
  },

  // braço direito para cima, cumprimentando
  wave: {
    upperL: { dir: [0.55, -0.8, 0] }, foreL: { dir: [0.45, -0.85, 0.15] },
    upperR: { dir: [-0.9, 0.35, 0.1] }, foreR: { dir: [-0.25, 1, 0.1] },
    head: [0, 0.2, 0],
  },

  // dando um passo animado: punho direito levantado na frente do corpo, braço esquerdo abaixado e para trás,
  // joelho esquerdo levantado para a frente (sola à mostra) e o pé direito parado no chão
  stride: {
    upperR: { dir: [-0.85, -0.3, 0.45] }, foreR: { dir: [-0.2, 1, 0.3] },
    upperL: { dir: [0.85, -0.5, -0.3] }, foreL: { dir: [0.7, -0.55, -0.45] },
    thighL: { dir: [0.1, -0.15, 1] }, shinL: { dir: [0.05, -0.85, 0.5] }, footL: { dir: [0, 0.6, 0.8] },
    head: [-0.05, -0.15, 0],
  },
};

export const DEFAULT_POSE = 'stride';

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
    const bone = model.getObjectByName(boneName), tip = model.getObjectByName(tipName);
    if (!bone || !tip) throw new Error(`Osso '${boneName}' ou '${tipName}' não encontrado no modelo do Capitão Toad`);
    bones[key] = bone;
  }
  // na primeira vez guarda a pose original (de T) de cada osso: orientação e direção em que ele aponta
  if (!model.userData.restSaved) {
    model.position.y = 0;
    for (const [key, [, tipName]] of Object.entries(BONES)) {
      const bone = bones[key], tip = model.getObjectByName(tipName);
      const dir = posInRoot(model, tip, new THREE.Vector3()).sub(posInRoot(model, bone, new THREE.Vector3())).normalize();
      bone.userData.rest = { local: bone.quaternion.clone(), world: quatInRoot(model, bone, new THREE.Quaternion()), dir };
    }
    model.userData.restSaved = true;
  }

  const parentQ = new THREE.Quaternion(), delta = new THREE.Quaternion(), target = new THREE.Vector3();
  for (const [key, bone] of Object.entries(bones)) { // pai antes do filho (ordem de BONES)
    const rest = bone.userData.rest, entry = def[key];
    if (!entry) { bone.quaternion.copy(rest.local); continue; } // osso fora da pose: volta ao original
    if (Array.isArray(entry)) delta.setFromEuler(new THREE.Euler(entry[0], entry[1], entry[2], 'XYZ'));
    else delta.setFromUnitVectors(rest.dir, target.fromArray(entry.dir).normalize());
    quatInRoot(model, bone.parent, parentQ);
    bone.quaternion.copy(parentQ.invert()).multiply(delta.multiply(rest.world));
  }
  model.updateMatrixWorld(true);
  fitToGround(model);
}

// sobe/desce o modelo para que o ponto mais baixo das solas fique no chão (y = 0 do grupo do Capitão Toad).
// As medidas são feitas no espaço do pai do modelo, onde as unidades já são metros (o modelo em si guarda a escala
// de polegadas para metros que o ColladaLoader aplica).
const _v = new THREE.Vector3(), _pinv = new THREE.Matrix4();
function fitToGround(model) {
  model.position.y = 0;
  model.updateMatrixWorld(true);
  if (model.parent) _pinv.copy(model.parent.matrixWorld).invert(); else _pinv.identity();
  let lowest = Infinity;
  for (const [name, sole] of SOLE_BONES) {
    _v.setFromMatrixPosition(model.getObjectByName(name).matrixWorld).applyMatrix4(_pinv);
    lowest = Math.min(lowest, _v.y - sole);
  }
  model.position.y = -lowest;
  model.updateMatrixWorld(true);
}

export async function loadCaptainToad() {
  // as texturas ficam em ./images, como o .dae espera
  const collada = await new ColladaLoader().loadAsync(BASE + 'kinopiobrigade.dae');
  const model = collada.scene;
  // O .dae diz "Z para cima", mas os vértices já estão com Y para cima: a rotação que o ColladaLoader aplica por causa
  // dessa marcação deitaria o personagem. Cancela essa rotação.
  model.rotation.set(0, 0, 0);

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // malha com esqueleto muda de forma: o volume original não vale
    // o arquivo traz as 6 expressões e as 3 pálpebras sobrepostas: mostra só uma expressão e deixa os olhos abertos
    const face = o.name.match(/^Face0Shape(\d+)$/);
    if (face && +face[1] !== FACE) o.visible = false;
    if (/^Eyelid/.test(o.name)) o.visible = false;
    [].concat(o.material).forEach((m) => {
      m.transparent = false; // o arquivo marca tudo como transparente (opacidade 1), o que bagunça a ordem de desenho
      m.side = THREE.DoubleSide; // olhos e a lente do capacete são finos
      m.needsUpdate = true;
    });
  });

  setPose(model, DEFAULT_POSE);

  const toad = new THREE.Group();
  toad.add(model);
  toad.scale.setScalar(SITE.height / MODEL_HEIGHT);
  toad.rotation.y = SITE.yaw; // a frente do modelo é +Z
  toad.position.set(SITE.x, standHeight(SITE.x, SITE.z), SITE.z); // em cima da estrada
  // para trocar a pose depois de carregado: toad.userData.setPose('relaxed')
  toad.userData.setPose = (pose) => setPose(model, pose);
  return toad;
}
