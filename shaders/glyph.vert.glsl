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

  float wave =
    sin(uTime * 1.2 + pos.y * 6.0) *
    uBreath *
    (0.3 + uAudio);

  pos.x += wave * uWarp;
  pos.y += wave * 0.5;

  vEnergy = abs(wave) + uAudio * 0.4;

  gl_Position = vec4(pos, 0.0, 1.0);
}
