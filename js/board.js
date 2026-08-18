// 七大分类的显示与操作逻辑。canEdit() 来自 supabaseClient.js(= 目前登入的是不是 admin)。
// 老板(boss)登入时 canEdit() 恒为 false:所有新增/编辑/删除控件不会渲染,
// 打勾/勾选按钮会加 disabled,attachPanelEvents 里每个会修改数据的处理函数也会在最前面挡掉,双重保险。

const MONTHS_ZH = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const WEEKDAY_ZH = ['','一','二','三','四','五','六','日'];

let activeTab = 'calendar';

function renderToday(){
  const d = new Date();
  const box = document.getElementById('todayBox');
  if(!box) return;
  box.innerHTML = `<b>${d.getFullYear()}年${MONTHS_ZH[d.getMonth()]}月${d.getDate()}日</b>今天`;
}

function pendingCount(list, doneKeyFn){
  return list.filter(it => !doneKeyFn(it)).length;
}

function escapeHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function listByType(type){
  if(type==='daily') return state.daily;
  if(type==='monthly') return state.monthly;
  if(type==='weekly') return state.weekly;
  if(type==='yearly') return state.yearly;
  if(type==='dated') return state.dated;
  return state.adhoc;
}

function formatTime12(t){
  if(!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr,10);
  const ap = h>=12 ? 'PM' : 'AM';
  h = h % 12; if(h===0) h = 12;
  return `${h}:${mStr}${ap}`;
}

function timeToMinutes(t){
  const [h,m] = t.split(':').map(n=>parseInt(n,10));
  return h*60+m;
}

function minutesUntilTime(t){
  const now = new Date();
  return timeToMinutes(t) - (now.getHours()*60 + now.getMinutes());
}

function getNote(type,id){
  const it = listByType(type).find(x=>x.id===id);
  return it ? (it.note||'') : '';
}

function setNote(type,id,val){
  const it = listByType(type).find(x=>x.id===id);
  if(it) it.note = val;
}

function getItemTitle(type,id){
  const it = listByType(type).find(x=>x.id===id);
  return it ? it.title : null;
}

function getLinkedMistakes(type,id){
  return state.mistakes.filter(m => m.linkType===type && m.linkId===id && !m.resolved);
}

function getStepsDoneMap(type, item, weekOverride){
  if(type==='daily'){
    const dk = weekOverride || todayISO();
    if(!state.dailyStepsDone[dk]) state.dailyStepsDone[dk] = {};
    if(!state.dailyStepsDone[dk][item.id]) state.dailyStepsDone[dk][item.id] = {};
    return state.dailyStepsDone[dk][item.id];
  }
  if(type==='monthly'){
    const mk = monthKey();
    if(!state.monthlyStepsDone[mk]) state.monthlyStepsDone[mk] = {};
    if(!state.monthlyStepsDone[mk][item.id]) state.monthlyStepsDone[mk][item.id] = {};
    return state.monthlyStepsDone[mk][item.id];
  }
  if(type==='weekly'){
    const wk = weekOverride || weekKey();
    if(!state.weeklyStepsDone[wk]) state.weeklyStepsDone[wk] = {};
    if(!state.weeklyStepsDone[wk][item.id]) state.weeklyStepsDone[wk][item.id] = {};
    return state.weeklyStepsDone[wk][item.id];
  }
  if(type==='yearly'){
    const yk = yearKey();
    if(!state.yearlyStepsDone[yk]) state.yearlyStepsDone[yk] = {};
    if(!state.yearlyStepsDone[yk][item.id]) state.yearlyStepsDone[yk][item.id] = {};
    return state.yearlyStepsDone[yk][item.id];
  }
  if(!item.stepsDone) item.stepsDone = {};
  return item.stepsDone;
}

function isYearlyActiveThisYear(item, year){
  const interval = item.intervalYears || 1;
  const anchor = item.anchorYear || year;
  if(year < anchor) return false;
  return (year - anchor) % interval === 0;
}

function yearlyNextDueYear(item, fromYear){
  const interval = item.intervalYears || 1;
  let anchor = item.anchorYear || fromYear;
  while(anchor < fromYear) anchor += interval;
  return anchor;
}

function computeDoneForKey(type, item, key){
  const steps = item.steps || [];
  if(steps.length > 0){
    let doneMap = {};
    if(type==='daily') doneMap = (state.dailyStepsDone[key]||{})[item.id] || {};
    else if(type==='monthly') doneMap = (state.monthlyStepsDone[key]||{})[item.id] || {};
    else if(type==='weekly') doneMap = (state.weeklyStepsDone[key]||{})[item.id] || {};
    else if(type==='yearly') doneMap = (state.yearlyStepsDone[key]||{})[item.id] || {};
    return steps.every(s=>doneMap[s.id]);
  }
  if(type==='daily') return !!(state.dailyDone[key]||{})[item.id];
  if(type==='monthly') return !!(state.monthlyDone[key]||{})[item.id];
  if(type==='weekly') return !!(state.weeklyDone[key]||{})[item.id];
  if(type==='yearly') return !!(state.yearlyDone[key]||{})[item.id];
  return false;
}

function computeDone(type, item, weekOverride){
  const steps = item.steps || [];
  if(steps.length > 0){
    const doneMap = getStepsDoneMap(type, item, weekOverride);
    return steps.every(s => doneMap[s.id]);
  }
  if(type==='daily'){
    const dk = weekOverride || todayISO();
    return !!(state.dailyDone[dk]||{})[item.id];
  }
  if(type==='monthly'){
    const mk = monthKey();
    return !!(state.monthlyDone[mk]||{})[item.id];
  }
  if(type==='weekly'){
    const wk = weekOverride || weekKey();
    return !!(state.weeklyDone[wk]||{})[item.id];
  }
  if(type==='yearly'){
    const yk = yearKey();
    return !!(state.yearlyDone[yk]||{})[item.id];
  }
  return !!item.done;
}

function advanceYearlyOnComplete(item, wasDone, isDoneNow){
  if(wasDone === isDoneNow) return;
  const interval = item.intervalYears || 1;
  if(interval <= 1) return;
  const cy = new Date().getFullYear();
  if(isDoneNow){
    item.anchorYear = cy + interval;
  } else {
    item.anchorYear = cy;
  }
}

function renderStamp(type, item, manualDone, weekOverride){
  const steps = item.steps || [];
  if(steps.length > 0){
    const doneMap = getStepsDoneMap(type, item, weekOverride);
    const doneCount = steps.filter(s=>doneMap[s.id]).length;
    const allDone = doneCount===steps.length;
    return `<div class="stamp steps-stamp ${allDone?'on':''}" aria-label="步骤进度">${doneCount}/${steps.length}</div>`;
  }
  let label = '';
  if(manualDone){
    label = '已办';
  } else if(type==='daily'){
    label = '每天<br>'+formatTime12(item.time);
  } else if(type==='monthly'){
    label = '每月<br>'+item.day+'号';
  } else if(type==='weekly'){
    label = '每周<br>'+WEEKDAY_ZH[item.weekday];
  } else if(type==='yearly'){
    label = item.month+'月<br>'+item.day+'号';
  }
  const weekAttr = weekOverride ? ` data-week="${weekOverride}"` : '';
  const editAttrs = canEdit() ? '' : ' disabled';
  return `<button class="stamp ${manualDone?'on':''} ${canEdit()?'':'readonly'}" data-action="toggle-${type}" data-id="${item.id}"${weekAttr}${editAttrs} aria-label="标记完成">${label}</button>`;
}

function renderStampOverview(item){
  const steps = item.steps || [];
  if(steps.length > 0){
    const doneMap = getStepsDoneMap(item.type, item, item.weekKey);
    const doneCount = steps.filter(s=>doneMap[s.id]).length;
    const allDone = doneCount===steps.length;
    return `<div class="stamp steps-stamp ${allDone?'on':''}" aria-label="步骤进度">${doneCount}/${steps.length}</div>`;
  }
  const weekAttr = item.type==='weekly' ? ` data-week="${item.weekKey}"` : '';
  const editAttrs = canEdit() ? '' : ' disabled';
  return `<button class="stamp ${item.done?'on':''} ${canEdit()?'':'readonly'}" data-action="toggle-overview" data-type="${item.type}" data-id="${item.id}"${weekAttr}${editAttrs} aria-label="标记完成">${item.done?'已办':''}</button>`;
}

function renderStepsBlock(type, item, allowEdit, weekOverride){
  const steps = item.steps || [];
  const doneMap = getStepsDoneMap(type, item, weekOverride);
  const weekAttr = weekOverride ? ` data-week="${weekOverride}"` : '';
  allowEdit = allowEdit && canEdit();
  let html = '';
  if(steps.length > 0){
    html += `<div class="steps-list-wrap"><ul class="steps-list">`;
    steps.forEach(s=>{
      const checked = !!doneMap[s.id];
      const stepDisabled = canEdit() ? '' : ' disabled';
      html += `<li class="step-item ${checked?'checked':''}">
        <button class="step-check ${checked?'on':''}" data-action="toggle-step" data-type="${type}" data-id="${item.id}" data-step="${s.id}"${weekAttr}${stepDisabled} aria-label="完成步骤">${checked?'✓':''}</button>
        <span class="step-text">${escapeHtml(s.text)}</span>
        ${allowEdit ? `<button class="icon-btn" data-action="del-step" data-type="${type}" data-id="${item.id}" data-step="${s.id}" aria-label="删除步骤">✕</button>` : ''}
      </li>`;
    });
    html += `</ul></div>`;
  }
  if(allowEdit){
    html += `<div class="step-add-row">
      <input type="text" class="step-input" data-type="${type}" data-id="${item.id}" placeholder="加一个步骤,例如:核对打卡记录">
      <button class="step-add-btn" data-action="add-step" data-type="${type}" data-id="${item.id}">+ 加步骤</button>
    </div>`;
  }
  return html;
}

