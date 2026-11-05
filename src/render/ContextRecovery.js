// WebGL context loss recovery.
//
// A lost WebGL context is not a rare edge case: a GPU driver reset, a
// laptop switching between integrated and discrete graphics, or the browser
// reclaiming resources all produce one. Without a handler the canvas stays
// blank forever, with no error in the console and nothing the user can do.
//
// The policy lives here, separate from three.js, so it can be tested without
// a GPU.
//
// The critical detail is `preventDefault()`. A context lost event is
// cancelable, and if it is not cancelled the browser will never fire
// `webglcontextrestored`. Without that call there is nothing to recover to.

/**
 * @typedef {object} ContextRecoveryHandlers
 * @property {() => void} [onLost]    Called when the context is lost.
 * @property {() => void} [onRestored] Called when the context comes back.
 * @property {(error: unknown) => void} [onError] Called if recovery fails.
 */

/**
 * Create a context-recovery handler for a canvas.
 *
 * @param {HTMLCanvasElement} canvas The canvas to protect.
 * @param {ContextRecoveryHandlers} [handlers] Callbacks.
 * @returns {object} The recovery controller.
 */
export function createContextRecovery(canvas, handlers = {}) {
  const { onLost, onRestored, onError } = handlers;

  let lost = false;
  let disposed = false;

  /**
   * Handle the context being lost.
   *
   * @param {Event} event The webglcontextlost event.
   */
  function handleLost(event) {
    // Cancelling the event is what makes restoration possible. Without it
    // the browser treats the loss as final and never fires the restore.
    if (typeof event?.preventDefault === 'function') event.preventDefault();
    lost = true;
    try {
      onLost?.();
    } catch (error) {
      onError?.(error);
    }
  }

  /**
   * Handle the context coming back.
   *
   * @param {Event} event The webglcontextrestored event.
   */
  function handleRestored(event) {
    lost = false;
    try {
      onRestored?.();
    } catch (error) {
      onError?.(error);
    }
  }

  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);
  }

  return {
    /** Whether the context is currently lost. */
    get isLost() {
      return lost;
    },

    /** Whether the controller has been disposed. */
    get isDisposed() {
      return disposed;
    },

    /**
     * Detach the listeners. The controller cannot be revived afterwards.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      if (canvas && typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('webglcontextlost', handleLost);
        canvas.removeEventListener('webglcontextrestored', handleRestored);
      }
    },
  };
}
