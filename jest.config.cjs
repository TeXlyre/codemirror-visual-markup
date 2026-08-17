module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/test'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/test/mocks/style.js',
    '^mathlive$': '<rootDir>/test/mocks/mathlive.js'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageProvider: 'v8'
};
