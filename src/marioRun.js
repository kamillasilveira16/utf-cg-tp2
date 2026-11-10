import * as THREE from 'three';

// Animação do Mario feita por código: a cada quadro giramos os ossos do esqueleto.
// Convenção do modelo: +Y para cima, +Z para a frente do Mario, +X é a esquerda dele (ossos "L").
// Todas as rotações abaixo são em eixos do modelo, aplicadas sobre a T-pose original:
//   Rx(+) inclina para a frente a parte de cima e leva uma perna/braço pendurado para TRÁS.
//
// Cada pose (corrida, pulo subindo, pulo descendo, agachar) é só um conjunto de ângulos com a
// MESMA forma (ver runParams). Como são só números, dá para misturar poses com mix() e a
// transição entre elas fica suave.

const BONES = [
  'JointRoot', 'Hip', 'Spine1', 'Spine2', 'Head',
  'LegL1', 'LegL2', 'FootL', 'LegR1', 'LegR2', 'FootR',
  'ArmL1', 'ArmL2', 'ArmR1', 'ArmR2',
];

// altura do ponto mais baixo de cada pé em relação ao osso (no modelo parado)
const ANKLE_ABOVE_SOLE = 14.2;
const TOE_ABOVE_SOLE = 9.06;

const s = Math.sin, c = Math.cos;
const E = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));

// ---------------------------------------------------------------------------------------------
// Poses. Formato de uma pose (ângulos em rad):
//   hip / spine / head: [x, y, z]
//   legL / legR: { thigh (coxa), knee (joelho, somado à coxa), foot (pé) }  -> rotações Rx
//   armL / armR: { swing (balanço Rx), elbow (cotovelo, somado ao swing), d (abaixa da T-pose, Rz) }
//     d positivo = braço abaixado; d negativo = braço levantado acima da horizontal
// ---------------------------------------------------------------------------------------------

// mistura dois conjuntos de parâmetros com a mesma forma (números, arrays ou objetos aninhados)
function mix(a, b, t) {
  if (typeof a === 'number') return THREE.MathUtils.lerp(a, b, t);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], t));
  const out = {};
  for (const key in a) out[key] = mix(a[key], b[key], t);
  return out;
}

// ângulos de uma perna na fase p (rad): coxa, joelho e pé (Rx em eixo do mundo)
// k (0..1) é a intensidade da corrida: 0 = em pé parado, 1 = corrida completa
function leg(p, k) {
  const thigh = k * (-0.85 * s(p) + 0.1);                  // balanço frente/trás
  const knee = k * (0.3 + 1.0 * Math.max(0, c(p - 0.3)));  // dobra forte quando a perna vem para a frente
  const foot = 0.5 * (thigh + knee) + 0.15 * k;
  return { thigh, knee, foot };
}

// pose de corrida (ou em pé, com k = 0) na fase ph
function runParams(ph, k, lean) {
  const pL = ph, pR = ph + Math.PI;
  const elbow = -(0.15 + 1.15 * k);
  return {
    hip: [0.05 * k, -0.15 * s(pL) * k, 0],            // quadril gira junto com a passada
    spine: [lean * k, 0.2 * s(pL) * k, 0],            // tronco inclinado e girando ao contrário
    head: [0.05 * k, -0.1 * s(pL) * k, 0],            // cabeça olhando para a frente
    legL: leg(pL, k),
    legR: leg(pR, k),
    // braços: abaixa da T-pose e balança em oposição à perna do mesmo lado; cotovelo dobrado
    armL: { swing: 0.9 * s(pL) * k, elbow, d: 1.2 },
    armR: { swing: 0.9 * s(pR) * k, elbow, d: 1.2 },
  };
}

// pulo, subindo: pose de "comemoração" do Mario (como na arte clássica do personagem)
//   - braço esquerdo esticado para o alto, punho fechado
//   - braço direito dobrado na frente do corpo, punho fechado
//   - perna direita levantada (joelho para a frente, canela caindo para baixo)
//   - perna esquerda estendida para baixo/trás, com o joelho levemente dobrado
const JUMP_RISE = {
  hip: [0.05, 0, 0],
  spine: [0.0, 0.1, 0],                               // leve giro do tronco, como no impulso do soco
  head: [-0.15, 0, 0],                                // olha um pouco para cima
  legL: { thigh: 0.15, knee: 0.6, foot: 0.5 },        // perna de apoio: quase reta, pé apontando para baixo
  legR: { thigh: -1.3, knee: 1.65, foot: 0.6 },       // perna levantada: coxa à frente, canela quase vertical
  armL: { swing: 0.25, elbow: 0.1, d: -1.35 },        // braço quase vertical (d negativo = acima da horizontal)
  armR: { swing: 0.2, elbow: -1.2, d: 1.0 },          // braço junto ao corpo, antebraço dobrado para a frente
};

// pulo, descendo: mantém a pose (punhos e perna levantada), mas relaxa: braço desce um pouco e a perna se estende
const JUMP_FALL = {
  hip: [0.03, 0, 0],
  spine: [0.0, 0.05, 0],
  head: [0, 0, 0],
  legL: { thigh: 0.1, knee: 0.5, foot: 0.4 },
  legR: { thigh: -0.8, knee: 1.0, foot: 0.3 },
  armL: { swing: 0.15, elbow: 0.1, d: -0.7 },
  armR: { swing: 0.15, elbow: -0.9, d: 0.8 },
};

