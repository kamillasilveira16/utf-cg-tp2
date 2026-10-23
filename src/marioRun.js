import * as THREE from 'three';

// Animação de corrida do Mario feita por código: a cada quadro giramos os ossos do esqueleto.
// Convenção do modelo: +Y para cima, +Z para a frente do Mario, +X é a esquerda dele (ossos "L").
// Todas as rotações abaixo são em eixos do modelo, aplicadas sobre a T-pose original:
//   Rx(+) inclina para a frente a parte de cima e leva uma perna/braço pendurado para TRÁS.

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

  // ângulos de uma perna na fase p (rad): coxa, joelho e pé (Rx em eixo do mundo)
  function leg(p) {
    const thigh = -0.85 * s(p) + 0.1;                    // balanço frente/trás
    const knee = 0.3 + 1.0 * Math.max(0, c(p - 0.3));    // dobra forte quando a perna vem para a frente
    const foot = 0.5 * (thigh + knee) + 0.15;
    return { thigh, knee, foot };
  }

  // ph: fase do ciclo em rad (2π = dois passos). Em seguida, ajusta a altura para o pé apoiado tocar o chão.
  function pose(ph, { lean = 0.22, air = 3 } = {}) {
    const pL = ph, pR = ph + Math.PI;
    const L = leg(pL), R = leg(pR);

    setWorld('Hip', E(0.05, -0.15 * s(pL), 0));          // quadril gira junto com a passada
    setWorld('Spine1', E(lean, 0.2 * s(pL), 0));          // tronco inclinado e girando ao contrário
    setWorld('Spine2', E(lean, 0.2 * s(pL), 0));
    setWorld('Head', E(0.05, -0.1 * s(pL), 0));           // cabeça olhando para a frente

    setWorld('LegL1', E(L.thigh)); setWorld('LegL2', E(L.thigh + L.knee)); setWorld('FootL', E(L.foot));
    setWorld('LegR1', E(R.thigh)); setWorld('LegR2', E(R.thigh + R.knee)); setWorld('FootR', E(R.foot));

    // braços: abaixa da T-pose (Rz) e balança em oposição à perna do mesmo lado; cotovelo dobrado
    const D = 1.2, swingL = 0.9 * s(pL), swingR = 0.9 * s(pR), elbow = -1.3;
    setWorld('ArmL1', E(swingL, 0, -D)); setWorld('ArmL2', E(swingL + elbow, 0, -D));
    setWorld('ArmR1', E(swingR, 0, D));  setWorld('ArmR2', E(swingR + elbow, 0, D));

    // altura: base no chão (pé mais baixo em y = 0) + pulinho no ar entre os passos
    const root0 = rig.JointRoot;
    root0.b.position.copy(root0.restPos);
    root0.b.updateWorldMatrix(true, true);
    _inv.copy(root.matrixWorld).invert();
    const lowest = Math.min(
      yInRoot(rig.FootL.b) - ANKLE_ABOVE_SOLE,
      yInRoot(rig.FootR.b) - ANKLE_ABOVE_SOLE,
      yInRoot(toeL) - TOE_ABOVE_SOLE,
      yInRoot(toeR) - TOE_ABOVE_SOLE);
    root0.b.position.y = root0.restPos.y - lowest + air * (0.5 - 0.5 * c(2 * ph));
  }

  return { pose };
}