# MORPHA Configuration Guide

MORPHA supports two methods for managing API credentials and configuration. Choose the one that works best for your workflow.

---

## Method 1: Environment Variables (Recommended)

Best for: Production deployments, CI/CD pipelines, containerized environments

### Setup

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your credentials:**
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key
   ```

3. **Start the app:**
   ```bash
   npm run dev
   ```

### Pros
- ✓ Industry standard approach
- ✓ Easy to manage across environments (dev, staging, prod)
- ✓ Works with CI/CD and deployment platforms
- ✓ Vite automatically handles variable substitution
- ✓ Never committed to git (automatically ignored)

### Cons
- Requires understanding of environment variables
- Need to configure on each environment

---

## Method 2: Config File (Alternative)

Best for: Simple local development, quick prototyping, learning

### Setup

1. **Copy the example file:**
   ```bash
   cp src/config.example.js src/config.js
   ```

2. **Edit `src/config.js` with your credentials:**
   ```javascript
   export const config = {
     google: {
       clientId: 'your-client-id.apps.googleusercontent.com',
       apiKey: 'your-api-key',
     },
     // ... other settings
   };
   ```

3. **Update imports (if needed):**

   If you want to use this method exclusively, you can replace the environment variable approach in `DriveAuth.js` with the config file approach shown in `DriveAuth.alternative.js`.

4. **Start the app:**
   ```bash
   npm run dev
   ```

### Pros
- ✓ Simple JavaScript object
- ✓ Easy to understand
- ✓ Can include comments and documentation
- ✓ Type-safe (can use JSDoc or TypeScript)
- ✓ Never committed to git (automatically ignored)

### Cons
- Not ideal for production deployments
- Harder to manage across multiple environments
- Need to manually update for each developer

---

## Getting Google API Credentials

Regardless of which method you choose, you'll need Google API credentials:

### Step-by-Step Guide

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create or Select a Project**
   - Click "Select a project" → "New Project"
   - Name it (e.g., "MORPHA") and create

3. **Enable Google Drive API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"

4. **Create Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Configure OAuth consent screen if prompted:
     - User Type: External
     - App name: MORPHA
     - User support email: your email
     - Developer contact: your email
     - Save and continue through the steps

5. **Create OAuth Client ID**
   - Application type: "Web application"
   - Name: "MORPHA Web Client"
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for local dev)
     - `https://your-domain.com` (for production)
   - Click "Create"

6. **Get Your Credentials**
   - Copy the **Client ID** (ends with `.apps.googleusercontent.com`)
   - Copy the **API Key** (starts with `AIzaSy`)

7. **Add to Configuration**
   - If using `.env`: Add to `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`
   - If using `config.js`: Add to `config.google.clientId` and `config.google.apiKey`

---

## Switching Between Methods

You can switch between configuration methods at any time:

### From .env to config.js

1. Copy `src/config.example.js` to `src/config.js`
2. Copy your credentials from `.env` to `config.js`
3. Update imports in your code if needed

### From config.js to .env

1. Copy `.env.example` to `.env`
2. Copy your credentials from `config.js` to `.env`
3. Ensure your code uses `import.meta.env.VITE_*` variables

---

## Security Best Practices

Regardless of method:

- ✓ **Never commit credentials** - Both `.env` and `config.js` are gitignored
- ✓ **Use different credentials** for development and production
- ✓ **Rotate keys regularly** if compromised
- ✓ **Restrict origins** in Google Cloud Console
- ✓ **Monitor API usage** in Google Cloud Console

---

## Troubleshooting

### "Missing Google API credentials" Error

**If using .env:**
- Ensure `.env` file exists in project root
- Check that variables start with `VITE_`
- Restart dev server after changing `.env`

**If using config.js:**
- Ensure `src/config.js` exists (copy from `src/config.example.js`)
- Check that credentials don't contain placeholder text
- Verify import paths are correct

### "Failed to authorize Google Drive" Error

- Check that your Client ID and API Key are correct
- Verify JavaScript origins in Google Cloud Console
- Ensure Google Drive API is enabled
- Try clearing browser cache and cookies

### Environment Variables Not Working

- Vite only exposes variables prefixed with `VITE_`
- Restart dev server after changing `.env`
- Check that `.env` is in the project root, not `src/`

---

## Configuration Reference

### Environment Variables (.env)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Yes | OAuth Client ID | `xxx.apps.googleusercontent.com` |
| `VITE_GOOGLE_API_KEY` | Yes | Google API Key | `AIzaSy...` |
| `VITE_APP_NAME` | No | Application name | `MORPHA` |
| `VITE_APP_VERSION` | No | Version number | `0.1.0` |
| `VITE_DRIVE_FOLDER_NAME` | No | Folder for saved rituals | `MORPHA Rituals` |

### Config File (config.js)

```javascript
{
  google: {
    clientId: string,        // Required
    apiKey: string,          // Required
    discoveryDocs: array,    // Default provided
    scopes: string,          // Default provided
  },
  app: {
    name: string,            // Optional
    version: string,         // Optional
  },
  storage: {
    driveFolderName: string, // Optional
  },
  dev: {
    enableLogging: boolean,  // Optional
    debugMode: boolean,      // Optional
  }
}
```

---

## Questions?

If you encounter issues with configuration:

1. Check this guide thoroughly
2. Verify Google Cloud Console settings
3. Check browser console for error messages
4. Open an issue on GitHub with details

---

*Last updated: 2025-12-19*
