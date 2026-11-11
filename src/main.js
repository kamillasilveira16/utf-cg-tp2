import * as THREE from 'three';
import { createLights } from './lighting.js';
import { createCameras } from './cameras.js';
import { createIsland } from './island.js';
import { setupInput } from './input.js';
import { loadMario } from './mario.js';
import { loadCastle } from './castle.js';

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

// personagem (carrega de forma assíncrona; a cena já roda enquanto o modelo baixa)
let mario = null;
loadMario().then((m) => {
  mario = m;
  island.group.add(m.group);
  cameras.setFollowTarget(m.group);
}).catch(console.error);

// castelo da Peach no topo do morro mais alto
loadCastle().then((c) => island.group.add(c)).catch(console.error);

setupInput({ onCamera: cameras.select });
addEventListener('resize', () => { cameras.resize(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; // limita dt: depois de uma aba em segundo plano o Mario não atravessa o castelo num quadro só
  island.update(t);
  if (mario) mario.update(dt, cameras.heading); // antes da câmera: a câmera 3 segue o Mario
  cameras.update(dt);
  renderer.render(scene, cameras.camera);
});