function buildLinkOptions(){
  const opts = [];
  state.daily.forEach(it=> opts.push({type:'daily', id:it.id, label:`[每天固定] ${it.title}`}));
  state.monthly.forEach(it=> opts.push({type:'monthly', id:it.id, label:`[每月固定] ${it.title}`}));
  state.weekly.forEach(it=> opts.push({type:'weekly', id:it.id, label:`[每周固定] ${it.title}`}));
  state.yearly.forEach(it=> opts.push({type:'yearly', id:it.id, label:`[每年固定] ${it.title}`}));
  state.dated.forEach(it=> opts.push({type:'dated', id:it.id, label:`[特定日期] ${it.title}`}));
  state.adhoc.forEach(it=> opts.push({type:'adhoc', id:it.id, label:`[老板交办] ${it.title}`}));
  return opts;
}

function renderNoteLine(type, id, note){
  const linked = getLinkedMistakes(type, id);
  let html = `<div class="note-line" data-type="${type}" data-id="${id}">`;
  if(note){
    if(canEdit()){
      html += `<div><span class="note-text" data-action="show-note">📌 ${escapeHtml(note)}</span></div>`;
    } else {
      html += `<div><span>📌 ${escapeHtml(note)}</span></div>`;
    }
  } else if(canEdit()){
    html += `<div><span class="note-add" data-action="show-note">+ 加注意事项(避免下次做错)</span></div>`;
  }
  linked.forEach(m=>{
    html += `<div class="linked-mistake">⚠️ ${escapeHtml((m.date||'').slice(5))} 曾经做错:${escapeHtml(m.what||'')} → <b>下次注意:${escapeHtml(m.lesson||'')}</b></div>`;
  });
  html += `</div>`;
  return html;
}

function isInCurrentMonth(dateStr){
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}

function daysUntil(dateStr){
  const today = new Date(todayISO());
  const target = new Date(dateStr);
  return Math.round((target-today)/(1000*60*60*24));
}

function countUrgentPending(type){
  const now = new Date();
  if(type==='daily'){
    return state.daily.filter(it=> !computeDone('daily', it) && minutesUntilTime(it.time) <= 60).length;
  }
  if(type==='monthly'){
    return state.monthly.filter(it=>{
      if(computeDone('monthly', it)) return false;
      const iso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(it.day)}`;
      return daysUntil(iso) <= 3;
    }).length;
  }
  if(type==='weekly'){
    return state.weekly.filter(it=>{
      const wk = weekKey();
      if(computeDone('weekly', it, wk)) return false;
      const monday = getMondayOf(now);
      const occ = new Date(monday);
      occ.setDate(monday.getDate() + (it.weekday - 1));
      const iso = `${occ.getFullYear()}-${pad(occ.getMonth()+1)}-${pad(occ.getDate())}`;
      return daysUntil(iso) <= 3;
    }).length;
  }
  if(type==='yearly'){
    return state.yearly.filter(it=>{
      if(!isYearlyActiveThisYear(it, now.getFullYear())) return false;
      if(computeDone('yearly', it)) return false;
      const iso = `${now.getFullYear()}-${pad(it.month)}-${pad(it.day)}`;
      return daysUntil(iso) <= 3;
    }).length;
  }
  if(type==='dated'){
    return state.dated.filter(it=> !computeDone('dated', it) && daysUntil(it.date) <= 3).length;
  }
  if(type==='adhoc'){
    return state.adhoc.filter(it=> !computeDone('adhoc', it) && daysUntil(it.deadline) <= 3).length;
  }
  return 0;
}

function updateTabTitle(){
  const total = ['daily','monthly','weekly','yearly','dated','adhoc'].reduce((sum,t)=>sum+countUrgentPending(t), 0);
  document.title = total > 0 ? `⚠️${total} 我的工作台帐` : '我的工作台帐';
}

function hasUrgentPending(type){
  const now = new Date();
  if(type==='daily'){
    return state.daily.some(it=> !computeDone('daily', it) && minutesUntilTime(it.time) <= 60);
  }
  if(type==='monthly'){
    return state.monthly.some(it=>{
      if(computeDone('monthly', it)) return false;
      const iso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(it.day)}`;
      return daysUntil(iso) <= 3;
    });
  }
  if(type==='weekly'){
    return state.weekly.some(it=>{
      const wk = weekKey();
      if(computeDone('weekly', it, wk)) return false;
      const monday = getMondayOf(now);
      const occ = new Date(monday);
      occ.setDate(monday.getDate() + (it.weekday - 1));
      const iso = `${occ.getFullYear()}-${pad(occ.getMonth()+1)}-${pad(occ.getDate())}`;
      return daysUntil(iso) <= 3;
    });
  }
  if(type==='yearly'){
    return state.yearly.some(it=>{
      if(!isYearlyActiveThisYear(it, now.getFullYear())) return false;
      if(computeDone('yearly', it)) return false;
      const iso = `${now.getFullYear()}-${pad(it.month)}-${pad(it.day)}`;
      return daysUntil(iso) <= 3;
    });
  }
  if(type==='dated'){
    return state.dated.some(it=> !computeDone('dated', it) && daysUntil(it.date) <= 3);
  }
  if(type==='adhoc'){
    return state.adhoc.some(it=> !computeDone('adhoc', it) && daysUntil(it.deadline) <= 3);
  }
  if(type==='overview'){
    return ['daily','monthly','weekly','yearly','dated','adhoc'].some(t=>hasUrgentPending(t));
  }
  return false;
}

function renderTabs(){
  const dailyPending = state.daily.filter(it => !computeDone('daily', it)).length;
  const monthlyPending = state.monthly.filter(it => !computeDone('monthly', it)).length;
  const weeklyPending = state.weekly.filter(it => !computeDone('weekly', it)).length;
  const yearlyPending = state.yearly.filter(it => isYearlyActiveThisYear(it, new Date().getFullYear()) && !computeDone('yearly', it)).length;
  const datedPending = state.dated.filter(it => !computeDone('dated', it)).length;
  const adhocPending = state.adhoc.filter(it => !computeDone('adhoc', it)).length;
  const now0 = new Date();
  const daysInThisMonth0 = new Date(now0.getFullYear(), now0.getMonth()+1, 0).getDate();
  let weeklyOccPending = 0;
  state.weekly.forEach(it=>{
    for(let day=1; day<=daysInThisMonth0; day++){
      const d = new Date(now0.getFullYear(), now0.getMonth(), day);
      if(isoWeekday(d) !== it.weekday) continue;
      const wk = weekKeyForDate(d);
      if(!computeDone('weekly', it, wk)) weeklyOccPending++;
    }
  });

  const overviewPending = dailyPending
    + monthlyPending
    + weeklyOccPending
    + state.dated.filter(it=>!computeDone('dated',it) && isInCurrentMonth(it.date)).length
    + state.adhoc.filter(it=>!computeDone('adhoc',it) && isInCurrentMonth(it.deadline)).length
    + state.yearly.filter(it=>isYearlyActiveThisYear(it, new Date().getFullYear()) && !computeDone('yearly',it) && it.month===(new Date().getMonth()+1)).length;

  const tabs = [
    {key:'calendar', label:'日历', cnt:null},
    {key:'overview', label:'本月总览', cnt:overviewPending, urgent:hasUrgentPending('overview')},
    {key:'daily', label:'每天固定', cnt:dailyPending, urgent:hasUrgentPending('daily')},
    {key:'weekly', label:'每周固定', cnt:weeklyPending, urgent:hasUrgentPending('weekly')},
    {key:'monthly', label:'每月固定', cnt:monthlyPending, urgent:hasUrgentPending('monthly')},
    {key:'yearly', label:'每年固定', cnt:yearlyPending, urgent:hasUrgentPending('yearly')},
    {key:'dated', label:'特定日期', cnt:datedPending, urgent:hasUrgentPending('dated')},
    {key:'adhoc', label:'老板临时交办', cnt:adhocPending, urgent:hasUrgentPending('adhoc')},
    {key:'notes', label:'备注事项', cnt:state.notes.filter(n=>!n.done).length},
    {key:'history', label:'历史记录', cnt:null},
    {key:'mistakes', label:'错题记录', cnt:state.mistakes.length},
  ];
  const nav = document.getElementById('tabsNav');
  nav.innerHTML = tabs.map(t => `
    <button class="${t.key===activeTab?'active':''}" data-tab="${t.key}">
      ${t.label}${t.cnt!==null?`<span class="cnt ${t.urgent?'cnt-urgent':''}">${t.cnt}</span>`:''}
    </button>
  `).join('');
  nav.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeTab = btn.dataset.tab;
      if(activeTab==='history') historyViewMonth = null;
      render();
    });
  });
}

