import express from 'express';
import request from 'supertest';

// Mock knex before importing routes
jest.mock('knex', () => {
  const mockChain = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue([1])
  };
  const mockDb = jest.fn().mockReturnValue(mockChain);
  return jest.fn().mockReturnValue(mockDb);
});

// Mock knexfile to avoid import.meta.url issues
jest.mock('../../src/db/knexfile.js', () => ({
  __esModule: true,
  default: { client: 'sqlite3', connection: ':memory:' }
}));

// Mock middleware/auth.js to avoid real DB calls
jest.mock('../../src/middleware/auth.js', () => ({
  __esModule: true,
  createUser: jest.fn(),
  verifyCredentials: jest.fn(),
  jwtAuth: jest.fn((req, res, next) => {
    req.user = { id: 1, username: 'testuser', role: 'user' };
    next();
  })
}));

import authRouter from '../../src/routes/auth.js';
import { createUser, verifyCredentials } from '../../src/middleware/auth.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

describe('Auth Routes Integration', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should return 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'validation_error');
    });

    it('should return 400 when username is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'ab', email: 'test@test.com', password: 'Secret1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'johndoe', email: 'not-email', password: 'Secret1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should return 400 when password is too weak', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'johndoe', email: 'test@test.com', password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should return 200 when registration is successful', async () => {
      createUser.mockResolvedValue({ id: 1, username: 'johndoe', email: 'john@test.com' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'johndoe', email: 'john@test.com', password: 'Secret1pass!' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('username', 'johndoe');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should return 401 when credentials are invalid', async () => {
      verifyCredentials.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'johndoe', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid credentials');
    });

    it('should return 200 with token on successful login', async () => {
      verifyCredentials.mockResolvedValue({ id: 1, username: 'johndoe', role: 'user' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'johndoe', password: 'correctpassword' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('username', 'johndoe');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer faketoken');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toHaveProperty('username', 'testuser');
    });
  });
});
