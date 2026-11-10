import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只跑单元测试与集成测试；端到端测试交给 Playwright（npm run test:e2e）
    include: ['tests/**/*.test.js'],
    environment: 'node',
    reporters: 'verbose',
  },
});
