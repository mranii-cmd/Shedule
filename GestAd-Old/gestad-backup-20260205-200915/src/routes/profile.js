import express from 'express';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
import { jwtAuth } from '../middleware/auth.js';
import getKnex from '../db/knex.js';

const db = getKnex();
const router = express.Router();

// Configuration de multer pour l'upload d'avatar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// GET /api/profile - Récupérer le profil de l'utilisateur connecté
router.get('/', jwtAuth, async (req, res) => {
  try {
    const user = await db('users')
      .select('id', 'username', 'email', 'role', 'first_name', 'last_name', 
              'phone', 'bio', 'avatar_url', 'is_active', 'last_login', 'created_at')
      .where('id', req.user.id)
      .first();

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du profil' });
  }
});

// PUT /api/profile - Mettre à jour le profil
router.put('/', jwtAuth, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, bio } = req.body;

    // Vérifier que l'email n'est pas déjà utilisé par un autre utilisateur
    if (email) {
      const existingUser = await db('users')
        .where('email', email)
        .where('id', '!=', req.user.id)
        .first();

      if (existingUser) {
        return res.status(400).json({ message: 'Cet email est déjà utilisé' });
      }
    }

    const updateData = {};
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;

    await db('users')
      .where('id', req.user.id)
      .update(updateData);

    // ✅ Log de l'activité (SANS description)
    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user.updated',
      entity_type: 'profile',
      entity_id: req.user.id
    });

    const updatedUser = await db('users')
      .select('id', 'username', 'email', 'role', 'first_name', 'last_name', 
              'phone', 'bio', 'avatar_url', 'is_active', 'last_login', 'created_at')
      .where('id', req.user.id)
      .first();

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du profil' });
  }
});

// PATCH /api/profile/password - Changer le mot de passe
router.patch('/password', jwtAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ 
        message: 'Le mot de passe actuel et le nouveau mot de passe sont requis' 
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ 
        message: 'Le nouveau mot de passe doit contenir au moins 6 caractères' 
      });
    }

    // Vérifier le mot de passe actuel
    const user = await db('users')
      .select('password')
      .where('id', req.user.id)
      .first();

    const isValid = bcrypt.compareSync(current_password, user.password);
    if (!isValid) {
      return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = bcrypt.hashSync(new_password, 10);

    // Mettre à jour le mot de passe
    await db('users')
      .where('id', req.user.id)
      .update({ password: hashedPassword });

    // ✅ Log de l'activité (SANS description)
    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'password.changed',
      entity_type: 'password',
      entity_id: req.user.id
    });

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe' });
  }
});

// POST /api/profile/avatar - Upload d'avatar
router.post('/avatar', jwtAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Mettre à jour l'avatar_url de l'utilisateur
    await db('users')
      .where('id', req.user.id)
      .update({ avatar_url: avatarUrl });

    // ✅ Log de l'activité (SANS description)
    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'avatar.updated',
      entity_type: 'avatar',
      entity_id: req.user.id
    });

    res.json({ 
      message: 'Avatar uploadé avec succès',
      avatar_url: avatarUrl
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ message: 'Erreur lors de l\'upload de l\'avatar' });
  }
});

// GET /api/profile/activity - Récupérer l'historique d'activité
router.get('/activity', jwtAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const activities = await db('activity_logs')
      .where('user_id', req.user.id)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('activity_logs')
      .where('user_id', req.user.id)
      .count('id as count')
      .first();

    res.json({
      activities,
      total: total.count,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'activité' });
  }
});

export default router;