/**
 * tests/qaRecord.test.js
 * 被测模块：src/record/qaRecord.js
 * 测试范围：add / list / list(limit) / writeAll + readAll 四个行为（共 18 条用例）
 *
 * 设计要点：
 *  1. 通过 QARECORD_FILE 环境变量把记录文件指向系统临时目录，用例不触碰 data/qa-records.json，避免产生副作用；
 *  2. 断言全部写成「明确的期望值」（如 id 顺序数组），不复述被测代码的排序实现，避免镜像断言；
 *  3. 每条用例开始前删除临时文件，保证用例之间互不污染。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import qaRecord from '../src/record/qaRecord.js';

// ---- 测试环境隔离：临时目录 + 临时记录文件 ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiqa-unit-'));
const tmpFile = path.join(tmpDir, 'qa-records.json');
process.env.QARECORD_FILE = tmpFile;

// 固定时间基准，保证顺序断言可复现（第 i 条比第 i-1 条晚 1 秒）
const BASE = Date.parse('2026-11-10T08:00:00.000Z');
function makeEntry(i, extra = {}) {
  return {
    question: `问题${i}`,
    answer: `回答${i}`,
    sources: [`来源${i}`],
    mode: 'demo',
    createdAt: new Date(BASE + i * 1000).toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('qaRecord —— 问答记录持久化模块', () => {
  // ============ 一、add(entry)：新增记录 ============
  describe('add(entry) 新增记录', () => {
    it('新增一条记录后，总记录数应从 0 递增为 1', () => {
      // 验证目标：add 会真正把记录写入数据源，而不是只返回对象
      expect(qaRecord.readAll()).toHaveLength(0);
      qaRecord.add(makeEntry(1));
      expect(qaRecord.readAll()).toHaveLength(1);
    });

    it('连续新增三条记录后，总记录数应精确递增为 3', () => {
      // 验证目标：每次新增只增加 1 条，不会覆盖已有记录
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      qaRecord.add(makeEntry(3));
      expect(qaRecord.readAll()).toHaveLength(3);
    });

    it('add 返回的记录应包含 id / question / answer / sources / mode / createdAt 六个字段', () => {
      // 验证目标：字段完整性——接口层依赖这些字段组织响应
      const record = qaRecord.add(makeEntry(1));
      expect(Object.keys(record).sort()).toEqual(
        ['answer', 'createdAt', 'id', 'mode', 'question', 'sources']
      );
      expect(record.question).toBe('问题1');
      expect(record.answer).toBe('回答1');
      expect(record.sources).toEqual(['来源1']);
      expect(record.mode).toBe('demo');
    });

    it('add 应为每条记录生成互不相同的 id（UUID）', () => {
      // 验证目标：id 的唯一性，避免历史列表出现重复键
      const a = qaRecord.add(makeEntry(1));
      const b = qaRecord.add(makeEntry(2));
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('新增的记录应立刻能从持久化文件中读回（字段值完全一致）', () => {
      // 验证目标：add 内部确实落盘，而不是只留在内存
      const record = qaRecord.add(makeEntry(1));
      const onDisk = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      expect(onDisk).toHaveLength(1);
      expect(onDisk[0].id).toBe(record.id);
      expect(onDisk[0].question).toBe('问题1');
      expect(onDisk[0].createdAt).toBe(record.createdAt);
    });

    it('新增记录落盘后，sources / answer / mode 必须与返回值完全一致', () => {
      // 【补充用例】这条用例是为堵住一个真实盲区而加的：
      // 原有用例只校验了返回值与 id/question/createdAt，如果 add() 落盘时丢掉 sources，
      // 17 条用例会全部通过（实测确认），属于「断言不完整」而非「代码正确」。
      const record = qaRecord.add(makeEntry(7));
      const onDisk = qaRecord.readAll().find((r) => r.id === record.id);
      expect(onDisk).toBeDefined();
      expect(onDisk.sources).toEqual(record.sources);
      expect(onDisk.answer).toBe(record.answer);
      expect(onDisk.mode).toBe(record.mode);
    });

    it('传入非对象时应抛出 TypeError', () => {
      // 验证目标：边界输入——空参数不能让服务静默写入坏数据
      expect(() => qaRecord.add(null)).toThrow(TypeError);
      expect(() => qaRecord.add('问题')).toThrow(TypeError);
    });
  });

  // ============ 二、list()：基础查询 ============
  describe('list() 基础查询', () => {
    it('list() 应返回全部记录', () => {
      // 验证目标：不传 limit 时不做截断
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      qaRecord.add(makeEntry(3));
      expect(qaRecord.list()).toHaveLength(3);
    });

    it('list() 应严格按「最新创建在前」的顺序返回', () => {
      // 验证目标：核心排序契约。第 1 条最早、第 3 条最新，期望顺序为 3 → 2 → 1
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      qaRecord.add(makeEntry(3));
      expect(qaRecord.list().map((r) => r.question)).toEqual(['问题3', '问题2', '问题1']);
    });

    it('记录为空时 list() 应返回空数组', () => {
      // 验证目标：空数据源的兜底行为，页面首次打开时不报错
      expect(qaRecord.list()).toEqual([]);
    });

    it('list() 返回的是副本，外部修改不应影响底层数据', () => {
      // 验证目标：返回数组被 push/pop 时不能污染真实记录
      qaRecord.add(makeEntry(1));
      const first = qaRecord.list();
      first.push({ question: '伪造记录' });
      expect(qaRecord.list()).toHaveLength(1);
    });
  });

  // ============ 三、list(limit)：条数限制 ============
  describe('list(limit) 条数限制', () => {
    it('list(1) 应只返回最新的 1 条记录', () => {
      // 验证目标：limit 截断 + 截断的是「最新」而不是「最早」
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      qaRecord.add(makeEntry(3));
      const result = qaRecord.list(1);
      expect(result).toHaveLength(1);
      expect(result[0].question).toBe('问题3');
    });

    it('list(2) 应返回最新的 2 条且顺序为「新→旧」', () => {
      // 验证目标：limit 与排序的组合行为
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      qaRecord.add(makeEntry(3));
      expect(qaRecord.list(2).map((r) => r.question)).toEqual(['问题3', '问题2']);
    });

    it('limit 大于总条数时应返回全部记录', () => {
      // 验证目标：越界 limit 不做报错，按实际条数返回
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      expect(qaRecord.list(99)).toHaveLength(2);
    });

    it('limit 为 0、负数或非数字时应返回全部记录（不做截断）', () => {
      // 验证目标：异常参数兜底，避免 slice 出空数组导致页面空白
      qaRecord.add(makeEntry(1));
      qaRecord.add(makeEntry(2));
      expect(qaRecord.list(0)).toHaveLength(2);
      expect(qaRecord.list(-1)).toHaveLength(2);
      expect(qaRecord.list('abc')).toHaveLength(2);
    });
  });

  // ============ 四、writeAll / readAll：数据持久化 ============
  describe('writeAll(records) 与 readAll() 数据持久化', () => {
    it('writeAll 写入的数据应能被 readAll 完全、准确地读回', () => {
      // 验证目标：序列化-反序列化无损（含中文、嵌套数组）
      const records = [makeEntry(1), makeEntry(2)];
      qaRecord.writeAll(records);
      expect(qaRecord.readAll()).toEqual(records);
    });

    it('writeAll 是覆盖写：旧记录不应残留', () => {
      // 验证目标：覆盖语义，避免「清空记录」变成「追加空记录」
      qaRecord.writeAll([makeEntry(1), makeEntry(2), makeEntry(3)]);
      qaRecord.writeAll([makeEntry(9)]);
      const all = qaRecord.readAll();
      expect(all).toHaveLength(1);
      expect(all[0].question).toBe('问题9');
    });

    it('文件不存在或内容损坏时 readAll 应返回空数组而不抛异常', () => {
      // 验证目标：坏数据的容错——服务不能因为一个坏文件启动失败
      expect(qaRecord.readAll()).toEqual([]);
      fs.writeFileSync(tmpFile, '{ 这不是合法 JSON', 'utf8');
      expect(qaRecord.readAll()).toEqual([]);
    });
  });
});
