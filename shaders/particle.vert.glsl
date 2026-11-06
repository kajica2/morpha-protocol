// Ambient particle field — vertex stage.
//
// The particle field sits behind the glyphs and gives the ritual depth:
// several depth planes of drifting points, the far ones dimmer, smaller
// and slower. It is atmosphere, not signal — the glyphs carry the
// meaning, the particles carry the room.
//
// protocol section 3.3: "Energy MUST bias motion, not directly map to
// appearance." The sound reaches the simulation, which changes how FAST
// the particles drift. It never reaches this shader, because the shader
// only draws what the simulation already decided.
//
// The particles are drawn in the same NDC space as the glyphs, so the
// uAspect correction applies here too: without it a field of round points
// reads as a field of wide ellipses on a non-square viewport.

precision highp float;

attribute float aSize;
attribute float aAlpha;
attribute float aDepth;

uniform float uTime;
uniform float uAudio;
uniform float uAspect;
uniform float uMotionScale;
uniform float uPointScale;

varying float vAlpha;
varying float vDepth;

void main() {
  // The simulation's depth convention: 0 is the farthest plane, 1 is the
  // nearest. The per-layer size and opacity scales are already folded into
  // aSize and aAlpha by the simulation, so this shader must not apply the
  // depth a second time.
  float depth = clamp(aDepth, 0.0, 1.0);

  // A slow breath across the planes. The planes drift out of phase with
  // one another, which keeps the field from moving as a single sheet.
  float drift = sin(uTime * 0.35 + depth * 4.0) * 0.012 * (0.25 + uAudio);

  vec3 displaced = position;
  displaced.x += drift * uMotionScale;
  displaced.y += drift * 0.6 * uMotionScale;

  gl_Position = vec4(displaced.x, displaced.y * uAspect, 0.0, 1.0);

  // aSize already carries the layer's size scale, so the shader only
  // applies the quality preset's point scale.
  gl_PointSize = max(1.0, aSize * uPointScale);

  vAlpha = aAlpha;
  vDepth = depth;
}
