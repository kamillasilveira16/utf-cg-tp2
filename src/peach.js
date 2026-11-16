import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { PEACH_SITE, standHeight } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/peach/', import.meta.url).href;

const MODEL_HEIGHT = 1.867; // altura do modelo (com a coroa) depois que o ColladaLoader converte centímetros em metros
const SINK = 0.02;          // afunda um pouco a base no chão para não aparecer fresta

// ----------------------------------------------------------------------------------------------------------
// POSES
//
// O modelo vem de braços abertos (pose de T) e tem um esqueleto com ossos de nome genérico ("jointnodeN").
// Uma pose é uma lista de { osso: [x, y, z] }: a rotação, em RADIANOS, aplicada sobre a pose de T.
// Os eixos são os do modelo: +Y para cima, +Z para a frente (para onde a Peach olha) e +X para a ESQUERDA dela.
//   z  inclina o braço para cima/baixo.   Braço esquerdo: z negativo desce, positivo sobe.
//                                          Braço direito:  z positivo desce, negativo sobe.
//   x  balança para frente/trás.          Com o braço pendurado, x negativo leva a mão para a FRENTE.
//   y  gira para os lados (ex.: cabeça virando).
//   O 4º valor, opcional, é o giro do osso em torno do PRÓPRIO eixo (como virar a palma da mão), em radianos.
//   Nos braços, que no modelo original apontam para os lados, é o eixo X do modelo. Ele é aplicado antes dos
//   outros três. Braço direito: giro negativo leva a palma da mão (que vem para baixo) para a FRENTE.
// Os ângulos são ABSOLUTOS: o antebraço não herda o ângulo do braço, então repita o z do braço no antebraço
// e some a dobra do cotovelo. Ossos que não aparecem na pose ficam como no modelo original.
// ----------------------------------------------------------------------------------------------------------
const BONES = { // ordem importa: pai antes do filho
  spine: 'jointnode13',  chest: 'jointnode14',  neck: 'jointnode29',
  shoulderL: 'jointnode15', upperL: 'jointnode16', foreL: 'jointnode17',   // esquerdo: ombro, antebraço, mão
  shoulderR: 'jointnode22', upperR: 'jointnode23', foreR: 'jointnode24',   // direito: ombro, antebraço, mão
  // Obs.: pelos pesos do skin do .dae, o osso do ombro (shoulderX) move o braço superior junto com o balão da manga;
  // upperX gira o ANTEBRAÇO (a partir do cotovelo) e foreX, a MÃO (a partir do pulso). Poses que não citam o ombro
  // o deixam como no modelo (braço superior aberto, escondido dentro da manga). Para um braço RETO, use o mesmo
  // ângulo nos três ossos do braço (os ângulos são absolutos).
};

export const POSES = {
  // como o modelo vem: braços abertos
  tpose: {},

  // em pé, braços descendo um pouco afastados do corpo (mais que ~55° atravessa a saia) e cotovelos levemente dobrados
  relaxed: {
    upperL: [0, 0, -0.95], foreL: [-0.35, 0, -0.95],
    upperR: [0, 0, 0.95],  foreR: [-0.35, 0, 0.95],
  },

  // acenando: antebraço direito levantado para cima e um pouco para fora e para a frente, mão aberta com a palma
  // virada para a frente (o giro -1.57 no antebraço e na mão, juntos, para a pele não torcer no pulso); a cabeça
  // levemente virada para o lado do aceno. O braço esquerdo fica RETO (mesmo ângulo no ombro, no antebraço e na
  // mão) e rente ao corpo: 1.05 rad (60°) abaixo da horizontal. Mais que ~1.1 (63°) a mão e o antebraço entram na saia.
  wave: {
    shoulderL: [0, 0, -1.05], upperL: [0, 0, -1.05], foreL: [0, 0, -1.05],
    upperR: [0, 0.3, -1.1, -1.57], foreR: [0, 0.3, -1.3, -1.57],
    neck: [0, -0.1, 0],
  },

  // mãos na cintura
  hips: {
    upperL: [0, 0, -0.95], foreL: [0, 0, -2.5],
    upperR: [0, 0, 0.95],  foreR: [0, 0, 2.5],
  },
};

export const DEFAULT_POSE = 'wave';

const AXIS_X = new THREE.Vector3(1, 0, 0); // eixo dos braços na pose de T (usado no giro)

// orientação de um objeto no espaço do modelo (produto dos quaternions locais da raiz até ele)
function quatInRoot(root, obj, out) {
  out.identity();
  for (let o = obj; o && o !== root; o = o.parent) out.premultiply(o.quaternion);
  return out;
}

