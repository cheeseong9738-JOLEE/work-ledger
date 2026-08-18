// 主入口:登入检查、套用角色 UI、载入数据、渲染

document.getElementById('logoutBtn').addEventListener('click', signOut);

(async function init(){
  const profile = await requireAuth();
  if(!profile) return; // requireAuth 已经处理跳转

  applyRoleUI();
  await loadState();
})();
