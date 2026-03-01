jest.mock('../../../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  errorHandler,
  notFoundHandler
} from '../../../src/middleware/errorHandler.js';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an error with default values', () => {
      const err = new AppError('Something went wrong');
      expect(err.message).toBe('Something went wrong');
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('internal_error');
      expect(err.isOperational).toBe(true);
    });

    it('should create an error with custom status and code', () => {
      const err = new AppError('Custom error', 422, 'custom_code');
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('custom_code');
    });

    it('should be an instance of Error', () => {
      const err = new AppError('Test');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error with 400 status', () => {
      const err = new ValidationError('Invalid data');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('validation_error');
    });

    it('should include details array', () => {
      const details = [{ field: 'email', message: 'Invalid email' }];
      const err = new ValidationError('Invalid data', details);
      expect(err.details).toEqual(details);
    });

    it('should default to empty details array', () => {
      const err = new ValidationError('Invalid data');
      expect(err.details).toEqual([]);
    });
  });

  describe('NotFoundError', () => {
    it('should create a 404 error', () => {
      const err = new NotFoundError();
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('not_found');
    });

    it('should include resource name in message', () => {
      const err = new NotFoundError('User');
      expect(err.message).toContain('User');
    });

    it('should use default resource name', () => {
      const err = new NotFoundError();
      expect(err.message).toBeDefined();
      expect(err.message.length).toBeGreaterThan(0);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create a 401 error', () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('unauthorized');
    });

    it('should accept custom message', () => {
      const err = new UnauthorizedError('Token expired');
      expect(err.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('should create a 403 error', () => {
      const err = new ForbiddenError();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('forbidden');
    });

    it('should accept custom message', () => {
      const err = new ForbiddenError('Insufficient permissions');
      expect(err.message).toBe('Insufficient permissions');
    });
  });
});

describe('errorHandler middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockRequest({ url: '/api/test', method: 'GET' });
    res = createMockResponse();
    next = createMockNext();
  });

  it('should handle operational errors with their status code', () => {
    const err = new AppError('Not found', 404, 'not_found');
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'not_found', message: 'Not found' })
    );
  });

  it('should include details for ValidationError', () => {
    const details = [{ field: 'email', message: 'Invalid' }];
    const err = new ValidationError('Validation failed', details);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.details).toEqual(details);
  });

  it('should handle duplicate entry errors with 409', () => {
    const err = new Error('Duplicate entry');
    err.code = 'ER_DUP_ENTRY';
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'duplicate_entry' })
    );
  });

  it('should return 500 for unknown errors', () => {
    const err = new Error('Unexpected error');
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'internal_server_error' })
    );
  });

  it('should hide error message in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('Internal details');
    errorHandler(err, req, res, next);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.message).not.toBe('Internal details');

    process.env.NODE_ENV = originalEnv;
  });
});

describe('notFoundHandler middleware', () => {
  it('should return 404 with route information', () => {
    const req = createMockRequest({ url: '/api/unknown', method: 'GET' });
    const res = createMockResponse();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'not_found' })
    );
  });

  it('should include method and URL in message', () => {
    const req = createMockRequest({ url: '/api/missing', method: 'POST' });
    const res = createMockResponse();

    notFoundHandler(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.message).toContain('POST');
    expect(jsonArg.message).toContain('/api/missing');
  });
});
