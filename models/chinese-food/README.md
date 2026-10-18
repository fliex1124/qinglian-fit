---
license: apache-2.0
base_model: microsoft/resnet-50
tags:
- image-classification
- pytorch
- chinese-food
- food-classification
datasets:
- ChineseFoodNet
language:
- en
- zh
metrics:
- accuracy
library_name: transformers
---

# Chinese Food Classification with ResNet-50 (ChineseFoodNet)

Fine-tuned ResNet-50 for Chinese food classification using the ChineseFoodNet dataset.
([Kaggle: ChineseFoodNet](https://www.kaggle.com/datasets/yihfeng/chinesefoodnet))

## Model Details
- **Base Model:** ResNet-50
- **Dataset:** ChineseFoodNet (101,565 images)
- **Classes:** 114 Chinese food categories
- **Test Accuracy:** 75.4%

## Performance
- **Test Accuracy:** 0.7536
- **Macro F1-Score:** 0.7409
- **Weighted F1-Score:** 0.7520

## Usage
```python
from transformers import AutoImageProcessor, ResNetForImageClassification
import torch
from PIL import Image

processor = AutoImageProcessor.from_pretrained("Albertbeta123/resnet-50-chinese-food")
model = ResNetForImageClassification.from_pretrained("Albertbeta123/resnet-50-chinese-food")

image = Image.open("chinese_food_image.jpg")
inputs = processor(image, return_tensors="pt")

with torch.no_grad():
    logits = model(**inputs).logits
    predicted_class_id = logits.argmax(-1).item()
    predicted_class = model.config.id2label[predicted_class_id]
    confidence = torch.nn.functional.softmax(logits, dim=-1).max().item()

print(f"Predicted: {predicted_class} ({confidence:.1%})")
```
