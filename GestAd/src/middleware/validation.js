import Joi from 'joi';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'validation_error',
        message: 'Erreur de validation',
        details: errors
      });
    }

    req[source] = value;
    next();
  };
}

export const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
      .required()
      .messages({
        'string.pattern.base': 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre'
      }),
    first_name: Joi.string().max(50).optional(),
    last_name: Joi.string().max(50).optional()
  }),

  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),

  createEvent: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000).optional().allow(''),
    start_date: Joi.date().iso().required(),
    start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional().allow('', null),
    end_date: Joi.date().iso().optional().allow('', null),
    end_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional().allow('', null),
    location: Joi.string().max(200).optional().allow(''),
    status: Joi.string().valid('planned', 'ongoing', 'completed', 'cancelled').default('planned'),
    all_day: Joi.boolean().default(false),
    created_by: Joi.number().integer().optional()
  }),

  updateEvent: Joi.object({
    title: Joi.string().min(1).max(200).optional(),
    description: Joi.string().max(1000).optional().allow(''),
    start_date: Joi.date().iso().optional(),
    start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional().allow('', null),
    end_date: Joi.date().iso().optional().allow(null),
    end_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional().allow('', null),
    location: Joi.string().max(200).optional().allow(''),
    status: Joi.string().valid('planned', 'ongoing', 'completed', 'cancelled').optional(),
    all_day: Joi.boolean().optional()
  }),

  // Documents
  createDocument: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000).optional().allow(''),
    category: Joi.string().max(100).optional()
  }),

  uploadDocument: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    category: Joi.string().max(100).allow(null),
    type_id: Joi.number().integer().positive().allow(null),
    year: Joi.number().integer().min(1900).max(2100).allow(null)
  }),

  // Profile
  updateProfile: Joi.object({
    first_name: Joi.string().max(50).optional().allow(''),
    last_name: Joi.string().max(50).optional().allow(''),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/).optional().allow(''),
    bio: Joi.string().max(500).optional().allow('')
  }),

  // ID parameter
  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
  })
};
