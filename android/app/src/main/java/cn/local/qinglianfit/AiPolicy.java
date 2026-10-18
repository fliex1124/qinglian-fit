package cn.local.qinglianfit;

import java.net.URI;

/** Pure validation shared by the Android client and JVM regression checks. */
public final class AiPolicy {
    private AiPolicy() {}
    public static String baseUrl(String raw) throws Exception {
        URI uri=new URI(raw.trim());
        String host=uri.getHost(),path=uri.getPath();
        if (!"https".equals(uri.getScheme()) || host==null || uri.getUserInfo()!=null
                || uri.getQuery()!=null || uri.getFragment()!=null || (uri.getPort()!=-1&&uri.getPort()!=443))
            throw new Exception("请输入阿里云官方HTTPS兼容地址");
        if (!host.equals("dashscope.aliyuncs.com") && !host.matches("[a-z0-9-]+\\.cn-beijing\\.maas\\.aliyuncs\\.com"))
            throw new Exception("当前个人版支持北京地域的阿里云官方接口");
        if (path==null)path="";
        while(path.endsWith("/"))path=path.substring(0,path.length()-1);
        if(path.endsWith("/chat/completions"))path=path.substring(0,path.length()-17);
        if(!path.equals("/compatible-mode/v1"))throw new Exception("请复制OpenAI兼容地址，末尾应为 /compatible-mode/v1");
        return "https://"+host+path;
    }
    public static String model(String raw) throws Exception {
        if(raw==null||!raw.matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,99}"))throw new Exception("模型名称格式不正确");
        return raw;
    }
    public static void key(String raw) throws Exception {
        if(raw==null||!raw.startsWith("sk-")||raw.length()<16||raw.length()>512||!raw.matches("[!-~]+"))
            throw new Exception("密钥格式不正确，请复制完整API Key");
    }
    public static int limit(String raw) throws Exception {
        try {int value=Integer.parseInt(raw.trim());if(value>=0&&value<=100)return value;}catch(Exception ignored){}
        throw new Exception("每日次数请输入0至100，0表示停用");
    }
    public static String usageDay(String today,String saved) {return saved!=null&&saved.compareTo(today)>0?saved:today;}
}
