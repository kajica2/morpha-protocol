precision highp float;

uniform float uOpacity;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uEmotion;

varying float vEnergy;

void main() {

  // Round, softly glowing point sprite.
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  float glow = 1.0 - (dist * 2.0);
  glow = pow(glow, 2.0);

  float energy = smoothstep(0.0, 1.0, vEnergy);

  float fade =
    uOpacity *
    (0.85 + energy * 0.6) *
    glow;

  // Emotion shifts the palette, but the glyph is always lit: colourB only
  // ever pulls 45% of the way in, so silence reads as dim white rather than
  // an invisible mid-grey.
  float t = clamp((uEmotion + 1.0) * 0.5, 0.0, 1.0) * 0.45;
  vec3 color = mix(uColorA, uColorB, t);

  gl_FragColor = vec4(
    color,
    fade
  );
}
