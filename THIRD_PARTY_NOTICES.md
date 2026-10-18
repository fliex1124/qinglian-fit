# 第三方素材与来源

## 动作图库

18 个动作使用 [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) 的照片与资料。来源项目标为 Unlicense，原文保存在 [exercise-library-LICENSE](assets/exercise-library-LICENSE)。各动作来源、图片路径和 SHA256 见 [exercise-guides.json](assets/exercise-guides.json) 及 [exercise-candidates.json](assets/exercise-candidates.json)。

`roman-chair-reference.jpg` 为项目使用者提供的「反向山羊挺身卷腹」教学参考图，沿用已有动作定义。本地未附作者或再分发许可证证明；它不包含在上述图库的 Unlicense 声明内，本仓库也不对其另行授予使用许可。

## 可选食物模型

[Albertbeta123/resnet-50-chinese-food](https://huggingface.co/Albertbeta123/resnet-50-chinese-food)，固定版本 `1ce5801e5905f15de1c4e55c89ef2a8cd6d6a97c`，来源模型卡标注 Apache-2.0。基础模型为 Microsoft ResNet-50，训练集为 ChineseFoodNet。配置和下载来源见 `models/chinese-food/` 与 `scripts/download-food-model.py`。本仓库和 APK 不附模型权重；来源测试指标不代表本 APP 的独立准确率测试。

## 条码及 AI

条码查询使用 [Open Food Facts](https://world.openfoodfacts.org/)。数据与图片许可由来源提供，项目不复制完整产品数据库或个人缓存。千问为用户自行配置的外部服务，本项目不提供模型、密钥或免费额度。

OpenGym 仅用于产品设计参考，未复制其代码或受单独授权约束的动画，见 [参考评估](OpenGym参考评估.md)。以上说明不构成对整个项目的开源授权。
