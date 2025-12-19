import { resampleSVGPath } from './Resampler';
import { Glyph } from './Glyph';

let phonemeData = {};
let rawGlyphSVGPaths = {}; // Will store raw SVG path strings

export async function loadGlyphData() {
  try {
    // Load phoneme data
    const phonemesResponse = await fetch('/data/phonemes.json');
    phonemeData = await phonemesResponse.json();

    // Load raw SVG path data
    const rawGlyphPathsResponse = await fetch('/data/processed-glyphs.json');
    rawGlyphSVGPaths = await rawGlyphPathsResponse.json();

    console.log("Glyph data loaded successfully.");
  } catch (error) {
    console.error("Error loading glyph data:", error);
  }
}

export function createGlyphFromPhoneme(phoneme, globalTime, userFingerprint = {}) {
  const data = phonemeData[phoneme.toLowerCase()];
  if (!data) {
    console.warn(`No glyph data found for phoneme: ${phoneme}`);
    return null;
  }

  const glyphFileName = data.glyph; // e.g., "circle.svg"
  const svgPathData = rawGlyphSVGPaths[glyphFileName];
  if (!svgPathData) {
    console.warn(`Raw SVG path data not found for glyph: ${glyphFileName}`);
    return null;
  }

  // Resample the SVG path data in the browser
  const geometry = resampleSVGPath(svgPathData);
  
  const semanticWeight = { ...data.semanticWeight };

  // Apply user fingerprint bias (example)
  semanticWeight.fadeTime *= (1 + (userFingerprint.silenceTolerance || 0) * 0.5);
  semanticWeight.resistance *= (1 + (userFingerprint.tempoTolerance || 0) * 0.3);

  return new Glyph(geometry, data.family, globalTime, semanticWeight);
}

export function getRandomPhoneme() {
  const phonemes = Object.keys(phonemeData);
  const randomIndex = Math.floor(Math.random() * phonemes.length);
  return phonemes[randomIndex];
}
