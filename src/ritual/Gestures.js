// MORPHA Gestures
// Handles user interaction gestures

export class GestureHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.longPressTimer = null;
    this.longPressDuration = 1000; // ms
    this.longPressCallbacks = [];
    this.tapCallbacks = [];

    this.setupListeners();
  }

  setupListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.onPressStart(e));
    this.canvas.addEventListener('touchstart', (e) => this.onPressStart(e), { passive: false });

    this.canvas.addEventListener('mouseup', (e) => this.onPressEnd(e));
    this.canvas.addEventListener('touchend', (e) => this.onPressEnd(e));

    this.canvas.addEventListener('mouseout', () => this.cancelPress());
    this.canvas.addEventListener('touchcancel', () => this.cancelPress());
  }

  onPressStart(event) {
    event.preventDefault();

    this.longPressTimer = setTimeout(() => {
      this.triggerLongPress(event);
    }, this.longPressDuration);
  }

  onPressEnd(event) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;

      // It was a tap, not a long press
      this.triggerTap(event);
    }
  }

  cancelPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  triggerLongPress(event) {
    this.longPressCallbacks.forEach(cb => cb(event));
    this.longPressTimer = null;
  }

  triggerTap(event) {
    this.tapCallbacks.forEach(cb => cb(event));
  }

  onLongPress(callback) {
    this.longPressCallbacks.push(callback);
  }

  onTap(callback) {
    this.tapCallbacks.push(callback);
  }

  destroy() {
    this.cancelPress();
    this.longPressCallbacks = [];
    this.tapCallbacks = [];
  }
}

export default GestureHandler;
