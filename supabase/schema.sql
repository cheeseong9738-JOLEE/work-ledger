-- 我的工作台帐 — Supabase schema
-- 在 Supabase 项目的 SQL Editor 里整份贴上执行一次即可。
-- 执行顺序:先建 profiles,再建 board_state,最后设 RLS 和初始数据。

create extension if not exists pgcrypto;

-- ============================================================
-- 1. profiles(跟 auth.users 一对一,存 role:admin 能改,boss 只能看)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','boss')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_boss()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'boss'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 2. board_state — 整个工作台帐只有这一张表、一行数据
-- 七大分类(每月/每周/每年/特定日期/老板交办/备注/错题)全部放在 data 这个 JSON 字段里,
-- 结构跟原本 Claude Artifact 版本的 state 对象完全一样,只是持久化方式从 window.storage 换成这里。
-- ============================================================
create table public.board_state (
  id smallint primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint board_state_singleton check (id = 1)
);

create trigger trg_board_state_updated_at
  before update on public.board_state
  for each row execute function public.set_updated_at();

alter table public.board_state enable row level security;

create policy "board_state_select"
  on public.board_state for select
  using (is_admin() or is_boss());

create policy "board_state_update"
  on public.board_state for update
  using (is_admin())
  with check (is_admin());

-- 老板/admin 都不需要 insert/delete 权限:这一行由下面的初始数据建好之后就不再新增或删除。

-- ============================================================
-- 3. 初始数据(照搬原本 Claude Artifact 版本的 defaultSeed)
-- 之后想调整内容,直接在网页上编辑就好,不需要再动这段 SQL。
-- ============================================================
insert into public.board_state (id, data) values (1, '{
  "monthly": [
    {"id":"m-salary","day":4,"title":"出 SALARY","steps":[{"id":"m-salary-s1","text":"FIRST ONE"},{"id":"m-salary-s2","text":"CS FIRSTONE"},{"id":"m-salary-s3","text":"TPP"}]},
    {"id":"m-epf","day":4,"title":"EPF / SOCSO / EIS 申报及缴付","steps":[{"id":"m-epf-s1","text":"FIRST ONE"},{"id":"m-epf-s2","text":"CS FIRSTONE"}]},
    {"id":"m-pcb","day":4,"title":"PCB (MTD) 税务提交","steps":[{"id":"m-pcb-s1","text":"FIRST ONE"},{"id":"m-pcb-s2","text":"CS FIRSTONE"}]},
    {"id":"m-hrdf","day":4,"title":"HRDF","steps":[{"id":"m-hrdf-s1","text":"FIRSTONE"}]},
    {"id":"m-bank","day":4,"title":"银行对账 (Bank Reconciliation)","steps":[{"id":"m-bank-s1","text":"FIRST ONE"},{"id":"m-bank-s2","text":"CS FIRSTONE"}]},
    {"id":"m-acc","day":10,"title":"准备文件给 Acc","steps":[{"id":"m-acc-s1","text":"FIRSTONE"},{"id":"m-acc-s2","text":"CS FIRSTONE"}]},
    {"id":"m-payroll","day":25,"title":"员工薪水计算"},
    {"id":"m-payroll2","day":1,"title":"再次计算员工薪水和统计"}
  ],
  "monthlyDone": {},
  "monthlyDoneDates": {},
  "monthlyStepsDone": {},
  "weekly": [
    {"id":"w-supplier1","weekday":1,"title":"FIRSTONE SUPPLIER PAYMENT & CLAIM"},
    {"id":"w-reviews","weekday":1,"title":"GOOGLE REVIEWS & GRAB REVIEWS REPLY & 统计差评给老板娘"},
    {"id":"w-shopee","weekday":1,"title":"对 SHOPEE & TAOBAO 的订单"},
    {"id":"w-supplier2","weekday":5,"title":"CS FIRSTONE SUPPLIER PAYMENT & CLAIM"}
  ],
  "weeklyDone": {},
  "weeklyDoneDates": {},
  "weeklyStepsDone": {},
  "yearly": [
    {"id":"y-hp1","month":6,"day":24,"title":"HIRE PURCHASE VRC6776 (RM3000) RENEW","note":"现在这期:2026.06.24 - 2027.06.24","intervalYears":1,"anchorYear":2027},
    {"id":"y-hp2","month":12,"day":2,"title":"HIRE PURCHASE JUS6776 (RM1279) RENEW","note":"现在这期:2025.12.03 - 2026.12.02","intervalYears":1,"anchorYear":2026},
    {"id":"y-rent1","month":7,"day":2,"title":"15 RADIN RENTAL FEES (RM3200) RENEW","note":"现在这期:2026.08.02 - 2027.07.02","intervalYears":1,"anchorYear":2027},
    {"id":"y-rent2","month":7,"day":2,"title":"29 RENTAL FEES (RM8000) RENEW","note":"现在这期:2026.08.02 - 2027.07.02","intervalYears":1,"anchorYear":2027}
  ],
  "yearlyDone": {},
  "yearlyDoneDates": {},
  "yearlyStepsDone": {},
  "dated": [
    {"id":"d-jtk","date":"2026-07-07","title":"去 JTK 拿宿舍的 CERT","done":false},
    {"id":"d-award","date":"2026-07-11","title":"MAI KURANG 颁奖典礼 9.30AM-10PM","done":false}
  ],
  "adhoc": [
    {"id":"a-winner","deadline":"2026-07-11","title":"处理好 2025 WINNER LIST TO ACC","done":false}
  ],
  "notes": [
    {"id":"n-abu","text":"ABU 借粮 RM500","done":false,"addedDate":"2026-08-18"},
    {"id":"n-ph","text":"这个月少出 PH 给某人,下个月补回","done":false,"addedDate":"2026-08-18"}
  ],
  "mistakes": []
}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 建好之后手动做的事(Supabase 后台操作,SQL 做不到):
-- 1. Authentication → Users → 新增 2 个用户(admin 的 email + boss 的 email,各设一个密码)
-- 2. 记下这两个用户的 UUID(Users 列表点进去可以看到 id)
-- 3. 回到 SQL Editor 执行(把下面的 UUID 换成真的):
--
--    insert into public.profiles (id, role, display_name) values
--      ('<admin-user-uuid>', 'admin', 'Jolee'),
--      ('<boss-user-uuid>', 'boss', '老板');
-- ============================================================
