/**
 * Constantes de l'application
 */

// Routes API
export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    PROFILE: '/profile'
  },
  EVENTS: {
    LIST: '/events',
    CREATE: '/events',
    GET: (id) => `/events/${id}`,
    UPDATE: (id) => `/events/${id}`,
    DELETE: (id) => `/events/${id}`
  },
  DOCUMENTS: {
    LIST: '/documents',
    UPLOAD: '/documents/upload',
    GET: (id) => `/documents/${id}`,
    DELETE: (id) => `/documents/${id}`,
    DOWNLOAD: (id) => `/documents/${id}/download`
  }
};

// Statuts des événements
export const EVENT_STATUS = {
  PLANNED: 'planned',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Traductions des statuts
export const EVENT_STATUS_LABELS = {
  [EVENT_STATUS.PLANNED]: 'Planifié',
  [EVENT_STATUS.ONGOING]: 'En cours',
  [EVENT_STATUS.COMPLETED]: 'Terminé',
  [EVENT_STATUS.CANCELLED]: 'Annulé'
};

// Catégories de documents
export const DOCUMENT_CATEGORIES = {
  RESSOURCES: 'ressources',
  LEGISLATION: 'legislation',
  DOCUMENTS: 'documents',
  AUTRES: 'autres'
};

// Tailles maximales
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_SIZE_LABEL = '50MB';

// Formats de fichiers autorisés
export const ALLOWED_FILE_TYPES = {
  DOCUMENTS: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
  IMAGES: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  ALL: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.webp']
};

// Messages d'erreur
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Erreur de connexion au serveur',
  FILE_TOO_LARGE: `Le fichier est trop volumineux (max ${MAX_FILE_SIZE_LABEL})`,
  FILE_TYPE_NOT_ALLOWED: 'Type de fichier non autorisé',
  REQUIRED_FIELD: 'Ce champ est requis',
  INVALID_EMAIL: 'Email invalide',
  INVALID_DATE: 'Date invalide',
  UNAUTHORIZED: 'Non autorisé',
  FORBIDDEN: 'Accès refusé',
  NOT_FOUND: 'Ressource non trouvée'
};
