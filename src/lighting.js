import * as THREE from 'three';

export function createLights(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 4);
  scene.add(sun, new THREE.HemisphereLight(0xcdeeff, 0x6b4a3a, 0.9));
  return sun;
}