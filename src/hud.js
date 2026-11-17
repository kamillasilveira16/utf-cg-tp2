// ----------------------------------------------------------------------------------------------------------
// PAINEL DO CANTO SUPERIOR ESQUERDO: a hora do dia e as teclas do jogo, com o estado atual de cada uma
// (câmera ativa, o que o Yoshi está fazendo, luz ligada ou não...). A tecla F mostra/esconde o painel.
//
// Hora: o ciclo dia/noite (daynight.js) tem 1 minuto de dia e 1 de noite. No relógio, o dia vai das 6:00 às 18:00
// e a noite das 18:00 às 6:00, então cada minuto de jogo vale 12 horas (1 hora = 5 segundos).
// ----------------------------------------------------------------------------------------------------------

const CAMERAS = { 1: 'automática', 2: 'orbital', 3: 'terceira pessoa' };
const YOSHI_SPOTS = ['imitando a Peach', 'imitando o Capitão Toad', 'imitando o Luigi'];

const keys = (...k) => k.map((t) => `<kbd>${t}</kbd>`).join('');

export function createHud({ cameras, lighting, dayNight, yoshi = () => null }) {
  const panel = document.createElement('div');
  panel.className = 'hud';
  panel.innerHTML = `
    <div class="hud-clock"><span class="hud-icon"></span><span class="hud-time"></span></div>
    <div class="hud-row">${keys('1', '2', '3')}<span>Câmera <em data-state="camera"></em></span></div>
    <div class="hud-row">${keys('Scroll')}<span>Zoom</span></div>
    <div class="hud-row">${keys('Arrastar')}<span>Girar (câmera 2)</span></div>
    <div class="hud-row">${keys('Clique')}<span>Olhar com o mouse (câmera 3)</span></div>
    <div class="hud-row">${keys('W', 'A', 'S', 'D')}<span>Andar</span></div>
    <div class="hud-row">${keys('Espaço')}<span>Pular</span></div>
    <div class="hud-row">${keys('E')}<span>Falar <em>(perto de alguém)</em></span></div>
    <div class="hud-row">${keys('P')}<span>Pose do Yoshi <em data-state="yoshi"></em></span></div>
    <div class="hud-row">${keys('L')}<span>Luz <em data-state="light"></em></span></div>
    <div class="hud-row">${keys('T')}<span>Acelerar o tempo <em data-state="time"></em></span></div>
    <div class="hud-row">${keys('F')}<span>Esconder painel</span></div>`;
  document.body.append(panel);
  const el = (s) => panel.querySelector(s);
  const time = el('.hud-time'), icon = el('.hud-icon');
  const state = Object.fromEntries([...panel.querySelectorAll('[data-state]')].map((e) => [e.dataset.state, e]));
  const set = (e, text) => { if (e.textContent !== text) e.textContent = text; }; // só mexe no HTML se mudou

  return {
    toggle() { panel.classList.toggle('hidden'); },
    update() {
      if (panel.classList.contains('hidden')) return;
      // relógio: t = 0 é 6:00 (começo do dia); 120 s de ciclo = 24 h
      const minutes = Math.floor(((6 + dayNight.time / 5) % 24) * 60);
      const h = Math.floor(minutes / 60), m = minutes % 60;
      set(time, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      set(icon, h >= 6 && h < 18 ? '☀️' : '🌙');

      set(state.camera, `(${CAMERAS[cameras.index]})`);
      const y = yoshi();
      set(state.yoshi, y ? `(${y.running ? 'correndo' : YOSHI_SPOTS[y.spot]})` : '');
      set(state.light, lighting.enabled ? '(ligada)' : '(desligada)');
      set(state.time, dayNight.isDay ? '(até a noite)' : '(até o dia)');
    },
  };
}
