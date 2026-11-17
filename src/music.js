// ----------------------------------------------------------------------------------------------------------
// MÚSICA DE FUNDO (opcional "Música/sons") + botão de volume no canto superior direito
//
// - A música toca em loop. Os navegadores só deixam tocar som depois de o usuário interagir com a página, então ela
//   começa no primeiro clique ou tecla.
// - O botão abre/fecha uma barra para ajustar o volume; o ícone mostra o volume atual (mudo, baixo ou alto).
//   O volume escolhido fica salvo no navegador para a próxima visita.
// ----------------------------------------------------------------------------------------------------------

const SRC = new URL('../assets/music/prologue.mp3', import.meta.url).href;
const DEFAULT_VOLUME = 0.4;
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
  audio.volume = loadVolume();

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
    const v = audio.volume;
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
    audio.volume = slider.value / 100;
    saveVolume(audio.volume);
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
