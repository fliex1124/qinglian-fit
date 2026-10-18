package cn.local.qinglianfit;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Local APK assets are the only documents allowed to access this native bridge. */
public final class MainActivity extends Activity {
    private static final String HOST="appassets.androidplatform.net";
    private static final int PICK_FILES=101, EXPORT_JSON=102, CAPTURE_MEAL=103, MAX_STATE_BYTES=32*1024*1024;
    private final Object stateLock=new Object();
    private final ExecutorService workers=Executors.newFixedThreadPool(2);
    private final AtomicBoolean barcodeBusy=new AtomicBoolean(false);
    private WebView web;
    private PersonalAI personalAI;
    private ValueCallback<Uri[]> chooser;
    private String pendingExport;
    private Uri pendingCamera, recoveredCamera;
    private String recoveredPhotoDataUrl;
    private boolean pageReady, recoveryJob, recoveredPhotoDelivered;
    private long lastBack;
    private long privateStateEpoch;
    private volatile boolean destroyed;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if(saved!=null){
            pendingCamera=MealPhotoProvider.restore(this,saved.getString("fit.camera.pending"));
            recoveredCamera=MealPhotoProvider.restore(this,saved.getString("fit.camera.recovered"));
        }
        MealPhotoProvider.cleanExpired(this,pendingCamera,recoveredCamera);
        getWindow().setStatusBarColor(Color.rgb(11,16,28));
        getWindow().setNavigationBarColor(Color.rgb(11,16,28));
        web=new WebView(this); web.setBackgroundColor(Color.rgb(11,16,28)); setContentView(web);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false); s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(true); s.setTextZoom(100);
        personalAI=new PersonalAI(this,workers,new PersonalAI.Sink(){
            @Override public void result(String id,int code,JSONObject body){
                if(destroyed)return;runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.fitNativeAIResult&&window.fitNativeAIResult("+JSONObject.quote(id)+","+code+","+JSONObject.quote(body.toString())+")",null);});
            }
            @Override public void settings(JSONObject status){
                if(destroyed)return;runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.fitNativeAISettingsResult&&window.fitNativeAISettingsResult("+JSONObject.quote(status.toString())+")",null);});
            }
        });
        web.addJavascriptInterface(new Bridge(),"QinglianAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view,String url){
                if(isLocal(Uri.parse(url))){pageReady=true;prepareRecoveredMealPhoto();deliverRecoveredMealPhoto();}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (isLocal(request.getUrl())) {
                    // Images and source files must not replace the app's sole document.
                    String path=request.getUrl().getPath();
                    return request.isForMainFrame() && !("/".equals(path)||"/index.html".equals(path));
                }
                if (request.isForMainFrame()) openExternal(request.getUrl());
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!isLocal(request.getUrl())) return response(403,"Forbidden","text/plain","此版本仅加载安装包内页面。");
                String path=request.getUrl().getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) path="/index.html";
                if (path.startsWith("/api/")) return response(503,"Service Unavailable","application/json",
                    "{\"error\":\"此电脑端功能尚未接入安卓；请使用免费手动记录。\",\"keyConfigured\":false}");
                if (!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod()))
                    return response(405,"Method Not Allowed","text/plain","Method not allowed");
                if (!safeAsset(path)) return response(403,"Forbidden","text/plain","Invalid asset path");
                try {
                    InputStream input=getAssets().open(path.substring(1));
                    Map<String,String> headers=new HashMap<>();
                    headers.put("Cache-Control","no-cache"); headers.put("X-Content-Type-Options","nosniff");
                    headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'");
                    return new WebResourceResponse(mime(path),"UTF-8",200,"OK",headers,input);
                } catch (Exception ex) { return response(404,"Not Found","text/plain","Asset not found"); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("轻练 FIT").setMessage(message)
                    .setPositiveButton("知道了",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("轻练 FIT").setMessage(message)
                    .setPositiveButton("确定",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel())
                    .setOnCancelListener(d->result.cancel()).show(); return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(!isLocal(Uri.parse(view.getUrl()==null?"":view.getUrl()))){callback.onReceiveValue(null);return true;}
                if(pendingCamera!=null){callback.onReceiveValue(null);toast("已有拍照正在进行，请先完成或取消");return true;}
                if (chooser != null) chooser.onReceiveValue(null);
                chooser=callback;
                String[] accepted=params.getAcceptTypes();
                boolean images=false;
                if (accepted != null) for (String type:accepted) if (type != null && type.startsWith("image/")) images=true;
                if(images&&params.isCaptureEnabled()) { startMealCamera(); return true; }
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(images?"image/*":"*/*");
                if (!images) intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent,PICK_FILES); }
                catch (ActivityNotFoundException ex) { chooser.onReceiveValue(null); chooser=null; toast("没有可用的系统文件选择器"); }
                return true;
            }
        });
        web.loadUrl("https://"+HOST+"/index.html");
    }

    @Override protected void onSaveInstanceState(Bundle saved){
        super.onSaveInstanceState(saved);
        if(pendingCamera!=null)saved.putString("fit.camera.pending",pendingCamera.toString());
        if(recoveredCamera!=null)saved.putString("fit.camera.recovered",recoveredCamera.toString());
    }
    private void completeChooser(Uri[] result){
        ValueCallback<Uri[]> callback=chooser;chooser=null;
        if(callback!=null)callback.onReceiveValue(result);
    }
    private void revokeCameraGrant(Uri uri){
        if(uri!=null)try{revokeUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}catch(SecurityException ignored){}
    }
    private void startMealCamera(){
        try{
            pendingCamera=MealPhotoProvider.create(this);
            Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT,pendingCamera);
            intent.setClipData(ClipData.newRawUri("轻练FIT餐食照片",pendingCamera));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            // The camera app owns camera access; this app needs no CAMERA or storage permission.
            startActivityForResult(intent,CAPTURE_MEAL);
        }catch(Exception ex){
            Uri failed=pendingCamera;pendingCamera=null;revokeCameraGrant(failed);MealPhotoProvider.discard(this,failed);
            completeChooser(null);toast("无法打开系统相机，请使用从相册选取");
        }
    }
    private void prepareRecoveredMealPhoto(){
        if(recoveredCamera==null||recoveryJob||recoveredPhotoDataUrl!=null||destroyed)return;
        final Uri source=recoveredCamera;recoveryJob=true;
        workers.execute(()->{
            String result=null;
            try{result=compressedMealPhoto(source);}catch(Exception|OutOfMemoryError ignored){}
            final String dataUrl=result;
            runOnUiThread(()->{
                if(destroyed||!source.equals(recoveredCamera))return;
                recoveryJob=false;
                if(dataUrl==null){MealPhotoProvider.discard(this,source);recoveredCamera=null;toast("照片恢复失败，请重新拍照或从相册选取");return;}
                recoveredPhotoDataUrl=dataUrl;deliverRecoveredMealPhoto();
            });
        });
    }
    private String compressedMealPhoto(Uri source) throws Exception{
        File file=MealPhotoProvider.resolve(this,source);
        if(file.length()==0||file.length()>25L*1024*1024)throw new Exception("照片大小无效");
        BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
        BitmapFactory.decodeFile(file.getPath(),options);
        if(options.outWidth<=0||options.outHeight<=0)throw new Exception("照片无法读取");
        int sample=1;while(Math.max(options.outWidth,options.outHeight)/sample>2000)sample*=2;
        options.inJustDecodeBounds=false;options.inSampleSize=sample;
        Bitmap bitmap=BitmapFactory.decodeFile(file.getPath(),options);
        if(bitmap==null)throw new Exception("照片无法读取");
        try{
            Matrix transform=new Matrix();
            int orientation=new ExifInterface(file.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);
            switch(orientation){
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:transform.setScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_180:transform.setRotate(180);break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL:transform.setScale(1,-1);break;
                case ExifInterface.ORIENTATION_TRANSPOSE:transform.setRotate(90);transform.postScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_90:transform.setRotate(90);break;
                case ExifInterface.ORIENTATION_TRANSVERSE:transform.setRotate(-90);transform.postScale(-1,1);break;
                case ExifInterface.ORIENTATION_ROTATE_270:transform.setRotate(-90);break;
                default:break;
            }
            double scale=Math.min(1.0,1000.0/Math.max(bitmap.getWidth(),bitmap.getHeight()));
            transform.postScale((float)scale,(float)scale);
            Bitmap resized=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),transform,true);
            if(resized!=bitmap){bitmap.recycle();bitmap=resized;}
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            if(!bitmap.compress(Bitmap.CompressFormat.JPEG,72,out)||out.size()>1100*1024)throw new Exception("照片压缩失败");
            return "data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
        }finally{bitmap.recycle();}
    }
    private void deliverRecoveredMealPhoto(){
        if(!pageReady||destroyed||recoveredCamera==null||recoveredPhotoDataUrl==null||recoveredPhotoDelivered)return;
        try{
            JSONObject detail=new JSONObject().put("dataUrl",recoveredPhotoDataUrl).put("recoveryId",recoveredCamera.getLastPathSegment());
            recoveredPhotoDelivered=true;
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('fit-native-camera-recovered',{detail:"+detail.toString()+"}))",null);
        }catch(Exception ignored){recoveredPhotoDelivered=false;}
    }
    // Picker results are untrusted: never let another app point WebView at our private providers/files.
    private boolean safePickedUri(Uri uri){
        if(uri==null||!"content".equals(uri.getScheme())||uri.getUserInfo()!=null)return false;
        String authority=uri.getAuthority();
        return authority!=null&&!authority.equals(getPackageName())&&!authority.startsWith(getPackageName()+".");
    }
    private boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort()==-1 && uri.getUserInfo()==null;
    }
    private boolean safeAsset(String path) {
        if (!path.startsWith("/") || path.indexOf('\\')>=0 || path.indexOf('\0')>=0) return false;
        for (String part:path.split("/")) if ("..".equals(part)||".".equals(part)) return false;
        return true;
    }
    private String mime(String path) {
        String p=path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".jpg")||p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }
    private WebResourceResponse response(int code,String reason,String type,String body) {
        Map<String,String> headers=new HashMap<>(); headers.put("Cache-Control","no-store");
        headers.put("X-Content-Type-Options","nosniff");
        return new WebResourceResponse(type,"UTF-8",code,reason,headers,
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); }
        catch (ActivityNotFoundException ex) { toast("没有可用的浏览器"); }
    }
    private void toast(String message) { runOnUiThread(()->Toast.makeText(this,message,Toast.LENGTH_SHORT).show()); }
    private String failure(String message) {
        try { return new JSONObject().put("ok",false).put("error",message).toString(); }
        catch (Exception ex) { return "{\"ok\":false,\"error\":\"操作失败\"}"; }
    }
    private String iso(long time) {
        if (time<=0) return "";
        SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC")); return f.format(new Date(time));
    }
    private AtomicFile stateFile(boolean previous) { return new AtomicFile(new File(getFilesDir(),previous?"previous_state.json":"current_state.json")); }
    private byte[] readBytes(InputStream input,int max) throws Exception {
        ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] buf=new byte[8192]; int count;
        while ((count=input.read(buf))!=-1) { if (out.size()+count>max) throw new Exception("文件过大"); out.write(buf,0,count); }
        return out.toByteArray();
    }
    private JSONObject checkedState(String raw) throws Exception {
        if (raw==null || raw.length()==0 || raw.length()>MAX_STATE_BYTES || raw.getBytes(StandardCharsets.UTF_8).length>MAX_STATE_BYTES)
            throw new Exception("镜像为空或超过32MB限制");
        JSONObject state=new JSONObject(raw);
        if (!(state.opt("plans") instanceof JSONArray) || state.getJSONArray("plans").length()==0
                || !(state.opt("progress") instanceof JSONObject) || !(state.opt("settings") instanceof JSONObject))
            throw new Exception("状态结构无效");
        String[] lists={"history","meals","weights","photos","chat","customFoods"};
        for (String key:lists) if (state.has(key) && !(state.opt(key) instanceof JSONArray)) throw new Exception("记录格式无效");
        JSONArray plans=state.getJSONArray("plans");
        for (int i=0;i<plans.length();i++) {
            JSONObject p=plans.optJSONObject(i);
            if (p==null || p.optString("id","").isEmpty() || !(p.opt("days") instanceof JSONArray) || p.getJSONArray("days").length()==0)
                throw new Exception("计划格式无效");
        }
        return state;
    }
    private String readValid(AtomicFile file) {
        try (InputStream in=file.openRead()) {
            String raw=new String(readBytes(in,MAX_STATE_BYTES),StandardCharsets.UTF_8); checkedState(raw); return raw;
        } catch (Exception ex) { return ""; }
    }
    private void atomicWrite(AtomicFile file,byte[] bytes) throws Exception {
        FileOutputStream out=null;
        try { out=file.startWrite(); out.write(bytes); file.finishWrite(out); }
        catch (Exception ex) { if(out!=null) file.failWrite(out); throw ex; }
    }
    private String checkedBackup(String raw) throws Exception {
        if (raw==null || raw.length()>MAX_STATE_BYTES || raw.getBytes(StandardCharsets.UTF_8).length>MAX_STATE_BYTES) throw new Exception("备份超过32MB限制");
        JSONObject item=new JSONObject(raw);
        if (!"qinglian-fit".equals(item.optString("app"))) throw new Exception("备份格式无效");
        checkedState(item.getJSONObject("state").toString()); return raw;
    }
    private String cleanFilename(String raw) {
        String name=raw==null?"":raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_").trim();
        if (name.length()>100) name=name.substring(0,100);
        if (name.isEmpty()||name.equals(".")||name.equals("..")) name="轻练FIT备份";
        if (!name.toLowerCase(Locale.ROOT).endsWith(".json")) name+=".json";
        return name;
    }
    private void event(String name,JSONObject detail) {
        if (destroyed) return;
        runOnUiThread(()->{if(!destroyed) web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+detail.toString()+"}))",null);});
    }
    private JSONObject exportResult(boolean ok,boolean cancelled,String error) {
        JSONObject obj=new JSONObject(); try {obj.put("ok",ok).put("cancelled",cancelled);if(error!=null)obj.put("error",error);}catch(Exception ignored){}return obj;
    }
    private void requestExport(String raw,String filename) {
        runOnUiThread(()->{
            if (pendingExport!=null) {event("fit-native-export",exportResult(false,false,"已有备份正在保存"));return;}
            pendingExport=raw;
            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json").putExtra(Intent.EXTRA_TITLE,cleanFilename(filename));
            try {startActivityForResult(intent,EXPORT_JSON);}
            catch(Exception ex){pendingExport=null;event("fit-native-export",exportResult(false,false,"无法打开系统保存界面"));}
        });
    }
    private boolean clearSharedBackups() {
        boolean ok=true;
        try {
            File cache=getCacheDir().getCanonicalFile();
            File dir=new File(cache,"shared-backups").getCanonicalFile();
            if(!cache.equals(dir.getParentFile()))return false;
            if(!dir.exists())return true;
            File[] items=dir.listFiles();if(items==null)return false;
            for(File candidate:items) {
                File item=candidate.getCanonicalFile();
                if(!dir.equals(item.getParentFile()) || !item.isFile() || !item.getName().endsWith(".json"))continue;
                Uri uri=new Uri.Builder().scheme("content").authority("cn.local.qinglianfit.backups").appendPath(item.getName()).build();
                try{revokeUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(SecurityException ignored){}
                if(!item.delete()&&item.exists())ok=false;
            }
        }catch(Exception ex){ok=false;}
        return ok;
    }

    public final class Bridge {
        @JavascriptInterface public void acknowledgeMealPhoto(String recoveryId){
            runOnUiThread(()->{
                if(recoveredCamera==null||!recoveredPhotoDelivered||!recoveredCamera.getLastPathSegment().equals(recoveryId))return;
                MealPhotoProvider.discard(MainActivity.this,recoveredCamera);
                recoveredCamera=null;recoveredPhotoDataUrl=null;recoveredPhotoDelivered=false;
            });
        }
        @JavascriptInterface public String getAIStatus(){return personalAI.status().toString();}
        @JavascriptInterface public String setAIEnabled(boolean value){return personalAI.setEnabled(value).toString();}
        @JavascriptInterface public String foodAIControl(boolean value){return personalAI.foodControl(value).toString();}
        @JavascriptInterface public void showAISettings(){personalAI.showSettings();}
        @JavascriptInterface public void startAIRequest(String id,String path,String raw,String token){personalAI.start(id,path,raw,token);}
        @JavascriptInterface public void cancelAIRequest(String id){personalAI.cancel(id);}
        @JavascriptInterface public String platformInfo() { return "{\"platform\":\"android\",\"version\":\"0.7.2\"}"; }
        @JavascriptInterface public String readState() { synchronized(stateLock) { return readValid(stateFile(false)); } }
        @JavascriptInterface public String readPreviousState() { synchronized(stateLock) { return readValid(stateFile(true)); } }
        @JavascriptInterface public String writeState(String raw) {
            synchronized(stateLock) {
                try {
                    checkedState(raw);
                    AtomicFile current=stateFile(false); String old=readValid(current);
                    if (!old.isEmpty() && !old.equals(raw)) atomicWrite(stateFile(true),old.getBytes(StandardCharsets.UTF_8));
                    atomicWrite(current,raw.getBytes(StandardCharsets.UTF_8));
                    return new JSONObject().put("ok",true).put("savedAt",iso(current.getBaseFile().lastModified())).toString();
                } catch(Exception ex) { return failure("原生镜像保存失败："+ex.getMessage()); }
            }
        }
        @JavascriptInterface public String storageInfo() {
            synchronized(stateLock) {try {
                AtomicFile file=stateFile(false); String current=readValid(file);
                return new JSONObject().put("savedAt",current.isEmpty()?"":iso(file.getBaseFile().lastModified()))
                    .put("bytes",current.getBytes(StandardCharsets.UTF_8).length).put("hasPrevious",!readValid(stateFile(true)).isEmpty()).toString();
            }catch(Exception ex){return failure("无法读取镜像状态");}}
        }
        @JavascriptInterface public String clearState() {
            synchronized(stateLock) {privateStateEpoch++;stateFile(false).delete();stateFile(true).delete();
                boolean gone=!stateFile(false).getBaseFile().exists()&&!stateFile(true).getBaseFile().exists();
                boolean sharedCleared=clearSharedBackups();
                return gone&&sharedCleared?"{\"ok\":true}":failure("未能完整清空本机镜像或临时分享备份，请重试");}
        }
        @JavascriptInterface public void exportBackup(String raw,String filename) {
            try {checkedBackup(raw);}catch(Exception ex){event("fit-native-export",exportResult(false,false,ex.getMessage()));return;}
            requestExport(raw,filename);
        }
        @JavascriptInterface public void exportRawStorage(String raw,String filename) {
            // Recovery export intentionally preserves malformed JSON without parsing it.
            if(raw==null||raw.length()>MAX_STATE_BYTES||raw.getBytes(StandardCharsets.UTF_8).length>MAX_STATE_BYTES){
                event("fit-native-export",exportResult(false,false,"原始文本为空值或超过32MB限制"));return;
            }
            requestExport(raw,filename);
        }
        @JavascriptInterface public void shareBackup(String raw,String filename) {
            final long scheduledEpoch;
            synchronized(stateLock){scheduledEpoch=privateStateEpoch;}
            workers.execute(()->{
                try {
                    checkedBackup(raw);
                    final Uri uri;
                    synchronized(stateLock){
                        if(scheduledEpoch!=privateStateEpoch)throw new Exception("数据已清空，之前的分享已取消");
                        File dir=new File(getCacheDir(),"shared-backups");if(!dir.exists()&&!dir.mkdirs())throw new Exception("无法创建临时备份");
                        File[] old=dir.listFiles();if(old!=null)for(File f:old)if(f.isFile()&&System.currentTimeMillis()-f.lastModified()>24*60*60*1000L)f.delete();
                        File item=new File(dir,System.currentTimeMillis()+"_"+cleanFilename(filename));
                        try(OutputStream out=new FileOutputStream(item)){out.write(raw.getBytes(StandardCharsets.UTF_8));}
                        uri=new Uri.Builder().scheme("content").authority("cn.local.qinglianfit.backups").appendPath(item.getName()).build();
                    }
                    Intent send=new Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM,uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(ClipData.newRawUri("轻练 FIT 备份",uri));
                    runOnUiThread(()->{try {
                        synchronized(stateLock){if(scheduledEpoch!=privateStateEpoch){event("fit-native-share",exportResult(false,true,"数据已清空，之前的分享已取消"));return;}}
                        startActivity(Intent.createChooser(send,"分享轻练 FIT 备份"));event("fit-native-share",exportResult(true,false,null));}
                        catch(Exception ex){event("fit-native-share",exportResult(false,false,"没有可用的分享应用"));}});
                } catch(Exception ex){event("fit-native-share",exportResult(false,false,ex.getMessage()));}
            });
        }
        @JavascriptInterface public String barcodeLookup(String code) { return lookupBarcode(code).toString(); }
        @JavascriptInterface public void startBarcodeLookup(String requestId,String code) {
            if(requestId==null||requestId.length()>100)return;
            if(!barcodeBusy.compareAndSet(false,true)){barcodeCallback(requestId,errorObject("请等待当前条码查询结束"));return;}
            workers.execute(()->{try{barcodeCallback(requestId,lookupBarcode(code));}finally{barcodeBusy.set(false);}});
        }
    }
    private JSONObject errorObject(String message) {JSONObject o=new JSONObject();try{o.put("error",message);}catch(Exception ignored){}return o;}
    private void barcodeCallback(String id,JSONObject result) {
        if(destroyed)return;
        runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.fitNativeBarcodeResult&&window.fitNativeBarcodeResult("+JSONObject.quote(id)+","+JSONObject.quote(result.toString())+")",null);});
    }
    private boolean validBarcode(String code) {
        if(code==null||!(code.length()==8||code.length()==12||code.length()==13||code.length()==14)||!code.matches("[0-9]+"))return false;
        int sum=0,index=0;for(int i=code.length()-2;i>=0;i--,index++)sum+=(code.charAt(i)-'0')*(index%2==0?3:1);
        return (10-sum%10)%10==code.charAt(code.length()-1)-'0';
    }
    private Object nutrient(JSONObject n,String key,double max) {
        Object raw=n.opt(key);if(!(raw instanceof Number))return JSONObject.NULL;
        double value=((Number)raw).doubleValue();return Double.isNaN(value)||Double.isInfinite(value)||value<0||value>max?JSONObject.NULL:Math.round(value*100.0)/100.0;
    }
    private JSONObject normalizeBarcode(String code,JSONObject product) throws Exception {
        JSONObject n=product.optJSONObject("nutriments");if(n==null)n=new JSONObject();
        Object kcal=nutrient(n,"energy-kcal_100g",1000);
        if(kcal==JSONObject.NULL){Object kj=nutrient(n,"energy_100g",4200);if(kj instanceof Number)kcal=Math.round(((Number)kj).doubleValue()/4.184*10.0)/10.0;}
        String name=product.optString("product_name_zh","");if(name.trim().isEmpty())name=product.optString("product_name","未命名产品");
        if(name.length()>160)name=name.substring(0,160);String brand=product.optString("brands","");if(brand.length()>100)brand=brand.substring(0,100);
        JSONObject p=new JSONObject().put("id","barcode-"+code).put("barcode",code).put("name",name).put("brand",brand)
            .put("kcal",kcal).put("protein",nutrient(n,"proteins_100g",100)).put("carbs",nutrient(n,"carbohydrates_100g",100)).put("fat",nutrient(n,"fat_100g",100))
            .put("basis","100g").put("source","Open Food Facts（请核对实物营养标签）")
            .put("sourceUrl","https://world.openfoodfacts.org/product/"+code).put("estimated",true)
            .put("requiresUnitConfirmation",true).put("servingGrams",100).put("aliases",new JSONArray());
        JSONArray missing=new JSONArray();for(String key:new String[]{"kcal","protein","carbs","fat"})if(p.isNull(key))missing.put(key);
        return p.put("missing",missing);
    }
    private JSONObject lookupBarcode(String code) {
        if(!validBarcode(code))return errorObject("请输入校验正确的8/12/13/14位商品条码。");
        HttpsURLConnection con=null;
        try {
            File dir=new File(getFilesDir(),"barcodes");if(!dir.exists()&&!dir.mkdirs())throw new Exception("本地缓存无法创建");
            AtomicFile cache=new AtomicFile(new File(dir,code+".json"));
            try(InputStream in=cache.openRead()) {
                JSONObject product=new JSONObject(new String(readBytes(in,128*1024),StandardCharsets.UTF_8));
                if(!code.equals(product.optString("barcode")))throw new Exception("缓存无效");
                product.put("requiresUnitConfirmation",true);
                return new JSONObject().put("found",true).put("cached",true).put("product",product);
            } catch(Exception ignored){}
            URL url=new URL("https://world.openfoodfacts.org/api/v2/product/"+code+".json?fields=product_name,product_name_zh,brands,nutriments");
            con=(HttpsURLConnection)url.openConnection();con.setConnectTimeout(10000);con.setReadTimeout(10000);con.setInstanceFollowRedirects(false);
            con.setRequestProperty("User-Agent","QinglianFIT/0.5 Android personal nutrition tracker");con.setRequestProperty("Accept","application/json");
            int status=con.getResponseCode();
            if(status==404)return new JSONObject().put("found",false).put("message","数据库未收录此条码，请手动填写包装营养信息。");
            if(status!=200)throw new Exception("条码服务暂时不可用（"+status+"），请手动选择食物。");
            JSONObject data;try(InputStream in=con.getInputStream()){data=new JSONObject(new String(readBytes(in,1024*1024),StandardCharsets.UTF_8));}
            if(data.optInt("status")!=1||data.optJSONObject("product")==null)
                return new JSONObject().put("found",false).put("message","数据库未收录此条码，请手动填写包装营养信息。");
            JSONObject product=normalizeBarcode(code,data.getJSONObject("product"));
            try{atomicWrite(cache,product.toString().getBytes(StandardCharsets.UTF_8));}catch(Exception ignored){}
            return new JSONObject().put("found",true).put("cached",false).put("product",product);
        }catch(Exception ex){return errorObject("条码查询失败，请手动选择食物或填写包装营养信息。");}
        finally{if(con!=null)con.disconnect();}
    }

    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==CAPTURE_MEAL){
            Uri output=pendingCamera;pendingCamera=null;revokeCameraGrant(output);
            boolean valid=false;
            try{File file=MealPhotoProvider.resolve(this,output);valid=result==RESULT_OK&&file.length()>0&&file.length()<=25L*1024*1024;}catch(Exception ignored){}
            if(!valid){MealPhotoProvider.discard(this,output);completeChooser(null);if(result==RESULT_OK)toast("没有获得可用照片，请重新拍照或从相册选取");return;}
            if(chooser!=null){
                // Keep the file: WebView reads the URI asynchronously after this callback.
                completeChooser(new Uri[]{output});
            }else{
                // Android recreated this Activity while the system camera was open.
                if(recoveredCamera!=null)MealPhotoProvider.discard(this,recoveredCamera);
                recoveredCamera=output;recoveredPhotoDataUrl=null;recoveredPhotoDelivered=false;prepareRecoveredMealPhoto();
            }
        }else if(request==PICK_FILES){
            if(chooser==null)return;
            if(result!=RESULT_OK||data==null){completeChooser(null);return;}
            ClipData clips=data.getClipData();
            if(clips!=null){
                int count=clips.getItemCount();if(count==0||count>100){completeChooser(null);return;}
                Uri[] items=new Uri[count];for(int i=0;i<count;i++){items[i]=clips.getItemAt(i).getUri();if(!safePickedUri(items[i])){completeChooser(null);toast("无法读取所选文件，请从系统相册或文件中重新选择");return;}}
                completeChooser(items);
            }else{
                Uri item=data.getData();completeChooser(safePickedUri(item)?new Uri[]{item}:null);
            }
        }else if(request==EXPORT_JSON){
            String raw=pendingExport;pendingExport=null;
            if(result!=RESULT_OK||data==null||data.getData()==null){event("fit-native-export",exportResult(false,true,null));return;}
            if(raw==null){event("fit-native-export",exportResult(false,false,"保存过程已中断，请重新导出"));return;}
            final Uri target=data.getData();
            workers.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(target,"wt")){
                if(out==null)throw new Exception("无法写入所选文件");out.write(raw.getBytes(StandardCharsets.UTF_8));out.flush();
                event("fit-native-export",exportResult(true,false,null));
            }catch(Exception ex){event("fit-native-export",exportResult(false,false,"备份保存失败，请重新选择保存位置"));}});
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return typeof window.fitAndroidBack==='function'&&window.fitAndroidBack()===true}catch(e){return false}})()",value->{
            if("true".equals(value))return;
            long now=System.currentTimeMillis();if(now-lastBack<2000){finish();}else{lastBack=now;toast("再按一次返回键退出轻练 FIT");}
        });
    }
    @Override protected void onDestroy() {
        destroyed=true;if(personalAI!=null)personalAI.destroy();completeChooser(null);
        if(isFinishing()){
            revokeCameraGrant(pendingCamera);MealPhotoProvider.discard(this,pendingCamera);pendingCamera=null;
            MealPhotoProvider.discard(this,recoveredCamera);recoveredCamera=null;
        }
        workers.shutdownNow();if(web!=null){web.removeJavascriptInterface("QinglianAndroid");web.destroy();}super.onDestroy();
    }
}
