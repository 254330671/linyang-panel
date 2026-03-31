/**
 * API 服务模块（独立，可测试）
 * 
 * 功能：
 * - API 配置管理（保存/读取/验证）
 * - Chat Completion 调用（兼容 OpenAI 格式）
 * - AI 待办解析
 * - 错误处理 + 重试
 * - 多 provider 支持（OpenAI / DeepSeek / 其他兼容格式）
 * 
 * 用法：
 *   const api = new ApiService();
 *   api.setConfig({ endpoint: '...', key: '...', model: 'gpt-4o-mini' });
 *   const result = await api.chat('你好');
 */

class ApiService {
  constructor(options = {}) {
    // 存储适配器（默认用 localStorage，测试时可替换）
    this._storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this._storageKey = options.storageKey || 'userapi';
    
    // 当前配置
    this._config = null;
    
    // 聊天历史
    this._chatHistory = [];
    
    // 默认配置
    this._defaults = {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 2048,
      timeout: 30000,  // 30秒超时
      retries: 1,      // 失败重试次数
    };

    // 预设 provider 模板
    this.providers = {
      openai: {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
      },
      deepseek: {
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/chat/completions',
        models: ['deepseek-chat', 'deepseek-coder'],
      },
      together: {
        name: 'Together AI',
        endpoint: 'https://api.together.xyz/v1/chat/completions',
        models: ['meta-llama/Llama-3-70b-chat-hf'],
      },
      openrouter: {
        name: 'OpenRouter',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        models: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat'],
      },
      custom: {
        name: '自定义',
        endpoint: '',
        models: [],
      },
    };

    // 加载已有配置
    this._loadConfig();
  }

  // ============ 配置管理 ============

  /**
   * 设置 API 配置
   * @param {Object} config
   * @param {string} config.endpoint API 地址
   * @param {string} config.key API 密钥
   * @param {string} [config.model] 模型名
   * @param {string} [config.provider] 预设 provider 名
   */
  setConfig(config) {
    this._config = {
      endpoint: config.endpoint || this._defaults.endpoint,
      key: config.key || '',
      model: config.model || this._defaults.model,
      temperature: config.temperature ?? this._defaults.temperature,
      maxTokens: config.maxTokens ?? this._defaults.maxTokens,
      timeout: config.timeout ?? this._defaults.timeout,
      retries: config.retries ?? this._defaults.retries,
    };

    // 如果指定了 provider，用预设模板
    if (config.provider && this.providers[config.provider]) {
      const p = this.providers[config.provider];
      if (!config.endpoint) this._config.endpoint = p.endpoint;
    }

    this._saveConfig();
  }

  /** 获取当前配置（脱敏） */
  getConfig() {
    if (!this._config) return null;
    return {
      ...this._config,
      key: this._config.key ? '***' + this._config.key.slice(-4) : '',
      hasKey: !!this._config.key,
    };
  }

  /** 获取原始配置（内部用） */
  _getRawConfig() {
    return this._config || {};
  }

  /** 检查配置是否可用 */
  isReady() {
    return !!(this._config && this._config.key && this._config.endpoint);
  }

  /** 从存储加载 */
  _loadConfig() {
    if (!this._storage) return;
    try {
      const raw = this._storage.getItem(this._storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._config = {
          ...this._defaults,
          ...parsed,
        };
      }
    } catch (e) {
      console.warn('API config load error:', e);
    }
  }

  /** 保存到存储 */
  _saveConfig() {
    if (!this._storage || !this._config) return;
    try {
      this._storage.setItem(this._storageKey, JSON.stringify(this._config));
    } catch (e) {
      console.warn('API config save error:', e);
    }
  }

  // ============ 核心请求 ============