function renderReminderBanner(){
  const mistakeLessons = [...state.mistakes]
    .filter(m => !m.resolved)
    .sort((a,b)=> new Date(b.date) - new Date(a.date))
    .map(m => `${m.what ? m.what+' — ' : ''}${m.lesson}`);

  if(mistakeLessons.length===0) return '';

  return `
    <div class="reminder-banner">
      <div class="reminder-title">⚠️ 开工前看一眼,别再犯</div>
      <ul class="reminder-list">
        ${mistakeLessons.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}
      </ul>
    </div>
  `;
}

let historyViewMonth = null;

function renderHistoryPanel(){
  const monthKeys = Object.keys(state.monthlyDone).sort();
  const currentMk = monthKey();
  const hasAnyHistory = monthKeys.length > 0
    || Object.keys(state.dailyDone||{}).length > 0
    || Object.keys(state.weeklyDone||{}).length > 0
    || Object.keys(state.yearlyDone||{}).length > 0
    || state.dated.some(it=>it.done)
    || state.adhoc.some(it=>it.done);
  if(!hasAnyHistory){
    return `<div class="empty">还没有历史记录。当你在任何一个分类打勾之后,记录会自动保存在这里,月份过去也不会消失,可以随时回来查。</div>`;
  }
  if(!monthKeys.includes(currentMk)) monthKeys.push(currentMk);
  monthKeys.sort();

  const selectedMk = (historyViewMonth && monthKeys.includes(historyViewMonth)) ? historyViewMonth : currentMk;
  const isOngoing = selectedMk === currentMk;

  const monthOptsHtml = monthKeys.slice().reverse().map(mk=>{
    const [y,m] = mk.split('-');
    const label = `${y}年${parseInt(m,10)}月${mk===currentMk?'(进行中)':''}`;
    return `<option value="${mk}" ${mk===selectedMk?'selected':''}>${label}</option>`;
  }).join('');

  const dateMap = state.monthlyDoneDates[selectedMk] || {};
  const [y,m] = selectedMk.split('-');
  const selYear = parseInt(y,10), selMonth = parseInt(m,10);

  const typeLabel = {daily:'每天固定', monthly:'每月固定', weekly:'每周固定', yearly:'每年固定', dated:'特定日期', adhoc:'老板交办', note:'备注事项'};
  const typeClass = {daily:'tag-daily', monthly:'tag-monthly', weekly:'tag-weekly', yearly:'tag-yearly', dated:'tag-dated', adhoc:'tag-adhoc', note:'tag-note'};

  const rows = [];

  const daysInSelMonthForDaily = new Date(selYear, selMonth, 0).getDate();
  state.daily.forEach(it=>{
    for(let day=1; day<=daysInSelMonthForDaily; day++){
      const dISO = `${selYear}-${pad(selMonth)}-${pad(day)}`;
      rows.push({
        day,
        title: it.title,
        type: 'daily',
        done: computeDoneForKey('daily', it, dISO),
        dateStr: (state.dailyDoneDates[dISO]||{})[it.id]
      });
    }
  });

  state.monthly.forEach(it=>{
    rows.push({
      day: it.day,
      title: it.title,
      type: 'monthly',
      done: computeDoneForKey('monthly', it, selectedMk),
      dateStr: dateMap[it.id]
    });
  });

  const daysInSelMonth = new Date(selYear, selMonth, 0).getDate();
  state.weekly.forEach(it=>{
    for(let day=1; day<=daysInSelMonth; day++){
      const d = new Date(selYear, selMonth-1, day);
      if(isoWeekday(d) !== it.weekday) continue;
      const wk = weekKeyForDate(d);
      rows.push({
        day,
        title: it.title,
        type: 'weekly',
        done: computeDoneForKey('weekly', it, wk),
        dateStr: (state.weeklyDoneDates[wk]||{})[it.id]
      });
    }
  });

  state.yearly.forEach(it=>{
    if(it.month===selMonth && isYearlyActiveThisYear(it, selYear)){
      rows.push({
        day: it.day,
        title: it.title,
        type: 'yearly',
        done: computeDoneForKey('yearly', it, String(selYear)),
        dateStr: (state.yearlyDoneDates[String(selYear)]||{})[it.id]
      });
    }
  });

  state.dated.forEach(it=>{
    const d = new Date(it.date);
    if(d.getFullYear()===selYear && (d.getMonth()+1)===selMonth){
      rows.push({ day: d.getDate(), title: it.title, type:'dated', done: !!it.done, dateStr: it.date });
    }
  });

  state.adhoc.forEach(it=>{
    const d = new Date(it.deadline);
    if(d.getFullYear()===selYear && (d.getMonth()+1)===selMonth){
      rows.push({ day: d.getDate(), title: it.title, type:'adhoc', done: !!it.done, dateStr: it.deadline });
    }
  });

  const itemsToShow = (isOngoing ? rows.filter(r=>r.done) : rows).sort((a,b)=>a.day-b.day || a.title.localeCompare(b.title));

  let itemsHtml = '';
  if(itemsToShow.length===0){
    itemsHtml = `<li class="history-item">${isOngoing ? '(这个月还没有完成的项目)' : '(这个月没有任何事项)'}</li>`;
  } else {
    itemsToShow.forEach(r=>{
      const dateLabel = r.done
        ? (r.dateStr ? `完成于 ${parseInt(r.dateStr.slice(5,7),10)}/${parseInt(r.dateStr.slice(8,10),10)}` : `${r.day}号 · 已完成`)
        : `${r.day}号 · 未完成`;
      itemsHtml += `<li class="history-item ${r.done?'done':''}">
        <span class="history-dot ${r.done?'done':'pending'}"></span>
        <span class="tag ${typeClass[r.type]}" style="flex:none;">${typeLabel[r.type]}</span>
        <span class="history-title">${escapeHtml(r.title)}</span>
        <span class="history-date ${r.done?'':'pending-label'}">${dateLabel}</span>
      </li>`;
    });
  }

  const noteRows = state.notes.filter(n=>{
    if(!n.done || !n.doneDate) return false;
    const d = new Date(n.doneDate);
    return d.getFullYear()===selYear && (d.getMonth()+1)===selMonth;
  }).sort((a,b)=> new Date(a.doneDate) - new Date(b.doneDate));

  let noteItemsHtml = '';
  if(noteRows.length===0){
    noteItemsHtml = `<li class="history-item">(这个月还没有处理完的备注)</li>`;
  } else {
    noteRows.forEach(n=>{
      noteItemsHtml += `<li class="history-item done">
        <span class="history-dot done"></span>
        <span class="history-title">${escapeHtml(n.text)}</span>
        <span class="history-date">完成于 ${parseInt(n.doneDate.slice(5,7),10)}/${parseInt(n.doneDate.slice(8,10),10)}</span>
      </li>`;
    });
  }

  return `
    <div class="hint">默认显示当月(进行中只列出已完成的);想查之前的月份,从下面选单选就好。所有分类合并显示,按日期排序;备注事项另外分开放,不会混在一起。</div>
    <div class="add-row">
      <select class="link-select" id="historyMonthSelect">${monthOptsHtml}</select>
    </div>
    <div class="history-month">
      <div class="history-month-title">${y} 年 ${parseInt(m,10)} 月${isOngoing?' <span style="color:var(--muted);font-weight:400;font-size:12px;">(进行中)</span>':''}</div>
      <ul class="history-list">${itemsHtml}</ul>
    </div>
    <div class="history-month">
      <div class="history-month-title">${y} 年 ${parseInt(m,10)} 月 · 备注事项</div>
      <ul class="history-list">${noteItemsHtml}</ul>
    </div>
  `;
}

