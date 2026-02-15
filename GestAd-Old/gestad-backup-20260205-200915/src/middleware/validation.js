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
      })
  }),

  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),

  createEvent: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(2000).allow('', null),
    start_date: Joi.date().iso().required(),
    start_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).allow(null),
    end_date: Joi.date().iso().min(Joi.ref('start_date')).allow(null),
    end_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).allow(null),
    all_day: Joi.boolean().default(false)
  }),

  updateEvent: Joi.object({
    title: Joi.string().min(1).max(255),
    description: Joi.string().max(2000).allow('', null),
    start_date: Joi.date().iso(),
    start_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).allow(null),
    end_date: Joi.date().iso(),
    end_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).allow(null),
    all_day: Joi.boolean()
  }).min(1),

  uploadDocument: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    category: Joi.string().max(100).allow(null),
    type_id: Joi.number().integer().positive().allow(null),
    year: Joi.number().integer().min(1900).max(2100).allow(null)
  }),

  id: Joi.object({
    id: Joi.number().integer().positive().required()
  })
};
