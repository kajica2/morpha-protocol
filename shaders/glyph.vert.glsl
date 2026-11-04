precision highp float;

attribute vec2 positionFrom;
attribute vec2 positionTo;

uniform float uMorph;
uniform float uTime;
uniform float uAudio;

uniform float uBreath;
uniform float uWarp;
uniform float uAspect;

varying float vEnergy;

float easeInOut(float t) {
  return t * t * (3.0 - 2.0 * t);
}

void main() {

  float m = easeInOut(clamp(uMorph, 0.0, 1.0));

  vec2 pos = mix(positionFrom, positionTo, m);

  float wave =
    sin(uTime * 1.2 + pos.y * 6.0) *
    uBreath *
    (0.3 + uAudio);

  pos.x += wave * uWarp;
  pos.y += wave * 0.5;

  vEnergy = abs(wave) + uAudio * 0.4;

  // NDC x spans more pixels than NDC y, so y is stretched to match.
  // Without this a circle reads as a wide ellipse on a non-square window.
  gl_Position = vec4(pos.x, pos.y * uAspect, 0.0, 1.0);

  // Point sprites carry the glyph. The base size keeps the sampled path
  // legible as a continuous line rather than a dotted trace.
  gl_PointSize = 9.0 + uAudio * 16.0;
}
