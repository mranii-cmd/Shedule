/**
 * Utilitaires pour les salles
 */
import StateManager from '../controllers/StateManager.js';

export function getRoomCapacity(roomName) {
    if (!roomName) return 0;
    
    // 1. Chercher dans examRoomConfigs (ARRAY)
    try {
        const configs = StateManager?. state?.examRoomConfigs || [];
        if (Array.isArray(configs)) {
            const config = configs.find(c => c.room === roomName);
            if (config?. capacity) {
                return config.capacity;
            }
        }
    } catch (e) { /* noop */ }

    // 2. Chercher dans sallesInfo
    try {
        const roomsInfo = StateManager?.state?.sallesInfo || {};
        const info = roomsInfo[roomName];
        
        if (info && typeof info === 'object') {
            const cap = info.capacity || info.capacite || 0;
            if (cap > 0) return cap;
        }
        
        // 3. Heuristiques basées sur le type
        if (typeof info === 'string') {
            if (info === 'Amphi' || info. toLowerCase().includes('amphi')) return 200;
            if (info === 'Standard') return 50;
            if (info === 'STP') return 30;
        }
    } catch (e) { /* noop */ }

    // 4. Heuristique basée sur le NOM de la salle
    const nameLower = String(roomName).toLowerCase();
    if (nameLower.includes('amphi')) return 200;
    if (nameLower.includes('tp')) return 30;
    if (nameLower.includes('td')) return 40;
    
    return 0;
}

export function formatRoomWithCapacity(roomName) {
    if (!roomName) return '';
    const capacity = getRoomCapacity(roomName);
    return capacity > 0 ? `${roomName} (${capacity})` : roomName;
}