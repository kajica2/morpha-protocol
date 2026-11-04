// src/storage/DriveAuth.js
//
// Optional Google Drive linking for saving ritual artifacts.
//
// SECURITY: the API key that used to be committed here was expired and is
// present in this repository's git history. It has been removed from the
// working tree. Supply your own credentials via the environment:
//
//   VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
//   VITE_GOOGLE_API_KEY=AIza...
//
// See .env.example. Without them the ritual still runs completely; only the
// Drive export is disabled and artifacts fall back to a local download.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

// Discovery docs for APIs used
const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];

// Authorization scopes
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // Allows access to files created by the app

// How long we wait for Google's scripts before giving up and letting the
// ritual start without Drive. The ritual never depends on Drive.
const AUTH_LOAD_TIMEOUT_MS = 6000;

let gapiInited = false;
let gisInited = false;
let gapiDone = false;
let gisDone = false;
let authAvailable = false;
let tokenClient;
let settleAuth = null;

/**
 * Start loading the Google API and Identity scripts.
 *
 * Resolves with whether Drive is actually usable. It never rejects and
 * never hangs: a missing key, an expired key, a blocked CDN or an offline
 * network all resolve to false rather than stalling the caller.
 *
 * @returns {Promise<boolean>} True when Drive credentials are usable.
 */
export function initGoogleAuth() {
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve(authAvailable);
    };
    settleAuth = settle;

    if (!CLIENT_ID || !API_KEY) {
      console.warn('MORPHA: Google Drive credentials not configured. Drive export disabled.');
      settle();
      return;
    }

    // Load the Google API client library
    const scriptGapi = document.createElement('script');
    scriptGapi.src = 'https://apis.google.com/js/api.js';
    scriptGapi.onload = gapiLoaded;
    scriptGapi.onerror = () => {
      console.warn('MORPHA: Google API script unavailable. Drive export disabled.');
      gapiDone = true;
      maybeEnableAuthButton();
    };
    document.head.appendChild(scriptGapi);

    // Load the Google Identity Services library
    const scriptGis = document.createElement('script');
    scriptGis.src = 'https://accounts.google.com/gsi/client';
    scriptGis.onload = gisLoaded;
    scriptGis.onerror = () => {
      console.warn('MORPHA: Google Identity script unavailable. Drive export disabled.');
      gisDone = true;
      maybeEnableAuthButton();
    };
    document.head.appendChild(scriptGis);

    // Never let a blocked/slow CDN stall the ritual.
    setTimeout(() => {
      if (!gapiDone || !gisDone) {
        console.warn('MORPHA: Google auth timed out. Drive export disabled.');
      }
      settle();
    }, AUTH_LOAD_TIMEOUT_MS);
  });
}

function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
  } catch (error) {
    gapiInited = false;
    console.warn('MORPHA: Google Drive init failed (invalid or expired API key).', error?.message || error);
  }
  gapiDone = true;
  maybeEnableAuthButton();
}

function gisLoaded() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // Will be set in handleAuthClick
    });
    gisInited = true;
  } catch (error) {
    gisInited = false;
    console.warn('MORPHA: Google Identity init failed.', error?.message || error);
  }
  gisDone = true;
  maybeEnableAuthButton();
}

// Resolve once both Google paths have settled (successfully or not), so the
// caller is never left waiting on a half-loaded API.
function maybeEnableAuthButton() {
  if (gapiInited && gisInited) {
    authAvailable = true;
  }
  if (gapiDone && gisDone && settleAuth) {
    settleAuth();
  }
}

/**
 * Request Drive access from the user.
 *
 * @returns {Promise<boolean>} Resolves true once the user grants access.
 */
export function handleAuthClick() {
  return new Promise((resolve, reject) => {
    if (!tokenClient || !gapiInited) {
      reject(new Error('Google Drive auth is unavailable (missing or expired credentials).'));
      return;
    }

    tokenClient.callback = async (resp) => {
      if (resp.error) {
        reject(resp.error);
        return;
      }
      // Authorization successful
      resolve(true);
    };

    try {
      if (gapi.client.getToken() === null) {
        // No token, request authorization
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        // Token exists, but might be expired or insufficient scope
        // For simplicity, we'll always request a new token with prompt: 'consent'
        // In a real app, you'd check token validity first.
        tokenClient.requestAccessToken({ prompt: 'consent' });
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * True when Drive credentials are usable at all. False means the app must
 * fall back to local download for saved rituals.
 *
 * @returns {boolean}
 */
export function isAuthAvailable() {
  return authAvailable;
}

/**
 * True when the user has granted Drive access.
 *
 * @returns {boolean}
 */
export function isAuthorized() {
  if (!gapiInited || !authAvailable) return false;
  try {
    return gapi.client.getToken() !== null;
  } catch (error) {
    return false;
  }
}

/**
 * The current Drive access token, or null when unavailable.
 *
 * @returns {string|null}
 */
export function getAccessToken() {
  if (!gapiInited || !authAvailable) return null;
  try {
    const token = gapi.client.getToken();
    return token ? token.access_token : null;
  } catch (error) {
    return null;
  }
}

// Instructions for the user:
// 1. Go to Google Cloud Console: https://console.cloud.google.com/
// 2. Create a new project or select an existing one.
// 3. Enable the Google Drive API for your project.
// 4. Go to "Credentials" -> "Create Credentials" -> "OAuth client ID".
// 5. Choose "Web application".
// 6. Add your app's domain to "Authorized JavaScript origins"
//    (e.g. http://localhost:5173 for local development).
// 7. Create an API key and restrict it to your domain.
// 8. Copy your Client ID and API Key into .env as
//    VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY.
