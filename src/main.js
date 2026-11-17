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
import { loadPiranhaPlants } from './piranha.js';
import { loadYoshi } from './yoshi.js';
import { loadSky } from './sky.js';
import { WIND } from './wind.js';
import { createTrees } from './trees.js';
import { loadFlag } from './flag.js';
import { createRoads } from './roads.js';
import { createDialogue } from './dialogue.js';
import { createDayNight } from './daynight.js';
import { createBlobShadows } from './shadows.js';
import { setupMusic } from './music.js';
import { createHud } from './hud.js';
import { PEACH_SITE, CAPTAIN_TOAD_SITE, LUIGI_CHAR_SITE, standHeight } from './island.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe6ff); // aparece só até o céu carregar

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false; // limpa uma vez por quadro e desenha o céu e depois a cena por cima
document.body.appendChild(renderer.domElement);

const lights = createLights(scene);
const dayNight = createDayNight(lights); // ciclo dia/noite: muda a luz e o céu com o tempo (ver daynight.js)
const lighting = createLighting(scene); // modelo de Phong + tecla L (ver lighting.js)
const cameras = createCameras(renderer);

// sombras simples (manchas no chão) embaixo dos personagens, seguindo a luz do sol/lua (ver shadows.js)
const shadows = createBlobShadows({ sun: lights.sun, lighting });
scene.add(shadows.group);

// conversa com os personagens: chegar perto + tecla E (ver dialogue.js)
const dialogue = createDialogue();
const at = (s) => { const p = new THREE.Vector3(s.x, standHeight(s.x, s.z), s.z); return () => p; }; // personagem parado
dialogue.addTalker({ id: 'peach', name: 'Peach', position: at(PEACH_SITE), height: 1.6, radius: PEACH_SITE.colliderRadius });
dialogue.addTalker({ id: 'toad', name: 'Capitão Toad', position: at(CAPTAIN_TOAD_SITE), height: 1.1, radius: CAPTAIN_TOAD_SITE.colliderRadius });
dialogue.addTalker({ id: 'luigi', name: 'Luigi', position: at(LUIGI_CHAR_SITE), height: 1.6, radius: LUIGI_CHAR_SITE.colliderRadius });

// mundo
const island = createIsland();
scene.add(island.group);
lighting.register(island.group, MATERIALS.terreno);

// plantas carnívoras: o objeto hierárquico (ver piranha.js)
let piranhas = null;
loadPiranhaPlants().then((p) => {
  piranhas = p;
  island.group.add(lighting.register(p.group, MATERIALS.planta));
}).catch(console.error);

// personagem (carrega de forma assíncrona; a cena já roda enquanto o modelo baixa)
let mario = null;
loadMario().then((m) => {
  mario = m;
  island.group.add(lighting.register(m.group, MATERIALS.personagem));
  cameras.setFollowTarget(m.group);
  dialogue.setPlayer(m);
  shadows.add(m.group, { radius: 0.45, height: 1.4 });
}).catch(console.error);

// castelo da Peach no topo do morro mais alto
loadCastle().then((c) => island.group.add(lighting.register(c, MATERIALS.construcao))).catch(console.error);

// casa do Toad no morro do Toad
loadToadHouse().then((h) => island.group.add(lighting.register(h, MATERIALS.casa))).catch(console.error);

// casa do Luigi no morro do Luigi
loadLuigiHouse().then((h) => island.group.add(lighting.register(h, MATERIALS.casa))).catch(console.error);

// Peach em frente à porta do castelo
loadPeach().then((p) => {
  island.group.add(lighting.register(p, MATERIALS.personagem));
  shadows.add(p, { radius: 0.6, height: 1.6 });
}).catch(console.error);

// Capitão Toad em frente à porta da casa do Toad
loadCaptainToad().then((t) => {
  island.group.add(lighting.register(t, MATERIALS.personagem));
  shadows.add(t, { radius: 0.45, height: 1.1 });
}).catch(console.error);

// Luigi em frente à porta da casa dele
loadLuigi().then((l) => {
  island.group.add(lighting.register(l, MATERIALS.personagem));
  shadows.add(l, { radius: 0.45, height: 1.6 });
}).catch(console.error);

// estradas de terra do centro até a porta de cada casa (ver roads.js)
island.group.add(lighting.register(createRoads(), MATERIALS.terreno));

// árvores low-poly (as copas balançam com o vento, ver trees.js e wind.js)
island.group.add(lighting.register(createTrees(), MATERIALS.arvore));

// poste com bandeira no morro 'bandeira' (a bandeira tremula com o vento, ver flag.js)
let flag = null;
loadFlag().then((f) => {
  flag = f;
  island.group.add(lighting.register(f.group, MATERIALS.construcao));
}).catch(console.error);

// céu: domo que acompanha a câmera (ver sky.js); fora da ilha e sem iluminação
let sky = null;
loadSky().then((s) => {
  sky = s;
  dayNight.sky = s;
  scene.background = null; // o fundo agora é o céu, desenhado antes (cena própria)
}).catch(console.error);

// Yoshi: o personagem com 3 poses (tecla P), cada uma ao lado de um personagem (ver yoshi.js)
let yoshi = null;
loadYoshi().then((y) => {
  yoshi = y;
  island.group.add(lighting.register(y.group, MATERIALS.personagem));
  shadows.add(y.group, { radius: 0.6, height: 1.6 });
  // o Yoshi anda: a posição é a atual, e só dá para conversar com ele parado
  dialogue.addTalker({ id: 'yoshi', name: 'Yoshi', position: () => y.group.position, height: 1.7, radius: 0.5, available: () => !y.running });
}).catch(console.error);

setupMusic(); // música de fundo + botão de volume (ver music.js)
// painel com a hora e as teclas, no canto superior esquerdo (tecla F mostra/esconde; ver hud.js)
const hud = createHud({ cameras, lighting, dayNight, yoshi: () => yoshi });
setupInput({ onCamera: cameras.select, onLighting: lighting.toggle, onPose: () => { if (!dialogue.active) yoshi?.nextPose(); }, onTime: dayNight.skip, onPanel: hud.toggle }); // sem trocar de pose no meio da conversa
addEventListener('resize', () => { cameras.resize(); renderer.setSize(innerWidth, innerHeight); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; // limita dt: depois de uma aba em segundo plano o Mario não atravessa o castelo num quadro só
  dayNight.update(dt); // hora do dia: luz e céu
  WIND.update(t); // vento: tempo e direção (o shear em si é feito no shader)
  island.update(t);
  if (flag) flag.update(dt);
  if (piranhas) piranhas.update(t);
  if (yoshi) yoshi.update(dt);
  if (mario) mario.update(dt, cameras.heading); // antes da câmera: a câmera 3 segue o Mario
  cameras.update(dt);
  shadows.update(); // depois de todos se mexerem
  hud.update();
  dialogue.update(dt, cameras.camera); // depois do Mario e da câmera: etiqueta "Falar", balões e câmera da conversa
  const camera = dialogue.camera || cameras.camera;
  if (sky) renderer.setClearColor(sky.clearColor);
  renderer.clear();
  if (sky) { sky.update(camera); renderer.render(sky.scene, camera); } // céu primeiro (depois da câmera se mexer)
  renderer.render(scene, camera);
});