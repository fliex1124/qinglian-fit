import concurrent.futures
import importlib
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import server

class Response:
    def __init__(self,answer): self.answer=answer
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def read(self,*args): return json.dumps({'choices':[{'message':{'content':self.answer}}]}).encode()

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        server.USAGE_DB=Path(cls.tmp.name)/'calls.sqlite3'
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.http.server_port}'
    @classmethod
    def tearDownClass(cls): cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()
    def setUp(self):
        server.FOOD_AI_TOKEN=None
    def enable_food_ai(self,request=None):
        status,body=(request or self.request)('/api/food-ai-control', {'enabled':True})
        self.assertEqual(status,200)
        return {'X-Fit-Food-Consent':json.loads(body)['token']}
    def request(self,path,data=None,headers=None):
        req=urllib.request.Request(self.base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=5) as res: return res.status,res.read()
        except urllib.error.HTTPError as e: return e.code,e.read()
    def inprocess_request(self,path,data=None,headers=None):
        """Exercise real handlers in threads with in-memory HTTP streams."""
        body=json.dumps(data).encode() if data is not None else b'';result=[]
        handler=server.Handler.__new__(server.Handler)
        handler.path=path
        handler.server=SimpleNamespace(server_port=8787)
        handler.headers={'Host':'127.0.0.1:8787','Content-Type':'application/json','Content-Length':str(len(body)),**(headers or {})}
        handler.rfile=io.BytesIO(body)
        handler.send_json=lambda status,payload:result.append((status,json.dumps(payload).encode()))
        handler.send_body=lambda status,payload,mime:result.append((status,payload))
        if data is None:handler.do_GET()
        else:handler.do_POST()
        return result[0]
    def test_static_assets(self):
        for path in ('/','/app.js','/enhancements.js','/roman-chair-reference.jpg','/training-details.js','/training-details.css','/exercise-guides.js','/nutrition.js','/nutrition.css','/food-database.js','/mobile-bootstrap.js','/mobile-app.js','/mobile.css'):
            self.assertEqual(self.request(path)[0],200)
        self.assertEqual(self.request('/.local/usage.sqlite3')[0],404)
        self.assertEqual(self.request('/assets/exercises/../../server.py')[0],404)
    def test_all_reviewed_images_served(self):
        self.assertEqual(len(server.GUIDES),19)
        for guide in server.GUIDES.values():
            for frame in guide['frames']:
                status,body=self.request('/'+frame['path'])
                self.assertEqual(status,200)
                self.assertTrue(body.startswith(b'\xff\xd8\xff'))
    def test_no_key_no_upstream(self):
        with patch.dict(os.environ,{'QWEN_API_KEY':''}),patch('server.urllib.request.urlopen') as remote:
            self.assertEqual(self.request('/api/chat',{'question':'hi'})[0],503)
            self.assertEqual(self.request('/api/food-photo',{'image':'not-an-image'})[0],403)
            remote.assert_not_called()
    def test_cross_origin_blocked(self):
        self.assertEqual(self.request('/api/chat',{}, {'Origin':'https://example.com'})[0],403)
    def test_mock_chat_payload_and_response(self):
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}),patch('server.urllib.request.urlopen',return_value=Response('模拟测试回答')) as remote:
            status,body=self.request('/api/chat',{'question':'今天练什么'})
            self.assertEqual(status,200);self.assertEqual(json.loads(body)['answer'],'模拟测试回答')
            payload=json.loads(remote.call_args.args[0].data)
            self.assertEqual(payload['messages'][-1]['content'],'今天练什么')
    def test_mock_food_result_requires_numeric_range(self):
        food={'name':'米饭和鸡肉','grams':300,'kcal':500,'protein':30,'carbs':60,'fat':15,'low':400,'high':650,'note':'需确认油量'}
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}),patch('server.urllib.request.urlopen',return_value=Response(json.dumps(food))):
            headers=self.enable_food_ai()
            status,body=self.request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','context':'少油','paidConsent':True},headers)
            self.assertEqual(status,200);self.assertEqual(json.loads(body)['kcal'],500)
        for bad in ({**food,'kcal':float('nan')},{**food,'low':600},{**food,'grams':-1}):
            with self.assertRaises(ValueError): server.parse_food(json.dumps(bad))
    def test_malformed_request(self):
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}):
            self.assertEqual(self.request('/api/chat',{'question':[]})[0],400)
            self.assertEqual(self.request('/api/food-photo',{'image':'https://example.com','paidConsent':True},self.enable_food_ai())[0],400)
    def test_disabled_food_ai_never_calls_upstream(self):
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}),patch('server.urllib.request.urlopen') as remote:
            self.assertEqual(self.request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True})[0],403)
            headers=self.enable_food_ai()
            self.request('/api/food-ai-control',{'enabled':False})
            self.assertEqual(self.request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True},headers)[0],403)
            remote.assert_not_called()
    def test_disable_cannot_overtake_a_pending_paid_dispatch(self):
        """Close the check/unlock/urlopen race without sending anything upstream."""
        dispatch_entered=threading.Event();allow_dispatch=threading.Event()
        disable_arrived=threading.Event();disable_complete=threading.Event();order=[]
        food={'name':'并发测试餐','grams':200,'kcal':300,'protein':20,'carbs':30,'fat':10,'low':250,'high':400}
        original_local_request=server.Handler.local_request;request=self.inprocess_request
        def observe_disable(handler):
            if handler.path=='/api/food-ai-control':disable_arrived.set()
            return original_local_request(handler)
        def blocked_dispatch(*args,**kwargs):
            dispatch_entered.set()
            if not allow_dispatch.wait(3):raise TimeoutError('Test dispatch was not released')
            order.append('paid-start')
            return Response(json.dumps(food))
        def disable():
            result=request('/api/food-ai-control',{'enabled':False})
            order.append('disabled');disable_complete.set()
            return result
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}):
            headers=self.enable_food_ai(request)
            with patch('server.urllib.request.urlopen',side_effect=blocked_dispatch) as remote,patch.object(server.Handler,'local_request',observe_disable),concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                pending=executor.submit(request,'/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True},headers)
                self.assertTrue(dispatch_entered.wait(2),'Paid handler did not reach dispatch')
                closing=executor.submit(disable)
                try:
                    self.assertTrue(disable_arrived.wait(2),'Disable request never reached the server')
                    self.assertFalse(disable_complete.wait(.2),'Disable returned before an old request started upstream')
                finally:
                    allow_dispatch.set()
                self.assertEqual(pending.result(timeout=3)[0],200)
                self.assertEqual(closing.result(timeout=3)[0],200)
                self.assertEqual(order,['paid-start','disabled'])
                self.assertEqual(request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True},headers)[0],403)
                self.assertEqual(remote.call_count,1)
    def test_disable_does_not_wait_for_an_already_sent_response_body(self):
        body_started=threading.Event();allow_body=threading.Event()
        request=self.inprocess_request
        food={'name':'已发送测试餐','grams':200,'kcal':300,'protein':20,'carbs':30,'fat':10,'low':250,'high':400}
        class SlowBody(Response):
            def read(self,*args):
                body_started.set()
                if not allow_body.wait(3):raise TimeoutError('Test response body was not released')
                return super().read(*args)
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}):
            headers=self.enable_food_ai(request)
            with patch('server.urllib.request.urlopen',return_value=SlowBody(json.dumps(food))) as remote,concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                pending=executor.submit(request,'/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True},headers)
                try:
                    self.assertTrue(body_started.wait(2),'Response body read did not begin')
                    self.assertEqual(request('/api/food-ai-control',{'enabled':False})[0],200)
                    self.assertFalse(pending.done(),'The pending response should still be waiting for its body')
                    self.assertEqual(request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True},headers)[0],403)
                    self.assertEqual(remote.call_count,1)
                finally:
                    allow_body.set()
                self.assertEqual(pending.result(timeout=3)[0],200)
    def test_food_ai_needs_cost_confirmation_and_honors_server_limit(self):
        with patch.dict(os.environ,{'QWEN_API_KEY':'unit-test-placeholder'}),patch('server.urllib.request.urlopen') as remote:
            headers=self.enable_food_ai()
            self.assertEqual(self.request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/'},headers)[0],400)
            with patch.object(server,'MAX_DAILY_CALLS',0):
                self.assertEqual(self.request('/api/food-photo',{'image':'data:image/jpeg;base64,/9j/','paidConsent':True},headers)[0],429)
            remote.assert_not_called()
    def test_local_food_route_does_not_use_paid_api(self):
        import base64
        image='data:image/jpeg;base64,'+base64.b64encode((server.ROOT/'roman-chair-reference.jpg').read_bytes()).decode()
        with patch('server.local_food.predict',return_value={'recognized':False,'candidates':[],'localOnly':True}),patch('server.urllib.request.urlopen') as remote:
            status,body=self.request('/api/local-food',{'image':image})
            self.assertEqual(status,200);self.assertTrue(json.loads(body)['localOnly']);remote.assert_not_called()
    def test_barcode_checksum_missing_fields_and_cached_lookup(self):
        import barcode_food
        self.assertTrue(barcode_food.valid_barcode('3017620422003'))
        self.assertFalse(barcode_food.valid_barcode('3017620422004'))
        self.assertIsNone(barcode_food.normalize('3017620422003',{'product_name':'测试','nutriments':{}})['kcal'])
        with tempfile.TemporaryDirectory() as directory,patch.object(barcode_food,'CACHE_DB',Path(directory)/'barcodes.sqlite3'):
            product={'status':1,'product':{'product_name':'测试产品','nutriments':{'energy-kcal_100g':500,'proteins_100g':10,'fat_100g':20,'carbohydrates_100g':70}}}
            class ProductResponse(Response):
                def read(self,*args):return json.dumps(product).encode()
            with patch('barcode_food.urllib.request.urlopen',return_value=ProductResponse('')) as remote:
                first=barcode_food.lookup('3017620422003');second=barcode_food.lookup('3017620422003')
                self.assertFalse(first['cached']);self.assertTrue(second['cached']);self.assertEqual(remote.call_count,1)
                self.assertTrue(first['product']['requiresUnitConfirmation']);self.assertTrue(second['product']['requiresUnitConfirmation'])

    def test_atomic_persistent_rate_limit(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(server,'USAGE_DB',Path(directory)/'limit.sqlite3'),patch.object(server,'MAX_DAILY_CALLS',3):
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                results=list(executor.map(lambda _:server.usage(True),range(12)))
            self.assertEqual(sum(results),3);self.assertEqual(server.usage(),0)
            with server.closing(server.sqlite3.connect(server.USAGE_DB)) as con:
                self.assertEqual(con.execute('SELECT count FROM calls').fetchone()[0],3)

if __name__=='__main__': unittest.main(verbosity=2)
