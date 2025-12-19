# MORPHA Quick Start Guide

Get MORPHA running in 5 minutes with either configuration method.

---

## Quick Setup (Choose One Method)

### Option A: Using .env (Recommended)

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env and add your Google credentials
nano .env

# 3. Install and run
npm install
npm run dev
```

**Your `.env` should look like:**
```env
VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-key
```

---

### Option B: Using config.js (Alternative)

```bash
# 1. Copy config template
cp src/config.example.js src/config.js

# 2. Edit config.js and add your Google credentials
nano src/config.js

# 3. Install and run
npm install
npm run dev
```

**Your `src/config.js` should look like:**
```javascript
export const config = {
  google: {
    clientId: 'your-id.apps.googleusercontent.com',
    apiKey: 'your-key',
  },
  // ... rest is fine as-is
};
```

---

## Get Google Credentials (2 minutes)

1. Go to https://console.cloud.google.com/
2. Create project → Enable Google Drive API
3. Create OAuth Client ID (Web application)
4. Add `http://localhost:5173` to authorized origins
5. Copy Client ID and API Key

**Detailed guide:** See [CONFIGURATION.md](./CONFIGURATION.md)

---

## What You'll See

1. **Landing page** - "MORPHA" title with "enter quietly" button
2. **Click button** - Microphone permission requested
3. **Make sounds** or stay silent - Glyphs respond and morph
4. **Long press** anywhere - Saves the moment to Google Drive

---

## Troubleshooting

**"Missing credentials" error?**
- Check your .env or config.js file exists
- Verify credentials are correct
- Restart dev server

**"Failed to authorize" error?**
- Add `http://localhost:5173` to Google Cloud Console
- Enable Google Drive API
- Check credentials are correct

**Need help?** See [CONFIGURATION.md](./CONFIGURATION.md) for detailed guide.

---

## Next Steps

- Explore the protocol: `/protocol/MORPHA.md`
- Read the philosophy: Check the README
- Deploy: Build with `npm run build`
