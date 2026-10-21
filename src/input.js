// teclas atualmente pressionadas (por e.code, ex.: 'KeyW', 'Space', 'ShiftLeft')
export const keys = new Set();

export function setupInput({ onCamera }) {
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault(); // evita rolar a página
    if (e.key === '1') onCamera(1);
    else if (e.key === '2') onCamera(2);
    else if (e.key === '3') onCamera(3);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear()); // não deixa tecla "presa" ao trocar de janela
}