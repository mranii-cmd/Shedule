import getKnex from '../db/knex.js';

const db = getKnex();

/**
 * Middleware pour vérifier les permissions
 */
export const checkPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
      }

      const userId = req.user.id;

      const user = await db('users').where({ id: userId }).first();

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      const role = await db('roles').where({ name: user.role }).first();

      if (!role) {
        return res.status(403).json({ error: 'Rôle invalide' });
      }

      const permissions = JSON.parse(role.permissions || '{}');

      if (permissions[resource] && permissions[resource].includes(action)) {
        return next();
      }

      console.log(`[permissions] ❌ User ${userId} denied: ${resource}.${action}`);
      return res.status(403).json({ 
        error: 'Permission refusée',
        required: `${resource}.${action}`
      });

    } catch (error) {
      console.error('[permissions] Error:', error);
      return res.status(500).json({ error: 'Erreur de vérification des permissions' });
    }
  };
};

/**
 * Middleware pour vérifier si l'utilisateur est admin
 */
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const user = await db('users').where({ id: req.user.id }).first();

    if (user && user.role === 'admin') {
      return next();
    }

    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });

  } catch (error) {
    console.error('[requireAdmin] Error:', error);
    return res.status(500).json({ error: 'Erreur de vérification' });
  }
};