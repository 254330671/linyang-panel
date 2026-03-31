# 部署命令记录 - 2026-03-26

## 服务器信息
- IP: 47.253.13.112
- 用户: admin
- 系统: OpenClaw (Alibaba Cloud Linux)

## 明天执行的命令（在服务器终端执行）

### 1. 更新面板文件（加PWA支持）
```
sudo curl -L -o /usr/share/nginx/html/index.html https://raw.githubusercontent.com/254330671/linyang-panel/main/index.html
sudo curl -L -o /usr/share/nginx/html/manifest.json https://raw.githubusercontent.com/254330671/linyang-panel/main/manifest.json
sudo curl -L -o /usr/share/nginx/html/service-worker.js https://raw.githubusercontent.com/254330671/linyang-panel/main/service-worker.js
```

### 2. 安装HTTPS证书（需要先配置DNS）
```
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d linyang.asia
```

### 3. DNS配置（阿里云域名控制台）
- 类型: A
- 主机记录: @
- 记录值: 47.253.13.112
- TTL: 600

## GitHub仓库
- URL: https://github.com/254330671/linyang-panel
- Token: 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

## 文件结构
- index.html - 主面板（38KB，响应式，PWA支持）
- manifest.json - PWA清单
- service-worker.js - 离线缓存
- CNAME - 域名 linyang.asia