function renderNotesPanel(){
  const pending = state.notes.filter(n=>!n.done).sort((a,b)=> new Date(b.addedDate||0) - new Date(a.addedDate||0));
  let rowsHtml = '';
  if(state.notes.length===0){
    rowsHtml = `<div class="empty">还没有备注事项。像老板临时说「谁借了多少钱」「这个月少出了什么要下个月补」这种不一定有固定日期、但要记住处理的事,都可以放这里。</div>`;
  } else if(pending.length===0){
    rowsHtml = `<div class="empty">目前的都处理完了!到「历史记录」可以回顾。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + pending.map(n=>`
      <li class="row" data-id="${n.id}">
        <div class="row-main">
          <button class="stamp ${canEdit()?'':'readonly'}" data-action="toggle-note" data-id="${n.id}" ${canEdit()?'':'disabled'} aria-label="标记完成"></button>
          <div class="title" style="cursor:default;">${escapeHtml(n.text)}</div>
          ${canEdit() ? `<button class="icon-btn" data-action="del-note" data-id="${n.id}" aria-label="删除">✕</button>` : ''}
        </div>
      </li>
    `).join('') + '</ul>';
  }

  return `
    <div class="hint">不一定有固定日期,但要记住去处理的事,比如「ABU 借粮 RM500」「这个月少出 PH 给某人,下个月补回」。处理好打勾后会移去「历史记录」,用它原本的名字记录,不会跟其他分类混在一起。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <input class="text" type="text" id="newNoteText" placeholder="记一笔,例如:ABU 借粮 RM500" style="flex:1;">
      <button id="addNoteBtn">加入</button>
    </div>` : ''}
  `;
}

function renderMistakesPanel(){
  const resolved = state.mistakes.filter(m=>m.resolved).sort((a,b)=> new Date(b.resolvedDate||b.date) - new Date(a.resolvedDate||a.date));
  const unresolved = state.mistakes.filter(m=>!m.resolved).sort((a,b)=> new Date(b.date) - new Date(a.date));
  const sorted = [...resolved, ...unresolved];
  let rowsHtml = '';
  if(sorted.length===0){
    rowsHtml = `<div class="empty">还没有记录,下次做错什么就记在这里,提醒自己下次别再犯</div>`;
  } else {
    rowsHtml = sorted.map(m=>{
      const linkTitle = m.linkType ? getItemTitle(m.linkType, m.linkId) : null;
      const resolvedLabel = m.resolved && m.resolvedDate
        ? `${parseInt(m.resolvedDate.slice(5,7),10)}月${parseInt(m.resolvedDate.slice(8,10),10)}日`
        : '';
      return `
      <div class="mistake-row ${m.resolved?'resolved':''}" data-id="${m.id}">
        <div class="mistake-head">
          <button class="mistake-resolve ${m.resolved?'on':''}" data-action="toggle-mistake-resolved" data-id="${m.id}" ${canEdit()?'':'disabled'} aria-label="标记已处理">${m.resolved?'✓':''}</button>
          <div class="mistake-date">${m.date.slice(5)}</div>
          <div class="mistake-what">${escapeHtml(m.what||'')}</div>
          ${canEdit() ? `<button class="icon-btn" data-action="del-mistake" data-id="${m.id}" aria-label="删除">✕</button>` : ''}
        </div>
        <div class="mistake-lesson">👉 下次注意:${escapeHtml(m.lesson||'')}</div>
        ${linkTitle ? `<div class="mistake-link">🔗 关联事项:${escapeHtml(linkTitle)}${m.resolved?'':' — 下次打开这个事项时会自动提醒'}</div>` : ''}
        ${m.resolved ? `<div class="mistake-resolved-label">✅ 已处理,${resolvedLabel}完成</div>` : ''}
      </div>
    `;
    }).join('');
  }

  const linkOpts = buildLinkOptions();
  const linkOptsHtml = linkOpts.map(o=>`<option value="${o.type}|${o.id}">${escapeHtml(o.label)}</option>`).join('');

  return `
    <div class="hint">做错什么、漏掉什么,记在这里。可以关联到具体事项,下次打开那个事项时会自动提醒你。已处理的会自动排到最前面方便查看,也会显示是几号处理好的,并且不会再出现在最上面的提醒栏和事项底下了。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <input class="date" type="date" id="newMistakeDate" value="${todayISO()}">
      <input class="text" type="text" id="newMistakeWhat" placeholder="今天做错了什么,例如:漏算了一个员工的OT">
    </div>
    <div class="add-row">
      <select class="link-select" id="newMistakeLink">
        <option value="">不关联特定事项</option>
        ${linkOptsHtml}
      </select>
      <input class="text" type="text" id="newMistakeLesson" placeholder="下次要注意什么,例如:发薪前逐个核对OT申请表">
      <button id="addMistakeBtn">记录下来</button>
    </div>` : ''}
  `;
}

function classifyCalItem(done, iso){
  if(done) return 'done';
  const dleft = daysUntil(iso);
  if(dleft <= 3) return 'overdue';
  if(dleft <= 7) return 'soon';
  return 'normal';
}

function classifyDailyCalItem(done, iso, time){
  if(done) return 'done';
  const todayIso = todayISO();
  if(iso < todayIso) return 'overdue';
  if(iso > todayIso) return 'normal';
  const mins = minutesUntilTime(time);
  if(mins <= 0) return 'overdue';
  if(mins <= 60) return 'soon';
  return 'normal';
}

function getItemsForDate(d){
  const dayNum = d.getDate();
  const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const wd = isoWeekday(d);
  const list = [];
  state.daily.forEach(it=>{
    const done = computeDone('daily', it, iso);
    list.push({type:'daily', id:it.id, title:it.title, done, weekKey:iso, cls:classifyDailyCalItem(done,iso,it.time)});
  });
  state.monthly.forEach(it=>{
    if(it.day===dayNum){
      const done = computeDone('monthly',it);
      list.push({type:'monthly', id:it.id, title:it.title, done, cls:classifyCalItem(done,iso)});
    }
  });
  state.weekly.forEach(it=>{
    if(it.weekday===wd){
      const wk = weekKeyForDate(d);
      const done = computeDone('weekly',it,wk);
      list.push({type:'weekly', id:it.id, title:it.title, done, weekKey:wk, cls:classifyCalItem(done,iso)});
    }
  });
  state.yearly.forEach(it=>{
    if(it.month===(d.getMonth()+1) && it.day===dayNum && isYearlyActiveThisYear(it, d.getFullYear())){
      const done = computeDone('yearly',it);
      list.push({type:'yearly', id:it.id, title:it.title, done, cls:classifyCalItem(done,iso)});
    }
  });
  state.dated.forEach(it=>{
    if(it.date===iso){
      const done = computeDone('dated',it);
      list.push({type:'dated', id:it.id, title:it.title, done, cls:classifyCalItem(done,iso)});
    }
  });
  state.adhoc.forEach(it=>{
    if(it.deadline===iso){
      const done = computeDone('adhoc',it);
      list.push({type:'adhoc', id:it.id, title:it.title, done, cls:classifyCalItem(done,iso)});
    }
  });
  return list;
}

function renderCalendarPanel(){
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = isoWeekday(firstOfMonth) - 1;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const todayIso = todayISO();

  const weekdayHeaders = ['周一','周二','周三','周四','周五','周六','周日'];
  let cellsHtml = '';
  for(let i=0; i<totalCells; i++){
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const inMonth = d.getMonth()===month;
    const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const isToday = iso===todayIso;
    const dayItems = getItemsForDate(d);
    const shown = dayItems.slice(0,4);
    const more = dayItems.length - shown.length;
    cellsHtml += `<div class="cal-cell ${inMonth?'':'other-month'} ${isToday?'is-today':''}">
      <div class="cal-daynum">${d.getDate()}</div>
      ${shown.map(it=>`<div class="cal-item type-${it.type} state-${it.cls}" ${canEdit()?`data-action="cal-toggle" data-type="${it.type}" data-id="${it.id}" ${it.weekKey?`data-week="${it.weekKey}"`:''}`:'style="cursor:default;"'}>${escapeHtml(it.title)}</div>`).join('')}
      ${more>0?`<div class="cal-more">+${more} 项</div>`:''}
    </div>`;
  }

  return `
    <div class="hint">${year} 年 ${month+1} 月 — 每天固定、每月固定、每周固定、特定日期、老板交办全部显示在对应的日子。${canEdit() ? '点一下项目可以标记完成(有步骤清单的事项,请到对应分页里逐步勾选)。' : ''}</div>
    <div class="cal-grid">
      ${weekdayHeaders.map(w=>`<div class="cal-weekday-header">${w}</div>`).join('')}
      ${cellsHtml}
    </div>
    <div class="cal-legend">
      <span><span class="cal-dot daily"></span>每天固定</span>
      <span><span class="cal-dot monthly"></span>每月固定</span>
      <span><span class="cal-dot weekly"></span>每周固定</span>
      <span><span class="cal-dot yearly"></span>每年固定</span>
      <span><span class="cal-dot dated"></span>特定日期</span>
      <span><span class="cal-dot adhoc"></span>老板交办</span>
    </div>
  `;
}

function renderOverviewPanel(){
  const mk = monthKey();
  if(!state.monthlyDone[mk]) state.monthlyDone[mk] = {};
  const todayDate = new Date().getDate();

  const items = [];

  const todayNum = new Date().getDate();
  state.daily.forEach(it=>{
    const done = computeDone('daily', it);
    const mins = minutesUntilTime(it.time);
    items.push({
      day: todayNum,
      dateLabel: formatTime12(it.time),
      title: it.title,
      done,
      type:'daily',
      id: it.id,
      note: it.note,
      steps: it.steps,
      overdue: !done && mins <= 0,
      soon: !done && mins > 0 && mins <= 60
    });
  });

  state.monthly.forEach(it=>{
    const done = computeDone('monthly', it);
    items.push({
      day: it.day,
      title: it.title,
      done,
      type:'monthly',
      id: it.id,
      note: it.note,
      steps: it.steps,
      overdue: !done && it.day < todayDate,
      soon: !done && it.day >= todayDate && (it.day - todayDate <= 3)
    });
  });

  state.dated.forEach(it=>{
    if(isInCurrentMonth(it.date)){
      const done = computeDone('dated', it);
      const dleft = daysUntil(it.date);
      items.push({
        day: new Date(it.date).getDate(),
        title: it.title,
        done,
        type:'dated',
        id: it.id,
        note: it.note,
        steps: it.steps,
        overdue: !done && dleft < 0,
        soon: !done && dleft >= 0 && dleft <= 3
      });
    }
  });

  state.adhoc.forEach(it=>{
    if(isInCurrentMonth(it.deadline)){
      const done = computeDone('adhoc', it);
      const dleft = daysUntil(it.deadline);
      items.push({
        day: new Date(it.deadline).getDate(),
        title: it.title,
        done,
        type:'adhoc',
        id: it.id,
        note: it.note,
        steps: it.steps,
        overdue: !done && dleft < 0,
        soon: !done && dleft >= 0 && dleft <= 2
      });
    }
  });

  const now = new Date();
  state.yearly.forEach(it=>{
    if(it.month === now.getMonth()+1 && isYearlyActiveThisYear(it, now.getFullYear())){
      const done = computeDone('yearly', it);
      const iso = `${now.getFullYear()}-${pad(it.month)}-${pad(it.day)}`;
      const dleft = daysUntil(iso);
      items.push({
        day: it.day,
        title: it.title,
        done,
        type:'yearly',
        id: it.id,
        note: it.note,
        steps: it.steps,
        overdue: !done && dleft <= 3,
        soon: !done && dleft > 3 && dleft <= 7
      });
    }
  });

  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  state.weekly.forEach(it=>{
    for(let day=1; day<=daysInThisMonth; day++){
      const d = new Date(now.getFullYear(), now.getMonth(), day);
      if(isoWeekday(d) !== it.weekday) continue;
      const wk = weekKeyForDate(d);
      const done = computeDone('weekly', it, wk);
      const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      const dleft = daysUntil(iso);
      items.push({
        day,
        title: it.title,
        done,
        type:'weekly',
        id: it.id,
        note: it.note,
        steps: it.steps,
        weekKey: wk,
        overdue: !done && dleft < 0,
        soon: !done && dleft >= 0 && dleft <= 1
      });
    }
  });

  items.sort((a,b)=>a.day-b.day);

  const typeLabel = {daily:'每天固定', monthly:'每月固定', weekly:'每周固定', yearly:'每年固定', dated:'特定日期', adhoc:'老板交办'};
  const typeClass = {daily:'tag-daily', monthly:'tag-monthly', weekly:'tag-weekly', yearly:'tag-yearly', dated:'tag-dated', adhoc:'tag-adhoc'};

  const pendingItems = items.filter(it=>!it.done);

  let rowsHtml = '';
  if(items.length===0){
    rowsHtml = `<div class="empty">这个月还没有任何事项${canEdit() ? ',去其他分类添加吧' : ''}</div>`;
  } else if(pendingItems.length===0){
    rowsHtml = `<div class="empty">这个月都做完了!到「历史记录」可以回顾。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + pendingItems.map(it=>`
      <li class="row ${it.overdue?'overdue':''} ${it.soon?'soon':''}">
        <div class="row-main">
          ${renderStampOverview(it)}
          <div class="datebadge">${it.dateLabel || (it.day+'号')}</div>
          <span class="tag ${typeClass[it.type]}">${typeLabel[it.type]}</span>
          <div class="title" style="cursor:default;">${it.title}</div>
        </div>
        ${renderNoteLine(it.type, it.id, it.note)}
        ${renderStepsBlock(it.type, it, false, it.weekKey)}
      </li>
    `).join('') + '</ul>';
  }

  const d = new Date();
  return `
    <div class="hint month-title">${d.getFullYear()} 年 ${d.getMonth()+1} 月总览 — 每天固定(今天的)/每月固定/每周固定/特定日期/老板交办合并,按日期排序。做完打勾后会移去「历史记录」,不留在这里。</div>
    ${rowsHtml}
  `;
}

