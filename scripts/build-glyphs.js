// scripts/build-glyphs.js

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom'; // For SVG parsing in Node.js

// Use import.meta.url to get the current file's URL, then convert to a path
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const GLYPHS_DIR = path.resolve(__dirname, '../data/base-glyphs');
const OUTPUT_FILE = path.resolve(__dirname, '../data/processed-glyphs.json');

async function buildGlyphs() {
  console.log("Building glyphs...");
  const processedGlyphs = {};

  try {
    const files = await fs.promises.readdir(GLYPHS_DIR);
    for (const file of files) {
      if (path.extname(file) === '.svg') {
        const glyphName = path.basename(file);
        const svgContent = await fs.promises.readFile(path.join(GLYPHS_DIR, file), 'utf-8');

        // Extract path data from SVG content
        const dom = new JSDOM(svgContent);
        const pathElement = dom.window.document.querySelector('path');
        if (pathElement) {
          const pathData = pathElement.getAttribute('d');
          if (pathData) {
            // Store the raw SVG path data string
            processedGlyphs[glyphName] = pathData;
            console.log(`Processed ${glyphName}`);
          } else {
            console.warn(`SVG ${glyphName} has no 'd' attribute.`);
          }
        } else {
          console.warn(`SVG ${glyphName} has no <path> element.`);
        }
      }
    }

    await fs.promises.writeFile(OUTPUT_FILE, JSON.stringify(processedGlyphs, null, 2));
    console.log(`Glyph build complete. Raw SVG path data saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Error building glyphs:", error);
  }
}

buildGlyphs();
