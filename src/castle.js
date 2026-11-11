import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { CASTLE_SITE, CASTLE_COLLIDERS, groundHeight } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/castle/', import.meta.url).href;

const FLAG_COLOR = 0xFB5486; // o modelo pinta as bandeiras de magenta ("Color_K02"); aqui ficam vermelhas
const SINK = 0.1;            // afunda um pouco a base no chão para não aparecer fresta

export async function loadCastle() {
  // o SketchUp exporta em polegadas e com Z para cima: o ColladaLoader já converte para metros e Y para cima
  const collada = await new ColladaLoader().loadAsync(BASE + 'model.dae');
  const model = collada.scene;

  model.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => {
      m.side = THREE.DoubleSide; // faces do SketchUp podem ter só um lado visível
      if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; } // texturas repetem
      if (m.name === 'Color_K02') m.color.set(FLAG_COLOR);
    });
  });

  // o modelo está longe da origem: centraliza em x/z e apoia a base em y = 0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

  // escala para a largura definida em island.js e põe no topo do morro mais alto
  const castle = new THREE.Group();
  castle.add(model);
  castle.scale.setScalar(CASTLE_SITE.width / size.x);
  castle.rotation.y = CASTLE_SITE.yaw; // a frente (porta) do modelo é +Z
  castle.position.set(CASTLE_SITE.x, groundHeight(CASTLE_SITE.x, CASTLE_SITE.z) - SINK, CASTLE_SITE.z);

  // depuração: abra a página com ?colliders para desenhar as caixas de colisão do castelo
  if (new URLSearchParams(location.search).has('colliders')) {
    const dbg = new THREE.Group();
    dbg.scale.setScalar(1 / castle.scale.x); // cancela a escala do castelo: as caixas já estão em unidades do mundo
    const H = 4;
    CASTLE_COLLIDERS.forEach((r) => {
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(r.x1 - r.x0, H, r.z1 - r.z0)),
        new THREE.LineBasicMaterial({ color: 0xff0000 }));
      box.position.set((r.x0 + r.x1) / 2, H / 2 + SINK, (r.z0 + r.z1) / 2);
      dbg.add(box);
    });
    castle.add(dbg);
  }
  return castle;
}