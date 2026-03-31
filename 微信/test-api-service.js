/**
 * api-service.js 单元测试
 * 
 * 测试 1-6：逻辑测试（mock fetch）
 * 测试 7：真实 API 调用（需要有效 key，可选）
 */

const { ApiService, ApiError } = require('./api-service.js');

// ============ Mock localStorage ============
class MockStorage {
  constructor() { this._data = {}; }
  getItem(k) { return this._data[k] || null; }
  setItem(k, v) { this._data[k] = v; }
  removeItem(k) { delete this._data[k]; }
  clear() { this._data = {}; }
}

// ============ 测试工具 ============
let passed = 0, failed = 0;

function assert(condition, testName) {
  if (condition) { console.log(`  ✅ ${testName}`); passed++; }
  else { console.log(`  ❌ ${testName}`); failed++; }
}

function assertEq(actual, expected, testName) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) console.log(`     期望: ${JSON.stringify(expected)}\n     实际: ${JSON.stringify(actual)}`);
  assert(ok, testName);
}

// ============ Mock fetch ============
let mockResponse = null;
let mockFetchCalls = [];

function mockFetch(url, options) {
  mockFetchCalls.push({ url, options, time: Date.now() });
  if (mockResponse instanceof Error) {
    return Promise.reject(mockResponse);
  }
  return Promise.resolve({
    ok: mockResponse.ok !== false,
    status: mockResponse.status || 200,
    json: () => Promise.resolve(mockResponse),
    text: () => Promise.resolve(JSON.stringify(mockResponse)),
  });
}

// 替换全局 fetch
global.fetch = mockFetch;

