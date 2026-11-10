import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { createRunAnimation } from './marioRun.js';
import { ISLAND_SCALE, clampToIsland } from './island.js';
import { keys, consumePress } from './input.js';

// caminho relativo a este arquivo (funciona local e no GitHub Pages)
const BASE = new URL('../assets/mario/', import.meta.url).href;

const MODEL_HEIGHT = 154.4; // altura do modelo original (unidades do .fbx)
const HEIGHT = 1.4;         // altura desejada na ilha
const FACE = 2;             // qual das 9 expressões mostrar (Face00..Face08)
const HAND = 0;             // qual das 7 mãos mostrar (Hand?00..Hand?06); 0 = punho fechado
const USE_NORMAL_MAP = false; // normal map do corpo (opcional "normal mapping"); teste com true

// movimento controlado por WASD (relativo à direção em que a câmera olha)
const RUN_SPEED = 4;        // unidades/s
const CYCLE_HZ = 2.5;       // ciclos de corrida por segundo (1 ciclo = 2 passos); passada = RUN_SPEED / CYCLE_HZ
const ACCEL = 10;           // quão rápido acelera/freia
const TURN_RATE = 12;       // quão rápido vira para a direção do movimento
const START = new THREE.Vector3(2.5 * ISLAND_SCALE, 0, -1.5 * ISLAND_SCALE); // ponto inicial (fora da lagoa)

// pulo (barra de espaço). Em vez de chutar gravidade e velocidade, definimos o que queremos ver
// (altura e tempo de subida) e derivamos o resto: h = g*t²/2  e  v0 = g*t
const JUMP_HEIGHT = 2.0;       // altura máxima do pulo completo (unidades da ilha; o Mario tem 1.4)
const TIME_TO_APEX = 0.36;     // segundos até o ponto mais alto
const GRAVITY = (2 * JUMP_HEIGHT) / (TIME_TO_APEX * TIME_TO_APEX);
const JUMP_SPEED = GRAVITY * TIME_TO_APEX;
const FALL_GRAVITY = 1.5;      // gravidade extra na descida: pulo mais "pesado" e responsivo
const JUMP_CUT = 0.45;         // soltar o espaço na subida limita a velocidade vertical a esta fração (pulo curto)
const JUMP_BUFFER = 0.12;      // s: espaço apertado um pouco antes de pousar ainda conta como pulo
const AIR_BLEND = 18;          // rapidez da transição entre a pose de corrida e a de pulo
const LAND_TIME = 0.2;         // s: duração do agachadinho ao pousar
const LAND_CROUCH = 0.8;       // intensidade máxima do agachadinho (0..1)

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
  let vy = 0, onGround = true, airW = 0, jumpBuf = 0, landT = LAND_TIME; // estado do pulo
  anim.pose(phase, { k: 0 });

  return {
    group,
    get onGround() { return onGround; },
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

      // --- pulo: o Y do grupo é a altura do Mario acima do chão (a ilha tem o topo em y = 0) ---
      // consome o toque todo quadro (mesmo no ar) e guarda um instante: pulo "adiantado" funciona
      jumpBuf = consumePress('Space') ? JUMP_BUFFER : Math.max(0, jumpBuf - dt);
      if (onGround && jumpBuf > 0) { vy = JUMP_SPEED; onGround = false; jumpBuf = 0; }
      if (!onGround) {
        if (vy > 0 && !keys.has('Space')) vy = Math.min(vy, JUMP_SPEED * JUMP_CUT); // espaço solto: pulo curto
        vy -= GRAVITY * (vy < 0 ? FALL_GRAVITY : 1) * dt;
        group.position.y += vy * dt;
        if (group.position.y <= 0) { group.position.y = 0; vy = 0; onGround = true; landT = 0; }
      } else {
        landT += dt;
      }

      if (speed > 0.05) { // vira suavemente (pelo menor ângulo) para a direção do movimento
        const diff = Math.atan2(Math.sin(Math.atan2(moveDir.x, moveDir.z) - facing), Math.cos(Math.atan2(moveDir.x, moveDir.z) - facing));
        facing += diff * (1 - Math.exp(-TURN_RATE * dt));
        group.rotation.y = facing; // o modelo olha para +Z
      }

      // a animação acompanha a velocidade: parado = em pé; correndo = ciclo completo
      const k = THREE.MathUtils.clamp(speed / RUN_SPEED, 0, 1);
      if (onGround) phase += dt * CYCLE_HZ * Math.PI * 2 * k; // no ar a passada congela

      // pose de pulo entra/sai suavemente; ao pousar, agacha rápido e levanta (menos se estiver correndo)
      airW += ((onGround ? 0 : 1) - airW) * (1 - Math.exp(-AIR_BLEND * dt));
      const crouch = onGround
        ? LAND_CROUCH * Math.min(1, landT / 0.04) * Math.max(0, 1 - landT / LAND_TIME) * (1 - 0.7 * k)
        : 0;
      anim.pose(phase, { k, jump: { w: airW, u: THREE.MathUtils.clamp(vy / JUMP_SPEED, -1, 1), crouch } });
    },
  };
}