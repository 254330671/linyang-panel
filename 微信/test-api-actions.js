/**
 * API调用 + 动作链接 端到端测试
 * 
 * 测试完整流程：用户输入 → AI解析 → 动作链接生成 → 待办创建
 */

// ============ Mock ============
class MockStorage {
  constructor() { this._data = {}; }
  getItem(k) { return this._data[k] || null; }
  setItem(k, v) { this._data[k] = String(v); }
}

// ============ 动作链接构建器（从 index.html 提取）============
const actionBuilders = {
  navigation: function(loc) {
    return 'https://uri.amap.com/navigation?to=&mode=car&keyword=' + encodeURIComponent(loc);
  },
  shopping: function(kw) {
    return {
      taobao: 'https://s.taobao.com/search?q=' + encodeURIComponent(kw),
      jd: 'https://search.jd.com/Search?keyword=' + encodeURIComponent(kw),
    };
  },
  call: function(phone) {
    return 'tel:' + phone;
  },
  mail: function(email) {
    return 'mailto:' + (email || '');
  },
  movie: function(kw) {
    return 'https://m.maoyan.com/search?kw=' + encodeURIComponent(kw || '电影');
  },
  food: function(kw) {
    return 'https://www.dianping.com/search/keyword/1/0_' + encodeURIComponent(kw || '美食');
  },
  health: function(kw) {
    return 'https://www.guahao.com/search?q=' + encodeURIComponent(kw || '');
  },
  study: function(kw) {
    return 'https://search.douban.com/book/subject_search?search_text=' + encodeURIComponent(kw || '');
  },
};

function buildActionUrls(parsed) {
  var urls = [];
  if (!parsed.actions || !parsed.actions.length) return urls;
  parsed.actions.forEach(function(a) {
    if (a === 'navigation' && parsed.location) urls.push({ type: 'navigation', url: actionBuilders.navigation(parsed.location), label: '导航到 ' + parsed.location });
    else if (a === 'shopping' && parsed.keyword) {
      var s = actionBuilders.shopping(parsed.keyword);
      urls.push({ type: 'shopping', url: s.taobao, label: '淘宝搜 ' + parsed.keyword });
      urls.push({ type: 'shopping', url: s.jd, label: '京东搜 ' + parsed.keyword });
    }
    else if (a === 'call' && parsed.contact) urls.push({ type: 'call', url: actionBuilders.call(parsed.contact), label: '拨打 ' + parsed.contact });
    else if (a === 'mail' && parsed.contact) urls.push({ type: 'mail', url: actionBuilders.mail(parsed.contact), label: '发邮件 ' + parsed.contact });
    else if (a === 'movie') urls.push({ type: 'movie', url: actionBuilders.movie(parsed.keyword), label: '猫眼搜电影' });
    else if (a === 'food') urls.push({ type: 'food', url: actionBuilders.food(parsed.keyword), label: '大众点评搜美食' });
    else if (a === 'health' && parsed.keyword) urls.push({ type: 'health', url: actionBuilders.health(parsed.keyword), label: '挂号搜 ' + parsed.keyword });
    else if (a === 'study' && parsed.keyword) urls.push({ type: 'study', url: actionBuilders.study(parsed.keyword), label: '豆瓣搜 ' + parsed.keyword });
  });
  return urls;
}

// ============ 测试工具 ============
let passed = 0, failed = 0;
function assert(condition, testName) {
  if (condition) { console.log('  ✅ ' + testName); passed++; }
  else { console.log('  ❌ ' + testName); failed++; }
}
function assertContains(str, sub, testName) {
  assert(str.indexOf(sub) > -1, testName + ' (含 "' + sub + '")');
}
function assertUrlValid(url, testName) {
  try { new URL(url); assert(true, testName); }
  catch { assert(false, testName + ' (无效URL: ' + url + ')'); }
}

