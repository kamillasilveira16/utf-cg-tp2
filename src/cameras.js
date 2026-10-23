import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { keys } from './input.js';
import { ISLAND_SCALE as S } from './island.js';

// centro do diorama (ilha + base rochosa)
export const CENTER = new THREE.Vector3(0, -1.5 * S, 0);

const ELEVATION = THREE.MathUtils.degToRad(45); // ângulo acima do chão da câmera 2
const ROTATION_SPEED = 0.3;                      // rad/s da câmera 2
const MIN_RADIUS = 8 * S, MAX_RADIUS = 40 * S;

const FREE_SPEED = 8 * S;                            // unidades/s da câmera 3
const LOOK_SENSITIVITY = 0.002;                  // rad por pixel do mouse
const MAX_PITCH = THREE.MathUtils.degToRad(89);

export function createCameras(renderer) {
  const aspect = innerWidth / innerHeight;
  const dom = renderer.domElement;

  // Câmera 1 (padrão): orbital, controlada pelo mouse, alvo fixo no centro
  const orbitCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
  orbitCam.position.set(10 * S, 4 * S, 16 * S);
  const controls = new OrbitControls(orbitCam, dom);
  controls.target.copy(CENTER);
  controls.enableDamping = true;
  controls.minDistance = MIN_RADIUS;
  controls.maxDistance = MAX_RADIUS;

  // Câmera 2: ~45° acima do chão, olhando para o centro e girando ao longo do tempo
  const autoCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
  let radius = 18 * S, angle = 0;

  // Câmera 3: navegação livre (WASD anda, Espaço sobe, Shift Esquerdo desce, mouse olha)
  const freeCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
  freeCam.rotation.order = 'YXZ'; // yaw (Y) aplicado antes do pitch (X)
  let yaw = 0, pitch = 0;

  let active = orbitCam; // câmera 1 é a padrão

  // scroll aproxima/afasta a câmera 2 (na câmera 1 quem trata o scroll é o OrbitControls)
  addEventListener('wheel', (e) => {
    if (active === autoCam) radius = THREE.MathUtils.clamp(radius + e.deltaY * 0.015, MIN_RADIUS, MAX_RADIUS);
  });

  // câmera 3: clique no canvas trava o mouse (Esc libera); sem trava, arrastar com o botão esquerdo também gira
  dom.addEventListener('click', () => { if (active === freeCam) dom.requestPointerLock(); });
  addEventListener('mousemove', (e) => {
    if (active !== freeCam) return;
    if (document.pointerLockElement !== dom && e.buttons !== 1) return;
    yaw -= e.movementX * LOOK_SENSITIVITY;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
  });

  function updateFreeCam(dt) {
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const lift = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') ? 1 : 0);

    // andar no plano horizontal, na direção do olhar (yaw)
    let mx = -Math.sin(yaw) * fwd + Math.cos(yaw) * side;
    let mz = -Math.cos(yaw) * fwd - Math.sin(yaw) * side;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; } // diagonal não fica mais rápida

    freeCam.position.x += mx * FREE_SPEED * dt;
    freeCam.position.z += mz * FREE_SPEED * dt;
    freeCam.position.y += lift * FREE_SPEED * dt;
    freeCam.rotation.set(pitch, yaw, 0);
  }

  return {
    get camera() { return active; },
    select(n) {
      const prev = active;
      active = n === 3 ? freeCam : n === 2 ? autoCam : orbitCam;
      controls.enabled = active === orbitCam; // evita o OrbitControls reagir ao mouse/scroll nas outras câmeras

      if (active === freeCam && prev !== freeCam) {
        // começa de onde a câmera anterior estava, olhando para o mesmo lado
        freeCam.position.copy(prev.position);
        const e = new THREE.Euler().setFromQuaternion(prev.quaternion, 'YXZ');
        yaw = e.y;
        pitch = THREE.MathUtils.clamp(e.x, -MAX_PITCH, MAX_PITCH);
        freeCam.rotation.set(pitch, yaw, 0);
      }
      if (prev === freeCam && active !== freeCam) document.exitPointerLock();
    },
    update(dt = 0) {
      if (active === autoCam) {
        angle += dt * ROTATION_SPEED;
        autoCam.position.set(
          CENTER.x + Math.cos(angle) * radius * Math.cos(ELEVATION),
          CENTER.y + Math.sin(ELEVATION) * radius,
          CENTER.z + Math.sin(angle) * radius * Math.cos(ELEVATION));
        autoCam.lookAt(CENTER);
      } else if (active === freeCam) {
        updateFreeCam(dt);
      } else {
        controls.update();
      }
    },
    resize() {
      [orbitCam, autoCam, freeCam].forEach((c) => { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); });
    },
  };
}