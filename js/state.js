// 日期/周期相关的共用工具函数,board.js 会用到

function pad(n){ return String(n).padStart(2,'0'); }
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function monthKey(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function isoWeekday(d){
  const day = d.getDay();
  return day===0 ? 7 : day;
}
function getMondayOf(d){
  const date = new Date(d);
  const day = isoWeekday(date);
  date.setDate(date.getDate() - (day-1));
  return date;
}
function weekKeyForDate(d){
  const monday = getMondayOf(d);
  return `${monday.getFullYear()}-${pad(monday.getMonth()+1)}-${pad(monday.getDate())}`;
}
function weekKey(){
  return weekKeyForDate(new Date());
}
function yearKey(){
  return String(new Date().getFullYear());
}
function uid(){ return Math.random().toString(36).slice(2,9); }

// 整个系统只有这一行数据(board_state 表,id 固定为 1),内容是这个 JSON 结构:
let state = {
  monthly: [],
  monthlyDone: {},
  monthlyDoneDates: {},
  monthlyStepsDone: {},
  weekly: [],
  weeklyDone: {},
  weeklyDoneDates: {},
  weeklyStepsDone: {},
  yearly: [],
  yearlyDone: {},
  yearlyDoneDates: {},
  yearlyStepsDone: {},
  dated: [],
  adhoc: [],
  notes: [],
  mistakes: []
};

const BOARD_ROW_ID = 1;

function ensureStateShape(){
  if(!state.monthly) state.monthly = [];
  if(!state.monthlyDone) state.monthlyDone = {};
  if(!state.monthlyDoneDates) state.monthlyDoneDates = {};
  if(!state.monthlyStepsDone) state.monthlyStepsDone = {};
  if(!state.weekly) state.weekly = [];
  if(!state.weeklyDone) state.weeklyDone = {};
  if(!state.weeklyDoneDates) state.weeklyDoneDates = {};
  if(!state.weeklyStepsDone) state.weeklyStepsDone = {};
  if(!state.yearly) state.yearly = [];
  if(!state.yearlyDone) state.yearlyDone = {};
  if(!state.yearlyDoneDates) state.yearlyDoneDates = {};
  if(!state.yearlyStepsDone) state.yearlyStepsDone = {};
  if(!state.dated) state.dated = [];
  if(!state.adhoc) state.adhoc = [];
  if(!state.notes) state.notes = [];
  if(!state.mistakes) state.mistakes = [];
}

async function loadState(){
  try{
    const { data, error } = await sb.from('board_state').select('data').eq('id', BOARD_ROW_ID).single();
    if(error) throw error;
    state = (data && data.data) ? data.data : state;
    clearLoadError();
  }catch(e){
    console.error('load failed', e);
    showLoadError();
  }
  ensureStateShape();
  render();
}

let saveInProgress = false;
let pendingSave = false;

async function saveState(){
  if(!canEdit()) return true; // 老板只读身份,不应该走到这里,双重保险
  if(saveInProgress){ pendingSave = true; return; }
  saveInProgress = true;
  const ok = await trySave();
  saveInProgress = false;
  if(pendingSave){
    pendingSave = false;
    saveState();
  }
  return ok;
}

async function trySave(attempt){
  attempt = attempt || 1;
  try{
    const { error } = await sb.from('board_state').update({ data: state }).eq('id', BOARD_ROW_ID);
    if(error) throw error;
    clearSaveError();
    return true;
  }catch(e){
    console.error('save failed', e);
    if(attempt < 2){
      await new Promise(r=>setTimeout(r, 700));
      return trySave(attempt+1);
    }
    showSaveError();
    return false;
  }
}

function showSaveError(){
  const box = document.getElementById('saveErrorBox');
  if(!box) return;
  box.innerHTML = `
    <div class="save-error-banner">
      <span>⚠️ 保存失败,可能是暂时的网络问题。数据还留在这个页面,先别关掉。</span>
      <button id="retrySaveBtn">重试保存</button>
    </div>
  `;
  const btn = document.getElementById('retrySaveBtn');
  if(btn) btn.addEventListener('click', ()=>{ saveState(); });
}

function clearSaveError(){
  const box = document.getElementById('saveErrorBox');
  if(box) box.innerHTML = '';
}

function showLoadError(){
  const box = document.getElementById('saveErrorBox');
  if(!box) return;
  box.innerHTML = `
    <div class="save-error-banner">
      <span>⚠️ 读取资料失败,可能是暂时的网络问题。</span>
      <button id="retryLoadBtn">重新载入</button>
    </div>
  `;
  const btn = document.getElementById('retryLoadBtn');
  if(btn) btn.addEventListener('click', ()=>{ loadState(); });
}

function clearLoadError(){
  clearSaveError();
}
