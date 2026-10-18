"""CPU-only local Chinese food candidates. Never calls a model hub or cloud inference."""
import hashlib
import importlib.util
import io
import json
import os
import threading
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MODEL_DIR=ROOT/'models/chinese-food'
EXPECTED_SHA='301c5262348a25beeb782d11cbd083dfad8d478f92672ef5a237b4f557d79849'
EXPECTED_SIZE=95221032
_model=None
_lock=threading.Lock()
LABELS='''麻婆豆腐|家常豆腐|炸豆腐|豆腐|臭豆腐|炒土豆丝|香煎土豆|香煎土豆|土豆炖豆角|地三鲜|薯条|鱼香茄子|蒜泥茄子|肉末茄子|辣白菜|酸白菜|清蒸娃娃菜|手撕包菜|蚝油生菜|炒青菜|蒜蓉空心菜|蒜蓉生菜|清炒菠菜|清炒豆芽|炒蚕豆|毛豆|蚝油西兰花|炸藕片|凉拌藕片|凉拌番茄|鸡胗|凉拌木耳|拍黄瓜|花生|凉拌海带|拔丝山药|清炒山药|干煸四季豆|清炒蘑菇|苦瓜酿肉|清炒苦瓜|虎皮青椒|凉拌腐竹|干锅花菜|松仁玉米|香菇青菜|卤香菇|芹菜炒豆干|百合炒芹菜|韭菜炒豆干|番茄炒蛋|韭菜炒蛋|黄瓜炒蛋|蒸蛋羹|卤猪肝|卤猪耳|叉烧|粉蒸肉|糖醋排骨|海带炖排骨|可乐鸡翅|泡椒凤爪|豉汁凤爪|口水鸡|烧鹅|白切鸡|大盘鸡|香菇蒸鸡|黄焖鸡|豉油鸡|辣子鸡|宫保鸡丁|三杯鸡|手撕鸡|炸鸡腿|啤酒鸭|爆炒腰花|红烧肉|红烧牛肉|酱牛肉|番茄牛腩|土豆炖牛腩|杭椒牛柳|梅菜扣肉|回锅肉|猪肉炖粉条|水煮肉片|糖醋里脊|酥炸糖醋肉|锅包肉|蔬菜炒肉丝|黄花菜炒肉|京酱肉丝|豆角肉丝|红烧猪蹄|炒牛肚|青椒肉丝|鱼香肉丝|木耳炒肉|木须肉|莴笋肉丝|蚂蚁上树|孜然羊肉|羊肉串|葱爆羊肉|红烧狮子头|酸菜鱼|烤鱼|糖醋鱼|松鼠桂鱼|红烧带鱼|剁椒鱼头|水煮鱼|清蒸鲈鱼'''.split('|')

def status():
    present=(MODEL_DIR/'model.safetensors').exists() and (MODEL_DIR/'model.safetensors').stat().st_size==EXPECTED_SIZE
    deps=all(importlib.util.find_spec(m) is not None for m in ['torch','transformers','PIL','numpy'])
    return {'ready':present and deps,'model':'ChineseFoodNet ResNet-50','classes':114,'localOnly':True,
            'message':'本机CPU推理，仅提供待确认候选，无法称重或测量用油。' if present and deps else '本地模型或运行依赖未准备好，请使用手动选择。'}

def predict(raw):
    global _model
    if not status()['ready']:raise RuntimeError('本地模型未准备好，请手动选择食物。')
    with _lock:
        os.environ['HF_HUB_OFFLINE']='1'
        os.environ['TRANSFORMERS_OFFLINE']='1'
        os.environ.setdefault('HF_HOME',str(ROOT/'.local/hf-cache'))
        import numpy as np
        import torch
        from PIL import Image,ImageOps
        from transformers import ResNetForImageClassification
        if _model is None:
            if hashlib.sha256((MODEL_DIR/'model.safetensors').read_bytes()).hexdigest()!=EXPECTED_SHA:
                raise RuntimeError('本地模型校验失败，请使用手动选择。')
            torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
            _model=ResNetForImageClassification.from_pretrained(str(MODEL_DIR),local_files_only=True,use_safetensors=True).eval()
        with Image.open(io.BytesIO(raw)) as image:
            if image.width*image.height>20_000_000:raise ValueError('图片尺寸过大')
            image=ImageOps.exif_transpose(image).convert('RGB')
            # Published ConvNextImageProcessor: shortest edge 224 / .875, then center crop 224.
            w,h=image.size;scale=256/min(w,h)
            image=image.resize((int(w*scale),int(h*scale)),Image.Resampling.BICUBIC)
            w,h=image.size;image=image.crop(((w-224)//2,(h-224)//2,(w-224)//2+224,(h-224)//2+224))
            array=np.array(image,dtype=np.float32)/255.0
        array=(array-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
        tensor=torch.from_numpy(array.transpose(2,0,1).copy()).unsqueeze(0)
        with torch.inference_mode():probabilities=_model(pixel_values=tensor).logits.softmax(-1)[0]
        scores,indices=torch.topk(probabilities,5)
        candidates=[{'name':LABELS[int(i)],'score':round(float(s),5),'classId':int(i)} for s,i in zip(scores,indices)]
        confident=candidates[0]['score']>=.70 and candidates[0]['score']-candidates[1]['score']>=.15
        # A closed-set classifier also assigns labels to non-food images. A high softmax
        # score is not proof that the photo contains food, nor a confirmed identification.
        return {'recognized':False,'candidateConfidence':'high' if confident else 'low','requiresConfirmation':True,
                'candidates':candidates,'localOnly':True,'model':'ChineseFoodNet ResNet-50',
                'message':'已生成待确认候选。此模型也可能误判非食物图片；请核对种类、重量与用油，不匹配时手动选择。' if confident else '无法可靠识别这张图片。下列仅为低置信度候选，请手动选择食物。'}