// aplica uma pose (nome em POSES ou o próprio objeto) ao modelo; pode ser chamada quantas vezes quiser
export function setPose(model, pose = DEFAULT_POSE) {
  const def = typeof pose === 'string' ? POSES[pose] : pose;
  if (!def) throw new Error(`Pose desconhecida: '${pose}'. Poses disponíveis: ${Object.keys(POSES).join(', ')}`);

  // na primeira vez guarda a pose original (de T) de cada osso mexido
  const bones = {};
  for (const [key, boneName] of Object.entries(BONES)) {
    const bone = model.getObjectByName(boneName);
    if (!bone) throw new Error(`Osso '${boneName}' não encontrado no modelo da Peach`);
    if (!bone.userData.rest) {
      bone.userData.rest = { local: bone.quaternion.clone(), world: quatInRoot(model, bone, new THREE.Quaternion()) };
    }
    bones[key] = bone;
  }

  const parentQ = new THREE.Quaternion(), delta = new THREE.Quaternion(), roll = new THREE.Quaternion();
  for (const [key, bone] of Object.entries(bones)) { // pai antes do filho (ordem de BONES)
    const rest = bone.userData.rest;
    const angles = def[key];
    if (!angles) { bone.quaternion.copy(rest.local); continue; } // osso sem ordem na pose: volta ao original
    delta.setFromEuler(new THREE.Euler(angles[0], angles[1], angles[2], 'XYZ'));
    if (angles[3]) delta.multiply(roll.setFromAxisAngle(AXIS_X, angles[3])); // giro no próprio eixo do osso, aplicado antes
    quatInRoot(model, bone.parent, parentQ);
    bone.quaternion.copy(parentQ.invert()).multiply(delta.multiply(rest.world));
  }
  model.updateMatrixWorld(true);
}

export async function loadPeach() {
  // o .dae está em centímetros; o ColladaLoader converte para metros (Peach com ~1,87)
  const collada = await new ColladaLoader().loadAsync(BASE + 'Peach.dae');
  const model = collada.scene;

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // malha com esqueleto muda de forma: o volume original não vale
    // O .dae da Peach NÃO traz normais. Sem elas a luz não tem como calcular o sombreamento e a Peach fica toda
    // preta. Aqui as normais são calculadas: suaves nas curvas e quebradas nas arestas vivas (ângulo > 60°).
    if (!o.geometry.attributes.normal) {
      const old = o.geometry;
      o.geometry = toCreasedNormals(old, THREE.MathUtils.degToRad(60));
      old.dispose();
    }
    [].concat(o.material).forEach((m) => {
      m.side = THREE.DoubleSide; // roupa e cabelo são finos: aparecem dos dois lados
      if (m.map) m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
      // Olhos, pálpebras e vestido usam PNG com pixels transparentes (a pálpebra tem um "buraco" por onde se vê o
      // olho; o olho é só a íris sobre fundo transparente). Sem recorte esses pixels aparecem PRETOS. Vale para todos
      // os materiais: nas texturas totalmente opacas o recorte não muda nada. (O ColladaLoader não dá nome às
      // texturas, então não dá para escolher o material pelo nome da imagem.)
      m.alphaTest = 0.5;
      m.transparent = false;
      m.needsUpdate = true;
    });
  });

  setPose(model, DEFAULT_POSE);

  const peach = new THREE.Group();
  peach.add(model);
  peach.scale.setScalar(PEACH_SITE.height / MODEL_HEIGHT);
  peach.rotation.y = PEACH_SITE.yaw; // a frente do modelo é +Z
  peach.position.set(PEACH_SITE.x, standHeight(PEACH_SITE.x, PEACH_SITE.z) - SINK, PEACH_SITE.z);
  // para trocar a pose depois de carregada: peach.userData.setPose('wave')
  peach.userData.setPose = (pose) => setPose(model, pose);

  // depuração: abra a página com ?colliders para desenhar o círculo de colisão da Peach
  if (new URLSearchParams(location.search).has('colliders')) {
    const H = 4;
    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(PEACH_SITE.colliderRadius, PEACH_SITE.colliderRadius, H, 24)),
      new THREE.LineBasicMaterial({ color: 0xff0000 }));
    ring.scale.setScalar(MODEL_HEIGHT / PEACH_SITE.height); // cancela a escala: o círculo já está em unidades do mundo
    ring.position.y = (H / 2 + SINK) * (MODEL_HEIGHT / PEACH_SITE.height);
    peach.add(ring);
  }
  return peach;
}