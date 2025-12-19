// MORPHA Glyph Mesh
// Creates Three.js meshes for morphing glyphs

import * as THREE from 'three';
import Config from '../core/Config.js';

// Load shaders
const vertexShader = `
precision highp float;

attribute vec2 positionFrom;
attribute vec2 positionTo;

uniform float uMorph;
uniform float uTime;
uniform float uAudio;
uniform float uBreath;
uniform float uWarp;

varying float vEnergy;

float easeInOut(float t) {
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  float m = easeInOut(clamp(uMorph, 0.0, 1.0));
  vec2 pos = mix(positionFrom, positionTo, m);

  float wave = sin(uTime * 1.2 + pos.y * 6.0) * uBreath * (0.3 + uAudio);

  pos.x += wave * uWarp;
  pos.y += wave * 0.5;

  vEnergy = abs(wave) + uAudio * 0.4;

  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = 3.0;
}
`;

const fragmentShader = `
precision highp float;

uniform float uOpacity;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uEmotion;

varying float vEnergy;

void main() {
  float glow = smoothstep(0.0, 1.0, vEnergy);
  float fade = uOpacity * (0.6 + glow * 0.4);

  vec3 color = mix(uColorA, uColorB, (uEmotion + 1.0) * 0.5);

  gl_FragColor = vec4(color, fade);
}
`;

export function createGlyphMesh(geometryFrom, geometryTo, initialUniforms = {}) {
  const geometry = new THREE.BufferGeometry();

  // Set dual position attributes for morphing
  geometry.setAttribute('positionFrom', new THREE.BufferAttribute(geometryFrom, 2));
  geometry.setAttribute('positionTo', new THREE.BufferAttribute(geometryTo, 2));

  // Create shader material
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMorph: { value: initialUniforms.uMorph || 0.0 },
      uTime: { value: initialUniforms.uTime || 0.0 },
      uAudio: { value: initialUniforms.uAudio || 0.0 },
      uBreath: { value: initialUniforms.uBreath || Config.DEFAULT_BREATH },
      uWarp: { value: initialUniforms.uWarp || Config.DEFAULT_WARP },
      uOpacity: { value: initialUniforms.uOpacity || 1.0 },
      uEmotion: { value: initialUniforms.uEmotion || 0.0 },
      uColorA: { value: new THREE.Color(...(initialUniforms.colorA || Config.DEFAULT_COLOR_A)) },
      uColorB: { value: new THREE.Color(...(initialUniforms.colorB || Config.DEFAULT_COLOR_B)) }
    }
  });

  // Create points mesh
  const mesh = new THREE.Points(geometry, material);

  return mesh;
}

export function updateGlyphMeshUniforms(mesh, uniforms) {
  if (!mesh || !mesh.material || !mesh.material.uniforms) return;

  Object.keys(uniforms).forEach(key => {
    if (mesh.material.uniforms[key]) {
      mesh.material.uniforms[key].value = uniforms[key];
    }
  });
}

export default {
  createGlyphMesh,
  updateGlyphMeshUniforms
};