function renderDailyPanel(){
  const sorted = [...state.daily].filter(it=>!computeDone('daily', it)).sort((a,b)=> (a.time||'').localeCompare(b.time||''));
  const totalCount = state.daily.length;

  let rowsHtml = '';
  if(totalCount===0){
    rowsHtml = `<div class="empty">还没有每天固定事项${canEdit() ? ',在下面添加一个吧' : ''}</div>`;
  } else if(sorted.length===0){
    rowsHtml = `<div class="empty">今天的都做完了!到「历史记录」可以回顾,明天自动重置。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + sorted.map(it=>{
      const mins = minutesUntilTime(it.time);
      const overdue = mins <= 0;
      const soon = !overdue && mins <= 60;
      return `
      <li class="row ${overdue?'overdue':''} ${soon?'soon':''}" data-id="${it.id}">
        <div class="row-main">
          ${renderStamp('daily', it, false)}
          <div class="datebadge">${formatTime12(it.time)}</div>
          <input class="title" data-action="edit-daily" data-id="${it.id}" value="${it.title.replace(/"/g,'&quot;')}" ${canEdit()?'':'readonly'}>
          ${canEdit() ? `<button class="icon-btn" data-action="del-daily" data-id="${it.id}" aria-label="删除">✕</button>` : ''}
        </div>
        ${renderNoteLine('daily', it.id, it.note)}
        ${renderStepsBlock('daily', it, true)}
      </li>`;
    }).join('') + '</ul>';
  }

  return `
    <div class="hint">每天都要做的事,填几点前要做好,比如开店检查、每天结账。超过那个时间还没打勾会标红。做完打勾后会移去「历史记录」,不会留在这里;明天自动重置再出现。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <input class="date" type="time" id="newDailyTime" style="width:120px;">
      <input class="text" type="text" id="newDailyTitle" placeholder="事项内容,例如:开店前检查">
      <button id="addDailyBtn">加入</button>
    </div>` : ''}
  `;
}

function renderMonthlyPanel(){
  const mk = monthKey();
  if(!state.monthlyDone[mk]) state.monthlyDone[mk] = {};
  const today = new Date();
  const todayDate = today.getDate();

  const sorted = [...state.monthly].filter(it=>!computeDone('monthly', it)).sort((a,b)=>a.day-b.day);
  const totalCount = state.monthly.length;

  let rowsHtml = '';
  if(totalCount===0){
    rowsHtml = `<div class="empty">还没有每月固定事项${canEdit() ? ',在下面添加一个吧' : ''}</div>`;
  } else if(sorted.length===0){
    rowsHtml = `<div class="empty">这个月的都做完了!到「历史记录」可以回顾,下个月自动重置。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + sorted.map(it=>{
      const overdue = it.day < todayDate;
      const soon = !overdue && (it.day - todayDate <= 3);
      return `
      <li class="row ${overdue?'overdue':''} ${soon?'soon':''}" data-id="${it.id}">
        <div class="row-main">
          ${renderStamp('monthly', it, false)}
          <div class="datebadge">${it.day}号</div>
          <input class="title" data-action="edit-monthly" data-id="${it.id}" value="${it.title.replace(/"/g,'&quot;')}" ${canEdit()?'':'readonly'}>
          ${canEdit() ? `<button class="icon-btn" data-action="del-monthly" data-id="${it.id}" aria-label="删除">✕</button>` : ''}
        </div>
        ${renderNoteLine('monthly', it.id, it.note)}
        ${renderStepsBlock('monthly', it, true)}
      </li>`;
    }).join('') + '</ul>';
  }

  return `
    <div class="hint">每月都会发生的事,比如申报、发薪、对账。做完打勾后会移去「历史记录」,不会留在这里;下个月自动重置再出现。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <input class="day" type="number" min="1" max="31" id="newMonthlyDay" placeholder="几号">
      <input class="text" type="text" id="newMonthlyTitle" placeholder="事项内容,例如:SST 申报">
      <button id="addMonthlyBtn">加入</button>
    </div>` : ''}
  `;
}

function renderWeeklyPanel(){
  const now = new Date();
  const todayDate = now.getDate();
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const totalCount = state.weekly.length;

  const rows = [];
  state.weekly.forEach(it=>{
    for(let day=1; day<=daysInThisMonth; day++){
      const d = new Date(now.getFullYear(), now.getMonth(), day);
      if(isoWeekday(d) !== it.weekday) continue;
      const wk = weekKeyForDate(d);
      if(computeDone('weekly', it, wk)) continue;
      rows.push({ day, item: it, wk });
    }
  });
  rows.sort((a,b)=>a.day-b.day);

  let rowsHtml = '';
  if(totalCount===0){
    rowsHtml = `<div class="empty">还没有每周固定事项${canEdit() ? ',在下面添加一个吧' : ''}</div>`;
  } else if(rows.length===0){
    rowsHtml = `<div class="empty">这个月的都做完了!到「历史记录」可以回顾,下个月自动出现新的一轮。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + rows.map(r=>{
      const it = r.item;
      const overdue = r.day < todayDate;
      const soon = !overdue && (r.day - todayDate <= 3);
      return `
      <li class="row ${overdue?'overdue':''} ${soon?'soon':''}" data-id="${it.id}">
        <div class="row-main">
          ${renderStamp('weekly', it, false, r.wk)}
          <div class="datebadge">${r.day}号</div>
          <input class="title" data-action="edit-weekly" data-id="${it.id}" value="${it.title.replace(/"/g,'&quot;')}" ${canEdit()?'':'readonly'}>
          ${canEdit() ? `<button class="icon-btn" data-action="del-weekly" data-id="${it.id}" aria-label="删除">✕</button>` : ''}
        </div>
        ${renderNoteLine('weekly', it.id, it.note)}
        ${renderStepsBlock('weekly', it, true, r.wk)}
      </li>`;
    }).join('') + '</ul>';
  }

  return `
    <div class="hint">每周都会重复的事,比如固定的付款、跟进、汇报。这里会列出这个月每一次出现的日子(比如每周一就会列好几行),做完哪一次就打勾哪一次,不会互相影响;下个月自动出现新的一轮。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <select class="link-select" id="newWeeklyDay">
        <option value="1">星期一</option>
        <option value="2">星期二</option>
        <option value="3">星期三</option>
        <option value="4">星期四</option>
        <option value="5">星期五</option>
        <option value="6">星期六</option>
        <option value="7">星期日</option>
      </select>
      <input class="text" type="text" id="newWeeklyTitle" placeholder="事项内容,例如:First One Payment">
      <button id="addWeeklyBtn">加入</button>
    </div>` : ''}
  `;
}

