import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// centro do diorama (ilha + base rochosa)
export const CENTER = new THREE.Vector3(0, -1.5, 0);

const ELEVATION = THREE.MathUtils.degToRad(45); // ângulo acima do chão da câmera 2
const ROTATION_SPEED = 0.3;                      // rad/s da câmera 2
const MIN_RADIUS = 8, MAX_RADIUS = 40;

export function createCameras(renderer) {
  const aspect = innerWidth / innerHeight;

  // Câmera 1 (padrão): orbital, controlada pelo mouse, alvo fixo no centro
  const orbitCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
  orbitCam.position.set(10, 4, 16);
  const controls = new OrbitControls(orbitCam, renderer.domElement);
  controls.target.copy(CENTER);
  controls.enableDamping = true;
  controls.minDistance = MIN_RADIUS;
  controls.maxDistance = MAX_RADIUS;

  // Câmera 2: ~45° acima do chão, olhando para o centro e girando ao longo do tempo
  const autoCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
  let radius = 18, angle = 0;

  let active = orbitCam; // câmera 1 é a padrão

  // scroll aproxima/afasta a câmera 2 do alvo (na câmera 1 quem trata o scroll é o OrbitControls)
  addEventListener('wheel', (e) => {
    if (active === autoCam) radius = THREE.MathUtils.clamp(radius + e.deltaY * 0.015, MIN_RADIUS, MAX_RADIUS);
  });

  return {
    get camera() { return active; },
    select(n) {
      active = n === 2 ? autoCam : orbitCam;
      controls.enabled = active === orbitCam; // evita o OrbitControls reagir ao mouse/scroll na câmera 2
    },
    update(dt = 0) {
      if (active === autoCam) {
        angle += dt * ROTATION_SPEED;
        autoCam.position.set(
          CENTER.x + Math.cos(angle) * radius * Math.cos(ELEVATION),
          CENTER.y + Math.sin(ELEVATION) * radius,
          CENTER.z + Math.sin(angle) * radius * Math.cos(ELEVATION));
        autoCam.lookAt(CENTER);
      } else {
        controls.update();
      }
    },
    resize() {
      [orbitCam, autoCam].forEach((c) => { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); });
    },
  };
}