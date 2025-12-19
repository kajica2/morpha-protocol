export class CanvasCapture {
  constructor(canvas, duration = 5000, fps = 30) {
    this.canvas = canvas;
    this.duration = duration; // in milliseconds
    this.fps = fps;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.startTime = 0;
    this.onCompleteCallback = null;
  }

  start(onComplete) {
    if (this.isRecording) {
      console.warn("Already recording.");
      return;
    }

    this.onCompleteCallback = onComplete;
    this.recordedChunks = [];
    const stream = this.canvas.captureStream(this.fps); // Capture stream at desired FPS
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.isRecording = false;
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      if (this.onCompleteCallback) {
        this.onCompleteCallback(blob);
      }
    };

    this.mediaRecorder.start();
    this.isRecording = true;
    this.startTime = performance.now();
    console.log("Canvas capture started.");

    // Stop recording after the specified duration
    setTimeout(() => {
      if (this.isRecording) {
        this.stop();
      }
    }, this.duration);
  }

  stop() {
    if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      console.log("Canvas capture stopped.");
    }
  }

  // You might want to add a method to capture a single SVG frame as well
  captureSVG() {
    // This would require iterating through glyphs and generating SVG paths
    // For now, we focus on video capture.
    console.warn("SVG capture not yet implemented.");
    return null;
  }
}