function renderYearlySchedule(it, interval, active, nextDue){
  const label = `📅 ${it.month}月${it.day}号 · 每${interval}年 · ${active ? '今年到期' : '下次:'+nextDue+'年'}`;
  if(!canEdit()){
    return `<div class="note-line" data-id="${it.id}"><span style="color:var(--muted);opacity:0.65;">${label}</span></div>`;
  }
  return `<div class="note-line" data-id="${it.id}">
    <span class="note-add" data-action="show-yearly-schedule" data-id="${it.id}">${label}(点这里可以修改)</span>
  </div>`;
}

function renderYearlyPanel(){
  const now = new Date();
  const curYear = now.getFullYear();
  const sorted = [...state.yearly].sort((a,b)=>{
    const ay = isYearlyActiveThisYear(a, curYear) ? curYear : yearlyNextDueYear(a, curYear);
    const by = isYearlyActiveThisYear(b, curYear) ? curYear : yearlyNextDueYear(b, curYear);
    if(ay !== by) return ay - by;
    if(a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });
  const monthOpts = MONTHS_ZH.map((m,idx)=>`<option value="${idx+1}">${m}月</option>`).join('');

  let rowsHtml = '';
  const pending = sorted.filter(it=>{
    const active = isYearlyActiveThisYear(it, curYear);
    const done = active && computeDone('yearly', it);
    return !done;
  });
  if(sorted.length===0){
    rowsHtml = `<div class="empty">还没有每年固定事项,比如牌照/保险续期、每年要重设的银行指示</div>`;
  } else if(pending.length===0){
    rowsHtml = `<div class="empty">这一轮都做完了!到「历史记录」可以回顾,下一轮到期会自动重新出现。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + pending.map(it=>{
      const interval = it.intervalYears || 1;
      const active = isYearlyActiveThisYear(it, curYear);
      const iso = `${curYear}-${pad(it.month)}-${pad(it.day)}`;
      const dleft = active ? daysUntil(iso) : null;
      const overdue = active && dleft <= 3;
      const soon = active && !overdue && dleft <= 7;
      const nextDue = active ? curYear : yearlyNextDueYear(it, curYear);
      const scheduleLine = renderYearlySchedule(it, interval, active, nextDue);
      return `
      <li class="row ${overdue?'overdue':''} ${soon?'soon':''}" data-id="${it.id}">
        <div class="row-main">
          ${renderStamp('yearly', it, false)}
          <div class="datebadge">${it.month}/${it.day}</div>
          <input class="title" data-action="edit-yearly" data-id="${it.id}" value="${it.title.replace(/"/g,'&quot;')}" ${canEdit()?'':'readonly'}>
          ${canEdit() ? `<button class="icon-btn" data-action="del-yearly" data-id="${it.id}" aria-label="删除">✕</button>` : ''}
        </div>
        ${scheduleLine}
        ${renderNoteLine('yearly', it.id, it.note)}
        ${renderStepsBlock('yearly', it, true)}
      </li>`;
    }).join('') + '</ul>';
  }

  return `
    <div class="hint">不是每年都发生的也可以放这里,比如车牌 5 年才续一次:填好月份日期,再填「每隔几年」和「下一次到期是哪一年」(不一定是今年,可以填未来的年份)。不是到期的那几年不会显示提醒或算逾期。做完打勾后会移去「历史记录」,不留在这里。每次真的续期之后,如果发现这次给的年限跟上次不一样,直接点每一项底下那行小字(📅 ...)就能改,不用删掉重加。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <select class="link-select" id="newYearlyMonth">${monthOpts}</select>
      <input class="day" type="number" min="1" max="31" id="newYearlyDay" placeholder="几号">
      <input class="day" type="number" min="1" max="20" id="newYearlyInterval" placeholder="每隔几年" value="1">
      <input class="day" type="number" id="newYearlyAnchorYear" placeholder="下次到期年份" value="${new Date().getFullYear()}" style="width:100px;">
      <input class="text" type="text" id="newYearlyTitle" placeholder="事项内容,例如:车牌续期(5年一次)">
      <button id="addYearlyBtn">加入</button>
    </div>` : ''}
  `;
}

function renderDatedPanel(){
  const sorted = [...state.dated].filter(it=>!computeDone('dated', it)).sort((a,b)=> new Date(a.date) - new Date(b.date));
  const totalCount = state.dated.length;
  let rowsHtml = '';
  if(totalCount===0){
    rowsHtml = `<div class="empty">还没有特定日期事项,比如续保、牌照更新、报税截止日</div>`;
  } else if(sorted.length===0){
    rowsHtml = `<div class="empty">目前的都做完了!到「历史记录」可以回顾。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + sorted.map(it=>{
      const dleft = daysUntil(it.date);
      const overdue = dleft < 0;
      const soon = !overdue && dleft <= 3;
      return `
      <li class="row ${overdue?'overdue':''} ${soon?'soon':''}" data-id="${it.id}">
        <div class="row-main">
          ${renderStamp('dated', it, false)}
          <div class="datebadge">${it.date.slice(5)}</div>
          <input class="title" data-action="edit-dated" data-id="${it.id}" value="${it.title.replace(/"/g,'&quot;')}" ${canEdit()?'':'readonly'}>
          ${canEdit() ? `<button class="icon-btn" data-action="del-dated" data-id="${it.id}" aria-label="删除">✕</button>` : ''}
        </div>
        ${renderNoteLine('dated', it.id, it.note)}
        ${renderStepsBlock('dated', it, true)}
      </li>`;
    }).join('') + '</ul>';
  }

  return `
    <div class="hint">只发生一次或不常发生的事,附上确切日期。红色代表已过期,黄色代表 3 天内到期。做完打勾后会移去「历史记录」,不留在这里。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <input class="date" type="date" id="newDatedDate">
      <input class="text" type="text" id="newDatedTitle" placeholder="事项内容,例如:公司保险续保">
      <button id="addDatedBtn">加入</button>
    </div>` : ''}
  `;
}

function renderAdhocPanel(){
  const sorted = [...state.adhoc].filter(it=>!computeDone('adhoc', it)).sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));
  const totalCount = state.adhoc.length;
  let rowsHtml = '';
  if(totalCount===0){
    rowsHtml = `<div class="empty">老板临时交代、几号要交的东西,记在这里,不会漏掉</div>`;
  } else if(sorted.length===0){
    rowsHtml = `<div class="empty">目前的都做完了!到「历史记录」可以回顾。</div>`;
  } else {
    rowsHtml = '<ul class="rows">' + sorted.map(it=>{
      const dleft = daysUntil(it.deadline);
      const overdue = dleft < 0;
      const soon = !overdue && dleft <= 2;
      return `
      <li class="row ${overdue?'overdue':''} ${soon?'soon':''}" data-id="${it.id}">
        <div class="row-main">
          ${renderStamp('adhoc', it, false)}
          <div class="datebadge">${it.deadline.slice(5)}</div>
          <input class="title" data-action="edit-adhoc" data-id="${it.id}" value="${it.title.replace(/"/g,'&quot;')}" ${canEdit()?'':'readonly'}>
          ${canEdit() ? `<button class="icon-btn" data-action="del-adhoc" data-id="${it.id}" aria-label="删除">✕</button>` : ''}
        </div>
        ${renderNoteLine('adhoc', it.id, it.note)}
        ${renderStepsBlock('adhoc', it, true)}
      </li>`;
    }).join('') + '</ul>';
  }

  return `
    <div class="hint">老板突然说「几号前要做完」的事,马上记下来,截止日一到就会提醒你。做完打勾后会移去「历史记录」,不留在这里。</div>
    ${rowsHtml}
    ${canEdit() ? `
    <div class="add-row">
      <input class="date" type="date" id="newAdhocDate">
      <input class="text" type="text" id="newAdhocTitle" placeholder="老板交代的事情">
      <button id="addAdhocBtn">加入</button>
    </div>` : ''}
  `;
}

function render(){
  renderToday();
  renderTabs();
  updateTabTitle();
  document.getElementById('reminderBox').innerHTML = renderReminderBanner();
  const panel = document.getElementById('panelBox');
  if(activeTab==='overview') panel.innerHTML = renderOverviewPanel();
  else if(activeTab==='calendar') panel.innerHTML = renderCalendarPanel();
  else if(activeTab==='daily') panel.innerHTML = renderDailyPanel();
  else if(activeTab==='monthly') panel.innerHTML = renderMonthlyPanel();
  else if(activeTab==='weekly') panel.innerHTML = renderWeeklyPanel();
  else if(activeTab==='yearly') panel.innerHTML = renderYearlyPanel();
  else if(activeTab==='dated') panel.innerHTML = renderDatedPanel();
  else if(activeTab==='adhoc') panel.innerHTML = renderAdhocPanel();
  else if(activeTab==='notes') panel.innerHTML = renderNotesPanel();
  else if(activeTab==='history') panel.innerHTML = renderHistoryPanel();
  else panel.innerHTML = renderMistakesPanel();
  attachPanelEvents();
}

