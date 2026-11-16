import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FLAG_SITE, groundHeight } from './island.js';
import { applyWind, WIND } from './wind.js';

// ----------------------------------------------------------------------------------------------------------
// POSTE COM BANDEIRA (a bandeira de chegada dos jogos do Mario), no morro 'bandeira' (ver island.js).
// A bandeira sente o vento (ver wind.js):
// - no shader, ela ondula e se dobra, mais forte nas rajadas e mais na ponta do que perto do poste;
// - aqui, ela gira em volta do poste devagar para ficar sempre a favor do vento.
// A malha original da bandeira tem poucos triângulos; ela é subdividida para a ondulação ficar lisa.
// ----------------------------------------------------------------------------------------------------------

const BASE = new URL('../assets/flag/', import.meta.url).href;
const SUBDIVIDE = 4;     // cada triângulo da bandeira vira 4^SUBDIVIDE triângulos
const TURN_SPEED = 0.4;  // quão rápido a bandeira gira para o lado do vento

// divide cada triângulo em 4 (pelos pontos médios), `levels` vezes; interpola todos os atributos
function subdivide(geo, levels) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (let l = 0; l < levels; l++) {
    const names = Object.keys(g.attributes), out = {};
    for (const n of names) out[n] = [];
    const count = g.attributes.position.count;
    for (let t = 0; t < count; t += 3) {
      for (const n of names) {
        const a = g.attributes[n], k = a.itemSize;
        const v = [0, 1, 2].map((i) => Array.from({ length: k }, (_, c) => a.array[(t + i) * k + c]));
        const mid = (p, q) => p.map((x, c) => (x + q[c]) / 2);
        const [A, B, C] = v, AB = mid(A, B), BC = mid(B, C), CA = mid(C, A);
        out[n].push(...A, ...AB, ...CA, ...AB, ...B, ...BC, ...CA, ...BC, ...C, ...AB, ...BC, ...CA);
      }
    }
    const ng = new THREE.BufferGeometry();
    for (const n of names) ng.setAttribute(n, new THREE.Float32BufferAttribute(out[n], g.attributes[n].itemSize));
    g = ng;
  }
  return g;
}

export async function loadFlag() {
  const gltf = await new GLTFLoader().loadAsync(BASE + 'scene.gltf');
  const model = gltf.scene;
  model.updateMatrixWorld(true);

  const flagMesh = model.getObjectByName('Flag_Flag_0');
  const pipe = model.getObjectByName('Pipe_Pipe_0');
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // bandeira: geometria levada para o espaço do modelo, com o poste em x = z = 0 e a bandeira apontando para +X
  // (assim o shader sabe que ela ondula em Z); o giro original volta no pivô
  const geo = subdivide(flagMesh.geometry.clone().applyMatrix4(flagMesh.matrixWorld), SUBDIVIDE);
  const pole = new THREE.Box3().setFromObject(pipe).getCenter(new THREE.Vector3());
  geo.translate(-pole.x, 0, -pole.z);
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  const restAngle = Math.atan2(-c.z, c.x); // giro (em Y) que leva +X para o lado em que a bandeira aponta
  geo.rotateY(-restAngle);
  geo.computeBoundingBox();
  const p = geo.attributes.position, len = geo.boundingBox.max.x;
  const weight = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) weight[i] = THREE.MathUtils.clamp(p.getX(i) / len, 0, 1); // 0 no poste, 1 na ponta
  geo.setAttribute('windWeight', new THREE.BufferAttribute(weight, 1));
  geo.computeVertexNormals();

  const flagMat = flagMesh.material;
  flagMat.side = THREE.DoubleSide;
  applyWind(flagMat, 'flag', { amount: 0.3 * len, flutter: 2.5 }); // flutter: velocidade da onda (baixa = mais suave)
  const flag = new THREE.Mesh(geo, flagMat);
  flag.frustumCulled = false;
  flagMesh.removeFromParent();

  const pivot = new THREE.Group(); // gira a bandeira em volta do poste
  pivot.position.set(pole.x, 0, pole.z);
  pivot.rotation.y = restAngle;
  pivot.add(flag);

  // escala pela altura e apoia a base no chão (no ponto mais baixo embaixo dela, para não flutuar no declive)
  const box = new THREE.Box3().setFromObject(model);
  const root = new THREE.Group();
  root.add(model, pivot);
  root.scale.setScalar(FLAG_SITE.height / (box.max.y - box.min.y));
  root.rotation.y = FLAG_SITE.yaw;
  const half = ((box.max.x - box.min.x) / 2) * root.scale.x;
  let ground = Infinity;
  for (const [dx, dz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) {
    ground = Math.min(ground, groundHeight(FLAG_SITE.x + dx, FLAG_SITE.z + dz));
  }
  root.position.set(FLAG_SITE.x, ground - box.min.y * root.scale.y - 0.05, FLAG_SITE.z);

  let angle = restAngle;
  return {
    group: root,
    update(dt) {
      // a favor do vento: +X da bandeira (no mundo) na direção do vento
      const d = WIND.dir, target = Math.atan2(-d.y, d.x) - root.rotation.y;
      const diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle)); // menor giro
      angle += diff * Math.min(1, dt * TURN_SPEED);
      pivot.rotation.y = angle;
    },
  };
}
