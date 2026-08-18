// 把下面两个值换成你自己 Supabase 项目的(Project Settings → API 页面可以找到)
// anon/public key 是设计给前端公开使用的(不是密钥),真正的权限控管靠数据库的 RLS 规则(schema.sql 里已经设好),
// 所以这个 key 写在这里、跟着代码一起放上 GitHub/Vercel 是安全的。
window.SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
