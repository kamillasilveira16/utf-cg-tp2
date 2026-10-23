import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { createRunAnimation } from './marioRun.js';
import { ISLAND_SCALE } from './island.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/mario/', import.meta.url).href;

const MODEL_HEIGHT = 154.4; // altura do modelo original (unidades do .fbx)
const HEIGHT = 1.4;         // altura desejada na ilha
const FACE = 2;             // qual das 9 expressões mostrar (Face00..Face08)
const HAND = 2;             // qual das 7 mãos mostrar (Hand?00..Hand?06)
const USE_NORMAL_MAP = false; // normal map do corpo (opcional "normal mapping"); teste com true

// corrida em círculo ao redor do centro da ilha (RUN_RADIUS = 0 corre parado no lugar)
const RUN_RADIUS = 3.2 * ISLAND_SCALE;
const RUN_SPEED = 2.8;      // unidades/s no chão
const CYCLE_HZ = 1.75;      // ciclos de corrida por segundo (1 ciclo = 2 passos)

export async function loadMario() {
  // o FBX cita texturas como "MarioBodyFix_alb.png"; no disco estão em minúsculo
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => url.replace(/[^/\\]+\.png$/i, (f) => f.toLowerCase()));
  const model = await new FBXLoader(manager).loadAsync(BASE + 'mario.fbx');

  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // malha com esqueleto muda de forma: o volume original não vale
    // o arquivo traz TODAS as variantes sobrepostas: deixa só uma de cada
    const face = o.name.match(/^Face(\d+)__/);
    const hand = o.name.match(/^Hand[RL](\d+)__/);
    if (face && +face[1] !== FACE) o.visible = false;
    if (hand && +hand[1] !== HAND) o.visible = false;
    if (o.name.startsWith('Eyelid')) o.visible = false;

    [].concat(o.material).forEach((m) => {
      m.transparent = false;           // o FBX marca tudo como transparente (opacidade 1)
      m.color.set(0xffffff);           // o FBX multiplica a textura por cinza 0.59 (escurece)
      if (!USE_NORMAL_MAP) m.normalMap = null;
    });
  });

  model.scale.setScalar(HEIGHT / MODEL_HEIGHT);
  const group = new THREE.Group();
  group.add(model);

  const anim = createRunAnimation(model);
  let phase = 0, angle = 0;
  anim.pose(phase);

  return {
    group,
    update(dt) {
      phase += dt * CYCLE_HZ * Math.PI * 2;
      anim.pose(phase);
      if (RUN_RADIUS > 0) {
        angle += (RUN_SPEED / RUN_RADIUS) * dt;
        group.position.set(Math.cos(angle) * RUN_RADIUS, 0, Math.sin(angle) * RUN_RADIUS);
        group.rotation.y = -angle; // de frente para a direção do movimento (o modelo olha para +Z)
      }
    },
  };
}