precision highp float;

attribute vec2 positionFrom;
attribute vec2 positionTo;

uniform float uMorph;
uniform float uTime;
uniform float uAudio;

uniform float uBreath;
uniform float uWarp;
uniform float uAspect;

// Point size and motion scale are uniforms so quality changes and
// reduced-motion damping do not require a shader recompile.
uniform float uPointSize;
uniform float uMotionScale;

// The temporal memory's distortion. A transient that has already ended
// keeps bending the glyph for a moment, so the sound leaves a shape
// rather than simply stopping.
uniform vec2 uDistortion;

varying float vEnergy;

float easeInOut(float t) {
  return t * t * (3.0 - 2.0 * t);
}

void main() {

  float m = easeInOut(clamp(uMorph, 0.0, 1.0));

  vec2 pos = mix(positionFrom, positionTo, m);

  // The motion scale damps the shader's wave - the most visible motion in
  // the field. Reduced motion makes it smaller, never zero: protocol section
  // 6 requires motion to stay continuous.
  float wave =
    sin(uTime * 1.2 + pos.y * 6.0) *
    uBreath *
    (0.3 + uAudio) *
    uMotionScale;

  pos.x += wave * uWarp * uMotionScale;
  pos.y += wave * 0.5 * uMotionScale;

  // The distortion displaces the glyph. It is a geometric bend, not a
  // change of appearance: the symbol's opacity, colour and emotion are
  // untouched by it.
  pos += uDistortion;

  vEnergy = abs(wave) + uAudio * 0.4;

  // NDC x spans more pixels than NDC y, so y is stretched to match.
  // Without this a circle reads as a wide ellipse on a non-square window.
  gl_Position = vec4(pos.x, pos.y * uAspect, 0.0, 1.0);

  // Point sprites carry the glyph. The base size keeps the sampled path
  // legible as a continuous line rather than a dotted trace.
  gl_PointSize = uPointSize + uAudio * uPointSize * 1.8;
}
