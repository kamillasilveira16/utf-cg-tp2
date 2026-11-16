import * as THREE from 'three';
import { consumePress } from './input.js';

// ----------------------------------------------------------------------------------------------------------
// CONVERSA COM OS PERSONAGENS (como nos jogos do Mario)
//
// - Quando o Mario chega perto de um personagem, aparece em cima dele a etiqueta "Falar" com a tecla E embaixo.
// - Apertando E, o Mario para e vira para o personagem, a câmera vai suavemente para trás do ombro dele, olhando
//   para o personagem, e aparece o balão de fala. O texto vai surgindo letra por letra.
// - E de novo: se o texto ainda está surgindo, mostra ele inteiro; senão, passa para o próximo balão. Depois do
//   último, a conversa acaba e a câmera volta suavemente para a câmera que estava ativa.
// A interface (etiqueta e balão) é feita em HTML por cima do canvas; o visual fica em css/style.css.
// ----------------------------------------------------------------------------------------------------------

// falas de cada personagem (um item por balão)
export const LINES = {
  peach: ['abacate', 'abacate', 'abacate'],
  toad: ['abacate', 'abacate', 'abacate'],
  luigi: ['abacate', 'abacate', 'abacate'],
  yoshi: ['abacate', 'abacate', 'abacate'],
};

const TALK_DISTANCE = 1.6;  // distância (além do corpo do personagem) em que dá para conversar
const BLEND_TIME = 0.8;     // segundos da câmera indo até a conversa (e voltando)
const LETTERS_PER_SEC = 30; // velocidade do texto surgindo

const ease = (t) => t * t * (3 - 2 * t); // começa e termina devagar

// elementos HTML da etiqueta "Falar" e do balão
function buildUI() {
  const keycap = () => Object.assign(document.createElement('span'), { className: 'keycap', textContent: 'E' });

  const prompt = document.createElement('div');
  prompt.className = 'talk-prompt hidden';
  prompt.append(Object.assign(document.createElement('span'), { className: 'talk-label', textContent: 'Falar' }), keycap());

  const box = document.createElement('div');
  box.className = 'speech hidden';
  const name = Object.assign(document.createElement('div'), { className: 'speech-name' });
  const text = Object.assign(document.createElement('p'), { className: 'speech-text' });
  const next = keycap();
  next.classList.add('speech-next');
  const tail = Object.assign(document.createElement('div'), { className: 'speech-tail' });
  box.append(name, text, next, tail);

  document.body.append(prompt, box);
  return { prompt, box, name, text, next, tail };
}

