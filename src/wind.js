import * as THREE from 'three';

// ----------------------------------------------------------------------------------------------------------
// VENTO (opcional ⭐ "Vento")
//
// O vento é um SHEAR (cisalhamento) aplicado nos vértices, na placa de vídeo (vertex shader): cada vértice anda na
// direção do vento proporcionalmente à altura dele acima de uma base (a base fica parada, o topo anda mais).
// A INTENSIDADE em cada lugar e momento vem de uma TEXTURA DE RUÍDO (Perlin noise, gerada aqui): a textura é
// "soprada" pela ilha (deslocada na direção do vento com o tempo) e cada objeto lê o ruído na sua posição do mundo.
// Assim as rajadas passam pela ilha: uma árvore balança mais forte e, logo depois, a do lado.
//
// Só os objetos que chamam applyWind() sentem o vento (a bandeira e as copas das árvores).
// ----------------------------------------------------------------------------------------------------------

const NOISE_SIZE = 128; // textura NOISE_SIZE x NOISE_SIZE, que se repete sem emenda
const NOISE_CELLS = 8;  // células da grade do Perlin noise (frequência base)

// Perlin noise 2D periódico (repete a cada `period` células, para a textura não ter emenda)
function perlinTexture() {
  let seed = 1234;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grads = (period) => Array.from({ length: period * period }, () => {
    const a = rnd() * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const perlin = (g, period, x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const dot = (ix, iy, dx, dy) => { const v = g[((iy % period) * period) + (ix % period)]; return v[0] * dx + v[1] * dy; };
    const n00 = dot(x0, y0, fx, fy), n10 = dot(x0 + 1, y0, fx - 1, fy);
    const n01 = dot(x0, y0 + 1, fx, fy - 1), n11 = dot(x0 + 1, y0 + 1, fx - 1, fy - 1);
    const u = fade(fx), v = fade(fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(n00, n10, u), THREE.MathUtils.lerp(n01, n11, u), v);
  };
  // soma de 3 oitavas (fractal): rajadas grandes com variações menores dentro
  const octaves = [[NOISE_CELLS, 1], [NOISE_CELLS * 2, 0.5], [NOISE_CELLS * 4, 0.25]].map(([p, amp]) => ({ p, amp, g: grads(p) }));
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      let n = 0;
      for (const o of octaves) n += o.amp * perlin(o.g, o.p, (x / NOISE_SIZE) * o.p, (y / NOISE_SIZE) * o.p);
      const v = THREE.MathUtils.clamp(0.5 + n * 0.9, 0, 1) * 255; // de [-1, 1] (aprox.) para [0, 255]
      data.set([v, v, v, 255], (y * NOISE_SIZE + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export const WIND = {
  strength: 1,        // intensidade geral (0 = sem vento)
  baseAngle: 0.6,     // direção principal do vento (radianos, no plano XZ do mundo)
  // uniforms compartilhados por todos os materiais com vento (mudar aqui muda em todos)
  uniforms: {
    windNoise: { value: perlinTexture() },
    windTime: { value: 0 },
    windDir: { value: new THREE.Vector2(1, 0) },  // direção do vento no mundo (x, z)
    windStrength: { value: 1 },
    windScale: { value: 1 / 40 },                 // tamanho das rajadas: 1 repetição da textura a cada 40 unidades
    windSpeed: { value: 2 },                      // velocidade com que as rajadas atravessam a ilha (baixa = mais suave)
  },
  // direção atual (x, z), para quem precisa dela fora do shader (a bandeira gira para o lado do vento)
  get dir() { return this.uniforms.windDir.value; },
  // chame a cada quadro: o tempo anda e a direção oscila devagar em volta da principal
  update(t) {
    const u = this.uniforms;
    u.windTime.value = t;
    const a = this.baseAngle + 0.35 * Math.sin(t * 0.04) + 0.15 * Math.sin(t * 0.11);
    u.windDir.value.set(Math.cos(a), Math.sin(a));
    u.windStrength.value = this.strength;
  },
};

// Trecho comum do vertex shader: lê a intensidade do vento (0..1, mais rajadas) na posição do objeto no mundo.
// `transformed` é a posição do vértice no espaço do objeto (ainda sem deformação).
const COMMON = /* glsl */ `
  uniform sampler2D windNoise;
  uniform float windTime, windStrength, windScale, windSpeed;
  uniform vec2 windDir;
  uniform float windBase, windAmount, windFlutter;
  attribute float windWeight;
  // intensidade do vento num ponto do mundo (x, z): o ruído "soprado" na direção do vento
  float windGust(vec2 xz) {
    vec2 uv = (xz - windDir * windTime * windSpeed) * windScale;
    return texture2D(windNoise, uv).r;
  }
`;

// Shear (copas das árvores): desloca o vértice na direção do vento, proporcional à altura acima de `windBase`.
// O deslocamento é calculado no mundo e convertido para o espaço do objeto (o objeto pode estar girado/escalado).
const SHEAR = /* glsl */ `
  #include <begin_vertex>
  {
    vec3 objW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;           // onde o objeto está no mundo
    float gust = windGust(objW.xz + transformed.xz * 0.2);                // rajada que está passando por ele
    float k = windStrength * windAmount * (0.15 + gust * gust * 1.6);     // shear: quanto o topo anda por unidade de altura
    k *= 1.0 + 0.08 * sin(windTime * 1.1 + objW.x * 0.7);                // balanço leve
    float h = max(transformed.y - windBase, 0.0);
    vec3 dirLocal = (inverse(modelMatrix) * vec4(windDir.x, 0.0, windDir.y, 0.0)).xyz; // direção do vento no objeto
    transformed += dirLocal * (k * h);
    transformed.y -= 0.15 * k * k * h;                                     // o topo desce um pouco ao inclinar
  }
`;

// Bandeira: além do shear, ondula. A bandeira fica no plano XY do objeto, presa no poste em x = 0 e apontando
// para +X; windWeight (atributo) vai de 0 no poste a 1 na ponta. A onda anda do poste para a ponta e é tanto
// maior quanto mais longe do poste e quanto mais forte a rajada.
const FLAG = /* glsl */ `
  #include <begin_vertex>
  {
    vec3 objW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float gust = windGust(objW.xz);
    float w = windStrength * (0.35 + gust * 1.3);
    float d = windWeight;
    transformed.z += windAmount * w * d * sin(d * 7.0 - windTime * windFlutter * (0.6 + w)); // ondulação
    transformed.z += windAmount * 0.25 * w * d * sin(transformed.y * 3.0 - windTime * 2.0);   // dobra na vertical
    transformed.y -= windAmount * (1.4 - w) * d * d * 0.5;                                     // vento fraco: a ponta cai
  }
`;

// Faz um material sentir o vento. mode = 'shear' (copas) ou 'flag' (bandeira).
// options: base (altura do objeto onde o vento começa a agir), amount (força), flutter (velocidade da onda).
// O material continua o mesmo: o vento é enxertado no shader dele (onBeforeCompile), então a iluminação de Phong,
// texturas etc. continuam funcionando. Geometrias de 'flag' precisam do atributo windWeight; nas outras ele vale 0.
export function applyWind(material, mode, { base = 0, amount = 0.1, flutter = 6 } = {}) {
  const own = { windBase: { value: base }, windAmount: { value: amount }, windFlutter: { value: flutter } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND.uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <begin_vertex>', mode === 'flag' ? FLAG : SHEAR);
  };
  material.customProgramCacheKey = () => 'wind-' + mode; // um programa de shader por modo
  material.userData.wind = own;
  material.needsUpdate = true;
  return material;
}
