/**
 * qaRecord.js —— 问答记录持久化模块
 * 以 JSON 文件存档问答记录，提供 readAll / writeAll / add / list / clear 五个函数。
 * 本项目坚持零运行时依赖，只使用 Node 内置模块。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'data', 'qa-records.json');

/** 当前生效的记录文件路径（允许测试通过环境变量指向独立文件，避免污染） */
function filePath() {
  return process.env.QARECORD_FILE || DEFAULT_FILE;
}

/** 确保数据目录存在 */
function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 读取全部记录（按写入顺序，最早写入的在前）
 * 文件不存在或内容损坏时返回空数组，保证服务不会因坏数据启动失败。
 */
function readAll() {
  const file = filePath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/** 覆盖写入全部记录，返回写入的条数 */
function writeAll(records) {
  if (!Array.isArray(records)) throw new TypeError('writeAll 需要传入数组');
  const file = filePath();
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
  return records.length;
}

/** 新增一条记录，返回带 id 与 createdAt 的完整记录 */
function add(entry) {
  if (!entry || typeof entry !== 'object') throw new TypeError('add 需要传入对象');
  const record = {
    id: crypto.randomUUID(),
    question: String(entry.question || ''),
    answer: String(entry.answer || ''),
    sources: Array.isArray(entry.sources) ? entry.sources : [],
    mode: entry.mode || 'demo',
    createdAt: entry.createdAt || new Date().toISOString(),
  };
  const records = readAll();
  records.push(record);
  writeAll(records);
  return record;
}

/**
 * 查询记录：最新创建的排在最前面
 * limit 为正整数时只返回最新的 limit 条。
 */
function list(limit) {
  const records = readAll();
  const ordered = records.slice().reverse(); // 文件按写入顺序（早→晚），反转后最新在前
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    return ordered.slice(0, limit);
  }
  return ordered;
}

/** 清空记录（测试用例隔离使用） */
function clear() {
  return writeAll([]);
}

module.exports = { readAll, writeAll, add, list, clear, filePath };
