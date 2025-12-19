// MORPHA Configuration File (Alternative to .env)
//
// INSTRUCTIONS:
// 1. Copy this file to src/config.js
// 2. Add your actual credentials below
// 3. IMPORTANT: src/config.js is gitignored - never commit it!
//
// This is an alternative to using .env files.
// If you prefer environment variables, use .env instead.

export const config = {
  // Google Drive API Configuration
  // Get these from: https://console.cloud.google.com/
  google: {
    clientId: 'YOUR-CLIENT-ID-HERE.apps.googleusercontent.com',
    apiKey: 'YOUR-API-KEY-HERE',

    // Don't change these unless you know what you're doing
    discoveryDocs: [
      'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
    ],
    scopes: 'https://www.googleapis.com/auth/drive.file',
  },

  // App Configuration
  app: {
    name: 'MORPHA',
    version: '0.1.0',
  },

  // Storage Configuration
  storage: {
    driveFolderName: 'MORPHA Rituals',
  },

  // Development Settings
  dev: {
    enableLogging: true,
    debugMode: false,
  }
};

// Validation helper
export function validateConfig() {
  const missing = [];

  if (!config.google.clientId || config.google.clientId.includes('YOUR-CLIENT-ID')) {
    missing.push('Google Client ID');
  }

  if (!config.google.apiKey || config.google.apiKey.includes('YOUR-API-KEY')) {
    missing.push('Google API Key');
  }

  if (missing.length > 0) {
    console.error('❌ Missing configuration:', missing.join(', '));
    console.error('Please copy src/config.example.js to src/config.js and add your credentials.');
    return false;
  }

  return true;
}

export default config;
