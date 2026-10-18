package cn.local.qinglianfit;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.UUID;

/** Grants the system camera access only to a single random file in our private meal-photo cache. */
public final class MealPhotoProvider extends ContentProvider {
    private static final String AUTHORITY="cn.local.qinglianfit.mealphotos";
    private static final long RETAIN_MILLIS=24L*60*60*1000;
    private static File directory(Context context) throws IOException{
        File cache=context.getCacheDir().getCanonicalFile();
        File root=new File(cache,"meal-camera").getCanonicalFile();
        if(!cache.equals(root.getParentFile()))throw new IOException("Invalid photo directory");
        if(!root.isDirectory()&&!root.mkdirs())throw new IOException("Photo directory unavailable");
        return root;
    }
    static File resolve(Context context,Uri uri) throws FileNotFoundException{
        if(uri==null||!"content".equals(uri.getScheme())||!AUTHORITY.equals(uri.getAuthority())
                ||uri.getQuery()!=null||uri.getFragment()!=null||uri.getPathSegments().size()!=1)
            throw new FileNotFoundException("Invalid meal photo URI");
        String name=uri.getLastPathSegment();
        if(name==null||!name.matches("meal-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg"))
            throw new FileNotFoundException("Invalid meal photo name");
        try{
            File root=directory(context);File item=new File(root,name).getCanonicalFile();
            if(!root.equals(item.getParentFile())||!item.isFile())throw new FileNotFoundException("Meal photo not found");
            return item;
        }catch(IOException ex){throw new FileNotFoundException("Meal photo not found");}
    }
    static Uri create(Context context) throws IOException{
        File root=directory(context);File item=new File(root,"meal-"+UUID.randomUUID().toString()+".jpg");
        if(!item.createNewFile())throw new IOException("Meal photo already exists");
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(item.getName()).build();
    }
    static Uri restore(Context context,String raw){
        if(raw==null)return null;
        try{Uri uri=Uri.parse(raw);resolve(context,uri);return uri;}catch(Exception ex){return null;}
    }
    static void discard(Context context,Uri uri){
        if(uri==null)return;
        try{
            File file=resolve(context,uri);
            context.revokeUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            file.delete();
        }catch(Exception ignored){}
    }
    static void cleanExpired(Context context,Uri pending,Uri recovered){
        try{
            File[] files=directory(context).listFiles();if(files==null)return;
            long cutoff=System.currentTimeMillis()-RETAIN_MILLIS;
            for(File file:files){
                Uri uri=new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(file.getName()).build();
                if(uri.equals(pending)||uri.equals(recovered)||file.lastModified()>cutoff)continue;
                discard(context,uri);
            }
        }catch(Exception ignored){}
    }
    @Override public boolean onCreate(){return true;}
    @Override public String getType(Uri uri){
        try{resolve(getContext(),uri);return "image/jpeg";}catch(FileNotFoundException ex){return null;}
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException{
        int flags;
        if("r".equals(mode))flags=ParcelFileDescriptor.MODE_READ_ONLY;
        else if("w".equals(mode)||"wt".equals(mode))flags=ParcelFileDescriptor.MODE_WRITE_ONLY|ParcelFileDescriptor.MODE_TRUNCATE;
        else if("rw".equals(mode))flags=ParcelFileDescriptor.MODE_READ_WRITE;
        else if("rwt".equals(mode))flags=ParcelFileDescriptor.MODE_READ_WRITE|ParcelFileDescriptor.MODE_TRUNCATE;
        else throw new FileNotFoundException("Unsupported photo mode");
        // No MODE_CREATE: grants never allow creating arbitrary paths/files.
        return ParcelFileDescriptor.open(resolve(getContext(),uri),flags);
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        try{
            File item=resolve(getContext(),uri);
            String[] cols=projection!=null?projection:new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE};
            MatrixCursor cursor=new MatrixCursor(cols);Object[] values=new Object[cols.length];
            for(int i=0;i<cols.length;i++){
                if(OpenableColumns.DISPLAY_NAME.equals(cols[i]))values[i]=item.getName();
                else if(OpenableColumns.SIZE.equals(cols[i]))values[i]=item.length();
            }
            cursor.addRow(values);return cursor;
        }catch(FileNotFoundException ex){return null;}
    }
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException("Camera output only");}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException("Camera output only");}
    @Override public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException("Camera output only");}
}
