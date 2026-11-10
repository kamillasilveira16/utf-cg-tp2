import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { createRunAnimation } from './marioRun.js';
import { ISLAND_SCALE, clampToIsland } from './island.js';
import { keys } from './input.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/mario/', import.meta.url).href;

const MODEL_HEIGHT = 154.4; // altura do modelo original (unidades do .fbx)
const HEIGHT = 1.4;         // altura desejada na ilha
const FACE = 2;             // qual das 9 expressões mostrar (Face00..Face08)
const HAND = 2;             // qual das 7 mãos mostrar (Hand?00..Hand?06)
const USE_NORMAL_MAP = false; // normal map do corpo (opcional "normal mapping"); teste com true

// movimento controlado por WASD (relativo à direção em que a câmera olha)
const RUN_SPEED = 4;        // unidades/s
const CYCLE_HZ = 2.5;       // ciclos de corrida por segundo (1 ciclo = 2 passos); passada = RUN_SPEED / CYCLE_HZ
const ACCEL = 10;           // quão rápido acelera/freia
const TURN_RATE = 12;       // quão rápido vira para a direção do movimento
const START = new THREE.Vector3(2.5 * ISLAND_SCALE, 0, -1.5 * ISLAND_SCALE); // ponto inicial (fora da lagoa)

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

  group.position.copy(START);

  const anim = createRunAnimation(model);
  const moveDir = new THREE.Vector3(0, 0, 1);
  let speed = 0, facing = 0, phase = 0;
  anim.pose(phase, { k: 0 });

  return {
    group,
    // heading: direção horizontal para onde a câmera olha (frente = (sin h, cos h))
    update(dt, heading = 0) {
      const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sh = Math.sin(heading), ch = Math.cos(heading);
      // W = para onde a câmera olha; D = direita da câmera
      const mx = fwd * sh - side * ch, mz = fwd * ch + side * sh;
      const len = Math.hypot(mx, mz);
      if (len > 0) moveDir.set(mx / len, 0, mz / len); // diagonal não fica mais rápida

      const target = len > 0 ? RUN_SPEED : 0;
      speed += (target - speed) * (1 - Math.exp(-ACCEL * dt));
      if (target === 0 && speed < 0.02) speed = 0;

      group.position.addScaledVector(moveDir, speed * dt);
      clampToIsland(group.position);

      if (speed > 0.05) { // vira suavemente (pelo menor ângulo) para a direção do movimento
        const diff = Math.atan2(Math.sin(Math.atan2(moveDir.x, moveDir.z) - facing), Math.cos(Math.atan2(moveDir.x, moveDir.z) - facing));
        facing += diff * (1 - Math.exp(-TURN_RATE * dt));
        group.rotation.y = facing; // o modelo olha para +Z
      }

      // a animação acompanha a velocidade: parado = em pé; correndo = ciclo completo
      const k = THREE.MathUtils.clamp(speed / RUN_SPEED, 0, 1);
      phase += dt * CYCLE_HZ * Math.PI * 2 * k;
      anim.pose(phase, { k });
    },
  };
}