// agachado (amortecimento da aterrissagem): coxas para a frente, canelas inclinadas, pés retos
const CROUCH = {
  hip: [0.25, 0, 0],
  spine: [0.4, 0, 0],
  head: [-0.15, 0, 0],
  legL: { thigh: -0.9, knee: 1.4, foot: 0 },
  legR: { thigh: -0.9, knee: 1.4, foot: 0 },
  armL: { swing: -0.4, elbow: -0.5, d: 0.9 },
  armR: { swing: -0.4, elbow: -0.5, d: 0.9 },
};

export function createRunAnimation(root) {
  // "mundo" aqui = espaço do modelo (root). Assim o Mario pode ser movido, girado e escalado na cena.
  const _p = new THREE.Quaternion(), _v = new THREE.Vector3(), _inv = new THREE.Matrix4();

  // orientação de um objeto no espaço do modelo (produto dos quaternions locais da raiz até ele)
  function quatInRoot(obj, out) {
    out.identity();
    for (let o = obj; o && o !== root; o = o.parent) out.premultiply(o.quaternion);
    return out;
  }
  const yInRoot = (obj) => _v.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(_inv).y;

  // getObjectByName devolve o primeiro osso com o nome (o mais externo): é nele que mexemos
  const rig = {};
  BONES.forEach((name) => {
    const b = root.getObjectByName(name);
    rig[name] = { b, restWorld: quatInRoot(b, new THREE.Quaternion()), restPos: b.position.clone() };
  });
  const toeL = root.getObjectByName('ToeL'), toeR = root.getObjectByName('ToeR');

  // define a orientação do osso como (delta em eixos do modelo) * (orientação original)
  function setWorld(name, delta) {
    const r = rig[name];
    quatInRoot(r.b.parent, _p);                          // pai já está na pose atual
    r.b.quaternion.copy(_p.invert()).multiply(delta.clone().multiply(r.restWorld));
  }

  // aplica uma pose aos ossos (pais antes dos filhos)
  function apply(P) {
    setWorld('Hip', E(...P.hip));
    setWorld('Spine1', E(...P.spine));
    setWorld('Spine2', E(...P.spine));
    setWorld('Head', E(...P.head));

    setWorld('LegL1', E(P.legL.thigh)); setWorld('LegL2', E(P.legL.thigh + P.legL.knee)); setWorld('FootL', E(P.legL.foot));
    setWorld('LegR1', E(P.legR.thigh)); setWorld('LegR2', E(P.legR.thigh + P.legR.knee)); setWorld('FootR', E(P.legR.foot));

    setWorld('ArmL1', E(P.armL.swing, 0, -P.armL.d)); setWorld('ArmL2', E(P.armL.swing + P.armL.elbow, 0, -P.armL.d));
    setWorld('ArmR1', E(P.armR.swing, 0, P.armR.d));  setWorld('ArmR2', E(P.armR.swing + P.armR.elbow, 0, P.armR.d));
  }

  // ph: fase do ciclo em rad (2π = dois passos). Em seguida, ajusta a altura para o pé apoiado tocar o chão.
  // jump (opcional): { w, u, crouch }
  //   w      0..1  quanto a pose de pulo substitui a de corrida (0 = no chão, 1 = no ar)
  //   u     -1..1  velocidade vertical normalizada (1 = decolando, 0 = ponto mais alto, -1 = caindo rápido)
  //   crouch 0..1  quanto o Mario está agachado (aterrissagem)
  // A altura do pulo em si (posição Y do grupo) é responsabilidade de quem chama; aqui o pé mais
  // baixo fica sempre em y = 0 do modelo.
  function pose(ph, { lean = 0.22, air = 3, k = 1, jump = null } = {}) {
    let P = runParams(ph, k, lean);
    let w = 0;
    if (jump) {
      w = jump.w ?? 0;
      P = mix(P, CROUCH, jump.crouch ?? 0);
      // u = 1 -> subindo; u = -1 -> caindo (com suavização nas pontas)
      const f = THREE.MathUtils.clamp((1 - (jump.u ?? 0)) / 2, 0, 1);
      P = mix(P, mix(JUMP_RISE, JUMP_FALL, f * f * (3 - 2 * f)), w);
    }
    apply(P);

    // altura: base no chão (pé mais baixo em y = 0) + pulinho no ar entre os passos (some durante o pulo)
    const root0 = rig.JointRoot;
    root0.b.position.copy(root0.restPos);
    root0.b.updateWorldMatrix(true, true);
    _inv.copy(root.matrixWorld).invert();
    const lowest = Math.min(
      yInRoot(rig.FootL.b) - ANKLE_ABOVE_SOLE,
      yInRoot(rig.FootR.b) - ANKLE_ABOVE_SOLE,
      yInRoot(toeL) - TOE_ABOVE_SOLE,
      yInRoot(toeR) - TOE_ABOVE_SOLE);
    root0.b.position.y = root0.restPos.y - lowest + air * k * (1 - w) * (0.5 - 0.5 * c(2 * ph));
  }

  return { pose };
}