import { authLimiter, apiLimiter, uploadLimiter } from '../../../src/middleware/rateLimiter.js';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers.js';

describe('Rate Limiters', () => {
  describe('authLimiter', () => {
    it('should export a middleware function', () => {
      expect(typeof authLimiter).toBe('function');
    });

    it('should accept req, res, next parameters', () => {
      expect(authLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next() for a single request', (done) => {
      const req = createMockRequest({
        ip: '1.2.3.4',
        headers: {},
        connection: { remoteAddress: '1.2.3.4' }
      });
      const res = createMockResponse();
      const next = jest.fn(() => done());

      authLimiter(req, res, next);
    });
  });

  describe('apiLimiter', () => {
    it('should export a middleware function', () => {
      expect(typeof apiLimiter).toBe('function');
    });

    it('should accept req, res, next parameters', () => {
      expect(apiLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next() for a single request', (done) => {
      const req = createMockRequest({
        ip: '2.3.4.5',
        headers: {},
        connection: { remoteAddress: '2.3.4.5' }
      });
      const res = createMockResponse();
      const next = jest.fn(() => done());

      apiLimiter(req, res, next);
    });
  });

  describe('uploadLimiter', () => {
    it('should export a middleware function', () => {
      expect(typeof uploadLimiter).toBe('function');
    });

    it('should accept req, res, next parameters', () => {
      expect(uploadLimiter.length).toBeGreaterThanOrEqual(2);
    });

    it('should call next() for a single request', (done) => {
      const req = createMockRequest({
        ip: '3.4.5.6',
        headers: {},
        connection: { remoteAddress: '3.4.5.6' }
      });
      const res = createMockResponse();
      const next = jest.fn(() => done());

      uploadLimiter(req, res, next);
    });
  });

  describe('Rate limiter instances', () => {
    it('should export three distinct rate limiters', () => {
      expect(authLimiter).not.toBe(apiLimiter);
      expect(apiLimiter).not.toBe(uploadLimiter);
      expect(authLimiter).not.toBe(uploadLimiter);
    });
  });
});
