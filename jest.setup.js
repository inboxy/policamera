// Jest setup file
// Add custom matchers, mocks, or global test configuration here

// Mock browser APIs that aren't available in jsdom
global.crypto = {
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  },
  subtle: {
    generateKey: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    exportKey: jest.fn(),
    importKey: jest.fn(),
  },
};

// Mock IndexedDB
global.indexedDB = {
  open: jest.fn(),
  deleteDatabase: jest.fn(),
};

// Mock MediaDevices
global.navigator.mediaDevices = {
  getUserMedia: jest.fn(),
  enumerateDevices: jest.fn(),
};

// Mock permissions API
global.navigator.permissions = {
  query: jest.fn(),
};

// Suppress console errors during tests (optional)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
