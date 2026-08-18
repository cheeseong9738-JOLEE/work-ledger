# 我的工作台帐 — Supabase + Vercel + Telegram 推播版

从 Claude Artifact 单页 HTML(`window.storage` 版)改造成的正式部署版本。纯静态网站(HTML/CSS/JS,没有打包步骤),数据存在 Supabase,部署在 Vercel,每天早上会用 Telegram Bot 推播提醒。

只有 2 个登入账号:**admin**(你自己,能看能改所有数据)和 **boss**(老板,只能看,不能改)。

跟 `HRMS DOC` 那个项目是同一套架构,如果你已经走过一次那边的流程,这边会很眼熟。

---

## 一、建立 Supabase 项目

1. 去 [supabase.com](https://supabase.com) 用你现有的账号登入 → **New Project**(免费方案即可),项目名字建议叫 `工作台帐` 或 `work-ledger`,记住设定的数据库密码。
2. 项目建好后,左边选单 **SQL Editor** → New query,把这个仓库里的 [supabase/schema.sql](supabase/schema.sql) 整份贴上去,点 **Run**。
   - 这一步会建好 `profiles` 表 + `board_state` 表(存全部七大分类数据的那一行)+ 所有权限规则(RLS)+ 初始的示范数据(照搬你原本 Artifact 版本里的内容)。
3. 左边选单 **Authentication → Users** → **Add user**,建 2 个账号:
   - 一个给你自己用(admin),例如 `jolee@yourdomain.com`,设一个密码
   - 一个给老板用(boss),例如 `boss@yourdomain.com`,设一个密码
   - 建好后点进每个用户,复制它的 **User UID**(一串 uuid)
4. 回到 **SQL Editor**,执行(把 UUID 换成上一步复制的):
   ```sql
   insert into public.profiles (id, role, display_name) values
     ('<admin 用户的 UUID>', 'admin', 'Jolee'),
     ('<boss 用户的 UUID>', 'boss', '老板');
   ```
5. 左边选单 **Project Settings → API**,记下两个值:
   - **Project URL**(例如 `https://xxxx.supabase.co`)
   - **anon public** key(一长串字符)
   - 同一页往下还有 **Project Reference ID**(网址中间那一段,例如 `xxxx`),等一下设 Telegram 排程会用到。

## 二、把 Project URL / anon key 填进代码

打开 [js/config.js](js/config.js),把两个占位值换成上一步记下的:

```js
window.SUPABASE_URL = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = '你的 anon public key';
```

> 这个 anon key 本来就是设计给前端公开使用的(不是密钥),真正的权限管控是 schema.sql 里设的 RLS 规则,所以放心跟着代码一起上传到 GitHub。

## 三、本地测试(部署前先自己看一下)

纯静态文件,用 Python 内建的小型服务器就能预览:

```bash
cd "工作台帐"
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`,应该会看到登入页。分别用 admin / boss 两个账号登入,确认:
- admin 能看到每个分类的「新增」「删除」「打勾」控件
- boss 完全看不到新增/删除/编辑控件,打勾按钮也是灰的、点了没反应,右上角会显示「👁️ 老板 · 只读」

## 四、部署到 Vercel

这是纯静态网站,不需要 build 步骤:

1. 把这个文件夹推到一个新的 GitHub repo(`git init` → `git add` → `git commit` → 推上去)
2. 去 [vercel.com](https://vercel.com) 用 GitHub 账号登入 → **Add New Project** → 选这个 repo
3. Framework Preset 选 **Other**(不需要 build command,不需要 output directory)
4. Deploy,等个几十秒会给你一个 `xxx.vercel.app` 网址
5. 之后每次改代码、推到 GitHub,Vercel 会自动重新部署

## 五、设定 Telegram 推播

### 5.1 建 Telegram Bot

1. Telegram 里搜索 **@BotFather**,点开始聊天
2. 发送 `/newbot`,照指示取个 bot 名字(随便取,例如 `我的工作台帐提醒`)和一个以 `bot` 结尾的 username(例如 `my_work_ledger_bot`)
3. 建好后 BotFather 会给你一串 **Bot Token**(格式类似 `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`),记下来

### 5.2 拿到你自己的 chat id

1. 在 Telegram 搜到你刚建的 bot,点进去发一条任意消息(比如 `hi`)——**一定要先发一条消息,不然下一步拿不到 chat id**
2. 浏览器打开(把 `<TOKEN>` 换成你的 Bot Token):
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. 页面会返回一段 JSON,里面找 `"chat":{"id":123456789,...}`,那个数字就是你的 **chat id**

### 5.3 部署 Edge Function

需要先在电脑装 Supabase CLI(如果还没装):

```bash
brew install supabase/tap/supabase
```

然后登入并连接到你的项目:

```bash
supabase login
cd "工作台帐"
supabase link --project-ref <你的 Project Reference ID>
```

设定两个密钥(用你 5.1 / 5.2 拿到的值):

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=你的Bot Token
supabase secrets set TELEGRAM_CHAT_ID=你的chat id
```

部署 Edge Function(`--no-verify-jwt` 是因为这个 function 会被排程自动呼叫,不是网页登入用户呼叫,不需要检查登入身份):

```bash
supabase functions deploy notify --no-verify-jwt
```

手动测试一次(应该会在 Telegram 收到一条消息):

```bash
curl -X POST https://<你的 Project Reference ID>.supabase.co/functions/v1/notify
```

### 5.4 设定每天自动排程

打开 [supabase/cron.sql](supabase/cron.sql),把里面 `<YOUR_PROJECT_REF>` 换成你的 Project Reference ID,整份贴到 Supabase 后台 **SQL Editor** 执行。

这样设定好之后,每天马来西亚时间早上 8 点,系统会自动检查所有分类里「已逾期」或「3 天内到期」的事项,加上还没处理的错题记录,整理成一条消息推播到你的 Telegram。

## 六、日常使用

- **backup 数据**:定期去 Supabase 后台 **Table Editor** → `board_state`,右上角 Export 存一份 JSON 到你的 Google Drive。
- **老板要看数据**:给老板 boss 账号的 email + 密码,他登入后所有 tab 都能看,但看不到新增/编辑/删除的按钮,打勾也点不动。
- **改推播时间**:去 `cron.sql` 里把 `'0 0 * * *'` 改成别的 cron 表达式(记得算好 UTC 跟马来西亚时间差 8 小时),重新贴到 SQL Editor 执行(先 `select cron.unschedule('daily-telegram-notify');` 再重新 `cron.schedule`)。
- **手动触发一次推播**(想临时看看效果):在终端机执行 `curl -X POST https://<Project Reference ID>.supabase.co/functions/v1/notify`。

## 七、文件结构

```
index.html                  登入页
app.html                    主系统(七大分类 + 日历 + 历史记录 + 错题本)
css/style.css                样式(照搬 Artifact 版)
js/config.js                  Supabase 连接设定(要填自己的值)
js/supabaseClient.js          登入检查 / 角色判断 / 只读模式套用
js/state.js                    日期工具函数 + loadState()/saveState()(读写 Supabase)
js/board.js                    七大分类的显示与操作逻辑(照搬 Artifact 版业务逻辑)
js/main.js                     主入口(登入检查、载入数据)
supabase/schema.sql            数据库结构 + 权限规则 + 初始示范数据
supabase/functions/notify/     Telegram 推播的 Edge Function
supabase/cron.sql              每日推播排程设定
```

## 八、跟原本 Artifact 版本的差异

- **共享模式**整个移除,改成真的 admin/boss 两个账号 + 数据库权限控管(RLS),不再是「同一个链接大家都能改」。
- **「🔄 换成正式清单」重置按钮**移除(那是开发调试用的)。
- 新增 **Telegram 每日推播**,不用打开网页也会收到逾期/即将到期提醒。
- 数据结构(七大分类的 JSON 格式)完全没变,原本 Artifact 版本熟悉的操作方式(打勾、加步骤、周期重置)都一样。

## 九、还没做的功能(这次范围之外,以后可以再加)

- 老板端的即时同步(目前老板要手动刷新页面才看得到你最新的更新;可以之后用 Supabase Realtime 加自动刷新)
- 一天多次的推播频率(目前是每天早上 8 点一次;可以之后在 `cron.sql` 里加第二个排程做傍晚检查)
- Web Push(手机主屏幕通知),目前先用 Telegram 顶着
