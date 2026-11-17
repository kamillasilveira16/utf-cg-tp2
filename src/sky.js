import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

// ----------------------------------------------------------------------------------------------------------
// CÉU (opcional ⭐ "Skybox, skysphere ou skydome"), de dia e de noite
//
// Dois domos de céu em volta da câmera:
// - DIA: o céu da fase Sky Chase (Sonic Adventure DX): parede circular com a faixa de nuvens no horizonte, tampa azul
//   em cima e um mar de nuvens embaixo.
// - NOITE: o céu noturno de Super Mario Sunshine: cúpula estrelada, lua com um halo e uma faixa de nuvens azuladas
//   no horizonte. As cores e a transparência das bordas vêm das cores por vértice do próprio modelo.
// O ciclo dia/noite (daynight.js) controla os dois com setTime(): o céu do dia é desenhado por cima do da noite com
// opacidade = "quanto é dia", e ganha um tom alaranjado no nascer e no pôr do sol.
//
// - Os domos ACOMPANHAM A POSIÇÃO da câmera a cada quadro (só a posição: não giram junto). Por isso nunca dá para
//   chegar perto da parede nem sair deles, e eles parecem infinitamente longe.
// - Eles ficam numa cena separada (scene), desenhada ANTES da cena principal e sem z-buffer: nada da ilha é escondido
//   por eles, por menores que sejam. O tamanho só precisa caber até o plano "far" das câmeras.
// - Não são iluminados (MeshBasicMaterial): o céu tem a cor da própria textura, com a luz ligada ou desligada (tecla L).
// ----------------------------------------------------------------------------------------------------------

const BASE = new URL('../assets/sky/', import.meta.url).href;
const NIGHT_BASE = new URL('../assets/nightsky/', import.meta.url).href;

const SCALE = 0.15;   // o mar de nuvens tem raio ~1800 no modelo: 0,15 × 1800 = 270, dentro do far (300) das câmeras
const NIGHT_SCALE = 0.003; // o céu noturno tem raio ~94000: 0,003 × 94000 = 282, dentro do far (300)
const EYE_HEIGHT = 15; // altura do olho dentro do domo (unidades do modelo); a faixa de nuvens começa em 0

// o .obj diz qual material cada parte usa; aqui cada nome vira a textura certa (o .mtl original põe três delas
// como "map_Ka", que o MTLLoader do THREE.js não lê, então os materiais são montados aqui mesmo)
const TEXTURES = {
  'acba2b32.dds': 'skyfloor.png',    // mar de nuvens embaixo
  'cb6ba871.dds': 'skygradient.png', // anel na base da parede (degradê até o branco do horizonte)
  '3a82f182.dds': 'skyblue.png',     // tampa azul no alto
  'd0477b8e.dds': 'sky.png',         // parede com as nuvens do horizonte
};

// céu noturno: as 4 partes do modelo, na ordem do arquivo, e como cada uma é desenhada
const NIGHT_PARTS = [
  { file: 'B_sterJimi_s.png', order: 0, brightness: 2 },           // cúpula estrelada (as estrelas mais fortes)
  { file: 'S_moon64.png', order: 2, additive: true },               // lua: soma a luz dela ao céu
  { file: 'S_ring64.png', order: 1, additive: true },               // halo em volta da lua
  { file: 'B_skyNightCloud.png', order: 3 },                         // faixa de nuvens no horizonte
];
// direção da lua no céu (centro da malha da lua no modelo): de lá vem a luz à noite
export const MOON_DIR = new THREE.Vector3(35355, 86603, 35355).normalize();

const DAY_BG = new THREE.Color(0xbfe6ff), NIGHT_BG = new THREE.Color(0x02030f); // cor de fundo onde não há céu

async function loadDaySky(loader) {
  const root = await new OBJLoader().loadAsync(BASE + 'sky.obj');
  const cache = {};
  const toBasic = (m) => {
    if (!cache[m.name]) {
      const tex = loader.load(BASE + (TEXTURES[m.name] ?? 'skyblue.png'));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // a parede e o mar de nuvens repetem a textura
      cache[m.name] = new THREE.MeshBasicMaterial({
        map: tex, side: THREE.DoubleSide, // vista por dentro
        depthTest: false, depthWrite: false, fog: false, transparent: true, // transparente: some aos poucos à noite
      });
    }
    return cache[m.name];
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(toBasic) : toBasic(o.material);
    o.renderOrder = 10;      // por cima do céu da noite; dentro da malha a ordem é a do arquivo: mar de nuvens, anel, tampa, parede
    o.frustumCulled = false; // sempre em volta da câmera
  });
  root.position.y = -EYE_HEIGHT;
  const group = new THREE.Group();
  group.add(root);
  group.scale.setScalar(SCALE);
  return { group, materials: Object.values(cache) };
}

async function loadNightSky(loader) {
  const collada = await new ColladaLoader().loadAsync(NIGHT_BASE + 'sky.dae');
  const materials = [];
  let i = 0;
  collada.scene.traverse((o) => {
    if (!o.isMesh) return;
    const part = NIGHT_PARTS[i++];
    const tex = loader.load(NIGHT_BASE + part.file);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // estrelas e nuvens repetem a textura
    o.material = new THREE.MeshBasicMaterial({
      map: tex, vertexColors: true, side: THREE.DoubleSide, // cor e transparência das bordas vêm dos vértices
      depthTest: false, depthWrite: false, fog: false, transparent: true,
      blending: part.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    o.material.color.setScalar(part.brightness ?? 1);
    o.renderOrder = part.order;
    o.frustumCulled = false;
    materials.push(o.material);
  });
  const group = new THREE.Group();
  group.add(collada.scene);
  group.scale.setScalar(NIGHT_SCALE);
  return { group, materials };
}

export async function loadSky() {
  const loader = new THREE.TextureLoader();
  const [day, night] = await Promise.all([loadDaySky(loader), loadNightSky(loader)]);
  const scene = new THREE.Scene(); // cena só do céu (desenhada antes da principal)
  const clearColor = DAY_BG.clone(); // cor para limpar a tela (aparece onde nenhum céu cobre)
  scene.add(night.group, day.group);
  const white = new THREE.Color(1, 1, 1);

  return {
    scene,
    clearColor,
    // chame a cada quadro, com a câmera que vai desenhar a cena
    update(camera) {
      camera.getWorldPosition(night.group.position);
      camera.getWorldPosition(day.group.position);
    },
    // dayness: 1 = dia, 0 = noite; tint = cor que multiplica o céu do dia (laranja no nascer/pôr do sol)
    setTime(dayness, tint = white) {
      for (const m of day.materials) { m.opacity = dayness; m.color.copy(tint); }
      for (const m of night.materials) m.opacity = 1; // a noite fica sempre embaixo; o dia cobre ela
      day.group.visible = dayness > 0.001;
      clearColor.copy(NIGHT_BG).lerp(DAY_BG, dayness);
    },
  };
}
