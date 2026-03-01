/**
 * Fonctions utilitaires pour les tests
 */

/**
 * Crée un objet request Express simulé
 * @param {object} overrides - Surcharges des propriétés par défaut
 * @returns {object}
 */
export function createMockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    ...overrides
  };
}

/**
 * Crée un objet response Express simulé
 * @returns {object}
 */
export function createMockResponse() {
  const res = {
    statusCode: 200,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn().mockReturnValue(undefined),
    end: jest.fn().mockReturnThis()
  };
  return res;
}

/**
 * Crée une fonction next Express simulée
 * @returns {jest.Mock}
 */
export function createMockNext() {
  return jest.fn();
}

/**
 * Crée un utilisateur de test
 * @param {object} overrides - Surcharges des propriétés par défaut
 * @returns {object}
 */
export function createTestUser(overrides = {}) {
  return {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: '$2a$10$hashedpassword',
    role: 'user',
    created_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Crée un événement de test
 * @param {object} overrides - Surcharges des propriétés par défaut
 * @returns {object}
 */
export function createTestEvent(overrides = {}) {
  return {
    id: 1,
    title: 'Test Event',
    description: 'Test description',
    start_date: '2024-01-01',
    start_time: '10:00',
    end_date: '2024-01-01',
    end_time: '12:00',
    all_day: false,
    created_by: 1,
    created_at: new Date().toISOString(),
    ...overrides
  };
}
