import * as THREE from 'three';
import { createLights, createLighting, MATERIALS } from './lighting.js';
import { createCameras } from './cameras.js';
import { createIsland } from './island.js';
import { setupInput } from './input.js';
import { loadMario } from './mario.js';
import { loadCastle } from './castle.js';
import { loadToadHouse } from './toadhouse.js';
import { loadLuigiHouse } from './luigihouse.js';
import { loadPeach } from './peach.js';
import { loadCaptainToad } from './captaintoad.js';
import { loadLuigi } from './luigi.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe6ff);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

createLights(scene);
const lighting = createLighting(scene); // modelo de Phong + tecla L (ver lighting.js)
const cameras = createCameras(renderer);

// mundo
const island = createIsland();
scene.add(island.group);
lighting.register(island.group, MATERIALS.terreno);

// personagem (carrega de forma assíncrona; a cena já roda enquanto o modelo baixa)
let mario = null;
loadMario().then((m) => {
  mario = m;
  island.group.add(lighting.register(m.group, MATERIALS.personagem));
  cameras.setFollowTarget(m.group);
}).catch(console.error);

// castelo da Peach no topo do morro mais alto
loadCastle().then((c) => island.group.add(lighting.register(c, MATERIALS.construcao))).catch(console.error);

// casa do Toad no morro do Toad
loadToadHouse().then((h) => island.group.add(lighting.register(h, MATERIALS.casa))).catch(console.error);

// casa do Luigi no morro do Luigi
loadLuigiHouse().then((h) => island.group.add(lighting.register(h, MATERIALS.casa))).catch(console.error);

// Peach em frente à porta do castelo
loadPeach().then((p) => island.group.add(lighting.register(p, MATERIALS.personagem))).catch(console.error);

// Capitão Toad em frente à porta da casa do Toad
loadCaptainToad().then((t) => island.group.add(lighting.register(t, MATERIALS.personagem))).catch(console.error);

// Luigi em frente à porta da casa dele
loadLuigi().then((l) => island.group.add(lighting.register(l, MATERIALS.personagem))).catch(console.error);

setupInput({ onCamera: cameras.select, onLighting: lighting.toggle });
addEventListener('resize', () => { cameras.resize(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; // limita dt: depois de uma aba em segundo plano o Mario não atravessa o castelo num quadro só
  island.update(t);
  if (mario) mario.update(dt, cameras.heading); // antes da câmera: a câmera 3 segue o Mario
  cameras.update(dt);
  renderer.render(scene, cameras.camera);
});