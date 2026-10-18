# 轻练FIT 0.6.0 手机个人AI直连

保留现有项目和数据结构，新增手机自填密钥直连千问，无需服务器或电脑常开。

## 实现

- 原生 `PersonalAI.java`：设置/费用弹窗、Keystore AES/GCM、本机共享调用次数、HTTP转发、取消与结果验证。
- `AiPolicy.java`：北京官方HTTPS地址白名单及固定路径校验，拒绝重定向、userinfo、额外端口、query和fragment。
- `MainActivity.java`：桥接非敏感状态及异步业务结果，不向网页提供密钥。
- `mobile-bootstrap.js`：原路由转原生请求、取消、超时与回调清理；无新桥时旧版明确不可用。
- `mobile-ai.js`：手机配置入口、连接测试、开关同步、聊天迟到响应保护；导入AI=true不启用原生。
- `mobile-app.js`：支持新桥时开放AI页面和增强表单；本地图片模型仍明确待补。
- `nutrition.js`：手机费用确认交给原生；现有待确认结果与手动保存保留。
- `index.html`、`server.py`：载入/允许新资源；电脑继续原有接口。
- manifest、构建与校验脚本：版本60/0.6.0，52个资源，沿用包名、签名和存储键。

## 验证边界

Node模拟AI19组、JVM策略26项、浏览器模拟原生AI19项和原有回归通过；APK编译、签名及资源哈希校验。真实手机、原生Keystore/确认框及真实千问联网尚未验证，不使用聊天截图中的密钥。

## 使用

先导出备份，覆盖安装新版；AI → 配置密钥与接口 → 填新Key及控制台OpenAI兼容Base URL → 保存 → 主动开启 → 测试连接并确认费用。默认聊天qwen-plus、图片qwen3-vl-plus，每天10次共享，失败计次。新Key仅在手机原生窗口输入。
