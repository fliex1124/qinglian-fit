package cn.local.qinglianfit;
public final class AiPolicyTest {
    private static int checks;
    interface Task {void run() throws Exception;}
    private static void same(Object a,Object b){if(!a.equals(b))throw new AssertionError(a+" != "+b);checks++;}
    private static void reject(Task t)throws Exception{try{t.run();}catch(Exception expected){checks++;return;}throw new AssertionError("Accepted invalid input");}
    public static void main(String[] args)throws Exception{
        String base="https://dashscope.aliyuncs.com/compatible-mode/v1";
        same(AiPolicy.baseUrl(base),base);same(AiPolicy.baseUrl(base+"/"),base);same(AiPolicy.baseUrl(base+"/chat/completions"),base);
        same(AiPolicy.baseUrl("https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"),"https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
        for(String bad:new String[]{"http://dashscope.aliyuncs.com/compatible-mode/v1","https://example.com/compatible-mode/v1",base+"?token=x",base+"#x","https://user@dashscope.aliyuncs.com/compatible-mode/v1","https://dashscope.aliyuncs.com.evil.test/compatible-mode/v1","https://dashscope.aliyuncs.com:8443/compatible-mode/v1","https://dashscope.aliyuncs.com/api/v1","https://x.cn-beijing.maas.aliyuncs.com.evil.test/compatible-mode/v1","https://dashscope.aliyuncs.com/compatible-mode/v1/../secret"})reject(()->AiPolicy.baseUrl(bad));
        same(AiPolicy.model("qwen3-vl-plus"),"qwen3-vl-plus");reject(()->AiPolicy.model("x\nAuthorization: evil"));
        same(AiPolicy.limit("0"),0);same(AiPolicy.limit("100"),100);reject(()->AiPolicy.limit("-1"));reject(()->AiPolicy.limit("101"));reject(()->AiPolicy.limit("1.2"));
        AiPolicy.key("sk-synthetic-fixture-only");checks++;reject(()->AiPolicy.key("sk-short"));reject(()->AiPolicy.key("sk-this-key contains spaces"));
        same(AiPolicy.usageDay("2026-10-18","2026-10-19"),"2026-10-19");same(AiPolicy.usageDay("2026-10-20","2026-10-19"),"2026-10-20");
        System.out.println(checks+" native AI policy checks passed; no Android device or network used");
    }
}
