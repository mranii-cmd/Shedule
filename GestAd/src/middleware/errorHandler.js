import logger from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'internal_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'validation_error');
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} non trouvé`, 404, 'not_found');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Non autorisé') {
    super(message, 401, 'unauthorized');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Accès refusé') {
    super(message, 403, 'forbidden');
  }
}

export function errorHandler(err, req, res, next) {
  logger.error('Error caught', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details && { details: err.details })
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'validation_error',
      message: err.message
    });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'duplicate_entry',
      message: 'Ressource existe déjà'
    });
  }

  return res.status(500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'production' ? 'Erreur serveur' : err.message
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.url} non trouvée`
  });
}
