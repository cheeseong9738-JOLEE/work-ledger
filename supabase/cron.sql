-- 排程:每天马来西亚时间早上 8 点(= UTC 0 点)呼叫 notify Edge Function,推播 Telegram 消息。
-- 部署 Edge Function 时要加 --no-verify-jwt(見 README),这样这里不用带任何认证 header 也能呼叫成功:
--   supabase functions deploy notify --no-verify-jwt
--
-- 在 Supabase 项目的 SQL Editor 里执行以下内容(先执行一次开启 extension,再执行排程那段):

-- 1) 开启需要的 extension(如果后台 Database → Extensions 页面已经手动开过 pg_cron / pg_net,这两行会自动跳过)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2) 建立排程任务
--    把 <YOUR_PROJECT_REF> 换成你的 Supabase 项目 Reference ID(Project Settings → General 页面可以看到,
--    也就是你的 Project URL https://<YOUR_PROJECT_REF>.supabase.co 中间那一段)
select cron.schedule(
  'daily-telegram-notify',        -- 排程名字,之后要改/删都是用这个名字
  '0 0 * * *',                    -- 每天 UTC 0 点 = 马来西亚时间早上 8 点
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 之后如果想暂停/取消这个排程,执行:
--   select cron.unschedule('daily-telegram-notify');
-- 想改时间,先 unschedule 再重新 cron.schedule 一次新的 cron 表达式即可。
