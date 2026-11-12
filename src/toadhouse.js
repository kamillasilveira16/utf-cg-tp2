import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { TOAD_SITE, groundHeight } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/toadhouse/', import.meta.url).href;

// O .dae usa a textura RoofA_nrm.png (um normal map) como cor do chapéu, o que deixa tudo azul-arroxeado.
// Aqui o chapéu vira vermelho e as bolinhas brancas. Os materiais sem textura vêm todos brancos no arquivo.
const FIXES = {
  KinopioHouseMat00: { color: 0xe0392f, map: null }, // chapéu
  KinopioHouseMat01: { color: 0xffffff, map: null }, // bolinhas
  KinopioHouseMat08: { color: 0x58b848 },            // folhinhas verdes
  KinopioHouseMat09: { color: 0xfff2b0 },            // janela redonda
};
const SINK = 0.03; // afunda um pouco a base no chão para não aparecer fresta

export async function loadToadHouse() {
  const collada = await new ColladaLoader().loadAsync(BASE + 'KinopioHouseRed.dae');
  const model = collada.scene; // metros, Y para cima; as medidas do modelo são ~850 x 760 x 960

  model.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => {
      m.side = THREE.DoubleSide; // por garantia: faces de um lado só somem quando vistas por trás
      const fix = FIXES[m.name];
      if (fix) {
        if ('map' in fix) m.map = fix.map;
        m.color.set(fix.color);
        m.needsUpdate = true;
      }
      if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; } // texturas repetem
    });
  });

  // a origem do modelo já é o centro da casa; só apoia a base (ponto mais baixo) em y = 0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;

  const house = new THREE.Group();
  house.add(model);
  house.scale.setScalar(TOAD_SITE.scale);
  house.rotation.y = TOAD_SITE.yaw; // a frente (porta e caminho) do modelo é +Z
  house.position.set(TOAD_SITE.x, groundHeight(TOAD_SITE.x, TOAD_SITE.z) - SINK, TOAD_SITE.z);

  // depuração: abra a página com ?colliders para desenhar a colisão da casa (círculo da base + retângulo da escada)
  if (new URLSearchParams(location.search).has('colliders')) {
    const H = 4, st = TOAD_SITE.stairs, red = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const dbg = new THREE.Group();
    dbg.scale.setScalar(1 / TOAD_SITE.scale); // cancela a escala da casa: as formas já estão em unidades do mundo
    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(TOAD_SITE.colliderRadius, TOAD_SITE.colliderRadius, H, 32)), red);
    ring.position.y = H / 2 + SINK;
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * st.halfW, H, st.zEnd)), red);
    box.position.set(0, H / 2 + SINK, st.zEnd / 2);
    dbg.add(ring, box);
    house.add(dbg);
  }
  return house;
}