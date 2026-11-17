// ----------------------------------------------------------------------------------------------------------
// MÚSICA DE FUNDO E EFEITOS SONOROS (opcional "Música/sons") + botão de volume no canto superior direito
//
// - A música toca em loop. Os navegadores só deixam tocar som depois de o usuário interagir com a página, então ela
//   começa no primeiro clique ou tecla.
// - O botão abre/fecha uma barra para ajustar o VOLUME GERAL; o ícone mostra esse volume (mudo, baixo ou alto).
//   O volume escolhido fica salvo no navegador para a próxima visita.
// - Efeitos sonoros (playSound): o pulo do Mario e a voz de cada personagem ao começar uma conversa.
// - Volume de cada áudio: MUSIC_VOLUME (música) e `volume` em SOUNDS (efeitos), de 0 a 1, ajustados aqui no código.
//   O volume tocado é (volume geral da barra) × (volume do áudio): a barra aumenta ou diminui todos juntos, sem
//   mudar a proporção entre eles.
// ----------------------------------------------------------------------------------------------------------

const SRC = new URL('../assets/music/Background_Music.mp3', import.meta.url).href;
const DEFAULT_VOLUME = 0.6; // volume geral inicial (a barra começa aqui)

// ---- volume de cada áudio (0 = mudo, 1 = volume original do arquivo) ----
const MUSIC_VOLUME = 0.25;     // música de fundo
const SFX_BASE = new URL('../assets/music/', import.meta.url).href;
const SOUNDS = {            // nome do efeito -> arquivo em assets/music e volume dele
  jump: { file: 'Mario_Pulo.oga', volume: 0.07 },
  peach: { file: 'Peach.mp3', volume: 0.60 },
  toad: { file: 'Toad.mp3', volume: 0.8 },
  luigi: { file: 'Luigi.mp3', volume: 0.5 },
  yoshi: { file: 'Yoshi.mp3', volume: 1 },
};

const sounds = {}; // áudios já carregados (um por efeito; cada toque usa uma cópia, para dois pulos seguidos não se cortarem)
let master = DEFAULT_VOLUME; // volume geral (barra)
const load = (name) => sounds[name] ?? (sounds[name] = Object.assign(new Audio(SFX_BASE + SOUNDS[name].file), { preload: 'auto' }));

// toca um efeito sonoro (ver SOUNDS); antes de o usuário interagir com a página o navegador não deixa, e ele é ignorado
export function playSound(name) {
  const v = master * SOUNDS[name].volume;
  if (v <= 0) return;
  const a = load(name).cloneNode();
  a.volume = Math.min(1, v);
  a.play().catch(() => {});
}
const STORAGE_KEY = 'diorama-volume';

// ícones (SVG): alto-falante com 0, 1 ou 2 ondas, ou cortado (mudo)
const SPEAKER = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>';
const ICONS = {
  mute: SPEAKER + '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  low: SPEAKER + '<path d="M15.5 9.5a4 4 0 0 1 0 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  high: SPEAKER + '<path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
};

function loadVolume() {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}
function saveVolume(v) {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* sem armazenamento: só não lembra */ }
}

export function setupMusic() {
  const audio = new Audio(SRC);
  audio.loop = true;
  master = loadVolume();
  audio.volume = Math.min(1, master * MUSIC_VOLUME);
  for (const name of Object.keys(SOUNDS)) load(name); // carrega os efeitos já

  // interface: botão redondo + barra que aparece ao lado
  const box = document.createElement('div');
  box.className = 'volume';
  box.innerHTML = `
    <div class="volume-bar hidden">
      <input type="range" min="0" max="100" step="1" aria-label="Volume da música">
      <span class="volume-value"></span>
    </div>
    <button class="volume-button" type="button" aria-label="Volume da música" title="Volume da música">
      <svg viewBox="0 0 24 24" width="26" height="26"></svg>
    </button>`;
  document.body.append(box);
  const bar = box.querySelector('.volume-bar'), slider = box.querySelector('input');
  const value = box.querySelector('.volume-value'), icon = box.querySelector('svg');

  function show() {
    const v = master; // a barra e o ícone mostram o volume geral
    slider.value = Math.round(v * 100);
    value.textContent = `${Math.round(v * 100)}%`;
    slider.style.setProperty('--fill', `${v * 100}%`); // parte preenchida da barra
    icon.innerHTML = v === 0 ? ICONS.mute : v < 0.5 ? ICONS.low : ICONS.high;
  }
  show();

  box.querySelector('.volume-button').addEventListener('click', () => {
    bar.classList.toggle('hidden');
    start(); // o clique também conta como interação: já pode tocar
  });
  slider.addEventListener('input', () => {
    master = slider.value / 100;
    audio.volume = Math.min(1, master * MUSIC_VOLUME);
    saveVolume(master);
    show();
  });
  slider.addEventListener('change', () => slider.blur()); // solta o foco: as setas e o espaço voltam para o jogo
  // clicar fora fecha a barra
  addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) bar.classList.add('hidden'); });

  // começa a tocar na primeira interação do usuário com a página
  let started = false;
  function start() {
    if (started) return;
    audio.play().then(() => { started = true; }).catch(() => { /* ainda bloqueado: tenta na próxima interação */ });
  }
  addEventListener('pointerdown', start);
  addEventListener('keydown', start);

  return { audio };
}
