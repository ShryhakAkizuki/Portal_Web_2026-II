import { defineConfig, type UserConfig } from 'vite';

// BASE_PATH
const config = {
  base: process.env.BASE_PATH ?? '/',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as UserConfig & { test: Record<string, unknown> };

export default defineConfig(config);
