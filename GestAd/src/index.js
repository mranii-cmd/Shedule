import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import knex from 'knex';
import knexConfig from './db/knexfile.js';
import profileRoutes from './routes/profile.js';

// Middlewares de sécurité
import { authLimiter, apiLimiter, uploadLimiter } from './middleware/rateLimiter.js';
import { logger, requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler, setupUncaughtHandlers } from './middleware/errorHandler.js';

// Import routes
import eventsRouter from './routes/events.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import resourcesRouter from './routes/resources-upload.js';
import notificationsRouter from './routes/notifications.js';
import tagsRouter from './routes/tags.js';
import favoritesRouter from './routes/favorites.js';
import usersRouter from './routes/users.js';
import legislationRouter from './routes/legislation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Setup handlers pour les erreurs non capturées
setupUncaughtHandlers();

// Database
const db = knex(knexConfig);
app.set('knex', db);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(requestLogger);

// Health check (pas de rate limit)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    memory: process.memoryUsage()
  });
});

// Rate limiting par type de route
app.use('/api/auth', authLimiter);
app.use('/api/documents/upload', uploadLimiter);
app.use('/api/resources/upload', uploadLimiter);
app.use('/api', apiLimiter);

// API Routes
app.use('/api/events', eventsRouter);
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/legislation', legislationRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/users', usersRouter);
app.use('/api/profile', profileRoutes);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Route spécifique pour la page de connexion
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Fallback pour SPA (with rate limiting for file system access)
app.get('*', apiLimiter, (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next(); // Passer au handler 404
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handlers (doivent être en dernier)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info('=============================================================');
  logger.info('✓ GestAd Server Started');
  logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`✓ Port: ${PORT}`);
  logger.info(`✓ Node version: ${process.version}`);
  logger.info('=============================================================');
});