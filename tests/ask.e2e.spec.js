/**
 * tests/ask.e2e.spec.js
 * 端到端测试：完整用户流程「打开首页 → 输入问题 → 提交 → 断言回答 → 断言历史 → 刷新后仍在」
 *
 * 定位策略约定：
 *  - 优先使用 data-testid（可测试性设计），其次语义化 id；
 *  - 不使用文案定位——提交按钮在请求过程中会变成「思考中…」并被禁用；
 *  - 等待一律交给 Playwright 的自动等待 + 显式 expect，不写死 sleep。
 */
import { test, expect } from '@playwright/test';
import qaRecord from '../src/record/qaRecord.js';

test.describe('AI 答疑助手 · 端到端主流程', () => {
  test.beforeEach(async ({ page }) => {
    qaRecord.writeAll([]); // 每条用例开始前把记录文件恢复为空，避免互相污染
    await page.goto('/');
  });

  test('打开首页 → 提问 → 断言回答面板与回答文本 → 断言历史新增 → 刷新后仍在', async ({ page }) => {
    const question = `什么是 Spec 驱动开发？（E2E ${Date.now()}）`;

    // 1. 打开首页：标题与关键元素可见
    await expect(page).toHaveTitle(/AI 答疑助手/);
    await expect(page.getByTestId('ask-input')).toBeVisible();

    // 2. 在问题输入框写入内容并提交（按 data-testid 定位，不按文案定位）
    await page.getByTestId('ask-input').fill(question);
    await page.getByTestId('ask-button').click();

    // 3. 断言回答面板出现，且回答文本不为空
    const panel = page.getByTestId('answer-panel');
    await expect(panel).toBeVisible();
    const answerText = page.getByTestId('answer-text');
    await expect(answerText).not.toHaveText('');
    await expect(page.getByTestId('answer-meta')).toContainText('演示模式');

    // 4. 断言历史提问列表中新增了这一条记录
    const historyItems = page.getByTestId('history-item');
    await expect(historyItems).toHaveCount(1);
    await expect(historyItems.first()).toContainText(question);

    // 5. 刷新页面后这条记录仍然存在（说明已落盘，而不是只留在前端内存）
    await page.reload();
    await expect(page.getByTestId('answer-panel')).toBeHidden();
    await expect(page.getByTestId('history-item')).toHaveCount(1);
    await expect(page.getByTestId('history-item').first()).toContainText(question);
  });
});
