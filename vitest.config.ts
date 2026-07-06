import { defineConfig } from 'vitest/config';

// The sim / game / progress logic is pure (no DOM, no wall-clock in the model),
// so the default environment is Node. A test that needs a DOM or `localStorage`
// global opts in per-file with `// @vitest-environment jsdom`; progress.test.ts
// instead injects a named FakeStorage, so no suite currently needs jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only the logic modules we own and test count toward coverage — the
      // canvas renderer, audio, and DOM bootstrap (Hector's track) are excluded
      // because they exercise the browser, not the simulation.
      include: ['src/sim/**', 'src/game.ts', 'src/progress.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: {
        // Guidelines: >80% overall for the tested logic, >95% for the core
        // simulation and board rules.
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'src/sim/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
        'src/game.ts': { lines: 95, functions: 95, branches: 95, statements: 95 },
      },
    },
  },
});
