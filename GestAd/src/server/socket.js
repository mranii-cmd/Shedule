import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';

let ioInstance = null;

export function initSocket(httpServer, { corsOrigin = '*' } = {}) {
  ioInstance = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin }
  });

  ioInstance.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Auth required'));
    try {
      const secret = process.env.JWT_SECRET || 'changeme';
      const payload = jwt.verify(token, secret);
      socket.user = payload;
      return next();
    } catch (e) {
      return next(new Error('Invalid token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`Socket connected: user_${userId}`);
    }
    socket.on('disconnect', () => {
      if (userId) console.log(`Socket disconnected: user_${userId}`);
    });
  });

  return ioInstance;
}

export function getIo() {
  return ioInstance;
}