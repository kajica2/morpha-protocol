// src/storage/DriveUpload.js

import { getAccessToken } from './DriveAuth';

const MORPHA_FOLDER_NAME = 'MORPHA_Rituals';
let morphaFolderId = null;

async function findOrCreateMorphaFolder() {
  if (morphaFolderId) {
    return morphaFolderId;
  }

  try {
    // Search for the folder
    const response = await gapi.client.drive.files.list({
      q: `name='${MORPHA_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      morphaFolderId = files[0].id;
      console.log("Found MORPHA folder:", morphaFolderId);
      return morphaFolderId;
    } else {
      // Create the folder if it doesn't exist
      const fileMetadata = {
        name: MORPHA_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const createResponse = await gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
      });
      morphaFolderId = createResponse.result.id;
      console.log("Created MORPHA folder:", morphaFolderId);
      return morphaFolderId;
    }
  } catch (error) {
    console.error("Error finding or creating MORPHA folder:", error);
    throw error;
  }
}

export async function uploadFileToDrive(fileBlob, fileName, mimeType, metadata = {}) {
  try {
    const folderId = await findOrCreateMorphaFolder();
    if (!folderId) {
      throw new Error("MORPHA folder not found or created.");
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error("Google Drive not authorized.");
    }

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
      ...metadata,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("File uploaded to Google Drive:", result);
    return result.id;
  } catch (error) {
    console.error("Error uploading file to Google Drive:", error);
    throw error;
  }
}
