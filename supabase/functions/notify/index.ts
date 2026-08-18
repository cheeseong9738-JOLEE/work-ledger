// Supabase Edge Function:每天定时读 board_state,把逾期/即将到期的事项 + 未处理的错题
// 整理成一条中文消息,推播到 Telegram。由 supabase/cron.sql 里的排程每天呼叫一次。
//
// 需要的环境变量(用 `supabase secrets set` 设定,不写进代码):
//   TELEGRAM_BOT_TOKEN   — 跟 @BotFather 申请的 Bot Token
//   TELEGRAM_CHAT_ID     — 你自己的 Telegram chat id
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 是 Supabase Edge Function 自动内建的环境变量,不用自己设。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MONTHS_ZH = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const WEEKDAY_ZH = ['','一','二','三','四','五','六','日'];

function pad(n: number){ return String(n).padStart(2,'0'); }

// 用马来西亚时间(UTC+8)当作「今天」,不用服务器的 UTC 时间,避免差一天
function nowMYT(): Date {
  const utcMs = Date.now();
  return new Date(utcMs + 8 * 60 * 60 * 1000);
}
function todayISO(): string {
  const d = nowMYT();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}
function monthKey(): string {
  const d = nowMYT();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`;
}
function yearKey(): string {
  return String(nowMYT().getUTCFullYear());
}
function isoWeekdayUTC(d: Date){
  const day = d.getUTCDay();
  return day===0 ? 7 : day;
}
function getMondayOfUTC(d: Date){
  const date = new Date(d);
  const day = isoWeekdayUTC(date);
  date.setUTCDate(date.getUTCDate() - (day-1));
  return date;
}
function weekKeyForDateUTC(d: Date){
  const monday = getMondayOfUTC(d);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth()+1)}-${pad(monday.getUTCDate())}`;
}
function daysUntil(dateStr: string): number {
  const today = new Date(todayISO() + 'T00:00:00Z');
  const target = new Date(dateStr + 'T00:00:00Z');
  return Math.round((target.getTime() - today.getTime()) / (1000*60*60*24));
}
function nowHM(): string {
  const d = nowMYT();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function timeToMinutes(t: string): number {
  const [h,m] = t.split(':').map((n:string)=>parseInt(n,10));
  return h*60+m;
}
function isYearlyActiveThisYear(item: any, year: number){
  const interval = item.intervalYears || 1;
  const anchor = item.anchorYear || year;
  if(year < anchor) return false;
  return (year - anchor) % interval === 0;
}

function computeDone(state: any, type: string, item: any, periodKey: string): boolean {
  const steps = item.steps || [];
  const doneMapRoot = type==='daily' ? state.dailyStepsDone
    : type==='monthly' ? state.monthlyStepsDone
    : type==='weekly' ? state.weeklyStepsDone
    : type==='yearly' ? state.yearlyStepsDone
    : null;
  if(steps.length > 0){
    if(!doneMapRoot) return !!item.stepsDone && steps.every((s: any)=>item.stepsDone[s.id]);
    const doneMap = (doneMapRoot[periodKey]||{})[item.id] || {};
    return steps.every((s: any)=>doneMap[s.id]);
  }
  if(type==='daily') return !!(state.dailyDone[periodKey]||{})[item.id];
  if(type==='monthly') return !!(state.monthlyDone[periodKey]||{})[item.id];
  if(type==='weekly') return !!(state.weeklyDone[periodKey]||{})[item.id];
  if(type==='yearly') return !!(state.yearlyDone[periodKey]||{})[item.id];
  return !!item.done;
}

type DueItem = { title: string; typeLabel: string; dleft: number; customNote?: string };

function collectDue(state: any): { overdue: DueItem[]; soon: DueItem[] } {
  const overdue: DueItem[] = [];
  const soon: DueItem[] = [];
  const now = nowMYT();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), dNum = now.getUTCDate();

  function push(title: string, typeLabel: string, dleft: number){
    if(dleft > 3) return;
    if(dleft < 0) overdue.push({title, typeLabel, dleft});
    else soon.push({title, typeLabel, dleft});
  }

  (state.daily||[]).forEach((it: any)=>{
    const dk = todayISO();
    if(computeDone(state, 'daily', it, dk)) return;
    const mins = timeToMinutes(it.time) - timeToMinutes(nowHM());
    if(mins > 60) return;
    if(mins <= 0){
      overdue.push({title: it.title, typeLabel: '每天固定', dleft: -1, customNote: `已过 ${it.time}`});
    } else {
      soon.push({title: it.title, typeLabel: '每天固定', dleft: 0, customNote: `还有 ${mins} 分钟(${it.time} 前)`});
    }
  });

  (state.monthly||[]).forEach((it: any)=>{
    if(computeDone(state, 'monthly', it, monthKey())) return;
    const iso = `${y}-${pad(m+1)}-${pad(it.day)}`;
    push(it.title, '每月固定', daysUntil(iso));
  });

  (state.weekly||[]).forEach((it: any)=>{
    const daysInMonth = new Date(Date.UTC(y, m+1, 0)).getUTCDate();
    for(let day=1; day<=daysInMonth; day++){
      const d = new Date(Date.UTC(y, m, day));
      if(isoWeekdayUTC(d) !== it.weekday) continue;
      const wk = weekKeyForDateUTC(d);
      if(computeDone(state, 'weekly', it, wk)) continue;
      const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
      push(it.title, '每周固定', daysUntil(iso));
    }
  });

  (state.yearly||[]).forEach((it: any)=>{
    if(!isYearlyActiveThisYear(it, y)) return;
    if(computeDone(state, 'yearly', it, yearKey())) return;
    const iso = `${y}-${pad(it.month)}-${pad(it.day)}`;
    push(it.title, '每年固定', daysUntil(iso));
  });

  (state.dated||[]).forEach((it: any)=>{
    if(computeDone(state, 'dated', it, '')) return;
    push(it.title, '特定日期', daysUntil(it.date));
  });

  (state.adhoc||[]).forEach((it: any)=>{
    if(computeDone(state, 'adhoc', it, '')) return;
    push(it.title, '老板交办', daysUntil(it.deadline));
  });

  overdue.sort((a,b)=>a.dleft-b.dleft);
  soon.sort((a,b)=>a.dleft-b.dleft);
  return { overdue, soon };
}

