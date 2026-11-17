import * as THREE from 'three';
import { standHeight, groundHeight } from './island.js';

// ----------------------------------------------------------------------------------------------------------
// SOMBRAS DOS PERSONAGENS (opcional ⭐ "Sombras"), do tipo "blob shadow": uma mancha escura e borrada no chão,
// embaixo de cada personagem (como nos jogos do Mario).
// A sombra segue a fonte de luz da cena (a luz direcional: sol de dia, lua à noite, ver daynight.js):
// - sai para o lado oposto ao da luz e se estica nessa direção quanto mais baixa a luz estiver (fim de tarde = sombra
//   comprida e deslocada; meio-dia = sombra redonda bem embaixo);
// - fica mais forte com luz forte e mais fraca com luz fraca (à noite, com o luar, quase some);
// - acompanha a inclinação do chão e, quando o personagem pula, fica no chão e diminui;
// - com a iluminação desligada (tecla L) não há luz, então não há sombra.
// ----------------------------------------------------------------------------------------------------------

const LIFT = 0.04;         // acima do chão (e das estradas)
const MAX_OPACITY = 0.6;   // sombra com a luz mais forte
const FULL_LIGHT = 2.2;    // intensidade da luz em que a sombra fica mais forte (o sol do meio-dia)

// textura: círculo escuro com borda que vai sumindo (gerada uma vez, num canvas)
function blobTexture() {
  const size = 128, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function createBlobShadows({ sun, lighting }) {
  const group = new THREE.Group();
  const texture = blobTexture();
  const geometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); // deitado no chão, raio 1
  const blobs = [];
  const light = new THREE.Vector3(), normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tilt = new THREE.Quaternion(), turn = new THREE.Quaternion(), world = new THREE.Vector3();

  // normal do chão em (x, z), pela inclinação do relevo
  function groundNormal(x, z, out) {
    const e = 0.3;
    const dx = groundHeight(x + e, z) - groundHeight(x - e, z), dz = groundHeight(x, z + e) - groundHeight(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  }

  return {
    group,
    // sombra embaixo de `target` (o grupo do personagem); radius = tamanho da mancha, height = altura do personagem
    add(target, { radius = 0.5, height = 1.5 } = {}) {
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -16, // por cima do chão e das estradas
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 1; // depois do chão
      group.add(mesh);
      blobs.push({ target, radius, height, mesh });
    },
    update() {
      // direção horizontal para onde a sombra vai (oposta à luz) e quanto a luz está baixa
      light.copy(sun.position).normalize();
      const horiz = Math.hypot(light.x, light.z);
      const stretch = Math.min(horiz / Math.max(light.y, 0.05), 1.6); // 0 = luz a pino; maior = luz baixa
      const away = Math.atan2(-light.x, -light.z);                     // ângulo (em Y) do lado oposto à luz
      const strength = THREE.MathUtils.clamp(sun.intensity / FULL_LIGHT, 0, 1);
      group.visible = lighting.enabled && strength > 0.01;

      for (const b of blobs) {
        b.target.getWorldPosition(world);
        const floor = standHeight(world.x, world.z);
        const air = Math.max(0, world.y - floor); // altura do pulo
        const fade = 1 / (1 + air * 1.2);         // longe do chão: menor e mais clara
        // desloca para o lado oposto ao da luz, proporcional à altura do personagem e a quão baixa está a luz
        const shift = stretch * b.height * 0.22;
        const x = world.x - (light.x / (horiz || 1)) * shift, z = world.z - (light.z / (horiz || 1)) * shift;
        // altura: o ponto mais alto do chão embaixo da mancha (no centro e em volta), para ela não entrar no chão
        let h = standHeight(x, z);
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2;
          h = Math.max(h, standHeight(x + Math.cos(ang) * b.radius * 0.7, z + Math.sin(ang) * b.radius * 0.7));
        }
        b.mesh.position.set(x, h + LIFT, z);
        // deita no chão inclinado e estica na direção da sombra
        tilt.setFromUnitVectors(up, groundNormal(x, z, normal));
        turn.setFromAxisAngle(up, away);
        b.mesh.quaternion.copy(tilt).multiply(turn);
        const r = b.radius * (0.6 + 0.4 * fade);
        b.mesh.scale.set(r, 1, r * (1 + stretch * 0.45));
        b.mesh.material.opacity = MAX_OPACITY * (0.35 + 0.65 * strength) * fade;
      }
    },
  };
}
