# OpenClaw 内置方案分析

> 整理：2026-03-28
> 状态：备用，暂不实施

---

## 基本信息

- OpenClaw 是 MIT 协议开源项目，可商用
- 本质是 Node.js 服务端应用（Gateway），不是前端库
- 设计为单用户个人助手，跑在自己的设备上
- 通过 API 调用各种 LLM（OpenAI/DeepSeek 等）
- GitHub: https://github.com/openclaw/openclaw

## 四种内置方式

### 方式一：用户自己部署，App 连接

```
App → 用户的 OpenClaw Gateway → LLM
```

- 用户填自己的 Gateway 地址
- 数据完全在用户手里
- 缺点：部署门槛高

### 方式二：你统一部署，App 调你的服务

```
App → 你的服务器（OpenClaw） → LLM
```

- 你跑 OpenClaw，暴露 API
- 用户零门槛
- 缺点：你承担成本，数据过你服务器

### 方式三：不用 OpenClaw，直接调 LLM

```
App → 你的后端 → LLM API
```

- 最简单最轻量
- 现阶段已经在这么做（AI 解析待办）
- 没有记忆/技能/多平台能力

### 方式四：App 内嵌 OpenClaw

- ❌ Node.js 在手机上跑不现实
- ❌ iOS 限制后台进程
- 结论：不推荐

## 推荐路径

| 阶段 | 方案 |
|------|------|
| 网页版 | 方式三，直接调 LLM API |
| App 初版 | 用户填 API Key 直连 LLM |
| App 后期 | 在服务器部署 OpenClaw，提供"托管 AI"选项 |
| Pro 功能 | 解锁 OpenClaw 高级能力（记忆/技能/多平台同步） |

## 备选收费思路

- 免费用户：填自己的 API Key
- Pro 用户：用你提供的 OpenClaw 托管服务（记忆/技能/多平台联动）
- 这样 OpenClaw 成为 Pro 的增值服务卖点
