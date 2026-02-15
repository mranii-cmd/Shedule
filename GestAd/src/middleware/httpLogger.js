import morgan from 'morgan';
import logger from '../utils/logger.js';

const stream = {
  write: (message) => logger.http(message.trim())
};

const format = ':method :url :status :res[content-length] - :response-time ms';

export const httpLogger = morgan(format, { stream });
