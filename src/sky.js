import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// ----------------------------------------------------------------------------------------------------------
// CÉU (opcional ⭐ "Skybox, skysphere ou skydome")
//
// Um domo de céu (o céu da fase Sky Chase, de Sonic Adventure DX) em volta da câmera: uma parede circular com a
// faixa de nuvens no horizonte, uma tampa azul em cima e um mar de nuvens embaixo.
// - O domo ACOMPANHA A POSIÇÃO da câmera a cada quadro (só a posição: ele não gira junto). Por isso nunca dá para
//   chegar perto da parede nem sair dele, e ele parece estar infinitamente longe.
// - Ele é desenhado ANTES de todo o resto e sem usar o z-buffer (depthTest/depthWrite desligados): assim nada da
//   cena é escondido por ele, por menor que ele seja. O tamanho só precisa caber até o plano "far" das câmeras.
// - Não é iluminado (MeshBasicMaterial): o céu tem a cor da própria textura, com a luz ligada ou desligada (tecla L).
// ----------------------------------------------------------------------------------------------------------

const BASE = new URL('../assets/sky/', import.meta.url).href;

const SCALE = 0.15;   // o mar de nuvens tem raio ~1800 no modelo: 0,15 × 1800 = 270, dentro do far (300) das câmeras
const EYE_HEIGHT = 15; // altura do olho dentro do domo (unidades do modelo); a faixa de nuvens começa em 0

// o .obj diz qual material cada parte usa; aqui cada nome vira a textura certa (o .mtl original põe três delas
// como "map_Ka", que o MTLLoader do THREE.js não lê, então os materiais são montados aqui mesmo)
const TEXTURES = {
  'acba2b32.dds': 'skyfloor.png',    // mar de nuvens embaixo
  'cb6ba871.dds': 'skygradient.png', // anel na base da parede (degradê até o branco do horizonte)
  '3a82f182.dds': 'skyblue.png',     // tampa azul no alto
  'd0477b8e.dds': 'sky.png',         // parede com as nuvens do horizonte
};

export async function loadSky() {
  const loader = new THREE.TextureLoader();
  const root = await new OBJLoader().loadAsync(BASE + 'sky.obj');

  const cache = {};
  const toBasic = (m) => {
    if (!cache[m.name]) {
      const tex = loader.load(BASE + (TEXTURES[m.name] ?? 'skyblue.png'));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // a parede e o mar de nuvens repetem a textura
      cache[m.name] = new THREE.MeshBasicMaterial({
        map: tex, side: THREE.DoubleSide, // vista por dentro
        depthTest: false, depthWrite: false, fog: false,
      });
    }
    return cache[m.name];
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(toBasic) : toBasic(o.material);
    o.renderOrder = -1000;   // antes de tudo; dentro da malha a ordem é a do arquivo: mar de nuvens, anel, tampa, parede
    o.frustumCulled = false; // sempre em volta da câmera
  });

  const sky = new THREE.Group();
  root.position.y = -EYE_HEIGHT;
  sky.add(root);
  sky.scale.setScalar(SCALE);

  return {
    group: sky,
    // chame a cada quadro, com a câmera que vai desenhar a cena
    update(camera) {
      camera.getWorldPosition(sky.position);
    },
  };
}
