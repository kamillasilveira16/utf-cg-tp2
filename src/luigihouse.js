import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { LUIGI_SITE, groundHeight } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/luigihouse/', import.meta.url).href;

// Pivô do modelo: o centro do círculo das paredes, medido na geometria do .obj (unidades do modelo, plano XZ).
// A origem original do modelo não é o centro da casa, então ele é deslocado por aqui.
const PIVOT_X = 0.395, PIVOT_Z = -0.545;
// No .obj a frente (porta, degraus e emblema "L") aponta para a diagonal (-X, +Z), a 135° do eixo +X.
// Girar 45° em Y leva essa frente para +Z, que é a convenção das outras construções (castelo e casa do Toad).
const FRONT_FIX = Math.PI / 4;
const SINK = 0.03; // afunda um pouco a base no chão para não aparecer fresta

export async function loadLuigiHouse() {
  // o .mtl aponta para Tex_0074_0.png (mesma pasta); o MTLLoader carrega a textura com o caminho de BASE
  const materials = await new MTLLoader().setPath(BASE).loadAsync('luigihouse.mtl');
  materials.preload();
  const model = await new OBJLoader().setMaterials(materials).setPath(BASE).loadAsync('luigihouse.obj');
  // unidades do modelo: ~10 x 11 x 10, Y para cima, um único material com a textura da casa inteira

  model.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => {
      m.side = THREE.DoubleSide;   // por garantia: faces de um lado só somem quando vistas por trás
      m.color.set(0xffffff);       // o .mtl tem Kd = 0.8, que escurece a textura; branco mostra a textura pura
      m.needsUpdate = true;
    });
  });

  // pivô no centro da casa e base (ponto mais baixo) em y = 0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.set(-PIVOT_X, -box.min.y, -PIVOT_Z);

  const orient = new THREE.Group(); // gira em torno do pivô, que agora é a origem
  orient.rotation.y = FRONT_FIX;
  orient.add(model);

  const house = new THREE.Group();
  house.add(orient);
  house.scale.setScalar(LUIGI_SITE.scale);
  house.rotation.y = LUIGI_SITE.yaw; // a frente (porta e degraus) é +Z, virada para o centro da ilha
  house.position.set(LUIGI_SITE.x, groundHeight(LUIGI_SITE.x, LUIGI_SITE.z) - SINK, LUIGI_SITE.z);

  // depuração: abra a página com ?colliders para desenhar a colisão da casa (círculo + retângulo da escada)
  if (new URLSearchParams(location.search).has('colliders')) {
    const H = 4, st = LUIGI_SITE.stairs, red = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const dbg = new THREE.Group();
    dbg.scale.setScalar(1 / LUIGI_SITE.scale); // cancela a escala da casa: as formas já estão em unidades do mundo
    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(LUIGI_SITE.colliderRadius, LUIGI_SITE.colliderRadius, H, 32)), red);
    ring.position.y = H / 2 + SINK;
    const stairs = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * st.halfW, H, st.zEnd)), red);
    stairs.position.set(0, H / 2 + SINK, st.zEnd / 2);
    dbg.add(ring, stairs);
    house.add(dbg);
  }
  return house;
}