  /**
   * 发送请求到 API
   * @param {Object} body 请求体
   * @returns {Promise<Object>} 响应 JSON
   */
  async _request(body) {
    const cfg = this._getRawConfig();
    if (!cfg.key || !cfg.endpoint) {
      throw new Error('API 未配置（缺少 key 或 endpoint）');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.key,
    };

    let lastError;
    const maxAttempts = 1 + (cfg.retries || 0);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), cfg.timeout || 30000);

        const resp = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => '');
          throw new ApiError(resp.status, errBody);
        }

        const data = await resp.json();
        return data;

      } catch (e) {
        lastError = e;
        if (e.name === 'AbortError') {
          lastError = new Error('请求超时 (' + (cfg.timeout || 30000) + 'ms)');
        }
        // 非最后一次尝试，等待后重试
        if (attempt < maxAttempts - 1) {
          await this._sleep(1000 * (attempt + 1)); // 递增等待
        }
      }
    }

    throw lastError;
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ============ Chat ============

  /**
   * 发送聊天消息
   * @param {string} message 用户消息
   * @param {Object} [options]
   * @param {string} [options.systemPrompt] 系统提示
   * @param {Array} [options.history] 自定义历史
   * @param {boolean} [options.stream] 是否流式（暂未实现）
   * @returns {Promise<{content: string, usage: Object}>}
   */
  async chat(message, options = {}) {
    const cfg = this._getRawConfig();

    // 加入历史
    this._chatHistory.push({ role: 'user', content: message });

    // 构建消息
    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    const history = options.history || this._chatHistory;
    messages.push(...history);

    const body = {
      model: cfg.model || 'gpt-4o-mini',
      messages: messages,
      temperature: cfg.temperature || 0.7,
      max_tokens: cfg.maxTokens || 2048,
    };

    try {
      const data = await this._request(body);
      const choice = data.choices && data.choices[0];
      const reply = choice?.message?.content || '';

      // 加入历史
      this._chatHistory.push({ role: 'assistant', content: reply });

      return {
        content: reply,
        usage: data.usage || null,
        model: data.model || cfg.model,
      };
    } catch (e) {
      // 失败时移除刚才加入的用户消息
      this._chatHistory.pop();
      throw e;
    }
  }

  /** 清空聊天历史 */
  clearHistory() {
    this._chatHistory = [];
  }

  /** 获取聊天历史 */
  getHistory() {
    return [...this._chatHistory];
  }

  // ============ AI 待办解析 ============

  /**
   * AI 解析自然语言为结构化待办
   * @param {string} text 用户输入
   * @returns {Promise<Object>} 解析结果
   */
  async parseTodo(text) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[now.getDay()];

    const systemPrompt = `你是待办解析器。用户输入一句话，可能包含多个待办事项。
返回JSON格式：
{"todos":[{"t":"精简标题（动词开头）","dl":"截止时间或备注，可为空","time":"YYYY-MM-DD HH:mm，可为空","cat":"工作|生活|学习|健康|财务|社交|休闲","actions":["navigation","shopping","call","mail","movie","food","health","study"],"location":"地点","keyword":"搜索关键词","contact":"联系方式","remind_min":提前分钟数}],"follow_up":"智能追问，可为空"}
规则：
- 一句话可能拆出多个待办（如"出差北京，见张总，买伴手礼"=3个）
- 没有时间的待办不设提醒
- 有明确截止日但无时间的类型（还信用卡、交房租），follow_up问用户要不要设提醒
- today是${dateStr} ${timeStr} 星期${weekday}
- 只返回JSON，不要其他文字`;

    const cfg = this._getRawConfig();
    if (!cfg.key) {
      // 无 API 时直接返回简单解析
      return {
        todos: [{ t: text, dl: '', time: null, cat: 'other' }],
        follow_up: '',
      };
    }

    try {
      const body = {
        model: cfg.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 500,
      };

      const data = await this._request(body);
      const reply = data.choices?.[0]?.message?.content || '';
      const cleaned = reply.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsed = JSON.parse(cleaned);

      return {
        todos: parsed.todos || [{ t: text, dl: '', time: null, cat: 'other' }],
        follow_up: parsed.follow_up || '',
      };
    } catch (e) {
      console.warn('AI todo parse failed:', e);
      return {
        todos: [{ t: text, dl: '', time: null, cat: 'other' }],
        follow_up: '',
      };
    }
  }

  // ============ 健康检查 ============

  /**
   * 测试 API 连通性
   * @returns {Promise<{ok: boolean, latency: number, model: string, error?: string}>}
   */
  async healthCheck() {
    const cfg = this._getRawConfig();
    if (!cfg.key || !cfg.endpoint) {
      return { ok: false, latency: 0, model: '', error: '未配置' };
    }

    const start = Date.now();
    try {
      const body = {
        model: cfg.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5,
        temperature: 0,
      };

      const data = await this._request(body);
      const latency = Date.now() - start;
      const reply = data.choices?.[0]?.message?.content || '';

      return {
        ok: true,
        latency: latency,
        model: data.model || cfg.model,
        reply: reply,
      };
    } catch (e) {
      return {
        ok: false,
        latency: Date.now() - start,
        model: cfg.model || '',
        error: e.message,
      };
    }
  }

  // ============ 多 provider 支持 ============

  /** 列出预设 provider */
  listProviders() {
    return Object.entries(this.providers).map(([key, p]) => ({
      key: key,
      name: p.name,
      endpoint: p.endpoint,
      models: p.models,
    }));
  }

  /** 使用预设 provider */
  useProvider(providerKey, apiKey, modelIndex = 0) {
    const p = this.providers[providerKey];
    if (!p) throw new Error('未知 provider: ' + providerKey);
    this.setConfig({
      endpoint: p.endpoint,
      key: apiKey,
      model: p.models[modelIndex] || p.models[0] || '',
      provider: providerKey,
    });
  }

  // ============ 流式输出（预留）============
  // TODO: SSE 流式支持
}

/** 自定义 API 错误 */
class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiService, ApiError };
}
