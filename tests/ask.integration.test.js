/**
 * tests/ask.integration.test.js
 * 被测对象：POST /api/ask 与 GET /api/history 之间的接口契约与数据传递
 *
 * 前置改造：src/server.js 已拆出可导出的 createServer() 工厂，
 * 仅在 require.main === module 时才 listen，因此这里引入不会占用真实端口。
 *
 * 用例隔离：每条用例开始前把问答记录文件恢复为空——集成测试是真实读写 data/qa-records.json 的，
 * 不隔离就会出现「上一条用例写的数据被下一条查到」的互相污染。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import qaRecord from '../src/record/qaRecord.js';
import serverModule from '../src/server.js';

const { createServer } = serverModule;

/** 每个请求用一个全新的服务实例，避免用例之间共享 socket 状态 */
function api() {
  return request(createServer());
}

beforeEach(() => {
  qaRecord.writeAll([]); // 契约：每条用例开始前问答记录文件恢复为空
});

describe('集成测试：POST /api/ask 与 GET /api/history 的接口契约', () => {
  it('【契约 1】正常提问应返回 200，且 data.answer 非空、字段齐全', async () => {
    const res = await api()
      .post('/api/ask')
      .send({ question: '什么是 Spec 驱动开发？' })
      .set('Content-Type', 'application/json');

    // 验证目标：状态码契约 + 成功响应体的字段形状
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { id, question, answer, sources, mode, createdAt } = res.body.data;
    expect(typeof id).toBe('string');
    expect(question).toBe('什么是 Spec 驱动开发？'); // 请求体被完整传递到回答环节
    expect(typeof answer).toBe('string');
    expect(answer.length).toBeGreaterThan(0); // 回答非空——模型层没有被跳过
    expect(Array.isArray(sources)).toBe(true);
    expect(mode).toBe('demo'); // 未配置 LLM_API_KEY 时为演示模式
    expect(new Date(createdAt).toString()).not.toBe('Invalid Date');
  });

  it('【契约 2】问题为空或只有空格时应返回 400 与「问题内容不能为空」', async () => {
    const res = await api()
      .post('/api/ask')
      .send({ question: '     ' })
      .set('Content-Type', 'application/json');

    // 验证目标：错误分支契约——空白输入必须在接口层被拦住，不能进入模型层与存档
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('问题内容不能为空');
    expect(qaRecord.readAll()).toHaveLength(0); // 被拒绝的请求不应留下记录
  });

  it('【契约 3】提问后 GET /api/history 应能查到刚写入的那一条（接口之间的数据传递）', async () => {
    const askRes = await api()
      .post('/api/ask')
      .send({ question: '什么是 MCP？' })
      .set('Content-Type', 'application/json');
    expect(askRes.status).toBe(200);

    const historyRes = await api().get('/api/history?limit=20');

    // 验证目标：POST 写入的数据能被 GET 读出，且字段原样传递（不是只查到了「有一条」）
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.ok).toBe(true);
    expect(Array.isArray(historyRes.body.data)).toBe(true);
    expect(historyRes.body.data).toHaveLength(1);

    const row = historyRes.body.data[0];
    expect(row.id).toBe(askRes.body.data.id);
    expect(row.question).toBe('什么是 MCP？');
    expect(row.answer).toBe(askRes.body.data.answer);
  });
});
