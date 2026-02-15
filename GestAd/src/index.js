import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import knex from 'knex';
import knexConfig from './db/knexfile.js';
import profileRoutes from './routes/profile.js';

// Import routes
import eventsRouter from './routes/events.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import resourcesRouter from './routes/resources-upload.js';
import notificationsRouter from './routes/notifications.js';  // ✅ AJOUTÉ
import tagsRouter from './routes/tags.js';                    // ✅ AJOUTÉ
import favoritesRouter from './routes/favorites.js';          // ✅ AJOUTÉ
import usersRouter from './routes/users.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Database
const db = knex(knexConfig);
app.set('knex', db);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Health check
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

// API Routes
app.use('/api/events', eventsRouter);
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/notifications', notificationsRouter);  // ✅ AJOUTÉ
app.use('/api/tags', tagsRouter);                    // ✅ AJOUTÉ
app.use('/api/favorites', favoritesRouter);          // ✅ AJOUTÉ
app.use('/api/users', usersRouter);
app.use('/api/profile', profileRoutes);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Route spécifique pour la page de connexion
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Fallback pour SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Route API non trouvée' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.name || 'internal_server_error',
    message: err.message || 'An error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log('=============================================================');
  console.log('✓ GestAd Server Started');
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Port: ${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ API Endpoints:`);
  console.log(`  - http://localhost:${PORT}/api/events`);
  console.log(`  - http://localhost:${PORT}/api/documents`);
  console.log(`  - http://localhost:${PORT}/api/notifications`);
  console.log(`  - http://localhost:${PORT}/api/tags`);
  console.log(`  - http://localhost:${PORT}/api/favorites`);
  console.log(`✓ Node version: ${process.version}`);
  console.log('=============================================================');
});