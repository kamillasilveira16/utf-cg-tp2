import * as THREE from 'three';

export const mat = (color, extra = {}) =>
  new THREE.MeshPhongMaterial({ color, flatShading: true, ...extra });

// material para geometrias com cores por vértice (cada face com sua cor)
export const vcMat = (extra = {}) => mat(0xffffff, { vertexColors: true, ...extra });

export function mesh(geo, color, pos = [0, 0, 0], extra) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.position.set(...pos);
  return m;
}

// aleatório com semente fixa (cena sempre igual)
let seed = 7;
export const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ruído determinístico por posição: vértices duplicados recebem o mesmo valor (sem rachaduras)
export function hash3(x, y, z, s = 0) {
  const h = Math.sin(
    (Math.round(x * 40) + 0) * 127.1 + (Math.round(y * 40) + 0) * 311.7 +
    (Math.round(z * 40) + 0) * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

// pinta cada triângulo com uma cor: colorFn(color, centroide)
export function colorFaces(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color(), cen = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    cen.set(0, 0, 0);
    for (let k = 0; k < 3; k++) cen.add(v.fromBufferAttribute(p, i + k));
    cen.divideScalar(3);
    colorFn(c, cen);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// pedra irregular (icosaedro com vértices deslocados)
export function rockGeo(radius, jitter = 0.3, detail = 0, s = 0) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + (hash3(x, y, z, s) - 0.5) * 2 * jitter;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  return g;
}

// pedra pronta com cores por face
export function rock(radius, baseColor, { jitter = 0.3, detail = 0 } = {}) {
  const geo = colorFaces(rockGeo(radius, jitter, detail, rand() * 100), (c) => {
    c.set(baseColor).offsetHSL(0, 0, (rand() - 0.5) * 0.14);
  });
  return new THREE.Mesh(geo, vcMat());
}