function buildMessage(state: any): string {
  const { overdue, soon } = collectDue(state);
  const unresolvedMistakes = (state.mistakes||[]).filter((m: any)=>!m.resolved);

  const now = nowMYT();
  const dateLabel = `${now.getUTCFullYear()}年${MONTHS_ZH[now.getUTCMonth()]}月${now.getUTCDate()}日`;

  const lines: string[] = [];
  lines.push(`📋 工作台帐 · ${dateLabel}`);

  if(overdue.length===0 && soon.length===0 && unresolvedMistakes.length===0){
    lines.push('');
    lines.push('今天没有逾期或即将到期的事项,也没有未处理的错题提醒 👍');
    return lines.join('\n');
  }

  if(overdue.length>0){
    lines.push('');
    lines.push('⚠️ 已逾期:');
    overdue.forEach(it=> lines.push(`· [${it.typeLabel}] ${it.title}(${it.customNote || `逾期 ${-it.dleft} 天`})`));
  }
  if(soon.length>0){
    lines.push('');
    lines.push('🔔 即将到期:');
    soon.forEach(it=> lines.push(`· [${it.typeLabel}] ${it.title}(${it.customNote || (it.dleft===0?'今天':`还有 ${it.dleft} 天`)})`));
  }
  if(unresolvedMistakes.length>0){
    lines.push('');
    lines.push('📌 开工前看一眼,别再犯:');
    unresolvedMistakes
      .sort((a: any,b: any)=> new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((m: any)=> lines.push(`· ${m.what ? m.what+' — ' : ''}${m.lesson}`));
  }
  return lines.join('\n');
}

Deno.serve(async (_req) => {
  try{
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if(!botToken || !chatId){
      return new Response(JSON.stringify({ error: '缺少 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID,请先用 supabase secrets set 设定' }), { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await sb.from('board_state').select('data').eq('id', 1).single();
    if(error) throw error;

    const message = buildMessage(data.data || {});

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    const tgBody = await tgRes.json();
    if(!tgRes.ok){
      return new Response(JSON.stringify({ error: 'Telegram 发送失败', detail: tgBody }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, message }), { status: 200 });
  }catch(e){
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
