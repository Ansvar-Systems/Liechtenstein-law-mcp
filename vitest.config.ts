import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      all: true,
      include: [
        'src/capabilities.ts',
        'src/constants.ts',
        'src/tools/**/*.ts',
        'src/utils/**/*.ts',
      ],
      exclude: [
        'src/index.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
