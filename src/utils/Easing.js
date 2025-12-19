// MORPHA Easing Functions
// For smooth, organic transitions

export function easeInOut(t) {
  return t * t * (3.0 - 2.0 * t);
}

export function easeIn(t) {
  return t * t;
}

export function easeOut(t) {
  return t * (2.0 - t);
}

export function easeInCubic(t) {
  return t * t * t;
}

export function easeOutCubic(t) {
  return 1 + (--t) * t * t;
}

export function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 + (--t) * (2 * (--t)) * (2 * t);
}

export function easeInQuart(t) {
  return t * t * t * t;
}

export function easeOutQuart(t) {
  return 1 - (--t) * t * t * t;
}

export function easeInOutQuart(t) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - 8 * (--t) * t * t * t;
}

// Elastic easing for organic feeling
export function easeOutElastic(t) {
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
}

// For silence-influenced temporal stretching
export function silenceEase(t, silenceWeight) {
  // When silence is high, ease becomes more gradual
  const power = 2.0 + silenceWeight * 2.0;
  return Math.pow(t, power);
}

// For morph transitions that feel alive
export function breathEase(t, breathIntensity) {
  return t + Math.sin(t * Math.PI) * breathIntensity * 0.1;
}
