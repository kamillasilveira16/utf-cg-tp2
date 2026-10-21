export function setupInput({ onCamera }) {
  addEventListener('keydown', (e) => {
    if (e.key === '1') onCamera(1);
    else if (e.key === '2') onCamera(2);
  });
}