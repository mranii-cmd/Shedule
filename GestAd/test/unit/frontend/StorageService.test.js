import { StorageService, storageService } from '../../../public/js/utils/StorageService.js';

describe('StorageService', () => {
  let storage;

  beforeEach(() => {
    storage = new StorageService('test_');
    localStorage.clear();
  });

  describe('constructor', () => {
    it('should use the provided prefix', () => {
      const s = new StorageService('myapp_');
      s.set('key', 'value');
      expect(localStorage.getItem('myapp_key')).toBe('"value"');
    });

    it('should use default prefix "gestad_"', () => {
      const s = new StorageService();
      s.set('key', 'value');
      expect(localStorage.getItem('gestad_key')).toBe('"value"');
    });
  });

  describe('set() and get()', () => {
    it('should store and retrieve a string value', () => {
      storage.set('name', 'John');
      expect(storage.get('name')).toBe('John');
    });

    it('should store and retrieve a number', () => {
      storage.set('count', 42);
      expect(storage.get('count')).toBe(42);
    });

    it('should store and retrieve an object', () => {
      const obj = { id: 1, name: 'Test' };
      storage.set('user', obj);
      expect(storage.get('user')).toEqual(obj);
    });

    it('should store and retrieve an array', () => {
      const arr = [1, 2, 3];
      storage.set('list', arr);
      expect(storage.get('list')).toEqual(arr);
    });

    it('should store and retrieve a boolean', () => {
      storage.set('flag', true);
      expect(storage.get('flag')).toBe(true);
    });

    it('should store and retrieve null', () => {
      storage.set('empty', null);
      expect(storage.get('empty')).toBeNull();
    });

    it('should return defaultValue when key does not exist', () => {
      expect(storage.get('nonexistent', 'default')).toBe('default');
    });

    it('should return null by default when key does not exist', () => {
      expect(storage.get('nonexistent')).toBeNull();
    });

    it('should return true on successful set', () => {
      const result = storage.set('key', 'value');
      expect(result).toBe(true);
    });
  });

  describe('remove()', () => {
    it('should remove an existing key', () => {
      storage.set('key', 'value');
      storage.remove('key');
      expect(storage.get('key')).toBeNull();
    });

    it('should not throw when removing a non-existent key', () => {
      expect(() => storage.remove('nonexistent')).not.toThrow();
    });

    it('should return the StorageService instance for chaining', () => {
      const result = storage.remove('key');
      expect(result).toBe(storage);
    });
  });

  describe('has()', () => {
    it('should return true when key exists', () => {
      storage.set('key', 'value');
      expect(storage.has('key')).toBe(true);
    });

    it('should return false when key does not exist', () => {
      expect(storage.has('nonexistent')).toBe(false);
    });

    it('should return true for keys with falsy values', () => {
      storage.set('zero', 0);
      expect(storage.has('zero')).toBe(true);
    });
  });

  describe('clear()', () => {
    it('should remove all keys with the prefix', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.clear();
      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
    });

    it('should not remove keys with different prefix', () => {
      storage.set('key1', 'value1');
      localStorage.setItem('other_key', 'other');
      storage.clear();
      expect(localStorage.getItem('other_key')).toBe('other');
    });

    it('should return the StorageService instance for chaining', () => {
      const result = storage.clear();
      expect(result).toBe(storage);
    });
  });

  describe('_key()', () => {
    it('should prepend prefix to key', () => {
      expect(storage._key('mykey')).toBe('test_mykey');
    });
  });

  describe('storageService singleton', () => {
    it('should export a shared StorageService instance', () => {
      expect(storageService).toBeInstanceOf(StorageService);
    });

    it('should use default "gestad_" prefix', () => {
      expect(storageService.prefix).toBe('gestad_');
    });

    it('should be usable for storing and retrieving data', () => {
      storageService.set('token', 'abc123');
      expect(storageService.get('token')).toBe('abc123');
      storageService.remove('token');
    });
  });
});
