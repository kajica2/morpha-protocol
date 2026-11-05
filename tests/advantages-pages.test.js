import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const pages = ['index', 'artists', 'developers', 'installations', 'gallery'];

test('all advantages pages are available and have shared metadata', () => {
  for (const page of pages) {
    const html = readFileSync(join(root, 'public/advantages', page + '.html'), 'utf8');
    assert.match(html, /<title>[^<]+MORPHA Protocol<\/title>/);
    assert.match(html, /name="description"/);
    assert.match(html, /id="main"/);
    assert.match(html, /assets\/site\.css/);
    assert.match(html, /\.\.\/index\.html/);
    assert.match(html, /<h1>.+<\/h1>/);
  }
});

test('advantages internal navigation resolves within the published directory', () => {
  for (const page of pages) {
    const html = readFileSync(join(root, 'public/advantages', page + '.html'), 'utf8');
    for (const link of html.matchAll(/href="\.\/([^"#?]+\.html)"/g)) {
      assert.ok(existsSync(join(root, 'public/advantages', link[1])), page + ': broken link to ' + link[1]);
    }
  }
});

test('ritual entry points to the advantages overview', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /href="\.\/advantages\/index\.html"/);
});

test('interactive gallery uses published glyph paths and accessible controls', () => {
  const html = readFileSync(join(root, 'public/advantages/gallery.html'), 'utf8');
  const code = readFileSync(join(root, 'public/advantages/assets/gallery.js'), 'utf8');
  assert.ok(html.includes('id="glyph-field"'));
  for (const id of ['family', 'energy', 'silence', 'pause-motion', 'reset-motion', 'gallery-status']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing interactive control ' + id);
  }
  assert.ok(code.includes('processed-glyphs.json'));
  assert.ok(code.includes('prefers-reduced-motion'));
  assert.ok(code.includes('drawLayer(second'));
  assert.ok(readFileSync(join(root, 'public/advantages/index.html'), 'utf8').includes('href="./gallery.html"'));
});
