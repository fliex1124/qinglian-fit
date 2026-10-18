"""Free barcode lookup, with a local cache. No photos, keys, or meal history sent."""
import json
import math
import sqlite3
import urllib.error
import urllib.request
from contextlib import closing
from pathlib import Path

ROOT=Path(__file__).resolve().parent
CACHE_DB=ROOT/'.local/barcodes.sqlite3'

def valid_barcode(code):
    if not isinstance(code,str) or not code.isascii() or not code.isdigit() or len(code) not in (8,12,13,14):return False
    weighted=sum(int(n)*(3 if i%2==0 else 1) for i,n in enumerate(reversed(code[:-1])))
    return (10-weighted%10)%10==int(code[-1])

def normalize(code,product):
    n=product.get('nutriments') or {}
    def value(key,max_value):
        x=n.get(key)
        if isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or not 0<=x<=max_value:return None
        return round(float(x),2)
    kcal=value('energy-kcal_100g',1000)
    if kcal is None:
        kj=value('energy_100g',4200)
        if kj is not None:kcal=round(kj/4.184,1)
    result={'id':'barcode-'+code,'barcode':code,'name':str(product.get('product_name_zh') or product.get('product_name') or '未命名产品')[:160],
            'brand':str(product.get('brands') or '')[:100],'kcal':kcal,'protein':value('proteins_100g',100),
            'carbs':value('carbohydrates_100g',100),'fat':value('fat_100g',100),'basis':'100g',
            'source':'Open Food Facts（请核对实物营养标签）','sourceUrl':'https://world.openfoodfacts.org/product/'+code,
            # OFF's _100g suffix also means per 100ml for liquids. Ask the user
            # to check the actual label rather than infer density from a name.
            'estimated':True,'requiresUnitConfirmation':True,'servingGrams':100,'aliases':[]}
    result['missing']=[k for k in ['kcal','protein','carbs','fat'] if result[k] is None]
    return result

def lookup(code):
    if not valid_barcode(code):raise ValueError('请输入校验正确的8/12/13/14位商品条码。')
    CACHE_DB.parent.mkdir(exist_ok=True)
    with closing(sqlite3.connect(CACHE_DB)) as con,con:
        con.execute('CREATE TABLE IF NOT EXISTS products(code TEXT PRIMARY KEY,body TEXT)')
        row=con.execute('SELECT body FROM products WHERE code=?',(code,)).fetchone()
        if row:
            product=json.loads(row[0]);product['requiresUnitConfirmation']=True
            return {'found':True,'cached':True,'product':product}
    fields='product_name,product_name_zh,brands,nutriments'
    url=f'https://world.openfoodfacts.org/api/v2/product/{code}.json?fields={fields}'
    req=urllib.request.Request(url,headers={'User-Agent':'QinglianFIT/0.4 (personal local nutrition tracker)','Accept':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=12) as response:data=json.load(response)
    except urllib.error.HTTPError as ex:
        if ex.code==404:return {'found':False,'message':'数据库未收录此条码。请手动填写包装上的营养信息。'}
        raise
    if data.get('status')!=1 or not isinstance(data.get('product'),dict):
        return {'found':False,'message':'数据库未收录此条码。请手动填写包装上的营养信息。'}
    product=normalize(code,data['product'])
    with closing(sqlite3.connect(CACHE_DB)) as con,con:
        con.execute('INSERT OR REPLACE INTO products VALUES (?,?)',(code,json.dumps(product,ensure_ascii=False)))
    return {'found':True,'cached':False,'product':product}
