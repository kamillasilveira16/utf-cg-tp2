// teclas atualmente pressionadas (por e.code, ex.: 'KeyW', 'Space', 'ShiftLeft')
export const keys = new Set();

// teclas apertadas desde a última consulta: um toque rápido (keydown+keyup entre dois quadros)
// não se perde, ao contrário de olhar só `keys`. Consuma com consumePress('Space').
const pressed = new Set();
export const consumePress = (code) => pressed.delete(code); // true se foi apertada desde a última vez

export function setupInput({ onCamera }) {
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (!e.repeat) pressed.add(e.code); // segurar a tecla não repete o toque
    if (e.code === 'Space') e.preventDefault(); // evita rolar a página
    if (e.key === '1') onCamera(1);
    else if (e.key === '2') onCamera(2);
    else if (e.key === '3') onCamera(3);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); pressed.clear(); }); // não deixa tecla "presa" ao trocar de janela
}