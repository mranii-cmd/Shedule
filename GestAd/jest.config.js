export default {
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'src/middleware/rateLimiter.js',
    'src/middleware/validation.js',
    'src/middleware/errorHandler.js',
    'src/routes/auth.js',
    'public/js/utils/EventBus.js',
    'public/js/utils/StorageService.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 10000
};
