package cn.local.qinglianfit;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Only temporary JSON backups are exposed, and only to an explicit URI grant. */
public final class BackupProvider extends ContentProvider {
    private File resolve(Uri uri) throws FileNotFoundException {
        if (!"cn.local.qinglianfit.backups".equals(uri.getAuthority())
                || uri.getPathSegments().size() != 1) throw new FileNotFoundException("Invalid backup URI");
        try {
            File root = new File(getContext().getCacheDir(), "shared-backups").getCanonicalFile();
            File item = new File(root, uri.getLastPathSegment()).getCanonicalFile();
            if (!root.equals(item.getParentFile()) || !item.isFile() || !item.getName().endsWith(".json"))
                throw new FileNotFoundException("Backup not found");
            return item;
        } catch (IOException ex) { throw new FileNotFoundException("Backup not found"); }
    }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "application/json"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File item = resolve(uri);
            String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
            MatrixCursor cursor = new MatrixCursor(cols);
            Object[] values = new Object[cols.length];
            for (int i=0; i<cols.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) values[i]=item.getName();
                else if (OpenableColumns.SIZE.equals(cols[i])) values[i]=item.length();
            }
            cursor.addRow(values); return cursor;
        } catch (FileNotFoundException ex) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Read only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Read only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Read only"); }
}
