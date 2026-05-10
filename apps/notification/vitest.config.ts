import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    swc.vite({
      swcrc: false,
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'es2022',
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    globals: false,
  },
})
