// Ambient particle field — fragment stage.
//
// A soft round point. The particle's own alpha carries its life: it fades
// in from zero and fades back to zero before it is recycled, so no particle
// is ever removed while it is visible (protocol section 6, "Never cut, only
// morph").
//
// There is deliberately no audio term here. protocol section 3.3 requires
// that energy bias motion rather than map directly to appearance, so the
// sound never reaches the colour or the alpha of a particle.

precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vAlpha;
varying float vDepth;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Soft falloff towards the edge of the sprite.
  float glow = 1.0 - (dist * 2.0);
  glow = glow * glow;

  // The simulation's depth convention: 0 is the farthest plane, 1 is the
  // nearest. Far particles sit closer to the background colour, which
  // keeps the depth planes distinguishable without drawing extra geometry.
  float t = (1.0 - vDepth) * 0.55;
  vec3 color = mix(uColorA, uColorB, t);

  // The simulation already folded the layer's opacity scale into aAlpha.
  // Only the sprite's own falloff is applied here.
  float alpha = vAlpha * glow;

  gl_FragColor = vec4(color, alpha);
}
