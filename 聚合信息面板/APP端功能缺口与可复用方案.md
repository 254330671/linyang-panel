# APP端功能缺口与可复用方案

> 独立文档，供后续提取使用
> 创建日期：2026-03-30
> 适用：Android APK

---

## 一、原生能力（零成本）

| 功能 | Android方案 | 可做什么 |
|------|------------|---------|
| **位置** | Location API | 周边推荐、到达提醒 |
| **相机** | Camera API | 扫码、拍照OCR |
| **语音** | SpeechRecognizer / TTS | 语音输入待办、语音播报 |
| **传感器** | 步数/心率/陀螺仪 | 运动追踪 |
| **NFC** | NFC API | 门禁卡、公交卡读取 |
| **蓝牙** | BLE API | 连接智能设备 |
| **推送** | FCM / 极光推送 | 提醒通知 |

---

## 二、低成本SDK

| 功能 | SDK | 费用 |
|------|-----|------|
| **地图** | 高德SDK / 百度SDK | 免费额度大 |
| **扫码** | ZXing / ML Kit | 免费 |
| **OCR** | ML Kit / 百度OCR | 免费额度 |
| **推送** | 极光推送 | 免费 |
| **分享** | 微信SDK / 系统分享 | 免费 |
| **支付** | 微信/支付宝SDK | 免费（需商户资质） |

---

## 三、推荐立即加入的功能

### 1. 扫码比价
- 相机扫商品条形码
- 解析商品名称
- 跳转淘宝/京东/拼多多搜索

### 2. 语音记账
- 语音输入"午饭花了25"
- AI解析分类+金额
- 自动记账

### 3. 拍照记发票
- OCR识别金额、商家、日期
- 自动填充记账表单

### 4. 步数同步
- 读取手机计步数据
- 同步到运动习惯模块
- 达标自动打卡

### 5. 到达提醒
- GPS检测到达指定地点
- 推送待办提醒（"你到超市了，记得买牛奶"）

---

## 四、技术要点

### 扫码比价
```kotlin
// 使用ZXing或ML Kit扫描条形码
val barcode = scanner.scan(image)
// 解析商品名称
val productName = lookupBarcode(barcode)
// 生成各平台搜索Intent
val intents = listOf(
    Intent(Intent.ACTION_VIEW, Uri.parse("taobao://s.taobao.com?q=$productName")),
    Intent(Intent.ACTION_VIEW, Uri.parse("openapp.jdmobile://virtual?params={...}")),
    Intent(Intent.ACTION_VIEW, Uri.parse("pinduoduo://search?keyword=$productName"))
)
```

### 语音记账
```kotlin
// 使用Android SpeechRecognizer
val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
// 识别结果示例："午饭花了25"
// AI解析：category=餐饮, amount=25, note=午饭
```

### 步数同步
```kotlin
// 使用Google Fit API或Sensor API
val sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
```

---

## 五、排除功能

- ❌ **NFC快捷操作** — 暂不加入

---

*最后更新：2026-03-30*
*状态：功能清单整理完成，待开发*