export function createDialogue() {
  const ui = buildUI();
  const talkers = []; // { id, name, position(), height, radius, available() }
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
  let player = null;  // o Mario
  let state = 'idle'; // idle | in (câmera indo) | talk | out (câmera voltando)
  let talker = null, line = 0, shown = 0, blend = 0;
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const to = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const v = new THREE.Vector3(), look = new THREE.Vector3(), m = new THREE.Matrix4();

  const head = (t, out) => out.copy(t.position()).setY(t.position().y + t.height);

  // personagem com quem o Mario vai falar: entre os que estão perto, o mais perto e mais à frente dele (dois
  // personagens lado a lado, como o Yoshi e a Peach, se escolhem virando o Mario para um ou para o outro)
  function nearest() {
    if (!player) return null;
    const p = player.group.position, f = player.group.rotation.y;
    let best = null, bestScore = Infinity;
    for (const t of talkers) {
      if (!t.available()) continue;
      const q = t.position(), dx = q.x - p.x, dz = q.z - p.z, dist = Math.hypot(dx, dz), d = dist - t.radius;
      if (d >= TALK_DISTANCE) continue;
      const facing = dist > 1e-6 ? (dx * Math.sin(f) + dz * Math.cos(f)) / dist : 1; // 1 = bem na frente, -1 = atrás
      const score = d + 1.2 * (1 - facing);
      if (score < bestScore) { best = t; bestScore = score; }
    }
    return best;
  }

  // enquadramento da conversa: atrás do ombro do Mario, olhando para o personagem
  function framing(t, out) {
    const mp = player.group.position, cp = t.position();
    const dx = mp.x - cp.x, dz = mp.z - cp.z, d = Math.hypot(dx, dz) || 1;
    const bx = dx / d, bz = dz / d;           // do personagem para o Mario
    const sx = -bz, sz = bx;                  // para o lado (ombro)
    out.pos.set(mp.x + bx * 2.6 + sx * 1.1, Math.max(mp.y, cp.y) + 1.5, mp.z + bz * 2.6 + sz * 1.1);
    head(t, look).lerp(v.copy(mp).setY(mp.y + 1.0), 0.3); // mira mais no personagem que no Mario
    m.lookAt(out.pos, look, THREE.Object3D.DEFAULT_UP);
    out.quat.setFromRotationMatrix(m);
  }

  function showLine() {
    shown = 0;
    ui.name.textContent = talker.name;
    ui.text.textContent = '';
    ui.next.classList.add('hidden');
  }

  function start(t, current) {
    talker = t; line = 0; state = 'in'; blend = 0;
    from.pos.copy(current.position); from.quat.copy(current.quaternion);
    framing(t, to);
    player.locked = true;
    player.lookAt(t.position());
    ui.prompt.classList.add('hidden');
    ui.box.classList.remove('hidden');
    showLine();
  }

  function finish() {
    state = 'out'; blend = 0;
    from.pos.copy(camera.position); from.quat.copy(camera.quaternion);
    ui.box.classList.add('hidden');
  }

  // põe um elemento HTML em cima de um ponto do mundo
  function place(el, point, cam) {
    v.copy(point).project(cam);
    el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    return v.z < 1; // false = atrás da câmera
  }

  return {
    // personagem que dá para conversar: position() devolve onde ele está (Vector3, pés), height = altura até onde
    // a etiqueta aparece, radius = tamanho do corpo, available() = se dá para conversar agora
    addTalker({ id, name, position, height, radius = 0.5, available = () => true }) {
      talkers.push({ id, name, position, height, radius, available, lines: LINES[id] ?? ['...'] });
    },
    setPlayer(p) { player = p; },
    get active() { return state !== 'idle'; },
    // câmera para desenhar a cena: a da conversa enquanto ela acontece (ou null: use a câmera normal)
    get camera() { return state === 'idle' ? null : camera; },

    // chame a cada quadro depois do Mario e das câmeras se mexerem; `current` = câmera ativa normal
    update(dt, current) {
      const pressed = consumePress('KeyE'); // consome sempre: um E apertado antes não "sobra" para depois
      camera.aspect = current.aspect; camera.fov = current.fov; camera.updateProjectionMatrix();

      if (state === 'idle') {
        const t = nearest();
        if (!t) { ui.prompt.classList.add('hidden'); return; }
        if (pressed) { start(t, current); return; }
        const visible = place(ui.prompt, head(t, look).setY(look.y + 0.35), current);
        ui.prompt.classList.toggle('hidden', !visible);
        return;
      }

      if (state === 'in' || state === 'out') {
        blend = Math.min(1, blend + dt / BLEND_TIME);
        const k = ease(blend);
        const goal = state === 'in' ? to : { pos: current.position, quat: current.quaternion }; // volta para a câmera ativa (que pode estar andando)
        camera.position.lerpVectors(from.pos, goal.pos, k);
        camera.quaternion.slerpQuaternions(from.quat, goal.quat, k);
        if (blend >= 1) {
          if (state === 'in') state = 'talk';
          else { state = 'idle'; player.locked = false; talker = null; return; }
        }
      }

      if (state === 'in' || state === 'talk') {
        // texto surgindo letra por letra; E completa o texto ou passa para o próximo balão
        const full = talker.lines[line];
        if (pressed && state === 'talk') {
          if (shown < full.length) shown = full.length;
          else if (++line < talker.lines.length) showLine();
          else { finish(); return; }
        }
        shown = Math.min(full.length, shown + dt * LETTERS_PER_SEC);
        ui.text.textContent = talker.lines[line].slice(0, Math.floor(shown));
        ui.next.classList.toggle('hidden', shown < talker.lines[line].length);
        // a pontinha do balão aponta para o personagem
        v.copy(head(talker, look)).project(camera);
        const x = THREE.MathUtils.clamp((v.x * 0.5 + 0.5) * innerWidth - ui.box.getBoundingClientRect().left, 40, ui.box.clientWidth - 40);
        ui.tail.style.left = `${x}px`;
      }
    },
  };
}
