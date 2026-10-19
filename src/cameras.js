import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// centro do diorama (ilha + base rochosa)
export const CENTER = new THREE.Vector3(0, -1.5, 0);

export function createCameras(renderer) {
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(10, 4, 16);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CENTER);
  controls.enableDamping = true;
  controls.minDistance = 8;
  controls.maxDistance = 40;

  return {
    camera,
    update() { controls.update(); },
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    },
  };
}
