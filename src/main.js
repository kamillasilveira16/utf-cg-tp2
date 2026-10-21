import * as THREE from 'three';
import { createLights } from './lighting.js';
import { createCameras } from './cameras.js';
import { createIsland } from './island.js';
import { setupInput } from './input.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe6ff);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

createLights(scene);
const cameras = createCameras(renderer);

// mundo
const island = createIsland();
scene.add(island.group);

setupInput({ onCamera: cameras.select });
addEventListener('resize', () => { cameras.resize(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  island.group.position.y = Math.sin(t * 0.8) * 0.2; // ilha flutuando
  island.update(t);
  cameras.update(dt);
  renderer.render(scene, cameras.camera);
});