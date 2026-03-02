import rateLimit from 'express-rate-limit';

// Rate limiter strict pour les routes d'authentification
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives maximum
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Trop de tentatives. Réessayez plus tard.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Rate limiter général pour les API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes maximum
  message: {
    error: 'too_many_requests',
    message: 'Trop de requêtes. Limite: 100 requêtes par 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter pour les uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // 20 uploads maximum
  message: {
    error: 'too_many_uploads',
    message: 'Trop d\'uploads. Limite: 20 fichiers par heure.'
  }
});
