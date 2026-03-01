import { validate, schemas } from '../../../src/middleware/validation.js';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers.js';

describe('Validation Middleware', () => {
  describe('validate()', () => {
    it('should call next() when body is valid', () => {
      const req = createMockRequest({
        body: { username: 'johndoe', password: 'Secret1!' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = validate(schemas.login);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when body is invalid', () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = validate(schemas.login);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'validation_error' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should strip unknown fields from body', () => {
      const req = createMockRequest({
        body: { username: 'johndoe', password: 'Secret1!', unknown: 'field' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = validate(schemas.login);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).not.toHaveProperty('unknown');
    });

    it('should validate params source when specified', () => {
      const req = createMockRequest({ params: { id: 1 } });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = validate(schemas.id, 'params');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should return multiple validation errors with abortEarly: false', () => {
      const req = createMockRequest({ body: { username: 'ab', email: 'not-email' } });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = validate(schemas.register);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.details).toBeInstanceOf(Array);
      expect(jsonCall.details.length).toBeGreaterThan(1);
    });
  });

  describe('schemas.register', () => {
    it('should validate a valid registration object', () => {
      const { error } = schemas.register.validate({
        username: 'johndoe',
        email: 'john@example.com',
        password: 'SecretPass1'
      });
      expect(error).toBeUndefined();
    });

    it('should reject username shorter than 3 characters', () => {
      const { error } = schemas.register.validate({
        username: 'ab',
        email: 'john@example.com',
        password: 'SecretPass1'
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid email', () => {
      const { error } = schemas.register.validate({
        username: 'johndoe',
        email: 'not-an-email',
        password: 'SecretPass1'
      });
      expect(error).toBeDefined();
    });

    it('should reject password without uppercase', () => {
      const { error } = schemas.register.validate({
        username: 'johndoe',
        email: 'john@example.com',
        password: 'secretpass1'
      });
      expect(error).toBeDefined();
    });

    it('should reject password without digit', () => {
      const { error } = schemas.register.validate({
        username: 'johndoe',
        email: 'john@example.com',
        password: 'SecretPassWord'
      });
      expect(error).toBeDefined();
    });

    it('should reject password shorter than 8 characters', () => {
      const { error } = schemas.register.validate({
        username: 'johndoe',
        email: 'john@example.com',
        password: 'Sec1'
      });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.login', () => {
    it('should validate valid login credentials', () => {
      const { error } = schemas.login.validate({
        username: 'johndoe',
        password: 'anypassword'
      });
      expect(error).toBeUndefined();
    });

    it('should reject missing username', () => {
      const { error } = schemas.login.validate({ password: 'anypassword' });
      expect(error).toBeDefined();
    });

    it('should reject missing password', () => {
      const { error } = schemas.login.validate({ username: 'johndoe' });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.createEvent', () => {
    it('should validate a valid event', () => {
      const { error } = schemas.createEvent.validate({
        title: 'Mon événement',
        start_date: '2024-06-15'
      });
      expect(error).toBeUndefined();
    });

    it('should reject event without title', () => {
      const { error } = schemas.createEvent.validate({
        start_date: '2024-06-15'
      });
      expect(error).toBeDefined();
    });

    it('should reject event without start_date', () => {
      const { error } = schemas.createEvent.validate({
        title: 'Mon événement'
      });
      expect(error).toBeDefined();
    });

    it('should accept all_day flag', () => {
      const { error, value } = schemas.createEvent.validate({
        title: 'Mon événement',
        start_date: '2024-06-15',
        all_day: true
      });
      expect(error).toBeUndefined();
      expect(value.all_day).toBe(true);
    });

    it('should default all_day to false', () => {
      const { value } = schemas.createEvent.validate({
        title: 'Mon événement',
        start_date: '2024-06-15'
      });
      expect(value.all_day).toBe(false);
    });
  });

  describe('schemas.id', () => {
    it('should validate a positive integer id', () => {
      const { error } = schemas.id.validate({ id: 42 });
      expect(error).toBeUndefined();
    });

    it('should reject negative id', () => {
      const { error } = schemas.id.validate({ id: -1 });
      expect(error).toBeDefined();
    });

    it('should reject non-integer id', () => {
      const { error } = schemas.id.validate({ id: 'abc' });
      expect(error).toBeDefined();
    });
  });
});
