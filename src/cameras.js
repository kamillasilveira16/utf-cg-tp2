import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ISLAND_SCALE as S } from './island.js';

// centro do diorama (ilha + base rochosa)
export const CENTER = new THREE.Vector3(0, -1.5 * S, 0);

const ELEVATION = THREE.MathUtils.degToRad(45); // ângulo acima do chão da câmera 2
const ROTATION_SPEED = 0.3;                      // rad/s da câmera 2
const MIN_RADIUS = 8 * S, MAX_RADIUS = 40 * S;

// câmera 3: terceira pessoa, atrás e acima do Mario
const FOLLOW_LOOK_HEIGHT = 1.0;                  // altura do Mario que a câmera mira (peito)
const FOLLOW_DIST = 6, FOLLOW_MIN_DIST = 2.5, FOLLOW_MAX_DIST = 15;
const FOLLOW_PITCH = THREE.MathUtils.degToRad(35);     // elevação inicial acima do Mario
const FOLLOW_MIN_PITCH = THREE.MathUtils.degToRad(10);
const FOLLOW_MAX_PITCH = THREE.MathUtils.degToRad(80);
const FOLLOW_SMOOTH = 12;                        // quanto maior, mais "colada" no Mario
const LOOK_SENSITIVITY = 0.002;                  // rad por pixel do mouse

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

  // Câmera 3: terceira pessoa. Mouse gira em volta do Mario, scroll aproxima/afasta.
  const followCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
  let target = null;                 // objeto a seguir (o Mario)
  let heading = 0;                   // para onde a câmera olha na horizontal (frente = (sin h, cos h))
  let followPitch = FOLLOW_PITCH, followDist = FOLLOW_DIST, snap = true;
  const lookAt = new THREE.Vector3(), desired = new THREE.Vector3();

  let active = orbitCam; // câmera 1 é a padrão

  // direção horizontal para onde uma câmera olha (guarda a última válida se olhar direto para baixo)
  const _d = new THREE.Vector3();
  let lastHeading = 0;
  function headingOf(cam) {
    cam.getWorldDirection(_d);
    if (Math.hypot(_d.x, _d.z) > 0.1) lastHeading = Math.atan2(_d.x, _d.z);
    return lastHeading;
  }

  addEventListener('wheel', (e) => {
    // câmera 2: aproxima/afasta do alvo (na câmera 1 quem trata o scroll é o OrbitControls)
    if (active === autoCam) radius = THREE.MathUtils.clamp(radius + e.deltaY * 0.015, MIN_RADIUS, MAX_RADIUS);
    if (active === followCam) followDist = THREE.MathUtils.clamp(followDist + e.deltaY * 0.01, FOLLOW_MIN_DIST, FOLLOW_MAX_DIST);
  });

  // câmera 3: clique no canvas trava o mouse (Esc libera); sem trava, arrastar com o botão esquerdo também gira
  dom.addEventListener('click', () => { if (active === followCam) dom.requestPointerLock(); });
  addEventListener('mousemove', (e) => {
    if (active !== followCam) return;
    if (document.pointerLockElement !== dom && e.buttons !== 1) return;
    heading -= e.movementX * LOOK_SENSITIVITY;
    followPitch = THREE.MathUtils.clamp(followPitch + e.movementY * LOOK_SENSITIVITY, FOLLOW_MIN_PITCH, FOLLOW_MAX_PITCH);
  });

  function updateFollowCam(dt) {
    if (!target) return;
    target.getWorldPosition(lookAt);
    lookAt.y += FOLLOW_LOOK_HEIGHT;
    // posição desejada: atrás do Mario (oposto ao heading) e acima, a followDist de distância
    const cp = Math.cos(followPitch), sp = Math.sin(followPitch);
    desired.set(
      lookAt.x - Math.sin(heading) * cp * followDist,
      lookAt.y + sp * followDist,
      lookAt.z - Math.cos(heading) * cp * followDist);
    if (snap) { followCam.position.copy(desired); snap = false; }
    else followCam.position.lerp(desired, 1 - Math.exp(-FOLLOW_SMOOTH * dt));
    followCam.lookAt(lookAt);
  }

  return {
    get camera() { return active; },
    // direção horizontal da câmera ativa: o Mario anda relativo a ela
    get heading() { return active === followCam ? heading : headingOf(active); },
    setFollowTarget(obj) { target = obj; },
    select(n) {
      const prev = active;
      active = n === 3 ? followCam : n === 2 ? autoCam : orbitCam;
      controls.enabled = active === orbitCam; // evita o OrbitControls reagir ao mouse/scroll nas outras câmeras

      if (active === followCam && prev !== followCam) {
        heading = headingOf(prev); // começa olhando para o mesmo lado da câmera anterior
        snap = true;
      }
      if (prev === followCam && active !== followCam) document.exitPointerLock();
    },
    update(dt = 0) {
      if (active === autoCam) {
        angle += dt * ROTATION_SPEED;
        autoCam.position.set(
          CENTER.x + Math.cos(angle) * radius * Math.cos(ELEVATION),
          CENTER.y + Math.sin(ELEVATION) * radius,
          CENTER.z + Math.sin(angle) * radius * Math.cos(ELEVATION));
        autoCam.lookAt(CENTER);
      } else if (active === followCam) {
        updateFollowCam(dt);
      } else {
        controls.update();
      }
    },
    resize() {
      [orbitCam, autoCam, followCam].forEach((c) => { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); });
    },
  };
}