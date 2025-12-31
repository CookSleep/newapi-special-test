(function(){
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

  // LocalStorage helpers
  function loadConfigs(){
    try { return JSON.parse(localStorage.getItem('apiConfigs')||'[]'); } catch { return []; }
  }
  function saveConfigs(cfgs){ localStorage.setItem('apiConfigs', JSON.stringify(cfgs)); }

  // URL helpers
  function stripTrailingSlash(u){ return (u || '').replace(/\/+$/, ''); }
  function normalizeApiUrl(u){
    let val = (u || '').trim();
    if(!val) return val;
    // 自动补全协议
    if(!/^https?:\/\//i.test(val)) val = 'https://' + val;
    try{
      const url = new URL(val);
      // 只保留 origin（协议+域名+端口），路径由系统在不同场景下添加
      return url.origin;
    } catch {
      // URL 解析失败，仅去除尾部斜杠
      return stripTrailingSlash(val);
    }
  }
  function buildEndpoint(base){ return stripTrailingSlash(base) + '/v1/chat/completions'; }
  function buildGeminiEndpoint(base, model, apiKey){
    const root = stripTrailingSlash(base);
    return `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }
  function buildAnthropicEndpoint(base){
    const root = stripTrailingSlash(base);
    return `${root}/v1/messages`;
  }
  function buildResponsesEndpoint(base){
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

  function displayConfigs(){
    const cfgs = loadConfigs();
    if(cfgs.length === 0){
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
  function escapeHtml(s){
    if(typeof s !== 'string') return '';
    return s.replace(/[&<>"{}]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','{':'&#123;','}':'&#125;'}[m]));
  }

  // Copy helper
  function attachCopy(btn, targetPre){
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(targetPre.textContent||'');
      const orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = orig, 1500);
    });
  }

  // Waiting inline loader helpers
  function ensureWaitingEl(){
    if(waitingEl) return waitingEl;
    const wrap = document.createElement('div');
    wrap.className = 'waiting-inline';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '请求中';
    const dots = document.createElement('span');
    dots.className = 'dots';
    for(let i=0;i<3;i++){
      const d = document.createElement('span');
      d.className = 'dot';
      dots.appendChild(d);
    }
    wrap.appendChild(label);
    wrap.appendChild(dots);
    waitingEl = wrap;
    return waitingEl;
  }
  function showWaiting(){
    const el = ensureWaitingEl();
    if(el.parentNode !== messageTimeline){
      messageTimeline.appendChild(el);
    } else {
      // 重新追加到末尾，确保在最新一条消息下方
      messageTimeline.removeChild(el);
      messageTimeline.appendChild(el);
    }
  }
  function hideWaiting(){
    if(waitingEl && waitingEl.parentNode){ waitingEl.parentNode.removeChild(waitingEl); }
  }

  // Info inline block (tip/warning)
  function addInlineInfo(text){
    const el = document.createElement('div');
    el.className = 'info-inline';
    el.textContent = String(text || '提示');
    messageTimeline.appendChild(el);
    scrollLatestIntoView();
    return el;
  }

  // Success inline block (green tip)
  function addInlineSuccess(text){
    const el = document.createElement('div');
    el.className = 'success-inline';
    el.textContent = String(text || '成功');
    messageTimeline.appendChild(el);
    scrollLatestIntoView();
    return el;
  }

  // Error inline block under latest message
  function addInlineError(text, raw){
    const el = document.createElement('div');
    el.className = 'error-inline';
    el.textContent = String(text || '发生未知错误');
    // 确保等待动画被移除后再追加错误块
    hideWaiting();
    messageTimeline.appendChild(el);
    // 附带原始内容（JSON/纯文本），不再渲染 HTML 预览
    try{
      const rawText = raw && raw.rawText;
      const ct = (raw && raw.contentType || '').toLowerCase();
      if(rawText){
        const wrap = document.createElement('div');
        wrap.style.marginTop = '6px';
        // 若为 HTML 返回，补充友好提示
        const isHtml = ct.includes('text/html') || /^\s*<(!doctype|html|head|body)/i.test(rawText);
        let notice = null;
        if(isHtml){
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
        if(ct.includes('application/json')){
          try{ pre.textContent = JSON.stringify(JSON.parse(rawText), null, 2); }
          catch{ pre.textContent = rawText; }
        } else {
          pre.textContent = rawText;
        }
        details.appendChild(sum);
        details.appendChild(pre);
        wrap.appendChild(details);
        // 点击提示或“查看原始返回”文字都可展开/收起
        const toggle = () => { details.open = !details.open; };
        sum.addEventListener('click', (e) => { /* 使用默认展开行为并扩大可点击区域 */ });
        if(notice){
          notice.addEventListener('click', toggle);
          notice.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
          notice.tabIndex = 0; // 可聚焦
        }
        el.appendChild(wrap);
      }
    }catch{ /* 附加原始内容失败时安静降级 */ }
    // 滚动到最新位置（错误块所在）
    scrollLatestIntoView();
    return el;
  }

  // Scroll helpers: keep latest message aligned to page top
  function scrollLatestIntoView(){
    const cards = messageTimeline.querySelectorAll('.card.message');
    if(cards.length === 0) return;
    const last = cards[cards.length - 1];
    // 将最新消息滚动到页面顶部位置
    try{
      last.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }catch{ /* 兼容性兜底 */
      const top = window.scrollY + last.getBoundingClientRect().top;
      window.scrollTo({ top: Math.max(top - 8, 0), behavior: 'smooth' });
    }
  }

  // App modal helpers (custom alert/confirm)
  let appModalEl = null;
  function ensureAppModal(){
    if(appModalEl) return appModalEl;
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
  function openAppModal({ title = '提示', content = '', showCancel = false, okText = '确定', cancelText = '取消' } = {}){
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
      const onBackdrop = (e) => { if(e.target === el){ showCancel ? onCancel() : onOk(); } };
      const onKey = (e) => { if(e.key === 'Escape'){ showCancel ? onCancel() : onOk(); } };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      el.addEventListener('click', onBackdrop);
      window.addEventListener('keydown', onKey);
    });
  }
  // Toast helper
  function showToast(msg, type = 'info'){
    let container = document.querySelector('.toast-container');
    if(!container){
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

  function appAlert(message){ 
    showToast(message, 'info'); 
    return Promise.resolve(true); 
  }
  function appConfirm(message){ 
    // Confirm 逻辑暂时保留原样或改为 Toast，但用户主要想要提示窗
    return confirm(message); 
  }

  // Apply config helpers
  function applyConfigToTop(cfg){
    if(!cfg) return;
    apiUrlEl.value = cfg.url || SYSTEM_DEFAULTS.apiUrl;
    apiKeyEl.value = cfg.key || SYSTEM_DEFAULTS.apiKey;
    modelEl.value = cfg.model || SYSTEM_DEFAULTS.model;
  }
  function applySystemDefaultToTop(){
    apiUrlEl.value = SYSTEM_DEFAULTS.apiUrl;
    apiKeyEl.value = SYSTEM_DEFAULTS.apiKey;
    modelEl.value = SYSTEM_DEFAULTS.model;
  }

  // UI builders
  function addBlock(title, payload, durationMs){
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    const h = document.createElement('div');
    h.className = 'title';
    // 如果有耗时，在标题后面追加
    if(typeof durationMs === 'number' && durationMs >= 0){
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
  function formatDuration(ms){
    if(ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function addMessage(role, label, payload){
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
    if(requestPending){ showWaiting(); }
    // Scroll page so that the latest message sits at page top
    scrollLatestIntoView();
    return card;
  }

  function clearResults(){
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
  window.addEventListener('click', (e) => { if(e.target === configModal) configModal.classList.remove('open'); });
  window.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      // 若有自定义弹窗打开，仅关闭自定义弹窗，不关闭配置页
      if(document.querySelector('.app-modal.open')) return;
      configModal.classList.remove('open');
    }
  });

  configListEl.addEventListener('click', (e) => {
    const starBtn = e.target.closest('[data-star]');
    if(starBtn){
      const idx = parseInt(starBtn.getAttribute('data-star'),10);
      const cfgs = loadConfigs();
      const wasDefault = !!(cfgs[idx] && cfgs[idx].isDefault);
      if(wasDefault){
        // 取消默认，恢复系统预设
        cfgs.forEach((c) => { if(c) c.isDefault = false; });
        saveConfigs(cfgs);
        displayConfigs();
        applySystemDefaultToTop();
        appAlert('已取消默认，已恢复系统预设');
      } else {
        // 设为默认，并应用到顶部
        cfgs.forEach((c, i) => { if(c) c.isDefault = (i === idx); });
        saveConfigs(cfgs);
        displayConfigs();
        applyConfigToTop(cfgs[idx]);
        appAlert('已设为默认配置');
      }
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if(delBtn){
      const idx = parseInt(delBtn.getAttribute('data-del'),10);
      // 二次确认逻辑：首次点击进入确认态，显示问号；再次点击才删除
      if(!delBtn.classList.contains('confirm')){
        delBtn.classList.add('confirm');
        // 定时自动恢复
        if(delBtn._confirmTimer) clearTimeout(delBtn._confirmTimer);
        delBtn._confirmTimer = setTimeout(() => { try{ delBtn.classList.remove('confirm'); }catch{} delBtn._confirmTimer=null; }, 2500);
        return;
      }
      if(delBtn._confirmTimer){ clearTimeout(delBtn._confirmTimer); delBtn._confirmTimer=null; }
      const cfgs = loadConfigs();
      cfgs.splice(idx,1);
      saveConfigs(cfgs);
      displayConfigs();
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    if(editBtn){
      const idx = parseInt(editBtn.getAttribute('data-edit'),10);
      const cfg = loadConfigs()[idx];
      if(cfg){
        editingIndex = idx;
        configNameEl.value = cfg.name || '';
        configUrlEl.value = cfg.url || '';
        configKeyEl.value = cfg.key || '';
        configModelEl.value = cfg.model || SYSTEM_DEFAULTS.model;
        saveConfigBtn.textContent = '保存修改';
        cancelEditBtn.style.display = '';
        if(saveAsDefaultBtn) saveAsDefaultBtn.style.display = 'none';
        // 保存按钮切换为蓝色
        if(saveConfigBtn){ saveConfigBtn.classList.remove('btn-secondary'); saveConfigBtn.classList.add('btn-primary'); }
        if(configModalTitleEl) configModalTitleEl.textContent = '修改 API 配置';
        if(modalFormHeadingEl) modalFormHeadingEl.textContent = '修改配置';
      }
      return;
    }
    const item = e.target.closest('.config-item');
    if(!item) return;
    const index = parseInt(item.getAttribute('data-index'), 10);
    const cfg = loadConfigs()[index];
    if(cfg){
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
    if(!name || !url || !key){ await appAlert('请填写所有必填字段'); return; }
    const cfgs = loadConfigs();
    if(editingIndex !== null){
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
  if(saveAsDefaultBtn){
    saveAsDefaultBtn.addEventListener('click', async () => {
      const name = configNameEl.value.trim();
      const url = stripTrailingSlash(configUrlEl.value.trim());
      const key = configKeyEl.value.trim();
      const model = (configModelEl.value || SYSTEM_DEFAULTS.model).trim();
      if(!name || !url || !key){ await appAlert('请填写所有必填字段'); return; }
      const cfgs = loadConfigs();
      let idx;
      if(editingIndex !== null){
        const prev = cfgs[editingIndex] || {};
        cfgs[editingIndex] = { ...prev, name, url, key, model, isDefault: true };
        idx = editingIndex;
      } else {
        cfgs.push({ name, url, key, model, isDefault: true });
        idx = cfgs.length - 1;
      }
      // 唯一默认
      cfgs.forEach((c, i) => { if(i !== idx && c) c.isDefault = false; });
      saveConfigs(cfgs);
      applyConfigToTop(cfgs[idx]);
      clearEditForm();
      showToast('已保存并设为默认配置', 'success');
      displayConfigs();
    });
  }

  function clearEditForm(){
    editingIndex = null;
    configNameEl.value = '';
    configUrlEl.value = '';
    configKeyEl.value = '';
    configModelEl.value = SYSTEM_DEFAULTS.model;
    saveConfigBtn.textContent = '保存配置';
    cancelEditBtn.style.display = 'none';
    if(saveAsDefaultBtn) saveAsDefaultBtn.style.display = '';
    // 保存按钮恢复为灰色
    if(saveConfigBtn){ saveConfigBtn.classList.remove('btn-primary'); saveConfigBtn.classList.add('btn-secondary'); }
    if(configModalTitleEl) configModalTitleEl.textContent = '管理 API 配置';
    if(modalFormHeadingEl) modalFormHeadingEl.textContent = '添加新配置';
  }

  cancelEditBtn.addEventListener('click', () => {
    clearEditForm();
  });

  clearBtn.addEventListener('click', clearResults);

  // Defaults
  // Password toggle functionality
  function initPasswordToggles(){
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const eyeIcon = btn.querySelector('.eye-icon');
        const eyeOffIcon = btn.querySelector('.eye-off-icon');
        
        if(input.type === 'password'){
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
    if(d){
      apiUrlEl.value = d.url || apiUrlEl.value || SYSTEM_DEFAULTS.apiUrl;
      apiKeyEl.value = d.key || SYSTEM_DEFAULTS.apiKey;
      modelEl.value = d.model || modelEl.value || SYSTEM_DEFAULTS.model;
    } else {
      if(!apiUrlEl.value){ apiUrlEl.value = SYSTEM_DEFAULTS.apiUrl; }
      if(!modelEl.value){ modelEl.value = SYSTEM_DEFAULTS.model; }
    }
    // 占位留空：不再动态写入 placeholder
    // 初始化厂商分组和测试按钮
    renderTestButtons('openai');
  });

  // 厂商分组配置
  const vendorTests = {
    openai: [
      { scenario: 'openai_tools', label: '工具调用 (Chat Completions)', defaultInput: '当前时间是？' },
      { scenario: 'responses_tools', label: '工具调用 (Responses)', defaultInput: '当前时间是？' },
      { scenario: 'responses_search', label: '搜索 (Responses)', defaultInput: '搜索当前最新的Gemini旗舰模型是？' }
    ],
    anthropic: [
      { scenario: 'anthropic_tools', label: '工具调用', defaultInput: '当前时间是？' }
    ],
    google: [
      { scenario: 'gemini_tools', label: '工具调用', defaultInput: '当前时间是？' },
      { scenario: 'gemini_search', label: '搜索', defaultInput: '搜索当前最新的Gemini旗舰模型是？' },
      { scenario: 'gemini_url_context', label: 'URL 上下文', defaultInput: '这个工具有哪些特点？https://ai.google.dev/gemini-api/docs/url-context' }
    ]
  };

  // 当前选中的厂商
  let currentVendor = 'openai';

  // 渲染测试按钮
  function renderTestButtons(vendor){
    const tests = vendorTests[vendor] || [];
    testTypeWrap.innerHTML = tests.map((t, i) => 
      `<button class="seg-btn${i === 0 ? ' active' : ''}" data-scenario="${t.scenario}">${t.label}</button>`
    ).join('');
    // 设置默认输入
    if(tests.length > 0){
      userInputEl.value = tests[0].defaultInput;
    }
  }

  // 切换厂商
  function setActiveVendor(vendor){
    currentVendor = vendor;
    $$('#vendorType .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.vendor === vendor));
    renderTestButtons(vendor);
    clearResults();
  }

  // 切换测试场景
  function setActiveScenario(scenario){
    $$('#testType .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.scenario === scenario));
    // 查找对应的默认输入
    const tests = vendorTests[currentVendor] || [];
    const test = tests.find(t => t.scenario === scenario);
    if(test){
      userInputEl.value = test.defaultInput;
    }
  }

  // 厂商切换事件
  if(vendorTypeWrap){
    vendorTypeWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if(!btn || !btn.dataset.vendor) return;
      setActiveVendor(btn.dataset.vendor);
    });
  }

  // 测试场景切换事件
  if(testTypeWrap){
    testTypeWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if(!btn || !btn.dataset.scenario) return;
      setActiveScenario(btn.dataset.scenario);
      clearResults();
    });
  }

  // Test function call flow (multiple scenarios)
  testBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlEl.value.trim();
    const apiKey = apiKeyEl.value.trim();
    const model = (modelEl.value || SYSTEM_DEFAULTS.model).trim();
    if(!apiUrl || !apiKey){ await appAlert('请填写 API URL 和 API Key'); return; }
    errorMessage.textContent = '';
    testBtn.disabled = true; testBtn.textContent = '请求中...';
    // 发起新请求前自动清空历史记录
    clearResults();

    const scenario = testTypeWrap.querySelector('.seg-btn.active')?.dataset.scenario || 'openai_tools';
    const endpoint = buildEndpoint(apiUrl);
    const geminiEndpoint = buildGeminiEndpoint(apiUrl, model, apiKey);
    const anthropicEndpoint = buildAnthropicEndpoint(apiUrl);

    try{
      requestPending = true; showWaiting();
      const userText = userInputEl.value.trim() || '当前时间是？';
      if(scenario === 'openai_tools'){
        // OpenAI: function call time query
        const requestBody1 = {
          model,
          messages: [ { role: 'user', content: userText } ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_current_time',
                description: '获取当前的日期和时间',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              }
            }
          ],
          tool_choice: 'auto'
        };
        addBlock('请求 #1', requestBody1);
        addMessage('user', '消息 #1', requestBody1.messages[0]);

        const t1Start = Date.now();
        const r1 = await fetchAndParse(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody1) });
        const data1 = ensureJsonOrThrow(r1);
        const t1Duration = Date.now() - t1Start;
        addBlock('响应 #1', data1, t1Duration);

        const choice = data1.choices && data1.choices[0];
        if(!choice){ throw new Error('响应无 choices'); }
        const assistantMsg = choice.message;
        addMessage('assistant', '消息 #2', assistantMsg);

        const toolCall = assistantMsg && assistantMsg.tool_calls && assistantMsg.tool_calls[0];
        if(!toolCall){
          addInlineInfo('未触发工具调用：模型可能未理解指令，或 API 异常。');
          return;
        }

        // Simulate tool execution
        const now = new Date();
        const datePart = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
        const timePart = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const currentTime = `${datePart} ${weekday} ${timePart}`;
        const toolMessage = {
          role: 'tool',
          content: JSON.stringify({ current_time: currentTime }),
          tool_call_id: toolCall.id
        };
        addMessage('tool', '消息 #3 (工具返回结果)', { current_time: currentTime });

        const requestBody2 = { model, messages: [ requestBody1.messages[0], assistantMsg, toolMessage ] };
        const t2Start = Date.now();
        addBlock('请求 #2', requestBody2);
        const r2 = await fetchAndParse(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody2) });
        const data2 = ensureJsonOrThrow(r2);
        const t2Duration = Date.now() - t2Start;
        addBlock('响应 #2', data2, t2Duration);
        const finalChoice = data2.choices && data2.choices[0];
        if(finalChoice && finalChoice.message){ addMessage('assistant', '消息 #4 (最终回答)', finalChoice.message); }
      }
      else if(scenario === 'anthropic_tools'){
        // Anthropic Messages: function/tool use (two-step)
        const aReq1 = {
          model,
          max_tokens: 256,
          messages: [ { role: 'user', content: userText } ],
          tools: [
            {
              name: 'get_current_time',
              description: '获取当前的日期和时间',
              input_schema: { type: 'object', properties: {}, required: [] }
            }
          ]
        };
        addBlock('请求 #1', aReq1);
        addMessage('user', '消息 #1', aReq1.messages[0]);
        const aT1Start = Date.now();
        const aR1 = await fetchAndParse(anthropicEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(aReq1)
        });
        const aData1 = ensureJsonOrThrow(aR1);
        const aT1Duration = Date.now() - aT1Start;
        addBlock('响应 #1', aData1, aT1Duration);

        // find tool_use
        const contentArr1 = Array.isArray(aData1 && aData1.content) ? aData1.content : [];
        const toolUse = contentArr1.find(p => p && p.type === 'tool_use');
        if(!toolUse){ addInlineInfo('未触发工具调用：模型可能未理解指令，或 API 异常。'); return; }
        addMessage('assistant', '消息 #2', Array.isArray(aData1 && aData1.content) ? aData1.content : aData1);

        // Simulate tool result
        const now = new Date();
        const datePart = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
        const timePart = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const currentTime = `${datePart} ${weekday} ${timePart}`;
        const toolResultMsg = {
          role: 'user',
          content: [ { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ current_time: currentTime }) } ]
        };
        addMessage('tool', '消息 #3 (工具返回结果)', { current_time: currentTime });

        const aReq2 = {
          model,
          max_tokens: 256,
          messages: [
            { role: 'user', content: userText },
            { role: 'assistant', content: [ toolUse ] },
            toolResultMsg
          ]
        };
        const aT2Start = Date.now();
        addBlock('请求 #2', aReq2);
        const aR2 = await fetchAndParse(anthropicEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(aReq2)
        });
        const aData2 = ensureJsonOrThrow(aR2);
        const aT2Duration = Date.now() - aT2Start;
        addBlock('响应 #2', aData2, aT2Duration);
        addMessage('assistant', '消息 #4 (最终回答)', Array.isArray(aData2 && aData2.content) ? aData2.content : aData2);
      }
      else if(scenario === 'gemini_tools'){
        // Gemini: function calling (two-step)
        const gReq1 = {
          systemInstruction: { parts: [{ text: '你是一个有帮助的助手。' }] },
          tools: [{ functionDeclarations: [
            {
              name: 'get_current_time',
              description: '获取当前的日期和时间',
              parameters: { type: 'object', properties: {}, required: [] }
            }
          ]}],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          contents: [{ role: 'user', parts: [{ text: userText }] }]
        };
        addBlock('请求 #1', gReq1);
        addMessage('user', '消息 #1', { role: 'user', parts: [{ text: userText }] });
        const gT1Start = Date.now();
        const gR1 = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq1) });
        const gData1 = ensureJsonOrThrow(gR1);
        const gT1Duration = Date.now() - gT1Start;
        addBlock('响应 #1', gData1, gT1Duration);

        const gCand1 = gData1.candidates && gData1.candidates[0];
        const gContent1 = gCand1 && gCand1.content;
        if(gContent1){ addMessage('assistant', '消息 #2', gContent1); }

        // Detect functionCall in parts
        let fc = null;
        if(gContent1 && Array.isArray(gContent1.parts)){
          for(const p of gContent1.parts){ if(p.functionCall){ fc = p.functionCall; break; } }
        }
        if(!fc){
          addInlineInfo('未触发工具调用：模型可能未理解指令，或 API 异常。');
          return;
        }

        // Simulate tool result
        const now = new Date();
        const datePart = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
        const timePart = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const currentTime = `${datePart} ${weekday} ${timePart}`;
        const funcResponsePart = { functionResponse: { name: fc.name || 'get_current_time', response: { current_time: currentTime } } };
        addMessage('tool', '消息 #3 (工具返回结果)', funcResponsePart.functionResponse.response);

        const gReq2 = {
          contents: [
            { role: 'user', parts: [{ text: userText }] },
            gContent1,
            { role: 'function', parts: [ funcResponsePart ] }
          ]
        };
        const gT2Start = Date.now();
        addBlock('请求 #2', gReq2);
        const gR2 = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq2) });
        const gData2 = ensureJsonOrThrow(gR2);
        const gT2Duration = Date.now() - gT2Start;
        addBlock('响应 #2', gData2, gT2Duration);
        const gCand2 = gData2.candidates && gData2.candidates[0];
        if(gCand2 && gCand2.content){ addMessage('assistant', '消息 #4 (最终回答)', gCand2.content); }
      }
      else if(scenario === 'responses_tools'){
        // OpenAI Responses API with function tool
        const responsesEndpoint = buildResponsesEndpoint(apiUrl);
        const rtReq1 = {
          model,
          tools: [
            {
              type: 'function',
              name: 'get_current_time',
              description: '获取当前的日期和时间',
              parameters: {
                type: 'object',
                properties: {},
                required: []
              }
            }
          ],
          input: userText || '当前时间是？'
        };
        addBlock('请求 #1', rtReq1);
        addMessage('user', '消息 #1', { input: rtReq1.input });
        const rtT1Start = Date.now();
        const rtR1 = await fetchAndParse(responsesEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(rtReq1)
        });
        const rtData1 = ensureJsonOrThrow(rtR1);
        const rtT1Duration = Date.now() - rtT1Start;
        addBlock('响应 #1', rtData1, rtT1Duration);

        // 检测是否存在 function_call
        const rtOutput1 = rtData1.output;
        let functionCall = null;
        if(Array.isArray(rtOutput1)){
          const fcItem = rtOutput1.find(item => item && item.type === 'function_call');
          if(fcItem){ functionCall = fcItem; }
        }
        if(!functionCall){
          // 显示回答内容（如果有）
          if(rtData1.output_text){
            addMessage('assistant', '回答', { text: rtData1.output_text });
          } else if(Array.isArray(rtOutput1)){
            const msgItem = rtOutput1.find(item => item && item.type === 'message');
            if(msgItem && msgItem.content){
              addMessage('assistant', '回答', msgItem.content);
            }
          }
          addInlineInfo('未触发工具调用：模型可能未理解指令，或 API 异常。');
          return;
        }
        addMessage('assistant', '消息 #2', functionCall);

        // Simulate tool result
        const now = new Date();
        const datePart = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' });
        const timePart = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const currentTime = `${datePart} ${weekday} ${timePart}`;
        addMessage('tool', '消息 #3 (工具返回结果)', { current_time: currentTime });

        const rtReq2 = {
          model,
          input: [
            { type: 'function_call_output', call_id: functionCall.call_id, output: JSON.stringify({ current_time: currentTime }) }
          ],
          previous_response_id: rtData1.id
        };
        const rtT2Start = Date.now();
        addBlock('请求 #2', rtReq2);
        const rtR2 = await fetchAndParse(responsesEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(rtReq2)
        });
        const rtData2 = ensureJsonOrThrow(rtR2);
        const rtT2Duration = Date.now() - rtT2Start;
        addBlock('响应 #2', rtData2, rtT2Duration);

        // 显示最终回答
        if(rtData2.output_text){
          addMessage('assistant', '消息 #4 (最终回答)', { text: rtData2.output_text });
        } else if(Array.isArray(rtData2.output)){
          const msgItem = rtData2.output.find(item => item && item.type === 'message');
          if(msgItem && msgItem.content){
            addMessage('assistant', '消息 #4 (最终回答)', msgItem.content);
          }
        }
      }
      else if(scenario === 'responses_search'){
        // OpenAI Responses API with web_search tool
        const responsesEndpoint = buildResponsesEndpoint(apiUrl);
        const rReq = {
          model,
          tools: [{ type: 'web_search' }],
          input: userText || '今天有什么正面的新闻？'
        };
        addBlock('请求 #1', rReq);
        addMessage('user', '消息', { input: rReq.input });
        const rTStart = Date.now();
        const rR = await fetchAndParse(responsesEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(rReq)
        });
        const rData = ensureJsonOrThrow(rR);
        const rTDuration = Date.now() - rTStart;
        addBlock('响应 #1', rData, rTDuration);

        // 检测是否存在 web_search_call
        const output = rData.output;
        let hasWebSearchCall = false;
        if(Array.isArray(output)){
          hasWebSearchCall = output.some(item => item && item.type === 'web_search_call');
        }

        // 显示回答内容
        if(rData.output_text){
          addMessage('assistant', '回答', { text: rData.output_text });
        } else if(Array.isArray(output)){
          const msgItem = output.find(item => item && item.type === 'message');
          if(msgItem && msgItem.content){
            addMessage('assistant', '回答', msgItem.content);
          }
        }

        // 未触发搜索工具调用的提示放在响应下面
        if(!hasWebSearchCall){
          addInlineInfo('未触发搜索工具调用：模型可能未理解指令，或 API 异常。');
        } else {
          addInlineSuccess('模型成功进行了搜索工具调用，但回答中仍可能含有事实性错误');
        }
      }
      else if(scenario === 'gemini_search'){
        const gReq = {
          tools: [{ googleSearch: {} }],
          contents: [{ role: 'user', parts: [{ text: userText || '搜索当前最新的Gemini旗舰模型是？' }] }]
        };
        addBlock('请求 #1', gReq);
        addMessage('user', '消息', gReq.contents[0]);
        const gsTStart = Date.now();
        const gR = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
        const gData = ensureJsonOrThrow(gR);
        const gsTDuration = Date.now() - gsTStart;
        addBlock('响应 #1', gData, gsTDuration);
        const cand = gData.candidates && gData.candidates[0];
        if(cand && cand.content){ addMessage('assistant', '回答', cand.content); }

        // 检测是否存在 groundingMetadata
        const hasGroundingMetadata = cand && cand.groundingMetadata;
        if(!hasGroundingMetadata){
          addInlineInfo('未触发搜索工具调用：模型可能未理解指令，或 API 异常。');
        } else {
          addInlineSuccess('模型成功进行了搜索工具调用，但回答中仍可能含有事实性错误');
        }
      }
      else if(scenario === 'gemini_url_context'){
        const gReq = {
          tools: [{ urlContext: {} }],
          contents: [{ role: 'user', parts: [{ text: userText || '这个工具有哪些特点？https://ai.google.dev/gemini-api/docs/url-context' }] }]
        };
        addBlock('请求 #1', gReq);
        addMessage('user', '消息', gReq.contents[0]);
        const guTStart = Date.now();
        const gR = await fetchAndParse(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
        const gData = ensureJsonOrThrow(gR);
        const guTDuration = Date.now() - guTStart;
        addBlock('响应 #1', gData, guTDuration);
        const cand = gData.candidates && gData.candidates[0];
        if(cand && cand.content){ addMessage('assistant', '回答', cand.content); }

        // 检测是否存在 groundingMetadata
        const hasGroundingMetadata = cand && cand.groundingMetadata;
        if(!hasGroundingMetadata){
          addInlineInfo('未触发 URL 上下文工具调用：模型可能未理解指令，或 API 异常。');
        } else {
          addInlineSuccess('模型成功进行了搜索工具调用，但回答中仍可能含有事实性错误');
        }
      }

    }catch(err){
      console.error(err);
      // 清空顶部简要错误，改为在时间线内展示红色错误块
      errorMessage.textContent = '';
      addInlineError(`错误：${err && (err.message || err)}`, { rawText: err && err.rawText, contentType: err && err.contentType });
    }finally{
      requestPending = false;
      hideWaiting();
      testBtn.disabled = false; testBtn.textContent = '发送测试请求';
    }
  });

  // ---- network helpers ----
  async function fetchAndParse(url, options){
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch{}
    if(!res.ok){ const e = new Error(`HTTP ${res.status}`); e.status = res.status; e.rawText = text; e.contentType = contentType; throw e; }
    return { json, text, contentType };
  }
  function ensureJsonOrThrow(parsed){
    if(parsed && parsed.json) return parsed.json;
    const e = new Error('响应非 JSON');
    e.rawText = parsed && parsed.text;
    e.contentType = parsed && parsed.contentType;
    throw e;
  }
})();
