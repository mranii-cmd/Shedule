/**
 * StorageAdapter
 * Fournit une API unifiée pour charger/écrire des données de session.
 * - Essaie StorageService.loadSessionData(sessionKey) si disponible (peut être sync ou Promise).
 * - Sinon utilise StateManager.dbService.load(sessionKey) (DatabaseService) si disponible.
 * - Retourne toujours une Promise résolue sur un objet { seances: [], nextId: 1 } par défaut.
 *
 * Cette couche évite de modifier massivement le code existant quand on migre
 * de StorageService (synchrone/hybride) vers DatabaseService (async IndexedDB).
 */
import StateManager from '../controllers/StateManager.js';

async function _tryStorageServiceLoad(sessionKey) {
  try {
    if (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function') {
      const maybe = StorageService.loadSessionData(sessionKey);
      return (maybe && typeof maybe.then === 'function') ? await maybe : maybe;
    }
  } catch (e) { /* noop */ }
  return null;
}

async function _tryDatabaseServiceLoad(sessionKey) {
  try {
    if (StateManager && StateManager.dbService && typeof StateManager.dbService.load === 'function') {
      const r = await StateManager.dbService.load(sessionKey);
      return r;
    }
  } catch (e) { /* noop */ }
  return null;
}

export async function loadSessionData(sessionKey) {
  // Try StorageService first (backwards compatibility)
  const r1 = await _tryStorageServiceLoad(sessionKey);
  if (r1) return r1;
  // Then try DatabaseService via StateManager.dbService
  const r2 = await _tryDatabaseServiceLoad(sessionKey);
  if (r2) return r2;
  // Default fallback
  return { seances: [], nextId: 1 };
}

export async function saveSessionData(sessionKey, data) {
  // Try StorageService
  try {
    if (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.saveSessionData === 'function') {
      const maybe = StorageService.saveSessionData(sessionKey, data);
      if (maybe && typeof maybe.then === 'function') await maybe;
      return true;
    }
  } catch (e) { /* noop */ }

  // Try DatabaseService via StateManager.dbService
  try {
    if (StateManager && StateManager.dbService && typeof StateManager.dbService.save === 'function') {
      await StateManager.dbService.save(sessionKey, data);
      return true;
    }
  } catch (e) { /* noop */ }

  return false;
}

export default {
  loadSessionData,
  saveSessionData
};