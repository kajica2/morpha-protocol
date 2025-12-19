# MORPHA Screenshots Guide

This guide explains what screenshots to capture and where to place them for documentation.

---

## Screenshots Needed

### 1. **Landing Page** (`landing-page.png`)
**What to capture:** The initial landing screen
**When to capture:** Immediately after loading the page
**Resolution:** 1920x1080 (desktop) and 375x812 (mobile)

**What should be visible:**
- Dark background (#0e0e0e)
- "MORPHA" title with wide letter spacing
- Three philosophical statements
- "enter quietly" button
- Protocol links
- Footer: "if it feels unclear, it is working"

**Browser:** Chrome or Firefox, incognito mode
**Timing:** Wait 3 seconds for fade-in animation to complete

---

### 2. **Entry Transition** (`entry-transition.png`)
**What to capture:** Mid-transition state
**When to capture:** 1 second after clicking "enter quietly"

**What should be visible:**
- Landing page fading out
- Canvas beginning to appear
- Subtle opacity transition

**Note:** This is optional but shows the graceful transition

---

### 3. **Microphone Permission** (`microphone-permission.png`)
**What to capture:** Browser's microphone permission dialog
**When to capture:** Immediately after entry transition completes

**What should be visible:**
- Browser permission dialog
- URL: http://localhost:5173 (or your domain)
- "Allow" and "Block" buttons

---

### 4. **Empty Canvas** (`ritual-start.png`)
**What to capture:** Initial ritual state
**When to capture:** Right after allowing microphone, before making sound

**What should be visible:**
- Black canvas
- Instructions overlay: "make a sound or stay silent"
- Subtle "long press to save" hint
- No glyphs yet

---

### 5. **Active Ritual - Low Sound** (`ritual-low-sound.png`)
**What to capture:** Glyphs responding to quiet sounds
**When to capture:** While humming or speaking softly

**What should be visible:**
- 2-3 glyphs on screen
- Subtle morphing/breathing motion
- Low-intensity warp and deformation
- Glyphs with moderate opacity

**Camera settings:** Use screen recording, extract frame at 5 seconds

---

### 6. **Active Ritual - High Energy** (`ritual-high-energy.png`)
**What to capture:** Glyphs responding to loud/complex sounds
**When to capture:** While speaking loudly, singing, or playing music

**What should be visible:**
- 3-4 glyphs overlapping
- Strong deformation and warp
- Higher opacity
- Dynamic morphing between states

---

### 7. **Silence State** (`ritual-silence.png`)
**What to capture:** Glyphs during sustained silence
**When to capture:** After 3-5 seconds of silence

**What should be visible:**
- Glyphs with minimal motion
- Increased persistence (glyphs staying visible longer)
- Slower morphing
- Calm, contemplative feel

---

### 8. **Long Press Save** (`save-indicator.png`)
**What to capture:** Save indicator appearing
**When to capture:** During a long press (hold for 1 second)

**What should be visible:**
- Main ritual canvas with glyphs
- Save indicator (◦) visible in bottom right
- Indicator at ~40% opacity

---

### 9. **Google Drive Authorization** (`gdrive-auth.png`)
**What to capture:** Google Drive link button
**When to capture:** When not yet authorized

**What should be visible:**
- "Link Google Drive" button
- Button positioned at bottom center
- Semi-transparent appearance

---

### 10. **Mobile View - Landing** (`mobile-landing.png`)
**What to capture:** Landing page on mobile
**Resolution:** 375x812 (iPhone X) or 360x740 (Android)

**What should be visible:**
- Same as desktop landing but with mobile layout
- Protocol links stacked vertically
- Smaller font sizes
- Touch-friendly button size

---

### 11. **Mobile View - Active** (`mobile-ritual.png`)
**What to capture:** Active ritual on mobile
**Resolution:** 375x812 or 360x740

**What should be visible:**
- Glyphs filling mobile screen
- Touch interaction working
- Save indicator in correct position

---

## How to Capture Screenshots

### Desktop (1920x1080)

**Method 1: Browser DevTools**
```bash
# 1. Open MORPHA in browser
# 2. Press F12 to open DevTools
# 3. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)
# 4. Type "Capture screenshot"
# 5. Select "Capture full size screenshot"
```

**Method 2: Browser Extensions**
- Nimbus Screenshot (Chrome/Firefox)
- Awesome Screenshot (Chrome/Firefox)
- FireShot (Chrome/Firefox)

**Method 3: OS Tools**
- macOS: Cmd+Shift+4 (select area) or Cmd+Shift+3 (full screen)
- Windows: Win+Shift+S (Snip & Sketch)
- Linux: Flameshot, Spectacle, or GNOME Screenshot

### Mobile Screenshots

**Method 1: Real Device**
- iOS: Side button + Volume Up
- Android: Power + Volume Down

**Method 2: Browser DevTools**
```bash
# 1. Open DevTools (F12)
# 2. Click device toolbar icon (Cmd+Shift+M / Ctrl+Shift+M)
# 3. Select device (iPhone X, Pixel 5, etc.)
# 4. Capture as above
```

---

## Screenshot Specifications

### File Format
- Format: PNG (preferred) or WebP
- Compression: Medium quality (80-90%)
- Alpha channel: Not needed (MORPHA has solid backgrounds)

### Naming Convention
```
{section}-{state}-{variant}.{ext}

Examples:
landing-page.png
landing-page-mobile.png
ritual-low-sound.png
ritual-high-energy-desktop.png
save-indicator.png
```

### File Size
- Desktop: Aim for < 500KB per image
- Mobile: Aim for < 300KB per image
- Use compression tools: TinyPNG, Squoosh, or ImageOptim

---

## Where to Place Screenshots

```
public/
└── screenshots/
    ├── landing-page.png
    ├── landing-page-mobile.png
    ├── ritual-start.png
    ├── ritual-low-sound.png
    ├── ritual-high-energy.png
    ├── ritual-silence.png
    ├── save-indicator.png
    ├── gdrive-auth.png
    ├── mobile-landing.png
    └── mobile-ritual.png
```

**After adding:**
```bash
git add public/screenshots/
git commit -m "Add MORPHA app screenshots"
```

---

## Creating Video Captures (Optional)

For showing motion and morphing:

### Quick GIF (< 5MB)
```bash
# Record 5-10 second clips showing:
# - Landing → entry transition
# - Glyph morphing in response to sound
# - Silence behavior
# - Save interaction

# Tools:
# - Kap (macOS)
# - ScreenToGif (Windows)
# - Peek (Linux)
# - LICEcap (cross-platform)
```

### Video Demo (MP4)
```bash
# Record 30-60 second demo showing:
# - Full user journey
# - Various sound interactions
# - Save functionality
# - Google Drive integration

# Tools:
# - OBS Studio (all platforms)
# - QuickTime (macOS)
# - Windows Game Bar (Windows)
```

**Place videos:**
```
public/
└── videos/
    ├── demo-short.gif (< 5MB)
    └── demo-full.mp4 (< 20MB)
```

---

## Using Screenshots in Documentation

Once captured, update:

1. **README.md** - Add "Screenshots" section
2. **Website** - Add visual gallery
3. **QUICK_START.md** - Add visual guides
4. **GitHub Pages** - Create showcase page

See [VISUAL_DOCUMENTATION.md](./VISUAL_DOCUMENTATION.md) for template code.

---

## Screenshot Checklist

- [ ] Landing page (desktop)
- [ ] Landing page (mobile)
- [ ] Entry transition
- [ ] Microphone permission
- [ ] Empty canvas / ritual start
- [ ] Active ritual - low sound
- [ ] Active ritual - high energy
- [ ] Silence state
- [ ] Save indicator
- [ ] Google Drive auth button
- [ ] Mobile active ritual
- [ ] (Optional) Demo GIF
- [ ] (Optional) Full demo video

---

## Tips for Best Screenshots

**Lighting:** Use dark mode browser, no toolbars visible
**Timing:** Wait for animations to complete
**Sound:** Use predictable sound sources (tone generator, metronome)
**Consistency:** Use same browser and resolution for all shots
**Context:** Capture enough UI to show state, not just glyphs
**Quality:** 2x retina resolution if possible, then downscale

---

**Once you have screenshots, see [VISUAL_DOCUMENTATION.md](./VISUAL_DOCUMENTATION.md) for how to integrate them into the website.**
