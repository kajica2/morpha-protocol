// Alternative DriveAuth.js using config.js instead of .env
//
// To use this approach:
// 1. Copy src/config.example.js to src/config.js
// 2. Add your credentials to src/config.js
// 3. Replace the import in main.js to use this file
//
// This file shows how to use config.js instead of environment variables

import config, { validateConfig } from '../config.js';

// Validate configuration on load
validateConfig();

// Google API Configuration from config file
const CLIENT_ID = config.google.clientId;
const API_KEY = config.google.apiKey;
const DISCOVERY_DOCS = config.google.discoveryDocs;
const SCOPES = config.google.scopes;

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
