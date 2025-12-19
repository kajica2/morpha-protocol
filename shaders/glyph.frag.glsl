precision highp float;

uniform float uOpacity;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uEmotion;

varying float vEnergy;

void main() {

  float glow = smoothstep(0.0, 1.0, vEnergy);

  float fade =
    uOpacity *
    (0.6 + glow * 0.4);

  vec3 color = mix(uColorA, uColorB, (uEmotion + 1.0) * 0.5);

  gl_FragColor = vec4(
    color,
    fade
  );
}
