# MORPHA Visual Documentation

How to add screenshots and videos to the MORPHA website and documentation.

---

## README.md Visual Section

Add this section to your README.md after the "Philosophy" section:

```markdown
## Visual Experience

### Landing Page
The MORPHA experience begins with a minimal, ceremonial landing page:

![MORPHA Landing Page](./public/screenshots/landing-page.png)

*Dark, contemplative aesthetic with philosophical statements and quiet entry point*

### The Ritual

![Active Ritual - Low Sound](./public/screenshots/ritual-low-sound.png)
*Glyphs responding to quiet sounds with subtle morphing*

![Active Ritual - High Energy](./public/screenshots/ritual-high-energy.png)
*Complex sound creates overlapping glyphs with strong deformation*

![Silence State](./public/screenshots/ritual-silence.png)
*During silence, glyphs persist and time stretches*

### Mobile Experience

<p align="center">
  <img src="./public/screenshots/mobile-landing.png" width="300" alt="Mobile Landing">
  <img src="./public/screenshots/mobile-ritual.png" width="300" alt="Mobile Ritual">
</p>

*MORPHA adapts seamlessly to mobile devices with touch interactions*

### Demo

![MORPHA Demo](./public/videos/demo-short.gif)

*Watch glyphs morph and breathe in response to sound and silence*

---

## Key Features Illustrated

| Feature | Visual |
|---------|--------|
| **Sound Response** | Glyphs morph based on frequency and amplitude |
| **Silence Influence** | Time stretches, persistence increases |
| **Overlap Semantics** | Multiple glyphs create meaning through layering |
| **Continuous Motion** | Never cuts, only morphs and fades |
| **Save Moments** | Long press captures seamless loops |
```

---

## Website Gallery Page

Create `public/gallery.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MORPHA Gallery</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0e0e0e;
      color: #e6e6e6;
      font-family: Georgia, serif;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: normal;
      letter-spacing: 0.12em;
      margin-bottom: 3rem;
      text-align: center;
      opacity: 0.95;
    }

    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 2rem;
      margin-bottom: 4rem;
    }

    .gallery-item {
      border: 1px solid rgba(230, 230, 230, 0.1);
      padding: 1rem;
      transition: border-color 0.3s;
    }

    .gallery-item:hover {
      border-color: rgba(230, 230, 230, 0.3);
    }

    .gallery-item img {
      width: 100%;
      height: auto;
      display: block;
      margin-bottom: 1rem;
    }

    .gallery-item h3 {
      font-size: 1.2rem;
      font-weight: normal;
      margin-bottom: 0.5rem;
      opacity: 0.9;
    }

    .gallery-item p {
      font-size: 0.95rem;
      line-height: 1.6;
      opacity: 0.7;
    }

    .video-section {
      margin-top: 4rem;
      text-align: center;
    }

    .video-section h2 {
      font-size: 1.8rem;
      font-weight: normal;
      margin-bottom: 2rem;
      opacity: 0.9;
    }

    .video-container {
      max-width: 800px;
      margin: 0 auto;
    }

    .back-link {
      display: inline-block;
      margin-top: 3rem;
      color: #e6e6e6;
      text-decoration: none;
      opacity: 0.7;
      transition: opacity 0.3s;
    }

    .back-link:hover {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MORPHA Gallery</h1>

    <div class="gallery">
      <div class="gallery-item">
        <img src="/screenshots/landing-page.png" alt="Landing Page">
        <h3>Landing Page</h3>
        <p>The ceremonial entry point. Dark, minimal, intentional.</p>
      </div>

      <div class="gallery-item">
        <img src="/screenshots/ritual-start.png" alt="Ritual Start">
        <h3>Ritual Beginning</h3>
        <p>After entering, instructions fade in briefly then dissolve.</p>
      </div>

      <div class="gallery-item">
        <img src="/screenshots/ritual-low-sound.png" alt="Low Sound">
        <h3>Quiet Sounds</h3>
        <p>Glyphs breathe gently in response to whispers and hums.</p>
      </div>

      <div class="gallery-item">
        <img src="/screenshots/ritual-high-energy.png" alt="High Energy">
        <h3>High Energy</h3>
        <p>Complex sounds create overlapping, morphing glyphs.</p>
      </div>

      <div class="gallery-item">
        <img src="/screenshots/ritual-silence.png" alt="Silence">
        <h3>Silence</h3>
        <p>During silence, time stretches. Glyphs persist and listen.</p>
      </div>

      <div class="gallery-item">
        <img src="/screenshots/save-indicator.png" alt="Save">
        <h3>Saving Moments</h3>
        <p>Long press anywhere to save the current state as a loop.</p>
      </div>
    </div>

    <div class="video-section">
      <h2>Watch MORPHA in Motion</h2>
      <div class="video-container">
        <img src="/videos/demo-short.gif" alt="MORPHA Demo" style="width: 100%;">
      </div>
    </div>

    <a href="/" class="back-link">← return to MORPHA</a>
  </div>
</body>
</html>
```

---

## Documentation with Screenshots

Update `docs/QUICK_START.md` to include visuals:

```markdown
# MORPHA Quick Start Guide

Get MORPHA running in 5 minutes.

---

## What You'll See

![Landing Page](../public/screenshots/landing-page.png)

The MORPHA landing page greets you with minimal design and clear intent.

---

## After Entering

![Active Ritual](../public/screenshots/ritual-low-sound.png)

Make sounds or stay silent - both are meaningful inputs.

---

## Rest of guide...
```

---

## GitHub Pages Showcase

Create `.github/workflows/deploy-gallery.yml`:

```yaml
name: Deploy Gallery

on:
  push:
    branches: [ main ]
    paths:
      - 'public/screenshots/**'
      - 'public/gallery.html'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

---

## Social Media Assets

For sharing MORPHA:

### Open Graph Images (1200x630)

Create `public/og-image.png` showing:
- MORPHA title
- Key visual (glyphs)
- Tagline: "A Protocol for Non-Verbal Communication"

### Twitter Card (1200x675)

Similar to OG image but with Twitter dimensions.

### Add to index.html:

```html
<head>
  <!-- Existing meta tags -->

  <!-- Open Graph -->
  <meta property="og:title" content="MORPHA — Non-Verbal Communication Protocol">
  <meta property="og:description" content="An open protocol for symbolic communication through transformation, sound, and silence.">
  <meta property="og:image" content="https://your-domain.com/og-image.png">
  <meta property="og:url" content="https://your-domain.com">
  <meta property="og:type" content="website">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="MORPHA — Non-Verbal Communication">
  <meta name="twitter:description" content="Sound and silence become form.">
  <meta name="twitter:image" content="https://your-domain.com/og-image.png">
</head>
```

---

## Screenshot Placeholders

Until real screenshots are captured, use SVG placeholders:

```html
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#0e0e0e"/>
  <text x="400" y="300" text-anchor="middle" fill="#e6e6e6"
        font-family="Georgia" font-size="24" opacity="0.5">
    MORPHA Landing Page
  </text>
  <text x="400" y="340" text-anchor="middle" fill="#e6e6e6"
        font-family="Georgia" font-size="16" opacity="0.3">
    Screenshot placeholder
  </text>
</svg>
```

---

## Next Steps

1. Run MORPHA locally: `npm run dev`
2. Capture screenshots following [SCREENSHOTS.md](./SCREENSHOTS.md)
3. Place images in `public/screenshots/`
4. Update README.md with visual section
5. Create `public/gallery.html` (optional)
6. Add Open Graph meta tags
7. Deploy and share!

---

**The visual experience is as important as the code. Take time to capture MORPHA's living, breathing nature.**
