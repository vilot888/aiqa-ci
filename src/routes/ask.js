/**
 * routes/ask.js —— 答疑助手接口层
 * POST /api/ask      : 提问，返回回答并写入问答记录
 * GET  /api/history  : 查询历史问答记录（最新在前）
 */
const qaRecord = require('../record/qaRecord');
const llm = require('../llm');

const MAX_QUESTION_LEN = 500;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** 读取并解析 JSON 请求体，非法 JSON 返回 null */
function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let raw = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return resolve(null);
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/** POST /api/ask */
async function handleAsk(req, res) {
  const body = await readJsonBody(req);
  if (body === null) {
    return sendJson(res, 400, { ok: false, error: '请求体不是合法的 JSON' });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';

  // 契约：问题为空或只有空格时必须返回 400
  if (!question) {
    return sendJson(res, 400, { ok: false, error: '问题内容不能为空' });
  }
  if (question.length > MAX_QUESTION_LEN) {
    return sendJson(res, 400, { ok: false, error: `问题长度不能超过 ${MAX_QUESTION_LEN} 字` });
  }

  let result;
  try {
    result = await llm.answer(question);
  } catch (err) {
    // 契约：大模型调用失败返回 502
    return sendJson(res, 502, { ok: false, error: `大模型调用失败：${err.message}` });
  }

  const record = qaRecord.add({
    question,
    answer: result.answer,
    sources: result.sources,
    mode: result.mode,
  });

  return sendJson(res, 200, {
    ok: true,
    data: {
      id: record.id,
      question: record.question,
      answer: record.answer,
      sources: record.sources,
      mode: record.mode,
      createdAt: record.createdAt,
    },
  });
}

/** GET /api/history?limit=20 */
function handleHistory(req, res, url) {
  const rawLimit = url.searchParams.get('limit');
  let limit = 20;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isFinite(n) || n <= 0) {
      return sendJson(res, 400, { ok: false, error: 'limit 必须是大于 0 的数字' });
    }
    limit = Math.min(Math.floor(n), 100);
  }
  return sendJson(res, 200, { ok: true, data: qaRecord.list(limit) });
}

/** 接口层入口：返回 true 表示已处理 */
async function handler(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    await handleAsk(req, res);
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/history') {
    handleHistory(req, res, url);
    return true;
  }
  return false;
}

module.exports = { handler, readJsonBody };
