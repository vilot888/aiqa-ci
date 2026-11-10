/**
 * app.js —— 答疑助手前端逻辑
 * 提问 → 调用 POST /api/ask → 渲染回答 → 刷新 GET /api/history
 */
(function () {
  var form = document.getElementById('askForm');
  var input = document.getElementById('question');
  var button = document.getElementById('askBtn');
  var result = document.getElementById('result');
  var answerEl = document.getElementById('answer');
  var metaEl = document.getElementById('answerMeta');
  var errorBox = document.getElementById('errorBox');
  var historyList = document.getElementById('history');
  var historyCount = document.getElementById('historyCount');
  var historyEmpty = document.getElementById('historyEmpty');

  /** 提交过程中按钮文案变化并禁用，防止重复提交 */
  function setLoading(loading) {
    button.disabled = loading;
    button.textContent = loading ? '思考中…' : '提交提问';
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function renderHistory(items) {
    historyList.innerHTML = '';
    historyCount.textContent = items.length + ' 条';
    historyEmpty.classList.toggle('hidden', items.length > 0);
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.setAttribute('data-testid', 'history-item');
      var q = document.createElement('span');
      q.className = 'q';
      q.textContent = item.question;
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = formatTime(item.createdAt) + ' · ' + (item.mode === 'llm' ? '大模型' : '演示模式');
      li.appendChild(q);
      li.appendChild(t);
      historyList.appendChild(li);
    });
  }

  function loadHistory() {
    return fetch('/api/history?limit=20')
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.ok) renderHistory(json.data);
      })
      .catch(function () { /* 历史加载失败不影响提问 */ });
  }

  function ask(question) {
    clearError();
    setLoading(true);
    return fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question }),
    })
      .then(function (res) {
        return res.json().then(function (json) { return { status: res.status, json: json }; });
      })
      .then(function (r) {
        if (r.status !== 200 || !r.json.ok) {
          showError(r.json && r.json.error ? r.json.error : '请求失败（HTTP ' + r.status + '）');
          return;
        }
        var data = r.json.data;
        answerEl.textContent = data.answer;
        metaEl.textContent = (data.mode === 'llm' ? '大模型模式' : '演示模式') +
          ' · 来源：' + (data.sources && data.sources.length ? data.sources.join('；') : '无') +
          ' · ' + formatTime(data.createdAt);
        result.classList.remove('hidden');
        return loadHistory();
      })
      .catch(function (err) {
        showError('网络异常：' + err.message);
      })
      .finally(function () { setLoading(false); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var question = input.value.trim();
    if (!question) {
      showError('问题内容不能为空');
      return;
    }
    ask(question);
  });

  loadHistory();
})();
