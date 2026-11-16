import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREE_SITES, groundHeight } from './island.js';
import { mat, vcMat, colorFaces } from './utils.js';
import { applyWind } from './wind.js';

// ----------------------------------------------------------------------------------------------------------
// ÁRVORES low-poly, montadas com geometrias do THREE.js: tronco (cilindro de 6 lados) e copa redonda (várias
// "bolas" de icosaedro juntas numa malha só, cada triângulo com um tom de verde).
// A COPA sente o vento (ver wind.js): o shader inclina a copa a partir da base dela; o tronco fica parado.
// Os lugares das árvores vêm de island.js (TREE_SITES).
// ----------------------------------------------------------------------------------------------------------

const TRUNK_HEIGHT = 1.5;
const CANOPY_GREENS = [0x4cae38, 0x5cc043, 0x6bcf4c, 0x3e9a33];

// aleatório com semente própria por árvore (cada árvore sai diferente, mas sempre igual entre execuções)
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// copa: uma bola grande no meio e algumas menores em volta e em cima; y = 0 é a base da copa
function canopyGeometry(rand) {
  const balls = [[0, 1.0, 0, 1.05]]; // [x, y, z, raio]
  const n = 4 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.6;
    balls.push([Math.cos(a) * 0.7, 0.75 + rand() * 0.45, Math.sin(a) * 0.7, 0.6 + rand() * 0.2]);
  }
  balls.push([0.1, 1.75, -0.05, 0.6]);
  const parts = balls.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { // amassa um pouco cada vértice (mesma posição → mesmo deslocamento)
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const f = 1 + (Math.sin(vx * 12.9 + vy * 78.2 + vz * 37.7 + x * 5) * 0.5) * 0.18;
      p.setXYZ(i, vx * f, vy * f * 0.9, vz * f);
    }
    return g.translate(x, y, z);
  });
  const g = colorFaces(mergeGeometries(parts), (c) => c.setHex(CANOPY_GREENS[Math.floor(rand() * CANOPY_GREENS.length)]));
  g.computeVertexNormals();
  return g;
}

export function createTrees() {
  const group = new THREE.Group();
  const trunkMat = mat(0x8a5a35);
  const canopyMat = applyWind(vcMat(), 'shear', { base: 0, amount: 0.2 }); // o vento inclina a copa a partir da base
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, TRUNK_HEIGHT, 6).translate(0, TRUNK_HEIGHT / 2, 0);

  for (const site of TREE_SITES) {
    const rand = rng(site.seed);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    const canopy = new THREE.Mesh(canopyGeometry(rand), canopyMat);
    canopy.position.y = TRUNK_HEIGHT - 0.25; // a copa abraça a ponta do tronco
    tree.add(trunk, canopy);
    tree.scale.setScalar(1.1 + rand() * 0.45);
    tree.rotation.y = rand() * Math.PI * 2;
    tree.position.set(site.x, groundHeight(site.x, site.z) - 0.1, site.z); // afunda um pouco: tronco não flutua no declive
    group.add(tree);
  }
  return group;
}
