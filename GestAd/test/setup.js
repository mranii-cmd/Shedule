// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { store = {}; },
    get length() { return Object.keys(store).length; },
    key(n) { return Object.keys(store)[n] || null; },
    _store() { return store; }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: jest.fn().mockResolvedValue({}),
  text: jest.fn().mockResolvedValue('')
});

// Mock console methods to reduce noise during tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
});
