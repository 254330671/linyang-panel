/**
 * encryption.js 单元测试
 * 测试 AES-256-GCM 加密模块的完整流程
 */

// Node.js 环境补丁：Web Crypto API + TextEncoder/TextDecoder
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// 加载加密模块
const Encryption = require('./encryption.js');

// 测试工具
let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('🔐 AES-256-GCM 加密模块测试\n');

  // ============ 测试 1：基础加解密 ============
  console.log('📋 测试 1：基础加解密');
  await Encryption.setPassword('test123');
  
  const plain = '你好世界 Hello World 123 !@#';
  const encrypted = await Encryption.encrypt(plain);
  
  assert(encrypted.startsWith('ENC:v2:'), '密文格式正确 (ENC:v2: 前缀)');
  assert(encrypted !== plain, '密文与明文不同');
  assert(encrypted.split(':').length === 5, '密文有 5 个部分');
  
  const decrypted = await Encryption.decrypt(encrypted);
  assert(decrypted === plain, '解密后与原文一致');

  // ============ 测试 2：无密码时明文通过 ============
  console.log('\n📋 测试 2：无密码时不加密');
  Encryption.clearPassword();
  
  const noEncrypt = await Encryption.encrypt('test');
  assert(noEncrypt === 'test', '无密码时 encrypt 返回原文');
  
  const noDecrypt = await Encryption.decrypt('test');
  assert(noDecrypt === 'test', '无密码时 decrypt 返回原文');

  // ============ 测试 3：每次加密结果不同（随机盐/IV）============
  console.log('\n📋 测试 3：随机盐/IV');
  await Encryption.setPassword('same-password');
  
  const e1 = await Encryption.encrypt('same-text');
  const e2 = await Encryption.encrypt('same-text');
  assert(e1 !== e2, '相同明文加密结果不同（随机盐/IV）');
  
  const d1 = await Encryption.decrypt(e1);
  const d2 = await Encryption.decrypt(e2);
  assert(d1 === 'same-text' && d2 === 'same-text', '两者都能正确解密');

  // ============ 测试 4：不同密码解密失败 ============
  console.log('\n📋 测试 4：密码验证');
  await Encryption.setPassword('correct-password');
  const secret = await Encryption.encrypt('secret-data');
  
  await Encryption.setPassword('wrong-password');
  try {
    const wrongDecrypt = await Encryption.decrypt(secret);
    // 解密应该失败，返回原文（密文格式不匹配）
    assert(wrongDecrypt !== 'secret-data', '错误密码解密失败（数据不泄露）');
  } catch {
    assert(true, '错误密码解密抛出异常（安全）');
  }

  // ============ 测试 5：加密 key 判断 ============
  console.log('\n📋 测试 5：加密 key 判断');
  assert(Encryption.needsEncryption('mood') === true, 'mood 需要加密');
  assert(Encryption.needsEncryption('symptoms') === true, 'symptoms 需要加密');
  assert(Encryption.needsEncryption('weather') === false, 'weather 不加密');
  assert(Encryption.needsEncryption('todos') === false, 'todos 不加密');

  // ============ 测试 6：wrapForStorage / unwrapFromStorage ============
  console.log('\n📋 测试 6：localStorage 包装');
  await Encryption.setPassword('storage-test');
  
  const moodJson = '{"mood":"😊","score":4}';
  const wrapped = await Encryption.wrapForStorage('mood', moodJson);
  assert(wrapped !== moodJson, 'mood 数据被加密');
  assert(wrapped.startsWith('ENC:v2:'), 'mood 密文格式正确');
  
  const unwrapped = await Encryption.unwrapFromStorage('mood', wrapped);
  assert(unwrapped === moodJson, 'mood 数据解密后一致');
  
  const weatherJson = '{"city":"Shanghai"}';
  const weatherWrapped = await Encryption.wrapForStorage('weather', weatherJson);
  assert(weatherWrapped === weatherJson, 'weather 数据不加密');

  // ============ 测试 7：空字符串/特殊字符 ============
  console.log('\n📋 测试 7：特殊数据');
  
  const special = '{"emoji":"🎉","newline":"a\nb","quote":"\"hello\"","unicode":"中文测试"}';
  const encSpecial = await Encryption.encrypt(special);
  const decSpecial = await Encryption.decrypt(encSpecial);
  assert(decSpecial === special, '特殊字符（emoji/换行/引号/中文）正确加解密');

  // ============ 测试 8：大文本 ============
  console.log('\n📋 测试 8：大文本');
  const bigText = 'x'.repeat(10000);
  const encBig = await Encryption.encrypt(bigText);
  const decBig = await Encryption.decrypt(encBig);
  assert(decBig === bigText, '10KB 文本正确加解密');

  // ============ 测试 9：状态检查 ============
  console.log('\n📋 测试 9：状态');
  await Encryption.setPassword('status-test');
  const status = Encryption.getStatus();
  assert(status.locked === true, '状态：已锁定');
  assert(status.algorithm === 'AES-256-GCM', '算法：AES-256-GCM');
  assert(status.kdf === 'PBKDF2-SHA256', 'KDF：PBKDF2-SHA256');
  assert(status.iterations === 100000, '迭代：100000');

  // ============ 测试 10：密码验证令牌 ============
  console.log('\n📋 测试 10：密码验证令牌');
  await Encryption.setPassword('verify-test');
  const token = await Encryption.generateVerificationToken();
  assert(token.startsWith('ENC:v2:'), '验证令牌已加密');
  
  const valid = await Encryption.verifyWithToken(token, 'verify-test');
  assert(valid === true, '正确密码验证通过');
  
  const invalid = await Encryption.verifyWithToken(token, 'wrong-password');
  assert(invalid === false, '错误密码验证失败');

  // ============ 结果 ============
  console.log('\n' + '='.repeat(40));
  console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
  console.log('='.repeat(40));
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('测试异常:', e);
  process.exit(1);
});
