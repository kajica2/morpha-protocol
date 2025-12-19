// MORPHA UUID Generator
// Simple unique identifier generation

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function generateShortID() {
  return Math.random().toString(36).substring(2, 9);
}

export function generateTimestampID() {
  return `${Date.now()}-${generateShortID()}`;
}

export default {
  generateUUID,
  generateShortID,
  generateTimestampID
};
