import * as THREE from 'three';
import vertexShader from '../../shaders/glyph.vert.glsl?raw';
import fragmentShader from '../../shaders/glyph.frag.glsl?raw';
import { buildGlyphAttributes } from './GlyphGeometry.js';
import { resolveQuality, detectReducedMotion } from './Quality.js';
import { createContextRecovery } from './ContextRecovery.js';

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
  /**
   * @param {HTMLElement} container The element the canvas is appended to.
   * @param {object} [options] Rendering options.
   * @param {string} [options.preset] Quality preset name.
   * @param {boolean} [options.reducedMotion] Whether to damp visible motion.
   * @param {number} [options.devicePixelRatio] Override the detected ratio.
   * @param {number} [options.hardwareConcurrency] Override the detected core count.
   * @param {() => void} [options.onContextLost] Called when the WebGL context is lost.
   * @param {() => void} [options.onContextRestored] Called when it is restored.
   */
  constructor(container, options = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;

    // Resolve the quality policy before creating the renderer: the pixel
    // ratio must be set before the first draw, and the point size drives a
    // shader uniform rather than a recompile.
    this.onContextLost = options.onContextLost;
    this.onContextRestored = options.onContextRestored;

    this.quality = resolveQuality(options.preset, {
      devicePixelRatio: options.devicePixelRatio
        ?? window.devicePixelRatio
        ?? 1,
      reducedMotion: options.reducedMotion ?? detectReducedMotion(),
      hardwareConcurrency: options.hardwareConcurrency
        ?? navigator.hardwareConcurrency,
    });

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Without setPixelRatio the canvas renders at CSS pixel density, which
    // is visibly soft on a Retina display.
    this.renderer.setPixelRatio(this.quality.pixelRatio);
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
      // Point size and motion scale are uniforms rather than constants so
      // quality changes and reduced-motion damping do not require a shader
      // recompile.
      uPointSize: { value: this.quality.pointSize },
      uMotionScale: { value: this.quality.motionScale },
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

    // three.js already handles a lost context internally: it cancels the
    // event, skips rendering while the context is gone and re-initialises
    // the GL state when it comes back. This handler does NOT replace that -
    // it adds the two things three.js cannot do. It surfaces the loss to
    // the USER (three.js only writes to the console, where nobody sees it),
    // and it gives the application a signal it can act on.
    this.contextRecovery = createContextRecovery(this.renderer.domElement, {
      onLost: () => {
        this.isContextLost = true;
        this.onContextLost?.();
      },
      onRestored: () => {
        this.rebuildMeshes();
        this.isContextLost = false;
        this.onContextRestored?.();
      },
      onError: (error) => {
        // A failed rebuild must not take the whole runtime down with it.
        console.error('MORPHA: WebGL context recovery failed', error);
      },
    });
    this.isContextLost = false;

    this.handleResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.updateAspect();
  }

  onWindowResize() {
    if (this.disposed) return;
    this.renderer.setPixelRatio(this.quality.pixelRatio);
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
        uPointSize: this.sharedUniforms.uPointSize,
        uMotionScale: this.sharedUniforms.uMotionScale,
        uMorph: { value: initialMorph },
        uOpacity: { value: initialOpacity },
        uEmotion: { value: 0 },
      },
    });

    const mesh = new THREE.Points(geometry, glyphMaterial);
    // The morph target moves every frame; skip stale bounding-sphere culling.
    mesh.frustumCulled = false;
    // Keep the source geometry so the mesh can be rebuilt if the WebGL
    // context is lost and later restored.
    mesh.userData.sourceGeometry = { glyphFromGeometry, glyphToGeometry };
    this.scene.add(mesh);
    this.glyphMeshes.push(mesh);
    return mesh; // Return the mesh so Glyph instance can hold a reference
  }

  /**
   * Rebuild every glyph mesh after the WebGL context has been restored.
   *
   * A lost context destroys the GPU-side buffers. three.js re-uploads them
   * lazily when the material and geometry are used again, but a geometry
   * whose attributes were created before the loss can reference disposed
   * buffers. Rebuilding from the source geometry is the reliable path.
   *
   * @returns {number} How many meshes were rebuilt.
   */
  rebuildMeshes() {
    const sources = this.glyphMeshes
      .map(mesh => mesh.userData?.sourceGeometry)
      .filter(Boolean);

    // The mesh OBJECTS are reused, not replaced. Each Glyph holds a
    // reference to its mesh, so replacing the objects would leave every
    // glyph pointing at a disposed mesh and the field would come back empty.
    // Only the GPU-side geometry and material are swapped.
    for (const mesh of this.glyphMeshes) {
      const source = mesh.userData?.sourceGeometry;
      if (!source) continue;

      const attributes = buildGlyphAttributes(
        source.glyphFromGeometry,
        source.glyphToGeometry,
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(attributes.position, 3));
      geometry.setAttribute('positionFrom', new THREE.BufferAttribute(attributes.positionFrom, 2));
      geometry.setAttribute('positionTo', new THREE.BufferAttribute(attributes.positionTo, 2));

      // Carry the per-glyph uniform values across, so a glyph does not snap
      // back to full opacity when the context comes back.
      const previous = mesh.material?.uniforms;
      const material = new THREE.ShaderMaterial({
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
          uPointSize: this.sharedUniforms.uPointSize,
          uMotionScale: this.sharedUniforms.uMotionScale,
          uMorph: { value: previous?.uMorph?.value ?? 0 },
          uOpacity: { value: previous?.uOpacity?.value ?? 1 },
          uEmotion: { value: previous?.uEmotion?.value ?? 0 },
        },
      });

      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.geometry = geometry;
      mesh.material = material;
      mesh.frustumCulled = false;
    }

    return sources.length;
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

    // Drawing into a lost context throws. Skip the draw while the context
    // is gone; the field resumes when the context comes back.
    if (this.isContextLost) return;

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  /** Release every GPU resource this renderer owns. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    this.contextRecovery?.dispose();
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
