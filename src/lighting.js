import * as THREE from 'three';

// ----------------------------------------------------------------------------------------------------------
// ILUMINAÇÃO (requisito obrigatório "Gráficos")
//
// - Modelo de iluminação dinâmica de Phong: todos os objetos usam MeshPhongMaterial (componentes ambiente, difusa e
//   especular calculadas a cada quadro a partir da luz). Os modelos baixados vêm com outros tipos de material
//   (Lambert, por exemplo) e são convertidos para Phong ao entrar na cena.
// - 1 fonte de luz direcional (o "sol") + uma luz hemisférica fraca como luz ambiente (para o lado na sombra não
//   ficar preto).
// - Materiais diferentes: cada grupo de objetos recebe um material com brilho especular próprio (MATERIALS), além
//   das cores e texturas de cada modelo.
// - Tecla L: liga/desliga o modelo de iluminação. Desligado, cada material Phong é trocado por um MeshBasicMaterial
//   com a mesma cor e textura, que ignora as luzes (só a cor "pura" do objeto).
// ----------------------------------------------------------------------------------------------------------

// materiais por grupo de objetos: specular = cor do reflexo especular, shininess = quão concentrado é o brilho
export const MATERIALS = {
  terreno:     { specular: 0x111111, shininess: 4 },  // grama e rocha: foscas
  construcao:  { specular: 0x2a2a2a, shininess: 12 }, // pedra e tijolo: brilho fraco e espalhado
  casa:        { specular: 0x3a3a3a, shininess: 25 }, // casas pintadas: um pouco mais lisas
  personagem:  { specular: 0x555555, shininess: 45 }, // roupas, pele e luvas dos personagens: brilho mais marcado
  planta:      { specular: 0x777777, shininess: 70 }, // cabeça das plantas carnívoras: lisa e brilhante
};

export function createLights(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); // a fonte de luz direcional
  sun.position.set(6, 10, 4);
  const ambient = new THREE.HemisphereLight(0xcdeeff, 0x6b4a3a, 0.9); // céu azulado em cima, terra embaixo
  scene.add(sun, ambient);
  return { sun, ambient };
}

// propriedades copiadas de um material para o outro nas conversões
function copyCommon(from, to) {
  for (const k of ['map', 'alphaMap', 'alphaTest', 'transparent', 'opacity', 'side', 'vertexColors', 'depthWrite', 'name']) {
    if (from[k] !== undefined) to[k] = from[k];
  }
  if (from.color) to.color.copy(from.color);
  return to;
}

export function createLighting(scene) {
  let enabled = true;
  const phongOf = new Map(); // material original -> versão Phong (criada uma vez e reaproveitada)
  const unlitOf = new Map(); // material Phong -> versão sem iluminação (criada uma vez e reaproveitada)

  // converte um material qualquer para Phong (Phong continua o mesmo) e aplica o material do grupo
  function toPhong(m, preset) {
    if (phongOf.has(m)) return phongOf.get(m);
    let p = m;
    if (!m.isMeshPhongMaterial) {
      p = copyCommon(m, new THREE.MeshPhongMaterial());
      if (m.emissive) p.emissive.copy(m.emissive);
      for (const k of ['emissiveMap', 'emissiveIntensity', 'normalMap', 'bumpMap', 'bumpScale', 'flatShading']) {
        if (m[k] !== undefined) p[k] = m[k];
      }
    }
    if (preset) { p.specular.setHex(preset.specular); p.shininess = preset.shininess; }
    p.needsUpdate = true;
    phongOf.set(m, p);
    return p;
  }

  function unlit(p) {
    if (!unlitOf.has(p)) unlitOf.set(p, copyCommon(p, new THREE.MeshBasicMaterial()));
    return unlitOf.get(p);
  }

  // troca o material de cada malha de `root` conforme o estado (ligado = Phong, desligado = sem iluminação)
  function apply(root) {
    root.traverse((o) => {
      if (!o.isMesh || !o.userData.litMaterial) return;
      const lit = o.userData.litMaterial;
      o.material = enabled ? lit : (Array.isArray(lit) ? lit.map(unlit) : unlit(lit));
    });
  }

  return {
    get enabled() { return enabled; },
    // chame para cada objeto que entra na cena (inclusive os carregados depois): converte para Phong com o material
    // do grupo e já aplica o estado atual da tecla L
    register(root, preset) {
      root.traverse((o) => {
        if (!o.isMesh) return;
        const lit = Array.isArray(o.material) ? o.material.map((m) => toPhong(m, preset)) : toPhong(o.material, preset);
        o.userData.litMaterial = lit;
        o.material = lit;
      });
      apply(root);
      return root;
    },
    toggle() {
      enabled = !enabled;
      apply(scene);
      return enabled;
    },
  };
}