function recordDoneDate(store, key, itemId, isDone){
  if(!state[store][key]) state[store][key] = {};
  if(isDone){
    state[store][key][itemId] = todayISO();
  } else {
    delete state[store][key][itemId];
  }
}

function attachPanelEvents(){
  const panel = document.getElementById('panelBox');

  panel.querySelectorAll('[data-action="cal-toggle"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const type = el.dataset.type;
      const id = el.dataset.id;
      const item = listByType(type).find(x=>x.id===id);
      if(!item) return;
      if((item.steps||[]).length > 0) return;
      if(type==='daily'){
        const dk = el.dataset.week || todayISO();
        if(!state.dailyDone[dk]) state.dailyDone[dk]={};
        state.dailyDone[dk][id] = !state.dailyDone[dk][id];
        recordDoneDate('dailyDoneDates', dk, id, state.dailyDone[dk][id]);
      } else if(type==='monthly'){
        const mk = monthKey();
        if(!state.monthlyDone[mk]) state.monthlyDone[mk]={};
        state.monthlyDone[mk][id] = !state.monthlyDone[mk][id];
        recordDoneDate('monthlyDoneDates', mk, id, state.monthlyDone[mk][id]);
      } else if(type==='weekly'){
        const wk = el.dataset.week || weekKey();
        if(!state.weeklyDone[wk]) state.weeklyDone[wk]={};
        state.weeklyDone[wk][id] = !state.weeklyDone[wk][id];
        recordDoneDate('weeklyDoneDates', wk, id, state.weeklyDone[wk][id]);
      } else if(type==='yearly'){
        const yk = yearKey();
        if(!state.yearlyDone[yk]) state.yearlyDone[yk]={};
        const wasDone = !!state.yearlyDone[yk][id];
        state.yearlyDone[yk][id] = !wasDone;
        recordDoneDate('yearlyDoneDates', yk, id, state.yearlyDone[yk][id]);
        advanceYearlyOnComplete(item, wasDone, state.yearlyDone[yk][id]);
      } else if(type==='dated' || type==='adhoc'){
        item.done = !item.done;
      }
      saveState(); render();
    });
  });

  panel.querySelectorAll('[data-action="show-yearly-schedule"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const container = el.closest('.note-line');
      const id = el.dataset.id;
      const it = state.yearly.find(x=>x.id===id);
      if(!it) return;
      const monthOptsHtml = MONTHS_ZH.map((mn,idx)=>`<option value="${idx+1}" ${idx+1===it.month?'selected':''}>${mn}月</option>`).join('');
      container.innerHTML = `
        <div class="add-row" style="padding:8px 0 4px;">
          <select class="link-select" id="editYearlyMonth-${id}">${monthOptsHtml}</select>
          <input class="day" type="number" min="1" max="31" id="editYearlyDay-${id}" value="${it.day}" placeholder="几号">
          <input class="day" type="number" min="1" max="20" id="editYearlyInterval-${id}" value="${it.intervalYears||1}" placeholder="每隔几年">
          <input class="day" type="number" id="editYearlyAnchor-${id}" value="${it.anchorYear||new Date().getFullYear()}" placeholder="下次到期年份" style="width:100px;">
          <button data-action="save-yearly-schedule" data-id="${id}">保存</button>
        </div>
      `;
      const saveBtn = container.querySelector('[data-action="save-yearly-schedule"]');
      saveBtn.addEventListener('click', ()=>{
        const month = parseInt(document.getElementById(`editYearlyMonth-${id}`).value,10);
        const day = parseInt(document.getElementById(`editYearlyDay-${id}`).value,10);
        const intervalYears = parseInt(document.getElementById(`editYearlyInterval-${id}`).value,10) || 1;
        const anchorYear = parseInt(document.getElementById(`editYearlyAnchor-${id}`).value,10) || new Date().getFullYear();
        if(!month || !day || day<1 || day>31) return;
        it.month = month; it.day = day; it.intervalYears = intervalYears; it.anchorYear = anchorYear;
        saveState(); render();
      });
    });
  });

  panel.querySelectorAll('[data-action="show-note"]').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const container = el.closest('.note-line');
      const type = container.dataset.type;
      const id = container.dataset.id;
      const current = getNote(type, id);
      container.innerHTML = `<textarea class="note-edit" rows="2" placeholder="写下容易出错的地方,例如:先检查请假/无薪假天数,再核对 OT 时数,最后对比上个月总额...">${escapeHtml(current)}</textarea>`;
      const ta = container.querySelector('textarea');
      ta.focus();
      ta.addEventListener('blur', ()=>{
        setNote(type, id, ta.value.trim());
        saveState();
        render();
      });
    });
  });

  panel.querySelectorAll('[data-action="toggle-step"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const type = b.dataset.type;
      const id = b.dataset.id;
      const stepId = b.dataset.step;
      const weekOverride = b.dataset.week || undefined;
      const item = listByType(type).find(x=>x.id===id);
      if(!item) return;
      const wasDone = computeDone(type, item, weekOverride);
      const doneMap = getStepsDoneMap(type, item, weekOverride);
      doneMap[stepId] = !doneMap[stepId];
      const nowDone = computeDone(type, item, weekOverride);
      if(type==='monthly') recordDoneDate('monthlyDoneDates', monthKey(), id, nowDone);
      else if(type==='weekly') recordDoneDate('weeklyDoneDates', weekOverride || weekKey(), id, nowDone);
      else if(type==='yearly'){
        recordDoneDate('yearlyDoneDates', yearKey(), id, nowDone);
        advanceYearlyOnComplete(item, wasDone, nowDone);
      }
      saveState(); render();
    });
  });

  panel.querySelectorAll('[data-action="add-step"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const type = b.dataset.type;
      const id = b.dataset.id;
      const input = panel.querySelector(`.step-input[data-type="${type}"][data-id="${id}"]`);
      if(!input) return;
      const text = input.value.trim();
      if(!text) return;
      const item = listByType(type).find(x=>x.id===id);
      if(!item) return;
      if(!item.steps) item.steps = [];
      item.steps.push({id:uid(), text});
      saveState(); render();
    });
  });

  panel.querySelectorAll('.step-input').forEach(input=>{
    input.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){
        e.preventDefault();
        const type = input.dataset.type;
        const id = input.dataset.id;
        const btn = panel.querySelector(`.step-add-btn[data-type="${type}"][data-id="${id}"]`);
        if(btn) btn.click();
      }
    });
  });

  panel.querySelectorAll('[data-action="del-step"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const type = b.dataset.type;
      const id = b.dataset.id;
      const stepId = b.dataset.step;
      const item = listByType(type).find(x=>x.id===id);
      if(!item) return;
      item.steps = (item.steps||[]).filter(s=>s.id!==stepId);
      const doneMap = getStepsDoneMap(type, item);
      delete doneMap[stepId];
      saveState(); render();
    });
  });

  panel.querySelectorAll('[data-action="toggle-overview"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const type = b.dataset.type;
      const id = b.dataset.id;
      if(type==='daily'){
        const dk = todayISO();
        if(!state.dailyDone[dk]) state.dailyDone[dk]={};
        state.dailyDone[dk][id] = !state.dailyDone[dk][id];
        recordDoneDate('dailyDoneDates', dk, id, state.dailyDone[dk][id]);
      } else if(type==='monthly'){
        const mk = monthKey();
        if(!state.monthlyDone[mk]) state.monthlyDone[mk]={};
        state.monthlyDone[mk][id] = !state.monthlyDone[mk][id];
        recordDoneDate('monthlyDoneDates', mk, id, state.monthlyDone[mk][id]);
      } else if(type==='weekly'){
        const wk = b.dataset.week || weekKey();
        if(!state.weeklyDone[wk]) state.weeklyDone[wk]={};
        state.weeklyDone[wk][id] = !state.weeklyDone[wk][id];
        recordDoneDate('weeklyDoneDates', wk, id, state.weeklyDone[wk][id]);
      } else if(type==='yearly'){
        const yk = yearKey();
        if(!state.yearlyDone[yk]) state.yearlyDone[yk]={};
        const yit = state.yearly.find(x=>x.id===id);
        const wasDone = !!state.yearlyDone[yk][id];
        state.yearlyDone[yk][id] = !wasDone;
        recordDoneDate('yearlyDoneDates', yk, id, state.yearlyDone[yk][id]);
        if(yit) advanceYearlyOnComplete(yit, wasDone, state.yearlyDone[yk][id]);
      } else if(type==='dated'){
        const it = state.dated.find(x=>x.id===id);
        if(it) it.done = !it.done;
      } else if(type==='adhoc'){
        const it = state.adhoc.find(x=>x.id===id);
        if(it) it.done = !it.done;
      }
      saveState(); render();
    });
  });

  panel.querySelectorAll('[data-action="toggle-daily"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const dk = todayISO();
      if(!state.dailyDone[dk]) state.dailyDone[dk]={};
      const id = b.dataset.id;
      state.dailyDone[dk][id] = !state.dailyDone[dk][id];
      recordDoneDate('dailyDoneDates', dk, id, state.dailyDone[dk][id]);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="del-daily"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.daily = state.daily.filter(it=>it.id!==b.dataset.id);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="edit-daily"]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      if(!canEdit()) return;
      const it = state.daily.find(x=>x.id===inp.dataset.id);
      if(it){ it.title = inp.value; saveState(); }
    });
  });

  panel.querySelectorAll('[data-action="toggle-monthly"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const mk = monthKey();
      if(!state.monthlyDone[mk]) state.monthlyDone[mk]={};
      const id = b.dataset.id;
      state.monthlyDone[mk][id] = !state.monthlyDone[mk][id];
      recordDoneDate('monthlyDoneDates', mk, id, state.monthlyDone[mk][id]);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="del-monthly"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.monthly = state.monthly.filter(it=>it.id!==b.dataset.id);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="edit-monthly"]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      if(!canEdit()) return;
      const it = state.monthly.find(x=>x.id===inp.dataset.id);
      if(it){ it.title = inp.value; saveState(); }
    });
  });

  panel.querySelectorAll('[data-action="toggle-yearly"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const yk = yearKey();
      if(!state.yearlyDone[yk]) state.yearlyDone[yk]={};
      const id = b.dataset.id;
      const it = state.yearly.find(x=>x.id===id);
      const wasDone = !!state.yearlyDone[yk][id];
      state.yearlyDone[yk][id] = !wasDone;
      recordDoneDate('yearlyDoneDates', yk, id, state.yearlyDone[yk][id]);
      if(it) advanceYearlyOnComplete(it, wasDone, state.yearlyDone[yk][id]);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="del-yearly"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.yearly = state.yearly.filter(it=>it.id!==b.dataset.id);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="edit-yearly"]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      if(!canEdit()) return;
      const it = state.yearly.find(x=>x.id===inp.dataset.id);
      if(it){ it.title = inp.value; saveState(); }
    });
  });

  panel.querySelectorAll('[data-action="toggle-weekly"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const wk = b.dataset.week || weekKey();
      if(!state.weeklyDone[wk]) state.weeklyDone[wk]={};
      const id = b.dataset.id;
      state.weeklyDone[wk][id] = !state.weeklyDone[wk][id];
      recordDoneDate('weeklyDoneDates', wk, id, state.weeklyDone[wk][id]);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="del-weekly"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.weekly = state.weekly.filter(it=>it.id!==b.dataset.id);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="edit-weekly"]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      if(!canEdit()) return;
      const it = state.weekly.find(x=>x.id===inp.dataset.id);
      if(it){ it.title = inp.value; saveState(); }
    });
  });

  panel.querySelectorAll('[data-action="toggle-dated"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const it = state.dated.find(x=>x.id===b.dataset.id);
      if(it){ it.done = !it.done; saveState(); render(); }
    });
  });
  panel.querySelectorAll('[data-action="del-dated"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.dated = state.dated.filter(it=>it.id!==b.dataset.id);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="edit-dated"]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      if(!canEdit()) return;
      const it = state.dated.find(x=>x.id===inp.dataset.id);
      if(it){ it.title = inp.value; saveState(); }
    });
  });

  panel.querySelectorAll('[data-action="toggle-adhoc"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const it = state.adhoc.find(x=>x.id===b.dataset.id);
      if(it){ it.done = !it.done; saveState(); render(); }
    });
  });
  panel.querySelectorAll('[data-action="del-adhoc"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.adhoc = state.adhoc.filter(it=>it.id!==b.dataset.id);
      saveState(); render();
    });
  });
  panel.querySelectorAll('[data-action="edit-adhoc"]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      if(!canEdit()) return;
      const it = state.adhoc.find(x=>x.id===inp.dataset.id);
      if(it){ it.title = inp.value; saveState(); }
    });
  });

  const addDailyBtn = document.getElementById('addDailyBtn');
  if(addDailyBtn){
    addDailyBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const timeInp = document.getElementById('newDailyTime');
      const titleInp = document.getElementById('newDailyTitle');
      const time = timeInp.value;
      const title = titleInp.value.trim();
      if(!time || !title) return;
      state.daily.push({id:uid(), time, title});
      saveState(); render();
    });
  }

  const addMonthlyBtn = document.getElementById('addMonthlyBtn');
  if(addMonthlyBtn){
    addMonthlyBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const dayInp = document.getElementById('newMonthlyDay');
      const titleInp = document.getElementById('newMonthlyTitle');
      const day = parseInt(dayInp.value,10);
      const title = titleInp.value.trim();
      if(!day || day<1 || day>31 || !title) return;
      state.monthly.push({id:uid(), day, title});
      saveState(); render();
    });
  }

  const addYearlyBtn = document.getElementById('addYearlyBtn');
  if(addYearlyBtn){
    addYearlyBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const monthInp = document.getElementById('newYearlyMonth');
      const dayInp = document.getElementById('newYearlyDay');
      const intervalInp = document.getElementById('newYearlyInterval');
      const anchorInp = document.getElementById('newYearlyAnchorYear');
      const titleInp = document.getElementById('newYearlyTitle');
      const month = parseInt(monthInp.value,10);
      const day = parseInt(dayInp.value,10);
      const intervalYears = parseInt(intervalInp.value,10) || 1;
      const anchorYear = parseInt(anchorInp.value,10) || new Date().getFullYear();
      const title = titleInp.value.trim();
      if(!month || !day || day<1 || day>31 || !title) return;
      state.yearly.push({id:uid(), month, day, title, intervalYears, anchorYear});
      saveState(); render();
    });
  }

  const addWeeklyBtn = document.getElementById('addWeeklyBtn');
  if(addWeeklyBtn){
    addWeeklyBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const dayInp = document.getElementById('newWeeklyDay');
      const titleInp = document.getElementById('newWeeklyTitle');
      const weekday = parseInt(dayInp.value,10);
      const title = titleInp.value.trim();
      if(!weekday || !title) return;
      state.weekly.push({id:uid(), weekday, title});
      saveState(); render();
    });
  }

  const addDatedBtn = document.getElementById('addDatedBtn');
  if(addDatedBtn){
    addDatedBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const dateInp = document.getElementById('newDatedDate');
      const titleInp = document.getElementById('newDatedTitle');
      const date = dateInp.value;
      const title = titleInp.value.trim();
      if(!date || !title) return;
      state.dated.push({id:uid(), date, title, done:false});
      saveState(); render();
    });
  }

  const addAdhocBtn = document.getElementById('addAdhocBtn');
  if(addAdhocBtn){
    addAdhocBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const dateInp = document.getElementById('newAdhocDate');
      const titleInp = document.getElementById('newAdhocTitle');
      const deadline = dateInp.value;
      const title = titleInp.value.trim();
      if(!deadline || !title) return;
      state.adhoc.push({id:uid(), deadline, title, done:false});
      saveState(); render();
    });
  }

  const historyMonthSelect = document.getElementById('historyMonthSelect');
  if(historyMonthSelect){
    historyMonthSelect.addEventListener('change', ()=>{
      historyViewMonth = historyMonthSelect.value;
      render();
    });
  }

  panel.querySelectorAll('[data-action="toggle-mistake-resolved"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const m = state.mistakes.find(x=>x.id===b.dataset.id);
      if(!m) return;
      m.resolved = !m.resolved;
      m.resolvedDate = m.resolved ? todayISO() : null;
      saveState(); render();
    });
  });

  panel.querySelectorAll('[data-action="del-mistake"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.mistakes = state.mistakes.filter(m=>m.id!==b.dataset.id);
      saveState(); render();
    });
  });

  const addMistakeBtn = document.getElementById('addMistakeBtn');
  if(addMistakeBtn){
    addMistakeBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const dateInp = document.getElementById('newMistakeDate');
      const whatInp = document.getElementById('newMistakeWhat');
      const lessonInp = document.getElementById('newMistakeLesson');
      const linkInp = document.getElementById('newMistakeLink');
      const date = dateInp.value || todayISO();
      const what = whatInp.value.trim();
      const lesson = lessonInp.value.trim();
      let linkType = null, linkId = null;
      if(linkInp && linkInp.value){
        const [t, id] = linkInp.value.split('|');
        linkType = t; linkId = id;
      }
      if(!what && !lesson) return;
      state.mistakes.push({id:uid(), date, what, lesson, linkType, linkId});
      saveState(); render();
    });
  }
  panel.querySelectorAll('[data-action="toggle-note"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const n = state.notes.find(x=>x.id===b.dataset.id);
      if(!n) return;
      n.done = !n.done;
      n.doneDate = n.done ? todayISO() : null;
      saveState(); render();
    });
  });

  panel.querySelectorAll('[data-action="del-note"]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(!canEdit()) return;
      state.notes = state.notes.filter(n=>n.id!==b.dataset.id);
      saveState(); render();
    });
  });

  const addNoteBtn = document.getElementById('addNoteBtn');
  if(addNoteBtn){
    addNoteBtn.addEventListener('click', ()=>{
      if(!canEdit()) return;
      const textInp = document.getElementById('newNoteText');
      const text = textInp.value.trim();
      if(!text) return;
      state.notes.push({id:uid(), text, done:false, addedDate: todayISO()});
      saveState(); render();
    });
  }
}
