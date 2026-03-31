/**
 * AES-256-GCM 加密服务（纯 JS，浏览器 Web Crypto API）
 * 
 * 密钥派生：PBKDF2-SHA256，100000 轮，随机 16 字节盐
 * 加密算法：AES-256-GCM，随机 12 字节 IV
 * 密文格式：ENC:v2:base64(salt):base64(iv):base64(ciphertext+tag)
 * 
 * 使用方式：
 *   // 1. 设置密码
 *   await Encryption.setPassword('用户密码');
 *   
 *   // 2. 加密
 *   const encrypted = await Encryption.encrypt('敏感数据');
 *   
 *   // 3. 解密
 *   const plain = await Encryption.decrypt(encrypted);
 *   
 *   // 4. 与 localStorage 配合
 *   const wrapped = await Encryption.wrapForStorage('mood', JSON.stringify(moodData));
 *   localStorage.setItem('mood', wrapped);
 *   
 *   const raw = localStorage.getItem('mood');
 *   const unwrapped = await Encryption.unwrapFromStorage('mood', raw);
 *   const moodData = JSON.parse(unwrapped);
 */

const Encryption = (() => {
  // ============ 常量 ============
  const PBKDF2_ITERATIONS = 100000;
  const KEY_LENGTH = 256; // bits
  const SALT_LENGTH = 16; // bytes
  const IV_LENGTH = 12;   // bytes (GCM 推荐 12)
  const PREFIX = 'ENC:v2:';

  // 需要加密的数据 key（与设计文档一致）
  const ENCRYPTED_KEYS = [
    'mood',
    'moodHistory',
    'symptoms',
    'meds',
    'letters',
    'growthAlbum',
    'sleepLog',
    'periodLog',
    'healthProfile',
    'bodyRecords',
    'socialRecords',
  ];

  // ============ 状态 ============
  let _cryptoKey = null;  // CryptoKey 对象
  let _password = null;   // 明文密码（仅用于 verify）

  // ============ 工具函数 ============

  /** 字符串 → Uint8Array */
  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  /** Uint8Array → 字符串 */
  function bytesToStr(bytes) {
    return new TextDecoder().decode(bytes);
  }

  /** Uint8Array → base64 */
  function toBase64(bytes) {
    const bin = String.fromCharCode(...bytes);
    return btoa(bin);
  }

  /** base64 → Uint8Array */
  function fromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  /** 生成随机字节 */
  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  // ============ 密钥派生 ============

  /**
   * PBKDF2-SHA256 密钥派生
   * @param {string} password 
   * @param {Uint8Array} salt 
   * @returns {Promise<CryptoKey>}
   */
  async function deriveKey(password, salt) {
    // 先把密码导入为原始密钥材料
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      strToBytes(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // PBKDF2 派生 AES-GCM 密钥
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: KEY_LENGTH },
      false, // 不可导出
      ['encrypt', 'decrypt']
    );
  }

  // ============ 核心 API ============

  /**
   * 设置密码（派生密钥）
   * @param {string} password
   * @returns {Promise<void>}
   */
  async function setPassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('密码不能为空');
    }
    _password = password;
    // 预派生一个密钥用于快速验证，但实际加密每次用随机盐
    // 不缓存派生密钥，每次加密都用新盐重新派生
  }

  /** 检查是否已设置密码 */
  function isLocked() {
    return _password !== null && _password.length > 0;
  }

  /** 验证密码（通过尝试解密一个测试密文） */
  async function verifyPassword(password) {
    if (!_password) return false;
    // 简单比较（生产环境应该用密钥派生验证）
    return _password === password;
  }

  /** 清除密码 */
  function clearPassword() {
    _password = null;
    _cryptoKey = null;
  }

  /**
   * 加密数据
   * @param {string} plainText 明文
   * @returns {Promise<string>} 密文，格式：ENC:v2:base64(salt):base64(iv):base64(ciphertext+tag)
   */
  async function encrypt(plainText) {
    if (!isLocked()) return plainText;

    try {
      const salt = randomBytes(SALT_LENGTH);
      const iv = randomBytes(IV_LENGTH);

      // 派生密钥
      const key = await deriveKey(_password, salt);

      // AES-256-GCM 加密
      const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        strToBytes(plainText)
      );

      // 组装密文
      return PREFIX + toBase64(salt) + ':' + toBase64(iv) + ':' + toBase64(new Uint8Array(cipherBuffer));
    } catch (e) {
      console.error('AES-GCM Encrypt error:', e);
      return plainText; // 加密失败返回原文，避免数据丢失
    }
  }

  /**
   * 解密数据
   * @param {string} cipherText 密文
   * @returns {Promise<string>} 明文
   */
  async function decrypt(cipherText) {
    if (!isLocked()) return cipherText;

    try {
      // 兼容旧版 XOR 格式
      if (!cipherText.startsWith(PREFIX)) {
        if (cipherText.startsWith('ENC:')) {
          return decryptLegacy(cipherText.substring(4));
        }
        return cipherText; // 未加密的明文
      }

      // 解析密文
      const parts = cipherText.split(':');
      if (parts.length !== 5) return cipherText;

      const salt = fromBase64(parts[2]);
      const iv = fromBase64(parts[3]);
      const cipherBytes = fromBase64(parts[4]);

      // 派生密钥
      const key = await deriveKey(_password, salt);

      // AES-256-GCM 解密
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        cipherBytes
      );

      return bytesToStr(new Uint8Array(plainBuffer));
    } catch (e) {
      console.error('AES-GCM Decrypt error:', e);
      return cipherText; // 解密失败返回原文
    }
  }

  /**
   * 兼容旧版 XOR 解密
   * @param {string} cipherText 不带 "ENC:" 前缀的 base64 密文
   * @returns {string}
   */
  function decryptLegacy(cipherText) {
    try {
      const keyBytes = strToBytes(_password);
      const cipherBytes = fromBase64(cipherText);
      const decrypted = new Uint8Array(cipherBytes.length);
      for (let i = 0; i < cipherBytes.length; i++) {
        decrypted[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      return bytesToStr(decrypted);
    } catch (e) {
      console.error('Legacy XOR Decrypt error:', e);
      return cipherText;
    }
  }

  /**
   * 迁移旧版数据到 AES-256-GCM
   * @param {string} cipherText 
   * @returns {Promise<string>}
   */
  async function migrateFromLegacy(cipherText) {
    if (!isLocked()) return cipherText;
    if (cipherText.startsWith(PREFIX)) return cipherText;
    if (!cipherText.startsWith('ENC:')) return cipherText;

    const plainText = decryptLegacy(cipherText.substring(4));
    return encrypt(plainText);
  }

  // ============ localStorage 配合 ============

  /** 判断某个 key 是否需要加密 */
  function needsEncryption(key) {
    return ENCRYPTED_KEYS.includes(key);
  }

  /**
   * 存储前包装：需要加密则加密，不需要则原样返回
   * @param {string} key localStorage 的 key
   * @param {string} value 要存储的值（JSON 字符串等）
   * @returns {Promise<string>}
   */
  async function wrapForStorage(key, value) {
    if (needsEncryption(key) && isLocked()) {
      return encrypt(value);
    }
    return value;
  }

  /**
   * 读取后解包：如果是密文则解密，否则原样返回
   * @param {string} key localStorage 的 key
   * @param {string} value 读取到的值
   * @returns {Promise<string>}
   */
  async function unwrapFromStorage(key, value) {
    if (needsEncryption(key) && value && value.startsWith('ENC:')) {
      return decrypt(value);
    }
    return value;
  }

  /**
   * 批量迁移所有旧版加密数据
   * @param {Object} data {key: value} 对象
   * @returns {Promise<Object>}
   */
  async function migrateAll(data) {
    if (!isLocked()) return data;
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      if (needsEncryption(key) && typeof value === 'string') {
        result[key] = await migrateFromLegacy(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * 获取加密状态信息
   */
  function getStatus() {
    return {
      locked: isLocked(),
      encryptedKeys: [...ENCRYPTED_KEYS],
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
    };
  }

  // ============ 密码验证令牌 ============

  /**
   * 生成验证令牌（用于验证密码是否正确）
   * 加密一个固定字符串，存到 localStorage
   * 以后验证时解密对比
   * @returns {Promise<string>}
   */
  async function generateVerificationToken() {
    const token = 'ENC_VERIFY_' + Date.now();
    return encrypt(token);
  }

  /**
   * 通过验证令牌检查密码是否正确
   * @param {string} encryptedToken localStorage 里存的加密令牌
   * @param {string} password 待验证的密码
   * @returns {Promise<boolean>}
   */
  async function verifyWithToken(encryptedToken, password) {
    // 独立验证，不影响当前 _password 状态
    try {
      if (!encryptedToken.startsWith(PREFIX)) return false;
      const parts = encryptedToken.split(':');
      if (parts.length !== 5) return false;

      const salt = fromBase64(parts[2]);
      const iv = fromBase64(parts[3]);
      const cipherBytes = fromBase64(parts[4]);

      // 用待验证的密码派生密钥
      const key = await deriveKey(password, salt);
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        cipherBytes
      );
      const decrypted = bytesToStr(new Uint8Array(plainBuffer));
      return decrypted.startsWith('ENC_VERIFY_');
    } catch {
      return false;
    }
  }

  // ============ 密钥备份/恢复 ============

  /**
   * 导出加密密钥摘要（用于备份提示，不含真实密钥）
   * 仅提示用户备份密码，不导出任何密钥材料
   */
  function getBackupHint() {
    return {
      message: '请牢记您的加密密码。忘记密码后数据将无法恢复。',
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256 (' + PBKDF2_ITERATIONS + ' 轮)',
    };
  }

  // ============ 公开 API ============
  return {
    setPassword,
    isLocked,
    verifyPassword,
    clearPassword,
    encrypt,
    decrypt,
    migrateFromLegacy,
    needsEncryption,
    wrapForStorage,
    unwrapFromStorage,
    migrateAll,
    getStatus,
    generateVerificationToken,
    verifyWithToken,
    getBackupHint,
  };
})();

// 导出（支持 ES Module 和全局）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Encryption;
}
