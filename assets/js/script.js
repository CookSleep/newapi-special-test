(function () {
  // Utilities
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Elements
  const apiUrlEl = $('#apiUrl');
  const apiKeyEl = $('#apiKey');
  const modelEl = $('#model');
  const testBtn = $('#testBtn');
  const clearBtn = $('#clearBtn');
  const blocksContainer = $('#blocksContainer');
  const messageTimeline = $('#messageTimeline');
  const errorMessage = $('#errorMessage');
  const vendorTypeWrap = $('#vendorType');
  const testTypeWrap = $('#testType');
  const userInputEl = $('#userInput');
  const manageConfigBtn = $('#manageConfigBtn');
  const configModal = $('#configModal');
  const closeConfigModalBtn = $('#closeConfigModal');
  const configListEl = $('#configList');
  const saveConfigBtn = $('#saveConfigBtn');
  const saveAsDefaultBtn = $('#saveAsDefaultBtn');
  const saveSuccessEl = $('#saveSuccess');
  const cancelEditBtn = $('#cancelEditBtn');
  const configNameEl = $('#configName');
  const configUrlEl = $('#configUrl');
  const configKeyEl = $('#configKey');
  const configModelEl = $('#configModel');
  const configModalTitleEl = $('#configModalTitle');
  const modalFormHeadingEl = $('#modalFormHeading');

  // Edit state
  let editingIndex = null;
  // Waiting loader state
  let requestPending = false;
  let waitingEl = null;
  let currentAbortController = null;

  // Abort current request helper
  function abortCurrentRequest() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    requestPending = false;
    hideWaiting();
  }

  // LocalStorage helpers
  function loadConfigs() {
    try { return JSON.parse(localStorage.getItem('apiConfigs') || '[]'); } catch { return []; }
  }
  function saveConfigs(cfgs) { localStorage.setItem('apiConfigs', JSON.stringify(cfgs)); }

  // URL helpers
  function stripTrailingSlash(u) { return (u || '').replace(/\/+$/, ''); }
  function normalizeApiUrl(u) {
    let val = (u || '').trim();
    if (!val) return val;
    // 自动补全协议
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    try {
      const url = new URL(val);
      // 只保留 origin（协议+域名+端口），路径由系统在不同场景下添加
      return url.origin;
    } catch {
      // URL 解析失败，仅去除尾部斜杠
      return stripTrailingSlash(val);
    }
  }
  function buildEndpoint(base) { return stripTrailingSlash(base) + '/v1/chat/completions'; }
  function buildGeminiEndpoint(base, model, apiKey) {
    const root = stripTrailingSlash(base);
    return `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }
  function buildAnthropicEndpoint(base) {
    const root = stripTrailingSlash(base);
    return `${root}/v1/messages`;
  }
  function buildResponsesEndpoint(base) {
    const root = stripTrailingSlash(base);
    return `${root}/v1/responses`;
  }

  // System defaults (single source of truth) with optional env override from window.APP_CONFIG
  const ENV_CFG = (typeof window !== 'undefined' && window.APP_CONFIG && typeof window.APP_CONFIG === 'object') ? window.APP_CONFIG : {};
  const SYSTEM_DEFAULTS = {
    apiUrl: ENV_CFG.apiUrl || 'https://api.openai.com',
    apiKey: ENV_CFG.apiKey || '',
    model: ENV_CFG.model || 'gemini-2.5-pro'
  };

  function displayConfigs() {
    const cfgs = loadConfigs();
    if (cfgs.length === 0) {
      configListEl.innerHTML = '<p style="color:#64748b;text-align:center;">暂无保存的配置</p>';
      return;
    }
    configListEl.innerHTML = cfgs.map((c, i) => `
      <div class="config-item" data-index="${i}">
        <div class="config-info">
          <div class="config-name">${escapeHtml(c.name)}${c.isDefault ? ' <span class="badge-default">默认</span>' : ''}</div>
          <div class="config-url">${escapeHtml(c.url)}</div>
        </div>
        <div class="config-actions">
          <button class="icon-btn star-config ${c.isDefault ? 'starred' : ''}" data-star="${i}" aria-label="设为默认" title="设为默认">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"/>
            </svg>
          </button>
          <button class="icon-btn edit-config" data-edit="${i}" aria-label="编辑">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
            </svg>
          </button>
          <button class="icon-btn delete-config" data-del="${i}" aria-label="删除">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 1 0 0 2H6v11a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9zm6 2h-5V4h5v1zm-6 4a1 1 0 1 1 2 0v8a1 1 0 1 1-2 0V9zm5 0a1 1 0 1 1 2 0v8a1 1 0 1 1-2 0V9z"/>
            </svg>
            <span class="q-badge">?</span>
          </button>
        </div>
      </div>
    `).join('');
  }

  // Escape HTML
  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[&<>"{}]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '{': '&#123;', '}': '&#125;' }[m]));
  }

  // Copy helper
  function attachCopy(btn, targetPre) {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(targetPre.textContent || '');
      const orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = orig, 1500);
    });
  }

  // Waiting inline loader helpers
  function ensureWaitingEl() {
    if (waitingEl) return waitingEl;
    const wrap = document.createElement('div');
    wrap.className = 'waiting-inline';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '请求中';
    const dots = document.createElement('span');
    dots.className = 'dots';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('span');
      d.className = 'dot';
      dots.appendChild(d);
    }
    wrap.appendChild(label);
    wrap.appendChild(dots);
    waitingEl = wrap;
    return waitingEl;
  }
  function showWaiting() {
    const el = ensureWaitingEl();
    if (el.parentNode !== messageTimeline) {
      messageTimeline.appendChild(el);
    } else {
      // 重新追加到末尾，确保在最新一条消息下方
      messageTimeline.removeChild(el);
      messageTimeline.appendChild(el);
    }
  }
  function hideWaiting() {
    if (waitingEl && waitingEl.parentNode) { waitingEl.parentNode.removeChild(waitingEl); }
  }

  // Info inline block (tip/warning)
  function addInlineInfo(text) {
    const el = document.createElement('div');
    el.className = 'info-inline';
    el.textContent = String(text || '提示');
    messageTimeline.appendChild(el);
    scrollLatestIntoView();
    return el;
  }

  // Success inline block (green tip)
  function addInlineSuccess(text) {
    const el = document.createElement('div');
    el.className = 'success-inline';
    el.textContent = String(text || '成功');
    messageTimeline.appendChild(el);
    scrollLatestIntoView();
    return el;
  }

  // Error inline block under latest message
  function addInlineError(text, raw) {
    const el = document.createElement('div');
    el.className = 'error-inline';
    el.textContent = String(text || '发生未知错误');
    // 确保等待动画被移除后再追加错误块
    hideWaiting();
    messageTimeline.appendChild(el);
    // 附带原始内容（JSON/纯文本），不再渲染 HTML 预览
    try {
      const rawText = raw && raw.rawText;
      const ct = (raw && raw.contentType || '').toLowerCase();
      if (rawText) {
        const wrap = document.createElement('div');
        wrap.style.marginTop = '6px';
        // 若为 HTML 返回，补充友好提示
        const isHtml = ct.includes('text/html') || /^\s*<(!doctype|html|head|body)/i.test(rawText);
        let notice = null;
        if (isHtml) {
          notice = document.createElement('div');
          notice.textContent = '检测到返回的是网页，您可能填写了错误的 API URL。';
          notice.style.color = '#b91c1c';
          notice.style.fontWeight = '600';
          notice.style.cursor = 'pointer';
          wrap.appendChild(notice);
        }
        const details = document.createElement('details');
        const sum = document.createElement('summary');
        sum.textContent = '查看原始返回';
        sum.style.cursor = 'pointer';
        const pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-all';
        // 尝试美化 JSON；否则原样输出
        if (ct.includes('application/json')) {
          try { pre.textContent = JSON.stringify(JSON.parse(rawText), null, 2); }
          catch { pre.textContent = rawText; }
        } else {
          pre.textContent = rawText;
        }
        details.appendChild(sum);
        details.appendChild(pre);
        wrap.appendChild(details);
        // 点击提示或“查看原始返回”文字都可展开/收起
        const toggle = () => { details.open = !details.open; };
        sum.addEventListener('click', (e) => { /* 使用默认展开行为并扩大可点击区域 */ });
        if (notice) {
          notice.addEventListener('click', toggle);
          notice.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
          notice.tabIndex = 0; // 可聚焦
        }
        el.appendChild(wrap);
      }
    } catch { /* 附加原始内容失败时安静降级 */ }
    // 滚动到最新位置（错误块所在）
    scrollLatestIntoView();
    return el;
  }

  // Scroll helpers: keep latest message aligned to page top
  function scrollLatestIntoView() {
    const cards = messageTimeline.querySelectorAll('.card.message');
    if (cards.length === 0) return;
    const last = cards[cards.length - 1];
    // 将最新消息滚动到页面顶部位置
    try {
      last.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    } catch { /* 兼容性兜底 */
      const top = window.scrollY + last.getBoundingClientRect().top;
      window.scrollTo({ top: Math.max(top - 8, 0), behavior: 'smooth' });
    }
  }

  // App modal helpers (custom alert/confirm)
  let appModalEl = null;
  function ensureAppModal() {
    if (appModalEl) return appModalEl;
    const overlay = document.createElement('div');
    overlay.className = 'app-modal';
    overlay.innerHTML = `
      <div class="box">
        <div class="title" id="appModalTitle">提示</div>
        <div class="content" id="appModalContent"></div>
        <div class="actions">
          <button class="btn" id="appModalCancel">取消</button>
          <button class="btn btn-primary" id="appModalOk">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    appModalEl = overlay;
    return appModalEl;
  }
  function openAppModal({ title = '提示', content = '', showCancel = false, okText = '确定', cancelText = '取消' } = {}) {
    return new Promise((resolve) => {
      const el = ensureAppModal();
      const titleEl = el.querySelector('#appModalTitle');
      const contentEl = el.querySelector('#appModalContent');
      const okBtn = el.querySelector('#appModalOk');
      const cancelBtn = el.querySelector('#appModalCancel');
      titleEl.textContent = title;
      contentEl.textContent = content;
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;
      cancelBtn.style.display = showCancel ? '' : 'none';
      el.classList.add('open');

      const cleanup = () => {
        el.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        el.removeEventListener('click', onBackdrop);
        window.removeEventListener('keydown', onKey);
      };
      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      // 点击空白：alert 视为确定；confirm 视为取消
      const onBackdrop = (e) => { if (e.target === el) { showCancel ? onCancel() : onOk(); } };
      const onKey = (e) => { if (e.key === 'Escape') { showCancel ? onCancel() : onOk(); } };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      el.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKey);
    });
  }
  // Toast helper
  function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.innerHTML = ''; // 每次只显示一个
    container.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
      container.classList.add('show');
    });

    // 2s后滑出
    setTimeout(() => {
      container.classList.remove('show');
    }, 2000);
  }

  function appAlert(message) {
    showToast(message, 'info');
    return Promise.resolve(true);
  }
  function appConfirm(message) {
    // Confirm 逻辑暂时保留原样或改为 Toast，但用户主要想要提示窗
    return confirm(message);
  }

  // Apply config helpers
  function applyConfigToTop(cfg) {
    if (!cfg) return;
    apiUrlEl.value = cfg.url || SYSTEM_DEFAULTS.apiUrl;
    apiKeyEl.value = cfg.key || SYSTEM_DEFAULTS.apiKey;
    modelEl.value = cfg.model || SYSTEM_DEFAULTS.model;
  }
  function applySystemDefaultToTop() {
    apiUrlEl.value = SYSTEM_DEFAULTS.apiUrl;
    apiKeyEl.value = SYSTEM_DEFAULTS.apiKey;
    modelEl.value = SYSTEM_DEFAULTS.model;
  }

  // UI builders
  function addBlock(title, payload, durationMs) {
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    const h = document.createElement('div');
    h.className = 'title';
    // 如果有耗时，在标题后面追加
    if (typeof durationMs === 'number' && durationMs >= 0) {
      h.textContent = `${title} (${formatDuration(durationMs)})`;
    } else {
      h.textContent = title;
    }
    const copy = document.createElement('button');
    copy.className = 'copy-btn';
    copy.textContent = '复制';
    const pre = document.createElement('pre');
    pre.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    wrap.appendChild(h); wrap.appendChild(copy); wrap.appendChild(pre);
    blocksContainer.appendChild(wrap);
    attachCopy(copy, pre);
    return wrap;
  }

  // 格式化耗时
  function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function addMessage(role, label, payload) {
    const card = document.createElement('div');
    card.className = `card message ${role}`;
    const title = document.createElement('div');
    title.className = 'title';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const roleEl = document.createElement('span');
    roleEl.className = 'role';
    roleEl.textContent = role;
    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = `· ${label}`;
    meta.appendChild(roleEl); meta.appendChild(labelEl);
    const pre = document.createElement('pre');
    pre.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    title.appendChild(meta);
    card.appendChild(title);
    card.appendChild(pre);
    messageTimeline.appendChild(card);
    // Keep waiting loader under the latest message while pending
    if (requestPending) { showWaiting(); }
    // Scroll page so that the latest message sits at page top
    scrollLatestIntoView();
    return card;
  }

  function clearResults() {
    blocksContainer.innerHTML = '';
    messageTimeline.innerHTML = '';
    errorMessage.textContent = '';
    hideWaiting();
  }

  // Config modal events
  manageConfigBtn.addEventListener('click', () => {
    configModal.classList.add('open');
    // reset edit state when opening
    clearEditForm();
    displayConfigs();
  });
  closeConfigModalBtn.addEventListener('click', () => configModal.classList.remove('open'));
  window.addEventListener('click', (e) => { if (e.target === configModal) configModal.classList.remove('open'); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 若有自定义弹窗打开，仅关闭自定义弹窗，不关闭配置页
      if (document.querySelector('.app-modal.open')) return;
      configModal.classList.remove('open');
    }
  });

  configListEl.addEventListener('click', (e) => {
    const starBtn = e.target.closest('[data-star]');
    if (starBtn) {
      const idx = parseInt(starBtn.getAttribute('data-star'), 10);
      const cfgs = loadConfigs();
      const wasDefault = !!(cfgs[idx] && cfgs[idx].isDefault);
      if (wasDefault) {
        // 取消默认，恢复系统预设
        cfgs.forEach((c) => { if (c) c.isDefault = false; });
        saveConfigs(cfgs);
        displayConfigs();
        applySystemDefaultToTop();
        appAlert('已取消默认，已恢复系统预设');
      } else {
        // 设为默认，并应用到顶部
        cfgs.forEach((c, i) => { if (c) c.isDefault = (i === idx); });
        saveConfigs(cfgs);
        displayConfigs();
        applyConfigToTop(cfgs[idx]);
        appAlert('已设为默认配置');
      }
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const idx = parseInt(delBtn.getAttribute('data-del'), 10);
      // 二次确认逻辑：首次点击进入确认态，显示问号；再次点击才删除
      if (!delBtn.classList.contains('confirm')) {
        delBtn.classList.add('confirm');
        // 定时自动恢复
        if (delBtn._confirmTimer) clearTimeout(delBtn._confirmTimer);
        delBtn._confirmTimer = setTimeout(() => { try { delBtn.classList.remove('confirm'); } catch { } delBtn._confirmTimer = null; }, 2500);
        return;
      }
      if (delBtn._confirmTimer) { clearTimeout(delBtn._confirmTimer); delBtn._confirmTimer = null; }
      const cfgs = loadConfigs();
      cfgs.splice(idx, 1);
      saveConfigs(cfgs);
      displayConfigs();
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const idx = parseInt(editBtn.getAttribute('data-edit'), 10);
      const cfg = loadConfigs()[idx];
      if (cfg) {
        editingIndex = idx;
        configNameEl.value = cfg.name || '';
        configUrlEl.value = cfg.url || '';
        configKeyEl.value = cfg.key || '';
        configModelEl.value = cfg.model || SYSTEM_DEFAULTS.model;
        saveConfigBtn.textContent = '保存修改';
        cancelEditBtn.style.display = '';
        if (saveAsDefaultBtn) saveAsDefaultBtn.style.display = 'none';
        // 保存按钮切换为蓝色
        if (saveConfigBtn) { saveConfigBtn.classList.remove('btn-secondary'); saveConfigBtn.classList.add('btn-primary'); }
        if (configModalTitleEl) configModalTitleEl.textContent = '修改 API 配置';
        if (modalFormHeadingEl) modalFormHeadingEl.textContent = '修改配置';
      }
      return;
    }
    const item = e.target.closest('.config-item');
    if (!item) return;
    const index = parseInt(item.getAttribute('data-index'), 10);
    const cfg = loadConfigs()[index];
    if (cfg) {
      apiUrlEl.value = cfg.url || '';
      apiKeyEl.value = cfg.key || '';
      modelEl.value = cfg.model || SYSTEM_DEFAULTS.model;
      configModal.classList.remove('open');
    }
  });

  // 普通保存：编辑时保留原 isDefault；新建为 false
  saveConfigBtn.addEventListener('click', async () => {
    const name = configNameEl.value.trim();
    const url = stripTrailingSlash(configUrlEl.value.trim());
    const key = configKeyEl.value.trim();
    const model = (configModelEl.value || SYSTEM_DEFAULTS.model).trim();
    if (!name || !url || !key) { await appAlert('请填写所有必填字段'); return; }
    const cfgs = loadConfigs();
    if (editingIndex !== null) {
      const prev = cfgs[editingIndex] || {};
      cfgs[editingIndex] = { ...prev, name, url, key, model };
    } else {
      cfgs.push({ name, url, key, model, isDefault: false });
    }
    saveConfigs(cfgs);
    clearEditForm();
    showToast('配置已保存', 'success');
    displayConfigs();
  });

  // 保存为默认配置：将该项设为唯一默认，并立即应用到顶部
  if (saveAsDefaultBtn) {
    saveAsDefaultBtn.addEventListener('click', async () => {
      const name = configNameEl.value.trim();
      const url = stripTrailingSlash(configUrlEl.value.trim());
      const key = configKeyEl.value.trim();
      const model = (configModelEl.value || SYSTEM_DEFAULTS.model).trim();
      if (!name || !url || !key) { await appAlert('请填写所有必填字段'); return; }
      const cfgs = loadConfigs();
      let idx;
      if (editingIndex !== null) {
        const prev = cfgs[editingIndex] || {};
        cfgs[editingIndex] = { ...prev, name, url, key, model, isDefault: true };
        idx = editingIndex;
      } else {
        cfgs.push({ name, url, key, model, isDefault: true });
        idx = cfgs.length - 1;
      }
      // 唯一默认
      cfgs.forEach((c, i) => { if (i !== idx && c) c.isDefault = false; });
      saveConfigs(cfgs);
      applyConfigToTop(cfgs[idx]);
      clearEditForm();
      showToast('已保存并设为默认配置', 'success');
      displayConfigs();
    });
  }

  function clearEditForm() {
    editingIndex = null;
    configNameEl.value = '';
    configUrlEl.value = '';
    configKeyEl.value = '';
    configModelEl.value = SYSTEM_DEFAULTS.model;
    saveConfigBtn.textContent = '保存配置';
    cancelEditBtn.style.display = 'none';
    if (saveAsDefaultBtn) saveAsDefaultBtn.style.display = '';
    // 保存按钮恢复为灰色
    if (saveConfigBtn) { saveConfigBtn.classList.remove('btn-primary'); saveConfigBtn.classList.add('btn-secondary'); }
    if (configModalTitleEl) configModalTitleEl.textContent = '管理 API 配置';
    if (modalFormHeadingEl) modalFormHeadingEl.textContent = '添加新配置';
  }

  cancelEditBtn.addEventListener('click', () => {
    clearEditForm();
  });

  clearBtn.addEventListener('click', clearResults);

  // Defaults
  // Password toggle functionality
  function initPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const eyeIcon = btn.querySelector('.eye-icon');
        const eyeOffIcon = btn.querySelector('.eye-off-icon');

        if (input.type === 'password') {
          input.type = 'text';
          eyeIcon.style.display = 'none';
          eyeOffIcon.style.display = 'block';
          btn.setAttribute('aria-label', '隐藏密码');
        } else {
          input.type = 'password';
          eyeIcon.style.display = 'block';
          eyeOffIcon.style.display = 'none';
          btn.setAttribute('aria-label', '显示密码');
        }
      });
    });
  }

  // URL 输入框失焦时自动规范化
  apiUrlEl.addEventListener('blur', () => {
    apiUrlEl.value = normalizeApiUrl(apiUrlEl.value);
  });
  configUrlEl.addEventListener('blur', () => {
    configUrlEl.value = normalizeApiUrl(configUrlEl.value);
  });

  window.addEventListener('load', () => {
    // 初始化密码切换功能
    initPasswordToggles();

    // 自动应用默认配置
    const cfgs = loadConfigs();
    const d = cfgs.find(c => c && c.isDefault);
    if (d) {
      apiUrlEl.value = d.url || apiUrlEl.value || SYSTEM_DEFAULTS.apiUrl;
      apiKeyEl.value = d.key || SYSTEM_DEFAULTS.apiKey;
      modelEl.value = d.model || modelEl.value || SYSTEM_DEFAULTS.model;
    } else {
      if (!apiUrlEl.value) { apiUrlEl.value = SYSTEM_DEFAULTS.apiUrl; }
      if (!modelEl.value) { modelEl.value = SYSTEM_DEFAULTS.model; }
    }
    // 占位留空：不再动态写入 placeholder
    // 初始化厂商分组和测试按钮
    renderTestButtons('openai');
  });

  // 厂商分组配置
  const vendorTests = {
    openai: [
      { scenario: 'openai_tools', label: '工具调用 (Chat Completions)', defaultInput: 'RANDOM_CONVERT_TASK' },
      { scenario: 'responses_tools', label: '工具调用 (Responses)', defaultInput: 'RANDOM_CONVERT_TASK' },
      { scenario: 'responses_search', label: '搜索 (Responses)', defaultInput: '搜索当前最新的Gemini旗舰模型是？' }
    ],
    anthropic: [
      { scenario: 'anthropic_tools', label: '工具调用', defaultInput: 'RANDOM_CONVERT_TASK' }
    ],
    google: [
      { scenario: 'gemini_tools', label: '工具调用', defaultInput: 'RANDOM_CONVERT_TASK' },
      { scenario: 'gemini_search', label: '搜索', defaultInput: '搜索当前最新的Gemini旗舰模型是？' },
      { scenario: 'gemini_url_context', label: 'URL 上下文', defaultInput: '这个工具有哪些特点？https://ai.google.dev/gemini-api/docs/url-context' }
    ]
  };

  let activeExpectedAnswer = null;
  function generateRandomTask() {
    const val = Math.floor(Math.random() * 16777215);
    const bases = [2, 8, 10, 16];
    const baseNames = { 2: '二进制', 8: '八进制', 10: '十进制', 16: '十六进制' };

    // 随机选择三个互不相同的进制
    let shuffled = [...bases].sort(() => 0.5 - Math.random());
    const [b1, b2, b3] = shuffled;

    const startNum = val.toString(b1).toUpperCase();
    activeExpectedAnswer = val.toString(b3).toUpperCase();

    return `请将${baseNames[b1]}数 ${startNum} 转换为${baseNames[b2]}，然后再将该${baseNames[b2]}结果转换为${baseNames[b3]}。待转换完成后，你必须调用 submit_answer 工具提交最终的${baseNames[b3]}结果，系统将验证你的答案是否正确。`;
  }

  // 当前选中的厂商
  let currentVendor = 'openai';

  // 切换测试场景工具函数
  function applyScenarioInput(scenario, defaultInput) {
    const isToolScenario = ['openai_tools', 'anthropic_tools', 'gemini_tools', 'responses_tools'].includes(scenario);
    const label = document.querySelector('label[for="userInput"]');

    if (isToolScenario) {
      if (defaultInput === 'RANDOM_CONVERT_TASK') {
        userInputEl.value = generateRandomTask();
      } else {
        userInputEl.value = defaultInput;
      }
      userInputEl.readOnly = true;
      if (label && !label.querySelector('.label-hint')) {
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        const hint = document.createElement('span');
        hint.className = 'label-hint';
        hint.style.cssText = 'color: #94a3b8; font-size: 0.75rem; font-weight: normal; margin-left: 8px; line-height: 1.4;';
        hint.textContent = '(系统会自动验证，无需修改)';
        label.appendChild(hint);
      }
    } else {
      userInputEl.value = defaultInput;
      userInputEl.readOnly = false;
      const hint = label ? label.querySelector('.label-hint') : null;
      if (hint) hint.remove();
    }
  }

  // 渲染测试按钮
  function renderTestButtons(vendor) {
    const tests = vendorTests[vendor] || [];
    testTypeWrap.innerHTML = tests.map((t, i) =>
      `<button class="seg-btn${i === 0 ? ' active' : ''}" data-scenario="${t.scenario}">${t.label}</button>`
    ).join('');
    // 设置默认输入
    if (tests.length > 0) {
      applyScenarioInput(tests[0].scenario, tests[0].defaultInput);
    }
  }

  // 切换厂商
  function setActiveVendor(vendor) {
    abortCurrentRequest();
    currentVendor = vendor;
    $$('#vendorType .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.vendor === vendor));
    renderTestButtons(vendor);
    clearResults();
  }

  // 切换测试场景
  function setActiveScenario(scenario) {
    abortCurrentRequest();
    $$('#testType .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.scenario === scenario));
    // 查找对应的默认输入
    const tests = vendorTests[currentVendor] || [];
    const test = tests.find(t => t.scenario === scenario);
    if (test) {
      applyScenarioInput(scenario, test.defaultInput);
    }
  }

  // 厂商切换事件
  if (vendorTypeWrap) {
    vendorTypeWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn || !btn.dataset.vendor) return;
      setActiveVendor(btn.dataset.vendor);
    });
  }

  // 测试场景切换事件
  if (testTypeWrap) {
    testTypeWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn || !btn.dataset.scenario) return;
      setActiveScenario(btn.dataset.scenario);
      clearResults();
    });
  }

  // Test function call flow (multiple scenarios)
  testBtn.addEventListener('click', async () => {
    abortCurrentRequest();
    const apiUrl = apiUrlEl.value.trim();
    const apiKey = apiKeyEl.value.trim();
    const model = (modelEl.value || SYSTEM_DEFAULTS.model).trim();
    if (!apiUrl || !apiKey) { await appAlert('请填写 API URL 和 API Key'); return; }
    errorMessage.textContent = '';
    testBtn.disabled = true; testBtn.textContent = '请求中...';
    // 发起新请求前自动清空历史记录
    clearResults();

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    const scenario = testTypeWrap.querySelector('.seg-btn.active')?.dataset.scenario || 'openai_tools';
    const endpoint = buildEndpoint(apiUrl);
    const geminiEndpoint = buildGeminiEndpoint(apiUrl, model, apiKey);
    const anthropicEndpoint = buildAnthropicEndpoint(apiUrl);

    try {
      requestPending = true; showWaiting();
      let userText = userInputEl.value.trim() || '当前时间是？';

      // 如果是工具场景且输入是默认标记，则生成随机题目
      if (['openai_tools', 'anthropic_tools', 'gemini_tools', 'responses_tools'].includes(scenario)) {
        if (userText === 'RANDOM_CONVERT_TASK' || userText.includes('ABCDEF12')) {
          userText = generateRandomTask();
          userInputEl.value = userText;
        }
      }

      if (scenario === 'openai_tools') {
        const tools = [
          {
            type: 'function',
            function: {
              name: 'convert_base',
              description: '将数字从一种进制转换为另一种进制',
              parameters: {
                type: 'object',
                properties: {
                  number: { type: 'string', description: '待转换的数字' },
                  from_base: { type: 'integer', description: '原进制 (如 2, 10, 16)' },
                  to_base: { type: 'integer', description: '目标进制 (如 2, 10, 16)' }
                },
                required: ['number', 'from_base', 'to_base']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'submit_answer',
              description: '提交最终计算出的结果答案以供验证',
              parameters: {
                type: 'object',
                properties: {
                  answer: { type: 'string', description: '最终转换出的字符串结果' }
                },
                required: ['answer']
              }
            }
          }
        ];

        let messages = [{ role: 'user', content: userText }];
        addMessage('user', '用户消息 #1', messages[0]);

        let turn = 1;
        let hasSubmittedAnswer = false;
        let validationStatus = null; // null: not run, true: correct, false: error
        let validationMsg = '';

        const MAX_TURNS = 8;
        while (turn <= MAX_TURNS) {
          const requestBody = { model, messages, tools, tool_choice: 'auto' };
          addBlock(`请求 #${turn}`, requestBody);

          const tStart = Date.now();
          const r = await fetchAndParse(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(requestBody),
            signal
          });
          const data = ensureJsonOrThrow(r);
          const duration = Date.now() - tStart;
          addBlock(`响应 #${turn}`, data, duration);

          const choice = data.choices && data.choices[0];
          if (!choice) break;
          const assistantMsg = choice.message;
          messages.push(assistantMsg);
          addMessage('assistant', `模型响应 #${turn}`, assistantMsg);

          if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            for (const toolCall of assistantMsg.tool_calls) {
              let toolResults = { error: 'Unknown function' };
              if (toolCall.function.name === 'convert_base') {
                try {
                  const args = JSON.parse(toolCall.function.arguments || '{}');
                  const val = parseInt(args.number, args.from_base);
                  toolResults = isNaN(val) ? { error: 'Invalid input' } : { result: val.toString(args.to_base) };
                } catch (e) { toolResults = { error: e.message }; }
              } else if (toolCall.function.name === 'submit_answer') {
                hasSubmittedAnswer = true;
                try {
                  const args = JSON.parse(toolCall.function.arguments || '{}');
                  const isCorrect = String(args.answer).toUpperCase() === activeExpectedAnswer;
                  validationStatus = isCorrect;
                  toolResults = { success: isCorrect, message: isCorrect ? '验证通过！答案正确。' : `验证失败。预期结果为: ${activeExpectedAnswer}` };
                  if (isCorrect) {
                    validationMsg = '经过多轮工具调用，模型成功识别并完成了任务，且最终答案验证正确！';
                  } else {
                    validationMsg = `经过多轮工具调用，模型虽然尝试完成任务，但最终提交的答案验证错误（提交值: ${args.answer}）。`;
                  }
                } catch (e) { toolResults = { error: e.message }; }
              }
              const toolMessage = {
                role: 'tool',
                content: JSON.stringify(toolResults),
                tool_call_id: toolCall.id
              };
              messages.push(toolMessage);
              addMessage('tool', `工具执行 #${turn}`, toolResults);
            }
            turn++;
          } else {
            break;
          }
        }

        if (validationStatus === true) addInlineSuccess(validationMsg);
        else if (validationStatus === false) addInlineError(validationMsg);
        else if (!hasSubmittedAnswer) addInlineInfo('模型未执行最终的答案提交工具，流程提前结束。');
      }
      else if (scenario === 'anthropic_tools') {
        const tools = [
          {
            name: 'convert_base',
            description: '将数字从一种进制转换为另一种进制',
            input_schema: {
              type: 'object',
              properties: {
                number: { type: 'string', description: '待转换的数字' },
                from_base: { type: 'integer', description: '原进制 (如 2, 10, 16)' },
                to_base: { type: 'integer', description: '目标进制 (如 2, 10, 16)' }
              },
              required: ['number', 'from_base', 'to_base']
            }
          },
          {
            name: 'submit_answer',
            description: '提交最终计算出的结果答案以供验证',
            input_schema: {
              type: 'object',
              properties: {
                answer: { type: 'string', description: '最终转换出的字符串结果' }
              },
              required: ['answer']
            }
          }
        ];

        let messages = [{ role: 'user', content: userText }];
        addMessage('user', '用户消息 #1', messages[0]);

        let turn = 1;
        let hasSubmittedAnswer = false;
        let validationStatus = null;
        let validationMsg = '';

        const MAX_TURNS = 8;
        while (turn <= MAX_TURNS) {
          const aReq = {
            model,
            max_tokens: 1024,
            messages,
            tools
          };
          addBlock(`请求 #${turn}`, aReq);
          const aTStart = Date.now();
          const aR = await fetchAndParse(anthropicEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(aReq),
            signal
          });
          const aData = ensureJsonOrThrow(aR);
          const aTDuration = Date.now() - aTStart;
          addBlock(`响应 #${turn}`, aData, aTDuration);

          const contentArr = Array.isArray(aData && aData.content) ? aData.content : [];
          messages.push({ role: 'assistant', content: contentArr });
          addMessage('assistant', `模型响应 #${turn}`, contentArr);

          const toolUses = contentArr.filter(p => p && p.type === 'tool_use');
          if (toolUses.length > 0) {
            const toolResultsParts = [];
            for (const toolUse of toolUses) {
              let toolResults = { error: 'Unknown function' };
              if (toolUse.name === 'convert_base') {
                try {
                  const args = toolUse.input || {};
                  const val = parseInt(args.number, args.from_base);
                  toolResults = isNaN(val) ? { error: 'Invalid input' } : { result: val.toString(args.to_base) };
                } catch (e) { toolResults = { error: e.message }; }
              } else if (toolUse.name === 'submit_answer') {
                hasSubmittedAnswer = true;
                try {
                  const args = toolUse.input || {};
                  const isCorrect = String(args.answer).toUpperCase() === activeExpectedAnswer;
                  validationStatus = isCorrect;
                  toolResults = { success: isCorrect, message: isCorrect ? '验证通过！答案正确。' : `验证失败。预期结果为: ${activeExpectedAnswer}` };
                  if (isCorrect) {
                    validationMsg = '经过多轮工具调用，模型成功识别并完成了任务，且最终答案验证正确！';
                  } else {
                    validationMsg = `经过多轮工具调用，模型虽然尝试完成任务，但最终提交的答案验证错误（提交值: ${args.answer}）。`;
                  }
                } catch (e) { toolResults = { error: e.message }; }
              }
              toolResultsParts.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(toolResults)
              });
              addMessage('tool', `工具执行 #${turn}`, toolResults);
            }
            messages.push({ role: 'user', content: toolResultsParts });
            turn++;
          } else {
            break;
          }
        }

        if (validationStatus === true) addInlineSuccess(validationMsg);
        else if (validationStatus === false) addInlineError(validationMsg);
        else if (!hasSubmittedAnswer) addInlineInfo('模型未执行最终的答案提交工具，流程提前结束。');
      }
      else if (scenario === 'gemini_tools') {
        const functionDeclarations = [
          {
            name: 'convert_base',
            description: '将数字从一种进制转换为另一种进制',
            parameters: {
              type: 'object',
              properties: {
                number: { type: 'string', description: '待转换的数字' },
                from_base: { type: 'integer', description: '原进制 (如 2, 10, 16)' },
                to_base: { type: 'integer', description: '目标进制 (如 2, 10, 16)' }
              },
              required: ['number', 'from_base', 'to_base']
            }
          },
          {
            name: 'submit_answer',
            description: '提交最终计算出的结果答案以供验证',
            parameters: {
              type: 'object',
              properties: {
                answer: { type: 'string', description: '最终转换出的字符串结果' }
              },
              required: ['answer']
            }
          }
        ];

        let contents = [{ role: 'user', parts: [{ text: userText }] }];
        addMessage('user', '用户消息 #1', contents[0]);

        let turn = 1;
        let hasSubmittedAnswer = false;
        let validationStatus = null;
        let validationMsg = '';

        const MAX_TURNS = 8;
        while (turn <= MAX_TURNS) {
          const gReq = {
            systemInstruction: { parts: [{ text: '你是一个有帮助的助手。你不仅能够调用 convert_base 工具，还必须在得到最终计算结果后调用 submit_answer 工具来提交最终答案。' }] },
            tools: [{ functionDeclarations }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            contents
          };
          addBlock(`请求 #${turn}`, gReq);

          const gTStart = Date.now();
          const gR = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq), signal });
          const gData = ensureJsonOrThrow(gR);
          const gTDuration = Date.now() - gTStart;
          addBlock(`响应 #${turn}`, gData, gTDuration);

          const cand = gData.candidates && gData.candidates[0];
          const gContent = cand && cand.content;
          if (!gContent) break;

          contents.push(gContent);
          addMessage('assistant', `模型响应 #${turn}`, gContent);

          const fcs = (gContent.parts || []).filter(p => p.functionCall);
          if (fcs.length > 0) {
            const responseParts = [];
            for (const part of fcs) {
              const fc = part.functionCall;
              let toolResults = { error: 'Unknown function' };
              if (fc.name === 'convert_base') {
                try {
                  const args = fc.args || {};
                  const val = parseInt(args.number, args.from_base);
                  toolResults = isNaN(val) ? { error: 'Invalid input' } : { result: val.toString(args.to_base) };
                } catch (e) { toolResults = { error: e.message }; }
              } else if (fc.name === 'submit_answer') {
                hasSubmittedAnswer = true;
                try {
                  const args = fc.args || {};
                  const isCorrect = String(args.answer).toUpperCase() === activeExpectedAnswer;
                  validationStatus = isCorrect;
                  toolResults = { success: isCorrect, message: isCorrect ? '验证通过！答案正确。' : `验证失败。预期结果为: ${activeExpectedAnswer}` };
                  if (isCorrect) {
                    validationMsg = '经过多轮工具调用，模型成功识别并完成了任务，且最终答案验证正确！';
                  } else {
                    validationMsg = `经过多轮工具调用，模型虽然尝试完成任务，但最终提交的答案验证错误（提交值: ${args.answer}）。`;
                  }
                } catch (e) { toolResults = { error: e.message }; }
              }
              responseParts.push({
                functionResponse: { name: fc.name, response: toolResults }
              });
              addMessage('tool', `工具执行 #${turn}`, toolResults);
            }
            contents.push({ role: 'function', parts: responseParts });
            turn++;
          } else {
            break;
          }
        }

        if (validationStatus === true) addInlineSuccess(validationMsg);
        else if (validationStatus === false) addInlineError(validationMsg);
        else if (!hasSubmittedAnswer) addInlineInfo('模型未执行最终的答案提交工具，流程提前结束。');
      }
      else if (scenario === 'responses_tools') {
        const responsesEndpoint = buildResponsesEndpoint(apiUrl);
        const tools = [
          {
            type: 'function',
            name: 'convert_base',
            description: '将数字从一种进制转换为另一种进制',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                number: { type: 'string', description: '待转换的数字' },
                from_base: { type: 'integer', description: '原进制 (如 2, 10, 16)' },
                to_base: { type: 'integer', description: '目标进制 (如 2, 10, 16)' }
              },
              required: ['number', 'from_base', 'to_base'],
              additionalProperties: false
            }
          },
          {
            type: 'function',
            name: 'submit_answer',
            description: '提交最终计算出的结果答案以供验证',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                answer: { type: 'string', description: '最终转换出的字符串结果' }
              },
              required: ['answer'],
              additionalProperties: false
            }
          }
        ];

        let history = [{ role: 'user', content: userText }];
        addMessage('user', '用户消息 #1', history[0]);

        let turn = 1;
        let hasSubmittedAnswer = false;
        let validationStatus = null;
        let validationMsg = '';

        const MAX_TURNS = 8;
        while (turn <= MAX_TURNS) {
          const rtReq = { model, tools, input: history };
          addBlock(`请求 #${turn}`, rtReq);

          const rtTStart = Date.now();
          const rtR = await fetchAndParse(responsesEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(rtReq),
            signal
          });
          const rtData = ensureJsonOrThrow(rtR);
          const rtTDuration = Date.now() - rtTStart;
          addBlock(`响应 #${turn}`, rtData, rtTDuration);

          const outputs = Array.isArray(rtData.output) ? rtData.output : [];
          history.push(...outputs);

          if (rtData.output_text) {
            addMessage('assistant', `模型响应 #${turn}`, { text: rtData.output_text });
          } else {
            const msgItem = outputs.find(item => item && item.type === 'message');
            if (msgItem && msgItem.content) {
              addMessage('assistant', `模型响应 #${turn}`, msgItem.content);
            } else if (outputs.length > 0) {
              addMessage('assistant', `模型响应 #${turn}`, outputs);
            }
          }

          const fcs = outputs.filter(item => item && item.type === 'function_call');
          if (fcs.length > 0) {
            for (const fc of fcs) {
              let toolResults = { error: 'Unknown function' };
              if (fc.name === 'convert_base') {
                try {
                  const args = JSON.parse(fc.arguments || '{}');
                  const val = parseInt(args.number, args.from_base);
                  toolResults = isNaN(val) ? { error: 'Invalid input' } : { result: val.toString(args.to_base) };
                } catch (e) { toolResults = { error: e.message }; }
              } else if (fc.name === 'submit_answer') {
                hasSubmittedAnswer = true;
                try {
                  const args = JSON.parse(fc.arguments || '{}');
                  const isCorrect = String(args.answer).toUpperCase() === activeExpectedAnswer;
                  validationStatus = isCorrect;
                  toolResults = { success: isCorrect, message: isCorrect ? '验证通过！答案正确。' : `验证失败。预期结果为: ${activeExpectedAnswer}` };
                  if (isCorrect) {
                    validationMsg = '经过多轮工具调用，模型成功识别并完成了任务，且最终答案验证正确！';
                  } else {
                    validationMsg = `经过多轮工具调用，模型虽然尝试完成任务，但最终提交的答案验证错误（提交值: ${args.answer}）。`;
                  }
                } catch (e) { toolResults = { error: e.message }; }
              }
              const outputItem = {
                type: 'function_call_output',
                call_id: fc.call_id,
                output: JSON.stringify(toolResults)
              };
              history.push(outputItem);
              addMessage('tool', `工具执行 #${turn}`, toolResults);
            }
            turn++;
          } else {
            break;
          }
        }

        if (validationStatus === true) addInlineSuccess(validationMsg);
        else if (validationStatus === false) addInlineError(validationMsg);
        else if (!hasSubmittedAnswer) addInlineInfo('模型未执行最终的答案提交工具，流程提前结束。');
      }
      else if (scenario === 'responses_search') {
        // OpenAI Responses API with web_search tool 
        const responsesEndpoint = buildResponsesEndpoint(apiUrl);
        const rReq = {
          model,
          tools: [{ type: 'web_search' }],
          input: [{ role: 'user', content: userText || '搜索当前最新的Gemini旗舰模型是？' }]
        };
        addBlock('请求 #1', rReq);
        addMessage('user', '用户消息', rReq.input[0]);
        const rTStart = Date.now();
        const rR = await fetchAndParse(responsesEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(rReq),
          signal
        });
        const rData = ensureJsonOrThrow(rR);
        const rTDuration = Date.now() - rTStart;
        addBlock('响应 #1', rData, rTDuration);

        // 检测是否存在 web_search_call
        const output = rData.output;
        let hasWebSearchCall = false;
        if (Array.isArray(output)) {
          hasWebSearchCall = output.some(item => item && item.type === 'web_search_call');
        }

        // 显示回答内容
        if (rData.output_text) {
          addMessage('assistant', '回答', { text: rData.output_text });
        } else if (Array.isArray(output)) {
          const msgItem = output.find(item => item && item.type === 'message');
          if (msgItem && msgItem.content) {
            addMessage('assistant', '回答', msgItem.content);
          }
        }

        // 未触发搜索工具调用的提示放在响应下面
        if (!hasWebSearchCall) {
          addInlineInfo('未触发搜索工具调用：模型可能未理解指令，或 API 异常。');
        } else {
          addInlineSuccess('模型成功进行了搜索工具调用，但回答中仍可能含有事实性错误');
        }
      }
      else if (scenario === 'gemini_search') {
        const gReq = {
          tools: [{ googleSearch: {} }],
          contents: [{ role: 'user', parts: [{ text: userText || '搜索当前最新的Gemini旗舰模型是？' }] }]
        };
        addBlock('请求 #1', gReq);
        addMessage('user', '用户消息', gReq.contents[0]);
        const gsTStart = Date.now();
        const gR = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq), signal });
        const gData = ensureJsonOrThrow(gR);
        const gsTDuration = Date.now() - gsTStart;
        addBlock('响应 #1', gData, gsTDuration);
        const cand = gData.candidates && gData.candidates[0];
        if (cand && cand.content) { addMessage('assistant', '回答', cand.content); }

        // 检测是否存在 groundingMetadata
        const hasGroundingMetadata = cand && cand.groundingMetadata;
        if (!hasGroundingMetadata) {
          addInlineInfo('未触发搜索工具调用：模型可能未理解指令，或 API 异常。');
        } else {
          addInlineSuccess('模型成功进行了搜索工具调用，但回答中仍可能含有事实性错误');
        }
      }
      else if (scenario === 'gemini_url_context') {
        const gReq = {
          tools: [{ urlContext: {} }],
          contents: [{ role: 'user', parts: [{ text: userText || '这个工具有哪些特点？https://ai.google.dev/gemini-api/docs/url-context' }] }]
        };
        addBlock('请求 #1', gReq);
        addMessage('user', '用户消息', gReq.contents[0]);
        const guTStart = Date.now();
        const gR = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq), signal });
        const gData = ensureJsonOrThrow(gR);
        const guTDuration = Date.now() - guTStart;
        addBlock('响应 #1', gData, guTDuration);
        const cand = gData.candidates && gData.candidates[0];
        if (cand && cand.content) { addMessage('assistant', '回答', cand.content); }

        // 检测是否存在 groundingMetadata
        const hasGroundingMetadata = cand && cand.groundingMetadata;
        if (!hasGroundingMetadata) {
          addInlineInfo('未触发 URL 上下文工具调用：模型可能未理解指令，或 API 异常。');
        } else {
          addInlineSuccess('模型成功进行了搜索工具调用，但回答中仍可能含有事实性错误');
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request aborted by user');
        return;
      }
      console.error(err);
      // 清空顶部简要错误，改为在时间线内展示红色错误块
      errorMessage.textContent = '';
      addInlineError(`错误：${err && (err.message || err)}`, { rawText: err && err.rawText, contentType: err && err.contentType });
    } finally {
      requestPending = false;
      hideWaiting();
      testBtn.disabled = false; testBtn.textContent = '发送测试请求';
    }
  });

  // ---- network helpers ----
  async function fetchAndParse(url, options) {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { }
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; e.rawText = text; e.contentType = contentType; throw e; }
    return { json, text, contentType };
  }
  function ensureJsonOrThrow(parsed) {
    if (parsed && parsed.json) return parsed.json;
    const e = new Error('响应非 JSON');
    e.rawText = parsed && parsed.text;
    e.contentType = parsed && parsed.contentType;
    throw e;
  }
})();
