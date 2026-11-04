import * as THREE from 'three';
import vertexShader from '../../shaders/glyph.vert.glsl?raw';
import fragmentShader from '../../shaders/glyph.frag.glsl?raw';
import { buildGlyphAttributes } from './GlyphGeometry.js';

/**
 * WebGL renderer for the MORPHA glyph field.
 *
 * Each glyph owns its own mesh and material so it can morph and fade
 * independently - overlap is what creates semantic relationships between
 * glyphs, so the renderer must not collapse them into one shared mesh.
 *
 * Global uniforms (uTime, uAudio, uWarp, uBreath, uColorA, uColorB) are
 * shared by reference across every material so a single update reaches all
 * glyphs. Per-glyph uniforms (uMorph, uOpacity, uEmotion) stay independent.
 */
export class Renderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    // Uniform objects shared by every glyph material.
    this.sharedUniforms = {
      uTime:    { value: 0 },
      uAudio:   { value: 0 },
      uBreath:  { value: 0.4 },
      uWarp:    { value: 0.3 },
      uColorA:  { value: new THREE.Color(0xffffff) }, // Default white
      uColorB:  { value: new THREE.Color(0x000000) }, // Default black
      uAspect:  { value: 1 }, // viewport width / height, keeps glyphs round
    };

    // Kept for backwards compatibility with existing callers that read
    // renderer.uniforms directly.
    this.uniforms = {
      ...this.sharedUniforms,
      uMorph:   { value: 0 },
      uOpacity: { value: 1.0 },
      uEmotion: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // Or NormalBlending based on desired effect
      uniforms: this.uniforms
    });

    this.glyphMeshes = []; // Array to hold multiple glyph meshes
    this.disposed = false;

    this.handleResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.updateAspect();
  }

  onWindowResize() {
    if (this.disposed) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateAspect();
  }

  /**
   * NDC x spans more pixels than NDC y, so y is stretched to match.
   * Without this a circle reads as a wide ellipse on a non-square window.
   */
  updateAspect() {
    this.sharedUniforms.uAspect.value =
      window.innerWidth / Math.max(window.innerHeight, 1);
  }

  // This method now adds a new glyph mesh to the scene
  addGlyphMesh(glyphFromGeometry, glyphToGeometry, initialOpacity = 0, initialMorph = 0) {
    const attributes = buildGlyphAttributes(glyphFromGeometry, glyphToGeometry);

    const geometry = new THREE.BufferGeometry();
    // `position` carries the vertex count for THREE.Points and must be
    // itemSize 3 - three.js reads .getZ() when computing the bounding sphere,
    // and a two-component position yields a NaN radius that silently drops
    // the draw call.
    geometry.setAttribute('position', new THREE.BufferAttribute(attributes.position, 3));
    geometry.setAttribute('positionFrom', new THREE.BufferAttribute(attributes.positionFrom, 2));
    geometry.setAttribute('positionTo', new THREE.BufferAttribute(attributes.positionTo, 2));

    // Per-glyph material. Global uniform OBJECTS are shared by reference so
    // updating them reaches every glyph; per-glyph values stay independent.
    const glyphMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.sharedUniforms.uTime,
        uAudio: this.sharedUniforms.uAudio,
        uBreath: this.sharedUniforms.uBreath,
        uWarp: this.sharedUniforms.uWarp,
        uColorA: this.sharedUniforms.uColorA,
        uColorB: this.sharedUniforms.uColorB,
        uAspect: this.sharedUniforms.uAspect,
        uMorph: { value: initialMorph },
        uOpacity: { value: initialOpacity },
        uEmotion: { value: 0 },
      },
    });

    const mesh = new THREE.Points(geometry, glyphMaterial);
    // The morph target moves every frame; skip stale bounding-sphere culling.
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.glyphMeshes.push(mesh);
    return mesh; // Return the mesh so Glyph instance can hold a reference
  }

  removeGlyphMesh(mesh) {
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.glyphMeshes = this.glyphMeshes.filter(m => m !== mesh);
  }

  update(deltaTime, audioData, globalTime, userFingerprint) {
    if (this.disposed) return;

    // Update global uniforms that apply to all glyphs
    this.sharedUniforms.uTime.value = globalTime;
    this.sharedUniforms.uAudio.value = audioData.amp;
    this.sharedUniforms.uWarp.value = audioData.mid * 0.8; // Example mapping
    this.sharedUniforms.uBreath.value = userFingerprint.breath || 0.4; // Example user fingerprint
    this.sharedUniforms.uColorA.value.set(userFingerprint.colorA || 0xffffff);
    this.sharedUniforms.uColorB.value.set(userFingerprint.colorB || 0x000000);

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  /** Release every GPU resource this renderer owns. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    for (const mesh of [...this.glyphMeshes]) {
      this.removeGlyphMesh(mesh);
    }
    this.material.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