// ============ Mock fetch ============
let mockResponse = null;
let mockFetchCalls = [];
global.fetch = function(url, opts) {
  mockFetchCalls.push({ url: url, body: opts?.body, time: Date.now() });
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockResponse),
    text: () => Promise.resolve(JSON.stringify(mockResponse)),
  });
};

const { ApiService } = require('./api-service.js');

async function runTests() {
  console.log('🔗 API调用 + 动作链接 端到端测试\n');

  const storage = new MockStorage();
  const api = new ApiService({ storage });
  api.setConfig({ endpoint: 'https://api.deepseek.com/chat/completions', key: 'sk-test', model: 'deepseek-chat' });

  // ==========================================
  // 第一部分：动作链接生成
  // ==========================================
  console.log('📋 第一部分：动作链接生成');

  // 1. 导航
  var nav = buildActionUrls({ actions: ['navigation'], location: '北京天安门' });
  assert(nav.length === 1, '导航：生成 1 条');
  assertUrlValid(nav[0].url, '导航：URL 有效');
  assertContains(nav[0].url, 'amap.com', '导航：高德链接');
  assertContains(nav[0].url, encodeURIComponent('北京天安门'), '导航：包含目的地编码');

  // 2. 购物（同时生成淘宝+京东）
  var shop = buildActionUrls({ actions: ['shopping'], keyword: '剃须刀' });
  assert(shop.length === 2, '购物：生成 2 条（淘宝+京东）');
  assertContains(shop[0].url, 'taobao.com', '购物：淘宝链接');
  assertContains(shop[1].url, 'jd.com', '购物：京东链接');
  assertContains(shop[0].url, encodeURIComponent('剃须刀'), '购物：包含关键词编码');

  // 3. 打电话
  var call = buildActionUrls({ actions: ['call'], contact: '13800138000' });
  assert(call.length === 1, '电话：生成 1 条');
  assertContains(call[0].url, 'tel:13800138000', '电话：tel: 协议');

  // 4. 邮件
  var mail = buildActionUrls({ actions: ['mail'], contact: 'test@example.com' });
  assert(mail.length === 1, '邮件：生成 1 条');
  assertContains(mail[0].url, 'mailto:test@example.com', '邮件：mailto: 协议');

  // 5. 电影
  var movie = buildActionUrls({ actions: ['movie'], keyword: '流浪地球' });
  assert(movie.length === 1, '电影：生成 1 条');
  assertContains(movie[0].url, 'maoyan.com', '电影：猫眼链接');
  assertContains(movie[0].url, encodeURIComponent('流浪地球'), '电影：包含关键词编码');

  // 6. 美食
  var food = buildActionUrls({ actions: ['food'], keyword: '火锅' });
  assert(food.length === 1, '美食：生成 1 条');
  assertContains(food[0].url, 'dianping.com', '美食：大众点评链接');

  // 7. 挂号
  var health = buildActionUrls({ actions: ['health'], keyword: '骨科' });
  assert(health.length === 1, '挂号：生成 1 条');
  assertContains(health[0].url, 'guahao.com', '挂号：挂号网链接');

  // 8. 学习
  var study = buildActionUrls({ actions: ['study'], keyword: 'Python' });
  assert(study.length === 1, '学习：生成 1 条');
  assertContains(study[0].url, 'douban.com', '学习：豆瓣链接');

  // 9. 多动作组合
  var multi = buildActionUrls({ actions: ['navigation', 'call'], location: '协和医院', contact: '120' });
  assert(multi.length === 2, '多动作：2 个动作 2 条链接');

  // 10. 无动作
  var empty = buildActionUrls({ actions: [], location: 'test' });
  assert(empty.length === 0, '空动作：0 条链接');

  // 11. 缺少必填字段（如 navigation 没有 location）
  var noLoc = buildActionUrls({ actions: ['navigation'] });
  assert(noLoc.length === 0, '缺少 location：不生成导航链接');

  // ==========================================
  // 第二部分：AI 待办解析（Mock API）
  // ==========================================
  console.log('\n📋 第二部分：AI 待办解析（Mock API）');

  // 场景 1：简单待办 + 导航
  mockFetchCalls = [];
  mockResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [{
            t: '去协和医院取报告',
            dl: '今天17:00前',
            time: '2026-03-29T17:00',
            cat: 'health',
            actions: ['navigation'],
            location: '协和医院',
            keyword: '',
            contact: '',
            remind_min: 30,
          }],
          follow_up: '',
        }),
      },
    }],
    usage: { total_tokens: 150 },
  };

  var r1 = await api.parseTodo('下午5点前去协和医院取报告');
  assert(r1.todos.length === 1, '场景1：解析 1 个待办');
  assert(r1.todos[0].t === '去协和医院取报告', '场景1：标题正确');
  assert(r1.todos[0].cat === 'health', '场景1：分类=health');
  var r1Links = buildActionUrls(r1.todos[0]);
  assert(r1Links.length === 1, '场景1：1 条动作链接');
  assertContains(r1Links[0].url, 'amap.com', '场景1：导航链接');
  assertContains(r1Links[0].url, encodeURIComponent('协和医院'), '场景1：目的地');

  // 场景 2：购物 + 多待办拆分
  mockFetchCalls = [];
  mockResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [
            { t: '买剃须刀', dl: '', time: null, cat: 'life', actions: ['shopping'], keyword: '剃须刀', location: '', contact: '', remind_min: 0 },
            { t: '买牛奶', dl: '', time: null, cat: 'life', actions: ['shopping'], keyword: '牛奶', location: '', contact: '', remind_min: 0 },
          ],
          follow_up: '',
        }),
      },
    }],
    usage: {},
  };

  var r2 = await api.parseTodo('买剃须刀和牛奶');
  assert(r2.todos.length === 2, '场景2：拆分 2 个待办');
  var r2Links0 = buildActionUrls(r2.todos[0]);
  assert(r2Links0.length === 2, '场景2：淘宝+京东共 2 条');
  assertContains(r2Links0[0].url, 'taobao.com', '场景2：淘宝');
  assertContains(r2Links0[1].url, 'jd.com', '场景2：京东');

  // 场景 3：打电话
  mockFetchCalls = [];
  mockResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [{ t: '给妈妈打电话', dl: '晚上8点', time: '2026-03-29T20:00', cat: 'social', actions: ['call'], contact: '13800138000', keyword: '', location: '', remind_min: 15 }],
          follow_up: '',
        }),
      },
    }],
    usage: {},
  };

  var r3 = await api.parseTodo('晚上8点给妈妈打电话 13800138000');
  assert(r3.todos[0].actions[0] === 'call', '场景3：动作=call');
  var r3Links = buildActionUrls(r3.todos[0]);
  assertContains(r3Links[0].url, 'tel:13800138000', '场景3：tel: 链接');

  // 场景 4：发邮件
  mockFetchCalls = [];
  mockResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [{ t: '回复客户邮件', dl: '明天上午', time: '2026-03-30T10:00', cat: 'work', actions: ['mail'], contact: 'client@company.com', keyword: '', location: '', remind_min: 30 }],
          follow_up: '',
        }),
      },
    }],
    usage: {},
  };

  var r4 = await api.parseTodo('明天上午回复客户邮件 client@company.com');
  var r4Links = buildActionUrls(r4.todos[0]);
  assertContains(r4Links[0].url, 'mailto:client@company.com', '场景4：mailto: 链接');

  // 场景 5：电影 + 美食（约会场景）
  mockFetchCalls = [];
  mockResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [
            { t: '看电影流浪地球', dl: '周六晚上', time: '2026-03-29T19:00', cat: 'leisure', actions: ['movie'], keyword: '流浪地球', location: '', contact: '', remind_min: 60 },
            { t: '吃火锅', dl: '周六', time: null, cat: 'leisure', actions: ['food'], keyword: '火锅', location: '', contact: '', remind_min: 0 },
          ],
          follow_up: '需要我帮你查附近的火锅店吗？',
        }),
      },
    }],
    usage: {},
  };

  var r5 = await api.parseTodo('周六晚上看流浪地球，顺便吃火锅');
  assert(r5.todos.length === 2, '场景5：2 个待办');
  assert(r5.follow_up.includes('火锅'), '场景5：AI 追问');
  var r5Links0 = buildActionUrls(r5.todos[0]);
  assertContains(r5Links0[0].url, 'maoyan.com', '场景5：猫眼链接');
  var r5Links1 = buildActionUrls(r5.todos[1]);
  assertContains(r5Links1[0].url, 'dianping.com', '场景5：大众点评链接');

  // 场景 6：学习 + 挂号
  mockFetchCalls = [];
  mockResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          todos: [
            { t: '看Python入门书', dl: '', time: null, cat: 'study', actions: ['study'], keyword: 'Python入门', location: '', contact: '', remind_min: 0 },
          ],
          follow_up: '',
        }),
      },
    }],
    usage: {},
  };

  var r6 = await api.parseTodo('找本Python入门的书看看');
  var r6Links = buildActionUrls(r6.todos[0]);
  assertContains(r6Links[0].url, 'douban.com', '场景6：豆瓣搜索');
  assertContains(r6Links[0].url, encodeURIComponent('Python入门'), '场景6：关键词');

  // ==========================================
  // 第三部分：特殊字符 + 边界
  // ==========================================
  console.log('\n📋 第三部分：特殊字符 + 边界');

  // URL 编码正确性
  var navSpecial = buildActionUrls({ actions: ['navigation'], location: '北京大学附属医院&门诊部' });
  assert(!navSpecial[0].url.includes('&门诊'), 'URL编码：& 被编码');
  assertContains(navSpecial[0].url, encodeURIComponent('北京大学附属医院&门诊部'), 'URL编码：完整编码');

  var shopSpecial = buildActionUrls({ actions: ['shopping'], keyword: 'iPhone 16 Pro Max 256G' });
  assertContains(shopSpecial[0].url, encodeURIComponent('iPhone 16 Pro Max 256G'), 'URL编码：空格+大小写');

  // 空关键词
  var noKw = buildActionUrls({ actions: ['health'], keyword: '' });
  assert(noKw.length === 0, '空关键词：不生成链接（keyword 为空字符串）');

  // 省略关键词（undefined）
  var noKw2 = buildActionUrls({ actions: ['health'] });
  assert(noKw2.length === 0, '省略关键词：不生成链接');

  // ==========================================
  // 第四部分：API 请求格式验证
  // ==========================================
  console.log('\n📋 第四部分：API 请求格式验证');

  mockFetchCalls = [];
  mockResponse = { choices: [{ message: { content: JSON.stringify({ todos: [{ t: 'test', dl: '', time: null, cat: 'other', actions: [] }], follow_up: '' }) } }], usage: {} };
  await api.parseTodo('测试请求格式');

  assert(mockFetchCalls.length === 1, '调用了 1 次 API');
  var reqBody = JSON.parse(mockFetchCalls[0].body);
  assert(reqBody.model === 'deepseek-chat', '请求：model 正确');
  assert(reqBody.messages.length === 2, '请求：system + user 共 2 条');
  assert(reqBody.messages[0].role === 'system', '请求：[0] 是 system');
  assert(reqBody.messages[1].role === 'user', '请求：[1] 是 user');
  assertContains(reqBody.messages[0].content, 'JSON', '请求：system prompt 包含 JSON');
  assertContains(reqBody.messages[0].content, 'actions', '请求：system prompt 包含 actions');
  assert(reqBody.temperature === 0.3, '请求：temperature=0.3（低随机）');

  // ==========================================
  // 结果
  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log('✅ 通过: ' + passed + '  ❌ 失败: ' + failed);
  console.log('='.repeat(50));
  if (failed > 0) process.exit(1);
}

runTests().catch(e => { console.error('测试异常:', e); process.exit(1); });
