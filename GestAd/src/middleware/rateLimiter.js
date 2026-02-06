import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'too_many_requests',
    message: 'Trop de tentatives. Réessayez dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: {
    error: 'too_many_requests',
    message: 'Trop de requêtes.'
  }
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    error: 'upload_limit_exceeded',
    message: 'Limite d\'uploads atteinte.'
  }
});
