// src/storage/DriveAuth.js

// Google API Configuration from environment variables
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

// Validate configuration
if (!CLIENT_ID || !API_KEY) {
  console.error('Missing Google API credentials. Please check your .env file.');
}

// Discovery docs for APIs used
const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];

// Authorization scopes
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // Allows access to files created by the app

let gapiInited = false;
let gisInited = false;
let tokenClient;
let resolveAuthPromise;
let rejectAuthPromise;

export function initGoogleAuth() {
  return new Promise((resolve, reject) => {
    resolveAuthPromise = resolve;
    rejectAuthPromise = reject;

    // Load the Google API client library
    const scriptGapi = document.createElement('script');
    scriptGapi.src = 'https://apis.google.com/js/api.js';
    scriptGapi.onload = gapiLoaded;
    document.head.appendChild(scriptGapi);

    // Load the Google Identity Services library
    const scriptGis = document.createElement('script');
    scriptGis.src = 'https://accounts.google.com/gsi/client';
    scriptGis.onload = gisLoaded;
    document.head.appendChild(scriptGis);
  });
}

function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: DISCOVERY_DOCS,
  });
  gapiInited = true;
  maybeEnableAuthButton();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // Will be set in handleAuthClick
  });
  gisInited = true;
  maybeEnableAuthButton();
}

function maybeEnableAuthButton() {
  if (gapiInited && gisInited) {
    // Authentication is ready, resolve the promise
    resolveAuthPromise(true);
  }
}

export function handleAuthClick() {
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp) => {
      if (resp.error) {
        reject(resp.error);
        return;
      }
      // Authorization successful
      resolve(true);
    };

    if (gapi.client.getToken() === null) {
      // No token, request authorization
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      // Token exists, but might be expired or insufficient scope
      // For simplicity, we'll always request a new token with prompt: 'consent'
      // In a real app, you'd check token validity first.
      tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  });
}

export function isAuthorized() {
  return gapi.client.getToken() !== null;
}

export function getAccessToken() {
  const token = gapi.client.getToken();
  return token ? token.access_token : null;
}

// Instructions for the user:
// 1. Go to Google Cloud Console: https://console.cloud.google.com/
// 2. Create a new project or select an existing one.
// 3. Enable the Google Drive API for your project.
// 4. Go to "Credentials" -> "Create Credentials" -> "OAuth client ID".
// 5. Choose "Web application".
// 6. Add "http://localhost:5173" (or your app's domain) to "Authorized JavaScript origins".
// 7. Copy your Client ID and API Key and replace the placeholders above.