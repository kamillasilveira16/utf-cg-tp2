import * as THREE from 'three';
import { MOON_DIR } from './sky.js';

// ----------------------------------------------------------------------------------------------------------
// CICLO DIA/NOITE (opcional ⭐ "Ciclo dia/noite")
//
// O tempo passa: DAY_LENGTH segundos de dia e NIGHT_LENGTH de noite. A hora define como a cena é desenhada:
// - a luz direcional é o SOL de dia (anda pelo céu de um lado ao outro; branca no alto, alaranjada perto do horizonte)
//   e a LUA à noite (fraca e azulada, vindo da direção da lua do céu noturno);
// - a luz ambiente (hemisférica) também muda de cor e de força;
// - o céu troca: o do dia vai sumindo e mostra o céu noturno (com estrelas e lua), e fica alaranjado no nascer e no
//   pôr do sol (ver sky.js).
// As trocas dia -> noite e noite -> dia são suaves e duram TWILIGHT segundos.
// Tecla T: acelera o tempo até o próximo período (até a noite, se for dia; até o dia, se for noite).
// ----------------------------------------------------------------------------------------------------------

const DAY_LENGTH = 60, NIGHT_LENGTH = 60, CYCLE = DAY_LENGTH + NIGHT_LENGTH; // segundos
const TWILIGHT = 8;       // duração do nascer e do pôr do sol
const SKIP_TIME = 2.5;    // segundos que a tecla T leva para chegar ao próximo período
const START = TWILIGHT;   // começa de manhã, já claro

const SUN_DAY = new THREE.Color(0xffffff), SUN_LOW = new THREE.Color(0xffa060), MOON = new THREE.Color(0x9fb4ff);
const SKY_DAY = new THREE.Color(0xcdeeff), SKY_NIGHT = new THREE.Color(0x2a3b6e);     // luz ambiente: cor do céu
const GROUND_DAY = new THREE.Color(0x6b4a3a), GROUND_NIGHT = new THREE.Color(0x1a1a2a); // e da terra
const SUNSET_TINT = new THREE.Color(0xffa070);

const smooth = THREE.MathUtils.smoothstep;

// quanto é dia (1) ou noite (0) no instante t do ciclo
function daynessAt(t) {
  const h = TWILIGHT / 2;
  if (t < DAY_LENGTH / 2) return smooth(t, -h, h);                  // amanhecendo (o ciclo começa no meio do nascer do sol)
  if (t < DAY_LENGTH + h) return 1 - smooth(t, DAY_LENGTH - h, DAY_LENGTH + h); // anoitecendo
  return smooth(t, CYCLE - h, CYCLE + h);                            // noite (e o começo do próximo nascer do sol)
}

export function createDayNight({ sun, ambient, sky = null }) {
  let t = START, skipTo = null, skipSpeed = 1;
  const sunDir = new THREE.Vector3(), tint = new THREE.Color();

  return {
    set sky(s) { sky = s; },
    get isDay() { return t < DAY_LENGTH; },
    get time() { return t; },

    // tecla T: corre até o próximo período (para depois do nascer/pôr do sol, quando já virou dia/noite de vez)
    skip() {
      const target = (t < DAY_LENGTH ? DAY_LENGTH : CYCLE) + TWILIGHT / 2;
      skipTo = target;
      skipSpeed = Math.max(1, (target - t) / SKIP_TIME);
    },

    update(dt) {
      if (skipTo !== null) {
        t += dt * skipSpeed;
        if (t >= skipTo) { t = skipTo; skipTo = null; }
      } else {
        t += dt;
      }
      t %= CYCLE;
      if (skipTo !== null && skipTo > CYCLE) skipTo -= CYCLE; // o pulo da noite atravessa a virada do ciclo

      const d = daynessAt(t);
      // sol: faz um arco de leste a oeste durante o dia (abaixo do horizonte à noite)
      const a = ((t + TWILIGHT / 2) / (DAY_LENGTH + TWILIGHT)) * Math.PI; // 0 = nascendo, π = se pondo
      sunDir.set(Math.cos(a), Math.sin(a) * 0.9 + 0.08, 0.35).normalize();
      const elev = Math.max(0, sunDir.y);
      const low = 1 - smooth(elev, 0.05, 0.45); // 1 perto do horizonte

      // luz direcional: sol de dia, lua à noite (a que estiver mais forte decide a direção)
      const sunI = 2.2 * d * smooth(elev, 0, 0.25), moonI = 0.45 * (1 - d);
      if (sunI >= moonI) { sun.position.copy(sunDir).multiplyScalar(12); sun.color.copy(SUN_DAY).lerp(SUN_LOW, low); }
      else { sun.position.copy(MOON_DIR).multiplyScalar(12); sun.color.copy(MOON); }
      sun.intensity = Math.max(sunI, moonI);

      // luz ambiente
      ambient.color.copy(SKY_NIGHT).lerp(SKY_DAY, d);
      ambient.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, d);
      ambient.intensity = THREE.MathUtils.lerp(0.35, 0.9, d);

      // céu: alaranjado no nascer/pôr do sol
      if (sky) sky.setTime(d, tint.set(1, 1, 1).lerp(SUNSET_TINT, low * d));
    },
  };
}