async function runTests() {
  console.log('🌐 API 服务模块测试\n');

  // ============ 测试 1：配置管理 ============
  console.log('📋 测试 1：配置管理');
  const storage = new MockStorage();
  const api = new ApiService({ storage });

  assert(!api.isReady(), '未配置时 isReady=false');

  api.setConfig({
    endpoint: 'https://api.example.com/v1/chat',
    key: 'sk-test123456789',
    model: 'gpt-4o-mini',
  });

  assert(api.isReady(), '配置后 isReady=true');

  const cfg = api.getConfig();
  assertEq(cfg.endpoint, 'https://api.example.com/v1/chat', 'endpoint 正确');
  assertEq(cfg.key, '***6789', 'key 脱敏（末4位）');
  assert(cfg.hasKey === true, 'hasKey=true');
  assertEq(cfg.model, 'gpt-4o-mini', 'model 正确');

  // 持久化检查
  const saved = JSON.parse(storage.getItem('userapi'));
  assert(saved.key === 'sk-test123456789', '持久化保存成功（明文存储）');
  assert(saved.endpoint === 'https://api.example.com/v1/chat', 'endpoint 持久化');

  // 新实例加载
  const api2 = new ApiService({ storage });
  assert(api2.isReady(), '新实例加载已有配置');

  // ============ 测试 2：Provider 列表 ============
  console.log('\n📋 测试 2：Provider 列表');
  const providers = api.listProviders();
  assert(providers.length >= 3, '至少 3 个预设 provider');
  const deepseek = providers.find(p => p.key === 'deepseek');
  assert(!!deepseek, '有 DeepSeek');
  assert(deepseek.endpoint.includes('deepseek'), 'DeepSeek endpoint 正确');

  // useProvider
  api.useProvider('deepseek', 'sk-ds-test');
  const dsCfg = api.getConfig();
  assert(dsCfg.endpoint.includes('deepseek'), 'useProvider 设置 endpoint');
  assertEq(dsCfg.model, 'deepseek-chat', 'useProvider 设置默认 model');

  // ============ 测试 3：Chat 调用 ============
  console.log('\n📋 测试 3：Chat 调用');
  api.setConfig({ endpoint: 'https://api.test.com', key: 'sk-test', model: 'gpt-4o-mini' });
  mockFetchCalls = [];
  mockResponse = {
    ok: true,
    choices: [{ message: { content: '你好！有什么可以帮你的？' } }],
    usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    model: 'gpt-4o-mini',
  };

  const result = await api.chat('你好');
  assertEq(result.content, '你好！有什么可以帮你的？', '回复内容正确');
  assert(result.usage.total_tokens === 25, 'usage 正确');
  assert(mockFetchCalls.length === 1, '调用了 1 次 fetch');

  // 检查请求体
  const call = mockFetchCalls[0];
  assert(call.options.method === 'POST', 'POST 方法');
  assert(call.options.headers['Authorization'] === 'Bearer sk-test', 'Authorization 头');
  const body = JSON.parse(call.options.body);
  assertEq(body.model, 'gpt-4o-mini', 'model 在 body 中');
  assert(body.messages.length === 1, '1 条消息（无 system）');
  assert(body.messages[0].role === 'user', '用户消息');

  // 聊天历史
  const history = api.getHistory();
  assert(history.length === 2, '历史 2 条（user+assistant）');
  assertEq(history[0].role, 'user', '历史[0]=user');
  assertEq(history[1].role, 'assistant', '历史[1]=assistant');

  api.clearHistory();
  assert(api.getHistory().length === 0, '历史已清空');

  // ============ 测试 4：System Prompt ============
  console.log('\n📋 测试 4：System Prompt');
  mockFetchCalls = [];
  mockResponse = { ok: true, choices: [{ message: { content: 'ok' } }], usage: {} };

  await api.chat('test', { systemPrompt: '你是一个助手' });
  const body2 = JSON.parse(mockFetchCalls[0].options.body);
  assert(body2.messages[0].role === 'system', 'system 消息在首位');
  assertEq(body2.messages[0].content, '你是一个助手', 'system 内容正确');

  // ============ 测试 5：错误处理 ============
  console.log('\n📋 测试 5：错误处理');

  // 5a. HTTP 错误
  mockResponse = { ok: false, status: 401, error: 'Unauthorized' };
  try {
    await api.chat('test');
    assert(false, '401 应抛异常');
  } catch (e) {
    assert(e.status === 401, '401 异常正确');
  }

  // 5b. 网络错误
  mockResponse = new Error('Network error');
  try {
    await api.chat('test');
    assert(false, '网络错误应抛异常');
  } catch (e) {
    assert(e.message.includes('Network'), '网络异常正确');
  }

  // 5c. 超时（mock 环境下跳过，AbortController 需要真实 fetch）
  console.log('  ⏭️ 超时测试跳过（mock 不支持 AbortController）');

  // 恢复正常配置
  api.setConfig({ endpoint: 'https://api.test.com', key: 'sk-test', model: 'gpt-4o-mini' });

  // ============ 测试 6：待办解析（无 API）============
  console.log('\n📋 测试 6：待办解析');
  api.setConfig({ endpoint: '', key: '', model: '' });

  const todo1 = await api.parseTodo('明天下午3点开会');
  assert(todo1.todos.length >= 1, '至少解析 1 个待办');
  assertEq(todo1.todos[0].t, '明天下午3点开会', '无 API 时原文作为标题');

  // 有 API 时
  api.setConfig({ endpoint: 'https://api.test.com', key: 'sk-test', model: 'gpt-4o-mini' });
  mockResponse = {
    ok: true,
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [{ t: '团队周会', dl: '明天15:00', time: null, cat: 'work' }],
          follow_up: '需要提前准备什么吗？',
        }),
      },
    }],
    usage: {},
  };

  const todo2 = await api.parseTodo('明天下午3点团队周会');
  assert(todo2.todos[0].t === '团队周会', 'AI 解析标题');
  assert(todo2.todos[0].cat === 'work', 'AI 分类');
  assert(todo2.follow_up.includes('准备'), 'AI 追问');

  // ============ 测试 7：健康检查 ============
  console.log('\n📋 测试 7：健康检查');

  // 未配置
  api.setConfig({ endpoint: '', key: '' });
  const hc1 = await api.healthCheck();
  assert(hc1.ok === false, '未配置时 ok=false');
  assertEq(hc1.error, '未配置', '错误信息正确');

  // 正常
  api.setConfig({ endpoint: 'https://api.test.com', key: 'sk-test', model: 'gpt-4o-mini' });
  mockResponse = {
    ok: true,
    choices: [{ message: { content: 'ok' } }],
    usage: {},
    model: 'gpt-4o-mini',
  };
  const hc2 = await api.healthCheck();
  assert(hc2.ok === true, '正常时 ok=true');
  assertEq(hc2.reply, 'ok', '回复正确');
  assert(typeof hc2.latency === 'number', '有延迟数据');

  // ============ 结果 ============
  console.log('\n' + '='.repeat(40));
  console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
  console.log('='.repeat(40));

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error('测试异常:', e);
  process.exit(1);
});
