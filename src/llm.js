/**
 * llm.js —— 答疑助手的“模型层”
 * 未配置 LLM_API_KEY 时进入演示模式：基于本地小知识库做检索式回答，
 * 提问 → 检索 → 回答 → 存档 的链路与接入真实大模型时完全一致。
 * 设置 QA_FORCE_LLM_ERROR=1 可模拟大模型调用失败，用于验证 502 契约。
 */
const KB = [
  {
    keywords: ['spec', '驱动开发', '规格'],
    title: 'Spec 驱动开发',
    text:
      'Spec 驱动开发（Spec-Driven Development）指先把需求写成结构化、可验收的规格说明（Spec），' +
      '再让 AI 依据 Spec 实现代码与测试。Spec 里通常包含验收标准（Acceptance Criteria），' +
      '它既是实现的依据，也是测试断言的来源，从而避免 AI“自由发挥”。',
  },
  {
    keywords: ['mcp', 'model context protocol', '协议'],
    title: 'MCP',
    text:
      'MCP（Model Context Protocol）是一套让大模型安全接入外部工具与数据的开放协议。' +
      '客户端以统一的 JSON-RPC 方式描述“有哪些工具、参数是什么”，模型据此发起调用，' +
      'Playwright MCP 就是把浏览器操作（导航/点击/填写/截图）暴露成工具的一个实现。',
  },
  {
    keywords: ['测试', '金字塔', '单元测试', '集成测试', '端到端'],
    title: '测试金字塔',
    text:
      '测试金字塔自下而上分为单元测试、集成测试、端到端测试三层：单元测试盯函数逻辑、' +
      '毫秒级执行、失败定位精确；集成测试盯模块间接口契约、秒级；端到端测试盯完整用户流程、' +
      '秒到分钟级、失败定位最难。三层成本与收益不同，缺一层就会出现“单测全绿、连起来就崩”的情况。',
  },
  {
    keywords: ['data-testid', '可测试性', '定位器'],
    title: 'data-testid 与可测试性设计',
    text:
      'data-testid 是专供自动化测试定位元素的属性，它不参与样式与业务逻辑。' +
      '与“按可见文字定位”相比，它不会因为改文案、换配色、调整布局而失效，' +
      '因此把“页面元素”与“页面样式”解耦，让端到端测试的定位器在界面改版后依然稳定。',
  },
];

/** 演示模式回答 */
function demoAnswer(question) {
  const q = String(question || '').toLowerCase();
  const hits = KB.filter((item) => item.keywords.some((k) => q.includes(k.toLowerCase())));
  if (hits.length === 0) {
    return {
      answer:
        `（演示模式）我没有在本地知识库里找到与“${question}”高度相关的条目。` +
        '配置 LLM_API_KEY 后将由大模型回答；当前仅演示提问→检索→回答→存档的完整链路。',
      sources: ['演示知识库：未命中'],
      mode: 'demo',
    };
  }
  return {
    answer: hits.map((h) => `【${h.title}】${h.text}`).join('\n\n'),
    sources: hits.map((h) => `演示知识库：${h.title}`),
    mode: 'demo',
  };
}

/**
 * 生成回答。返回 { answer, sources, mode }
 * 大模型调用失败时抛出错误，由路由层转换为 502。
 */
async function answer(question) {
  if (process.env.QA_FORCE_LLM_ERROR === '1') {
    throw new Error('大模型调用失败：上游返回 503（模拟）');
  }
  const key = process.env.LLM_API_KEY;
  if (!key) return demoAnswer(question);

  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'qwen-plus',
      messages: [
        { role: 'system', content: '你是课程助教，回答简洁准确，控制在 200 字内。' },
        { role: 'user', content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error(`大模型调用失败：HTTP ${res.status}`);
  const data = await res.json();
  return {
    answer: data.choices?.[0]?.message?.content || '',
    sources: [`大模型：${process.env.LLM_MODEL || 'qwen-plus'}`],
    mode: 'llm',
  };
}

module.exports = { answer, demoAnswer };
