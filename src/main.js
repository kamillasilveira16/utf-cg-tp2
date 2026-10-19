import * as THREE from 'three';
import { createLights } from './lighting.js';
import { createCameras } from './cameras.js';
import { createIsland } from './island.js';

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

addEventListener('resize', () => { cameras.resize(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  island.group.position.y = Math.sin(t * 0.8) * 0.2; // ilha flutuando
  island.update(t);
  cameras.update();
  renderer.render(scene, cameras.camera);
});
