export const API_BASE_URL = '/api';
export const TOKEN_KEY = 'gestad_token';

export const ENDPOINTS = {
  auth: {
    login: `${API_BASE_URL}/auth/login`,
    register: `${API_BASE_URL}/auth/register`,
    me: `${API_BASE_URL}/auth/me`
  },
  events: {
    list: `${API_BASE_URL}/events`,
    create: `${API_BASE_URL}/events`,
    update: (id) => `${API_BASE_URL}/events/${id}`,
    delete: (id) => `${API_BASE_URL}/events/${id}`
  },
  documents: {
    list: `${API_BASE_URL}/documents`,
    upload: `${API_BASE_URL}/documents`,
    download: (id) => `${API_BASE_URL}/documents/${id}/download`,
    delete: (id) => `${API_BASE_URL}/documents/${id}`
  }
};
