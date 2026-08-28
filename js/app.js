/* 제주덕구 본사 통합관리 웹앱 */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const state = {
  stores: [],
  dropdowns: {},
  alertSettings: {},
  currentMonth: monthNow(),
  userName: localStorage.getItem("jdg_name") || "",
};

// ---------- 유틸 ----------
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function escapeHtml(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function monthNow() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtNum(n) { return (Number(n) || 0).toLocaleString("ko-KR"); }
function todayMidnight() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - todayMidnight()) / 86400000);
}
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}
function dd(category) { return (state.dropdowns[category] || []).map(o => o.value); }
function selectHtml(name, options, selected, extra = "") {
  const opts = options.map(o => `<option value="${escapeHtml(o)}" ${o === selected ? "selected" : ""}>${escapeHtml(o)}</option>`).join("");
  return `<select data-key="${name}" ${extra}><option value=""></option>${opts}</select>`;
}
function storeSelectHtml(selectedId) {
  const opts = state.stores.map(s => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
  return `<select data-key="store_id"><option value=""></option>${opts}</select>`;
}
function storeName(id) { return state.stores.find(s => s.id === id)?.name || ""; }

// ---------- 데이터 로드 ----------
async function loadStores() {
  const { data, error } = await sb.from("stores").select("*").order("store_code");
  if (error) { console.error(error); return []; }
  state.stores = data || [];
  return state.stores;
}
async function loadDropdowns() {
  const { data, error } = await sb.from("dropdown_options").select("*").order("category").order("sort_order");
  if (error) { console.error(error); return; }
  const grouped = {};
  for (const row of data || []) { (grouped[row.category] ??= []).push(row); }
  state.dropdowns = grouped;
}
async function loadAlertSettings() {
  const { data, error } = await sb.from("alert_settings").select("*").eq("id", 1).single();
  if (error) { console.error(error); return; }
  state.alertSettings = data || {};
}

// ---------- 로그인 ----------
function initLogin() {
  const authed = localStorage.getItem("jdg_authed") === "true";
  if (authed && state.userName) { startApp(); return; }
  $("#loginScreen").style.display = "flex";
  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = $("#loginPw").value;
    const name = $("#loginName").value.trim();
    if (!name) { $("#loginErr").textContent = "이름을 입력해주세요."; return; }
    if (pw !== CONFIG.APP_PASSWORD) { $("#loginErr").textContent = "비밀번호가 올바르지 않습니다."; return; }
    localStorage.setItem("jdg_authed", "true");
    localStorage.setItem("jdg_name", name);
    state.userName = name;
    startApp();
  });
}
function logout() {
  localStorage.removeItem("jdg_authed");
  location.reload();
}
async function startApp() {
  $("#loginScreen").style.display = "none";
  $("#app").style.display = "block";
  $("#userName").textContent = state.userName;

  if (CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") || CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON")) {
    $("#mainContent").innerHTML = `<div class="panel">
      <h2>Supabase 연결 설정이 아직 필요합니다</h2>
      <p>js/config.js 파일의 SUPABASE_URL, SUPABASE_ANON_KEY 값을
      Supabase 프로젝트의 실제 값으로 교체한 뒤 새로고침 해주세요.</p>
    </div>`;
    return;
  }

  buildTabs();
  try {
    await Promise.all([loadStores(), loadDropdowns(), loadAlertSettings()]);
    goTab("dashboard");
  } catch (err) {
    console.error(err);
    $("#mainContent").innerHTML = `<div class="panel">
      <h2>데이터를 불러오지 못했습니다</h2>
      <p>Supabase 연결 정보(js/config.js)가 올바른지, 인터넷 연결 상태를 확인해주세요.</p>
      <p style="color:var(--muted);font-size:12px">${escapeHtml(err.message || String(err))}</p>
    </div>`;
  }
}

// ---------- 탭 ----------
const TABS = [
  { id: "dashboard", label: "대시보드", render: renderDashboard },
  { id: "stores", label: "매장현황", render: renderStores },
  { id: "sales", label: "매출·로열티", render: renderSales },
  { id: "issues", label: "이슈관리", render: renderIssues },
  { id: "weekly", label: "주간보고", render: renderWeekly },
  { id: "monthly", label: "월간요약", render: renderMonthly },
  { id: "newstore", label: "신규오픈", render: renderNewStore },
  { id: "tasks", label: "본부장업무", render: renderTasks },
  { id: "leads", label: "가맹문의", render: renderFranchiseInquiries },
  { id: "logistics", label: "물류마진", render: renderLogistics },
  { id: "pnl", label: "매장손익", render: renderPnl },
  { id: "settings", label: "설정", render: renderSettings },
];
function buildTabs() {
  const nav = $("#tabs");
  nav.innerHTML = TABS.map(t => `<button data-tab="${t.id}">${t.label}</button>`).join("");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (btn) goTab(btn.dataset.tab);
  });
}
async function goTab(id) {
  $all("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  const tab = TABS.find(t => t.id === id);
  const main = $("#mainContent");
  main.innerHTML = `<div class="panel">불러오는 중...</div>`;
  await tab.render(main);
}

// ---------- 알림 계산 ----------
async function computeAlerts() {
  const s = state.alertSettings;
  const alerts = { contract: [], issue: [], newStore: [], task: [], unpaid: [], lead: [] };

  for (const st of state.stores) {
    if (!st.contract_end) continue;
    const d = daysUntil(st.contract_end);
    if (d < 0) alerts.contract.push({ level: "danger", text: `${st.name} 계약 만료 지남 (D+${-d})` });
    else if (d <= (s.contract_expiry_days ?? 60)) alerts.contract.push({ level: "warn", text: `${st.name} 계약만료 임박 (D-${d})` });
  }

  const { data: issues } = await sb.from("issues").select("*").neq("status", "완료");
  for (const it of issues || []) {
    if (!it.due_date) continue;
    const d = daysUntil(it.due_date);
    const nm = storeName(it.store_id) || "-";
    if (d < 0) alerts.issue.push({ level: "danger", text: `[${nm}] ${it.issue_text || "이슈"} 기한 지남 (D+${-d})` });
    else if (d <= (s.issue_due_days ?? 3)) alerts.issue.push({ level: "warn", text: `[${nm}] ${it.issue_text || "이슈"} 완료예정 임박 (D-${d})` });
  }

  const { data: openings } = await sb.from("new_store_openings").select("*").neq("opening_stage", "오픈완료");
  for (const op of openings || []) {
    if (!op.expected_open_date) continue;
    const d = daysUntil(op.expected_open_date);
    if (d <= (s.new_store_due_days ?? 14) && d >= 0) alerts.newStore.push({ level: "warn", text: `${op.store_name} 오픈예정 임박 (D-${d})` });
    else if (d < 0) alerts.newStore.push({ level: "danger", text: `${op.store_name} 예정오픈일 지남 (D+${-d})` });
  }

  const { data: tasks } = await sb.from("manager_tasks").select("*").neq("status", "완료");
  for (const tk of tasks || []) {
    if (!tk.due_at) continue;
    const d = daysUntil(tk.due_at);
    if (d < 0) alerts.task.push({ level: "danger", text: `${tk.task_content || "업무"} 마감 지남 (D+${-d})` });
    else if (d <= (s.manager_task_due_days ?? 3)) alerts.task.push({ level: "warn", text: `${tk.task_content || "업무"} 마감 임박 (D-${d})` });
  }

  const { data: sales } = await sb.from("sales_royalty").select("*").eq("month", state.currentMonth);
  for (const sr of sales || []) {
    const store = state.stores.find(s => s.id === sr.store_id);
    const royalty = (Number(sr.sales) || 0) * (Number(store?.royalty_rate) || 0) / 100;
    const unpaid = royalty - (Number(sr.payment_amount) || 0);
    if (unpaid > (s.unpaid_threshold ?? 0)) alerts.unpaid.push({ level: "danger", text: `${store?.name || "-"} 미수금 ${fmtNum(unpaid)}원` });
  }

  const { data: leads } = await sb.from("franchise_inquiries").select("*").not("status", "in", "(계약완료,보류,거절)");
  for (const ld of leads || []) {
    if (!ld.next_action_date) continue;
    const d = daysUntil(ld.next_action_date);
    const nm = ld.contact_name || "가맹문의";
    if (d < 0) alerts.lead.push({ level: "danger", text: `[가맹문의] ${nm} 후속조치 기한 지남 (D+${-d})` });
    else if (d <= (s.lead_followup_due_days ?? 3)) alerts.lead.push({ level: "warn", text: `[가맹문의] ${nm} 후속조치 임박 (D-${d})` });
  }

  return alerts;
}

// ---------- 00 대시보드 ----------
async function renderDashboard(main) {
  await loadStores();
  const alerts = await computeAlerts();
  const { data: salesRows } = await sb.from("sales_royalty").select("*").eq("month", state.currentMonth);
  const { data: issuesAll } = await sb.from("issues").select("*");
  const { data: marginRows } = await sb.from("supply_margin").select("*").eq("month", state.currentMonth);
  const { data: leadsThisMonth } = await sb.from("franchise_inquiries").select("id").gte("inquiry_date", `${state.currentMonth}-01`).lt("inquiry_date", `${shiftMonth(state.currentMonth, 1)}-01`);

  const salesByStore = {};
  for (const r of salesRows || []) salesByStore[r.store_id] = r;

  const openCount = state.stores.filter(s => s.status === "오픈").length;
  const progressCount = state.stores.filter(s => s.status === "진행중").length;
  const franchiseCount = state.stores.filter(s => s.type === "가맹").length;
  const directCount = state.stores.filter(s => s.type === "직영").length;
  const overseasCount = state.stores.filter(s => s.type === "해외").length;

  const totalSales = (salesRows || []).reduce((a, r) => a + (Number(r.sales) || 0), 0);
  const totalRoyalty = (salesRows || []).reduce((a, r) => {
    const st = state.stores.find(s => s.id === r.store_id);
    return a + (Number(r.sales) || 0) * (Number(st?.royalty_rate) || 0) / 100;
  }, 0);
  const totalUnpaid = (salesRows || []).reduce((a, r) => {
    const st = state.stores.find(s => s.id === r.store_id);
    const royalty = (Number(r.sales) || 0) * (Number(st?.royalty_rate) || 0) / 100;
    return a + Math.max(royalty - (Number(r.payment_amount) || 0), 0);
  }, 0);

  const totalMargin = (marginRows || []).reduce((a, r) => a + ((Number(r.supply_amount) || 0) - (Number(r.cost_amount) || 0)), 0);
  const totalHqRevenue = totalRoyalty + totalMargin;

  const unresolvedIssues = (issuesAll || []).filter(i => i.status !== "완료");
  const openIssueCount = (issuesAll || []).filter(i => i.status === "미처리").length;
  const progressIssueCount = (issuesAll || []).filter(i => i.status === "진행중").length;
  const doneIssueCount = (issuesAll || []).filter(i => i.status === "완료").length;

  const monthOptions = monthPickerHtml(state.currentMonth);

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">제주덕구 본부운영 대시보드</h2>
        <div class="right">
          조회월 ${monthOptions}
        </div>
      </div>
      <div class="kpiGrid">
        ${kpi("전체 매장 수", state.stores.length)}
        ${kpi("오픈 매장", openCount)}
        ${kpi("진행중 매장", progressCount)}
        ${kpi("가맹점 수", franchiseCount)}
        ${kpi("직영점 수", directCount)}
        ${kpi("해외점 수", overseasCount)}
        ${kpi("조회월 총매출", fmtNum(totalSales) + "원")}
        ${kpi("로열티 발생액", fmtNum(totalRoyalty) + "원")}
        ${kpi("로열티 미수금", fmtNum(totalUnpaid) + "원", totalUnpaid > 0 ? "danger" : "")}
        ${kpi("조회월 물류마진", fmtNum(totalMargin) + "원")}
        ${kpi("본사 총수익(로열티+물류마진)", fmtNum(totalHqRevenue) + "원")}
        ${kpi("미처리 이슈", openIssueCount)}
        ${kpi("진행중 이슈", progressIssueCount)}
        ${kpi("완료 이슈", doneIssueCount)}
        ${kpi("이번달 신규 가맹문의", (leadsThisMonth || []).length)}
      </div>
    </div>

    <div class="panel">
      <h2>실시간 경고 <small>(기준: 설정 탭)</small></h2>
      ${renderAlertList(alerts)}
    </div>

    <div class="panel">
      <h2>매장별 현황 · 매출 · 로열티 · 이슈 요약</h2>
      <div class="tableWrap">
      <table>
        <thead><tr>
          <th>매장명</th><th>구분</th><th>상태</th><th>조회월 매출</th><th>로열티 발생액</th>
          <th>입금액</th><th>미수금</th><th>입금상태</th><th>처리중 이슈</th><th>담당자</th>
        </tr></thead>
        <tbody>
          ${state.stores.map(s => {
            const r = salesByStore[s.id] || {};
            const royalty = (Number(r.sales) || 0) * (Number(s.royalty_rate) || 0) / 100;
            const unpaid = royalty - (Number(r.payment_amount) || 0);
            const issueCnt = unresolvedIssues.filter(i => i.store_id === s.id).length;
            return `<tr>
              <td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.status)}</td>
              <td>${fmtNum(r.sales)}</td><td>${fmtNum(royalty)}</td><td>${fmtNum(r.payment_amount)}</td>
              <td>${fmtNum(unpaid)}</td><td>${escapeHtml(r.payment_status || "-")}</td>
              <td>${issueCnt}</td><td>${escapeHtml(s.hq_manager || "-")}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      </div>
    </div>
  `;
  bindMonthPicker(main, () => renderDashboard(main));
}
function kpi(label, value, level = "") {
  return `<div class="kpi ${level}"><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div></div>`;
}
function renderAlertList(alerts) {
  const all = [...alerts.contract, ...alerts.issue, ...alerts.newStore, ...alerts.task, ...alerts.unpaid, ...alerts.lead];
  if (all.length === 0) return `<div class="alertBox ok">현재 기준을 초과한 경고가 없습니다.</div>`;
  return all.map(a => `<div class="alertBox ${a.level}">${escapeHtml(a.text)}</div>`).join("");
}
function monthPickerHtml(value) {
  return `<input type="month" class="monthPicker" id="monthPicker" value="${value}">`;
}
function bindMonthPicker(root, onChange) {
  const el = $("#monthPicker", root);
  if (!el) return;
  el.addEventListener("change", () => { state.currentMonth = el.value; onChange(); });
}

// ---------- 범용 CRUD 테이블 ----------
async function mountCrudTable(main, cfg) {
  const { data, error } = await sb.from(cfg.table).select("*").order(cfg.orderCol || "created_at", { ascending: cfg.orderAsc ?? false });
  if (error) { main.innerHTML = `<div class="panel">불러오기 실패: ${escapeHtml(error.message)}</div>`; return; }
  const rows = data || [];

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">${cfg.title}</h2>
        <div class="right"><button class="primary" id="addRowBtn">+ 행 추가</button></div>
      </div>
      ${cfg.summaryHtml || ""}
      <div class="tableWrap">
      <table${cfg.fixedLayout ? ' style="table-layout:fixed"' : ""}>
        <colgroup>${cfg.columns.map(c => `<col${c.width ? ` style="width:${c.width}"` : ""}>`).join("")}<col style="width:100px"></colgroup>
        <thead><tr>${cfg.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}<th>작업</th></tr></thead>
        <tbody id="crudBody">
          ${rows.map(r => rowHtml(cfg, r)).join("")}
        </tbody>
      </table>
      </div>
    </div>
  `;

  $("#addRowBtn").addEventListener("click", async () => {
    const payload = { ...cfg.addDefaults, updated_by: state.userName };
    const { data: inserted, error: insErr } = await sb.from(cfg.table).insert(payload).select().single();
    if (insErr) { alert("추가 실패: " + insErr.message); return; }
    $("#crudBody").insertAdjacentHTML("afterbegin", rowHtml(cfg, inserted));
    toast("행이 추가되었습니다");
  });

  const body = $("#crudBody");
  body.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (tr) tr.classList.add("dirty");
  });
  body.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest(".save")) {
      const payload = {};
      $all("[data-key]", tr).forEach(el => { payload[el.dataset.key] = el.value === "" ? null : el.value; });
      payload.updated_by = state.userName;
      const { error: updErr } = await sb.from(cfg.table).update(payload).eq("id", id);
      if (updErr) { alert("저장 실패: " + updErr.message); return; }
      tr.classList.remove("dirty");
      toast("저장되었습니다");
      if (cfg.onSaved) cfg.onSaved();
    }
    if (e.target.closest(".del")) {
      if (!confirm("이 행을 삭제할까요?")) return;
      const { error: delErr } = await sb.from(cfg.table).delete().eq("id", id);
      if (delErr) { alert("삭제 실패: " + delErr.message); return; }
      tr.remove();
      toast("삭제되었습니다");
    }
  });
}
function rowHtml(cfg, r) {
  const cells = cfg.columns.map(c => {
    let inner;
    if (c.type === "select") inner = selectHtml(c.key, dd(c.category), r[c.key]);
    else if (c.type === "store") inner = storeSelectHtml(r[c.key]);
    else if (c.type === "date") inner = `<input type="date" data-key="${c.key}" value="${r[c.key] || ""}">`;
    else if (c.type === "datetime") inner = `<input type="datetime-local" data-key="${c.key}" value="${toDatetimeLocal(r[c.key])}">`;
    else if (c.type === "number") inner = `<input type="number" data-key="${c.key}" value="${r[c.key] ?? ""}">`;
    else if (c.type === "textarea") inner = `<textarea rows="2" data-key="${c.key}">${escapeHtml(r[c.key])}</textarea>`;
    else inner = `<input type="text" data-key="${c.key}" value="${escapeHtml(r[c.key])}">`;
    return `<td>${inner}</td>`;
  }).join("");
  return `<tr data-id="${r.id}">${cells}<td class="rowActions">
    <button class="iconBtn save">저장</button><button class="iconBtn del">삭제</button>
  </td></tr>`;
}

// ---------- 01 매장현황 ----------
function renderStores(main) {
  return mountCrudTable(main, {
    table: "stores",
    title: "매장현황",
    orderCol: "store_code",
    orderAsc: true,
    fixedLayout: true,
    addDefaults: { name: "신규매장", type: "가맹", status: "준비중", royalty_rate: 3.0 },
    columns: [
      { key: "store_code", label: "매장코드", width: "64px" },
      { key: "name", label: "매장명", width: "84px" },
      { key: "type", label: "구분", type: "select", category: "매장구분", width: "56px" },
      { key: "status", label: "운영상태", type: "select", category: "운영상태", width: "64px" },
      { key: "owner_name", label: "점주/책임자", width: "72px" },
      { key: "phone", label: "연락처", width: "96px" },
      { key: "address", label: "주소", width: "280px" },
      { key: "open_date", label: "오픈일", type: "date", width: "112px" },
      { key: "contract_start", label: "계약시작일", type: "date", width: "112px" },
      { key: "contract_end", label: "계약만료일", type: "date", width: "112px" },
      { key: "royalty_rate", label: "로열티율(%)", type: "number", width: "64px" },
      { key: "hq_manager", label: "본부담당자", width: "72px" },
      { key: "notes", label: "비고", width: "100px" },
    ],
    onSaved: () => loadStores(),
  });
}

// ---------- 02 매출·로열티 ----------
async function renderSales(main) {
  await loadStores();
  const monthOptions = monthPickerHtml(state.currentMonth);
  const { data: rows } = await sb.from("sales_royalty").select("*").eq("month", state.currentMonth);
  const byStore = {}; for (const r of rows || []) byStore[r.store_id] = r;

  const prevMonth = shiftMonth(state.currentMonth, -1);
  const { data: prevRows } = await sb.from("sales_royalty").select("*").eq("month", prevMonth);
  const prevByStore = {}; for (const r of prevRows || []) prevByStore[r.store_id] = r;

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">가맹점 매출 · 로열티 통합관리</h2>
        <div class="right">월 ${monthOptions}</div>
      </div>
      <div class="tableWrap">
      <table style="table-layout:fixed">
        <colgroup>
          <col style="width:140px"><col style="width:56px"><col style="width:56px"><col style="width:96px">
          <col style="width:96px"><col style="width:72px"><col style="width:56px"><col style="width:96px">
          <col style="width:96px"><col style="width:96px"><col style="width:88px">
          <col style="width:80px"><col style="width:140px"><col style="width:100px">
        </colgroup>
        <thead><tr>
          <th>매장명</th><th>구분</th><th>상태</th><th>전월매출</th><th>월매출</th><th>전월대비</th>
          <th>로열티율</th><th>로열티발생액</th><th>입금액</th><th>미수금</th><th>입금상태</th>
          <th>확인자</th><th>특이사항/점주요청</th><th>작업</th>
        </tr></thead>
        <tbody id="salesBody">
          ${state.stores.map(s => salesRowHtml(s, byStore[s.id], prevByStore[s.id])).join("")}
        </tbody>
      </table>
      </div>
    </div>
  `;
  bindMonthPicker(main, () => renderSales(main));

  const body = $("#salesBody");
  body.addEventListener("input", (e) => {
    const tr = e.target.closest("tr"); if (tr) tr.classList.add("dirty");
  });
  body.addEventListener("click", async (e) => {
    if (!e.target.closest(".save")) return;
    const tr = e.target.closest("tr");
    const storeId = tr.dataset.storeId;
    const payload = { month: state.currentMonth, store_id: storeId, updated_by: state.userName };
    $all("[data-key]", tr).forEach(el => { payload[el.dataset.key] = el.value === "" ? null : el.value; });
    const { error } = await sb.from("sales_royalty").upsert(payload, { onConflict: "month,store_id" });
    if (error) { alert("저장 실패: " + error.message); return; }

    const rateEl = $("[data-store-key='royalty_rate']", tr);
    const newRate = rateEl ? Number(rateEl.value) || 0 : null;
    const store = state.stores.find(s => s.id === storeId);
    if (rateEl && store && newRate !== Number(store.royalty_rate)) {
      const { error: rateErr } = await sb.from("stores").update({ royalty_rate: newRate, updated_by: state.userName }).eq("id", storeId);
      if (rateErr) { alert("로열티율 저장 실패: " + rateErr.message); return; }
      store.royalty_rate = newRate;
    }

    tr.classList.remove("dirty");
    toast("저장되었습니다");
  });
}
function salesRowHtml(store, r, prev) {
  r = r || {};
  const rate = Number(store.royalty_rate) || 0;
  const sales = Number(r.sales) || 0;
  const royalty = sales * rate / 100;
  const unpaid = royalty - (Number(r.payment_amount) || 0);
  const prevSales = Number(prev?.sales) || 0;
  const diff = prevSales ? Math.round(((sales - prevSales) / prevSales) * 1000) / 10 : null;
  return `<tr data-store-id="${store.id}">
    <td>${escapeHtml(store.name)}</td>
    <td>${escapeHtml(store.type)}</td>
    <td>${escapeHtml(store.status)}</td>
    <td class="readonly"><input value="${fmtNum(prevSales)}" disabled></td>
    <td><input type="number" data-key="sales" value="${r.sales ?? ""}"></td>
    <td class="readonly"><input value="${diff === null ? '-' : diff + '%'}" disabled></td>
    <td><input type="number" step="0.1" data-store-key="royalty_rate" value="${rate}"></td>
    <td class="readonly"><input value="${fmtNum(royalty)}" disabled></td>
    <td><input type="number" data-key="payment_amount" value="${r.payment_amount ?? ""}"></td>
    <td class="readonly"><input value="${fmtNum(unpaid)}" disabled></td>
    <td>${selectHtml("payment_status", dd("입금상태"), r.payment_status)}</td>
    <td><input type="text" data-key="confirmer" value="${escapeHtml(r.confirmer)}"></td>
    <td><input type="text" data-key="notes" value="${escapeHtml(r.notes)}"></td>
    <td class="rowActions"><button class="iconBtn save">저장</button></td>
  </tr>`;
}
// ---------- 10 물류/식자재 마진관리 ----------
async function renderLogistics(main) {
  await loadStores();
  const monthOptions = monthPickerHtml(state.currentMonth);
  const { data: rows, error } = await sb.from("supply_margin").select("*").eq("month", state.currentMonth);
  if (error) {
    main.innerHTML = `<div class="panel">불러오기 실패: ${escapeHtml(error.message)}
      <p style="color:var(--muted);font-size:12px">supply_margin 테이블이 없다면 db/migration_02_logistics_and_leads.sql을 Supabase SQL Editor에서 먼저 실행해주세요.</p></div>`;
    return;
  }
  const byStore = {}; for (const r of rows || []) byStore[r.store_id] = r;

  const totalSupply = (rows || []).reduce((a, r) => a + (Number(r.supply_amount) || 0), 0);
  const totalCost = (rows || []).reduce((a, r) => a + (Number(r.cost_amount) || 0), 0);
  const totalMargin = totalSupply - totalCost;
  const marginRate = totalSupply ? Math.round((totalMargin / totalSupply) * 1000) / 10 : 0;

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">물류/식자재 마진관리</h2>
        <div class="right">월 ${monthOptions}</div>
      </div>
      <div class="kpiGrid" style="margin-bottom:12px">
        ${kpi("조회월 공급액 합계", fmtNum(totalSupply) + "원")}
        ${kpi("조회월 매입원가 합계", fmtNum(totalCost) + "원")}
        ${kpi("조회월 물류마진", fmtNum(totalMargin) + "원")}
        ${kpi("평균 마진율", marginRate + "%")}
      </div>
      <div class="tableWrap">
      <table style="table-layout:fixed">
        <colgroup>
          <col style="width:140px"><col style="width:56px"><col style="width:120px"><col style="width:120px">
          <col style="width:120px"><col style="width:80px"><col style="width:100px"><col style="width:160px"><col style="width:100px">
        </colgroup>
        <thead><tr>
          <th>매장명</th><th>구분</th><th>공급액(청구액)</th><th>매입원가</th>
          <th>마진액</th><th>마진율</th><th>확인자</th><th>비고</th><th>작업</th>
        </tr></thead>
        <tbody id="logisticsBody">
          ${state.stores.map(s => logisticsRowHtml(s, byStore[s.id])).join("")}
        </tbody>
      </table>
      </div>
    </div>
  `;
  bindMonthPicker(main, () => renderLogistics(main));

  const body = $("#logisticsBody");
  body.addEventListener("input", (e) => {
    const tr = e.target.closest("tr"); if (tr) tr.classList.add("dirty");
  });
  body.addEventListener("click", async (e) => {
    if (!e.target.closest(".save")) return;
    const tr = e.target.closest("tr");
    const storeId = tr.dataset.storeId;
    const payload = { month: state.currentMonth, store_id: storeId, updated_by: state.userName };
    $all("[data-key]", tr).forEach(el => { payload[el.dataset.key] = el.value === "" ? null : el.value; });
    const { error: saveErr } = await sb.from("supply_margin").upsert(payload, { onConflict: "month,store_id" });
    if (saveErr) { alert("저장 실패: " + saveErr.message); return; }
    tr.classList.remove("dirty");
    toast("저장되었습니다");
  });
}
function logisticsRowHtml(store, r) {
  r = r || {};
  const supply = Number(r.supply_amount) || 0;
  const cost = Number(r.cost_amount) || 0;
  const margin = supply - cost;
  const rate = supply ? Math.round((margin / supply) * 1000) / 10 : 0;
  return `<tr data-store-id="${store.id}">
    <td>${escapeHtml(store.name)}</td>
    <td>${escapeHtml(store.type)}</td>
    <td><input type="number" data-key="supply_amount" value="${r.supply_amount ?? ""}"></td>
    <td><input type="number" data-key="cost_amount" value="${r.cost_amount ?? ""}"></td>
    <td class="readonly"><input value="${fmtNum(margin)}" disabled></td>
    <td class="readonly"><input value="${rate}%" disabled></td>
    <td><input type="text" data-key="confirmer" value="${escapeHtml(r.confirmer)}"></td>
    <td><input type="text" data-key="notes" value="${escapeHtml(r.notes)}"></td>
    <td class="rowActions"><button class="iconBtn save">저장</button></td>
  </tr>`;
}
// ---------- 11 매장손익 통합뷰 ----------
async function renderPnl(main) {
  await loadStores();
  const monthOptions = monthPickerHtml(state.currentMonth);
  const { data: salesRows } = await sb.from("sales_royalty").select("*").eq("month", state.currentMonth);
  const { data: marginRows } = await sb.from("supply_margin").select("*").eq("month", state.currentMonth);
  const salesByStore = {}; for (const r of salesRows || []) salesByStore[r.store_id] = r;
  const marginByStore = {}; for (const r of marginRows || []) marginByStore[r.store_id] = r;

  let totalSales = 0, totalRoyalty = 0, totalRoyaltyPaid = 0, totalSupply = 0, totalCost = 0, totalMargin = 0, totalHq = 0;

  const rowsHtml = state.stores.map(s => {
    const sr = salesByStore[s.id] || {};
    const mr = marginByStore[s.id] || {};
    const sales = Number(sr.sales) || 0;
    const rate = Number(s.royalty_rate) || 0;
    const royalty = sales * rate / 100;
    const royaltyPaid = Number(sr.payment_amount) || 0;
    const supply = Number(mr.supply_amount) || 0;
    const cost = Number(mr.cost_amount) || 0;
    const margin = supply - cost;
    const hqRevenue = royaltyPaid + margin;

    totalSales += sales; totalRoyalty += royalty; totalRoyaltyPaid += royaltyPaid;
    totalSupply += supply; totalCost += cost; totalMargin += margin; totalHq += hqRevenue;

    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.type)}</td>
      <td>${fmtNum(sales)}</td>
      <td>${fmtNum(royalty)}</td>
      <td>${fmtNum(royaltyPaid)}</td>
      <td>${fmtNum(supply)}</td>
      <td>${fmtNum(cost)}</td>
      <td>${fmtNum(margin)}</td>
      <td><b>${fmtNum(hqRevenue)}</b></td>
    </tr>`;
  }).join("");

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">매장별 손익(본사 수익) 통합뷰</h2>
        <div class="right">월 ${monthOptions}</div>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:0 0 12px">본사 순수익 = 로열티 입금액 + 물류마진 (매출·로열티, 물류마진 탭의 입력값을 자동 합산한 조회 전용 화면입니다)</p>
      <div class="kpiGrid" style="margin-bottom:12px">
        ${kpi("조회월 총매출", fmtNum(totalSales) + "원")}
        ${kpi("로열티 발생액", fmtNum(totalRoyalty) + "원")}
        ${kpi("로열티 입금액", fmtNum(totalRoyaltyPaid) + "원")}
        ${kpi("물류마진", fmtNum(totalMargin) + "원")}
        ${kpi("본사 총순수익", fmtNum(totalHq) + "원")}
      </div>
      <div class="tableWrap">
      <table style="table-layout:fixed">
        <colgroup>
          <col style="width:140px"><col style="width:56px"><col style="width:110px"><col style="width:110px">
          <col style="width:110px"><col style="width:110px"><col style="width:110px"><col style="width:100px"><col style="width:120px">
        </colgroup>
        <thead><tr>
          <th>매장명</th><th>구분</th><th>월매출</th><th>로열티발생액</th><th>로열티입금액</th>
          <th>물류공급액</th><th>물류원가</th><th>물류마진</th><th>본사순수익</th>
        </tr></thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="font-weight:bold;background:var(--bg2,#f5f5f5)">
            <td>합계</td><td></td><td>${fmtNum(totalSales)}</td><td>${fmtNum(totalRoyalty)}</td><td>${fmtNum(totalRoyaltyPaid)}</td>
            <td>${fmtNum(totalSupply)}</td><td>${fmtNum(totalCost)}</td><td>${fmtNum(totalMargin)}</td><td>${fmtNum(totalHq)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  `;
  bindMonthPicker(main, () => renderPnl(main));
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------- 03 이슈관리 ----------
function renderIssues(main) {
  return mountCrudTable(main, {
    table: "issues",
    title: "매장별 이슈관리",
    orderCol: "reg_date",
    addDefaults: { reg_date: new Date().toISOString().slice(0, 10), status: "미처리", priority: "중" },
    columns: [
      { key: "reg_date", label: "등록일", type: "date" },
      { key: "type", label: "구분" },
      { key: "store_id", label: "매장", type: "store" },
      { key: "issue_text", label: "이슈/요청사항" },
      { key: "priority", label: "우선순위", type: "select", category: "우선순위" },
      { key: "assignee", label: "담당자" },
      { key: "status", label: "처리상태", type: "select", category: "처리상태" },
      { key: "due_date", label: "완료예정일", type: "date" },
      { key: "complete_date", label: "완료일", type: "date" },
      { key: "notes", label: "비고" },
    ],
  });
}

// ---------- 04 주간보고 ----------
function renderWeekly(main) {
  return mountCrudTable(main, {
    table: "weekly_reports",
    title: "주간보고",
    columns: [
      { key: "week_period", label: "주차/기간" },
      { key: "key_tasks", label: "이번주 핵심업무", type: "textarea" },
      { key: "store_issues", label: "매장 주요이슈", type: "textarea" },
      { key: "franchise_requests", label: "가맹점 요청사항", type: "textarea" },
      { key: "completed", label: "완료사항", type: "textarea" },
      { key: "next_week_plan", label: "다음주 계획", type: "textarea" },
      { key: "ceo_check", label: "대표 확인사항" },
      { key: "notes", label: "비고" },
    ],
  });
}

// ---------- 05 월간요약 ----------
async function renderMonthly(main) {
  await loadStores();
  const monthOptions = monthPickerHtml(state.currentMonth);
  const { data: salesRows } = await sb.from("sales_royalty").select("*").eq("month", state.currentMonth);
  const { data: issuesAll } = await sb.from("issues").select("*");
  const { data: openings } = await sb.from("new_store_openings").select("*").neq("opening_stage", "오픈완료");
  const { data: narrativeRow } = await sb.from("monthly_narrative").select("*").eq("month", state.currentMonth).maybeSingle();
  const { data: marginRows } = await sb.from("supply_margin").select("*").eq("month", state.currentMonth);
  const totalMargin = (marginRows || []).reduce((a, r) => a + ((Number(r.supply_amount) || 0) - (Number(r.cost_amount) || 0)), 0);

  const totalSales = (salesRows || []).reduce((a, r) => a + (Number(r.sales) || 0), 0);
  const totalRoyalty = (salesRows || []).reduce((a, r) => {
    const st = state.stores.find(s => s.id === r.store_id);
    return a + (Number(r.sales) || 0) * (Number(st?.royalty_rate) || 0) / 100;
  }, 0);
  const totalPaid = (salesRows || []).reduce((a, r) => a + (Number(r.payment_amount) || 0), 0);
  const totalUnpaid = totalRoyalty - totalPaid;
  const issueCount = (issuesAll || []).length;
  const doneIssueCount = (issuesAll || []).filter(i => i.status === "완료").length;

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar"><h2 style="margin:0">월간요약</h2><div class="right">월 ${monthOptions}</div></div>
      <div class="kpiGrid">
        ${kpi("전체매출", fmtNum(totalSales) + "원")}
        ${kpi("로열티발생액", fmtNum(totalRoyalty) + "원")}
        ${kpi("로열티입금액", fmtNum(totalPaid) + "원")}
        ${kpi("미수금", fmtNum(totalUnpaid) + "원", totalUnpaid > 0 ? "danger" : "")}
        ${kpi("물류마진", fmtNum(totalMargin) + "원")}
        ${kpi("전체 이슈수", issueCount)}
        ${kpi("완료 이슈수", doneIssueCount)}
        ${kpi("신규오픈 진행중", (openings || []).length)}
      </div>
    </div>
    <div class="panel">
      <h2>대표보고사항 / 다음월 중점</h2>
      <div class="settingsGrid">
        <div><label>대표보고사항</label><textarea id="narrReport" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px">${escapeHtml(narrativeRow?.report_text)}</textarea></div>
        <div><label>다음월 중점</label><textarea id="narrFocus" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px">${escapeHtml(narrativeRow?.next_month_focus)}</textarea></div>
        <div><label>비고</label><textarea id="narrNotes" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px">${escapeHtml(narrativeRow?.notes)}</textarea></div>
      </div>
      <div style="margin-top:12px"><button class="primary" id="saveNarrBtn">저장</button></div>
    </div>
  `;
  bindMonthPicker(main, () => renderMonthly(main));
  $("#saveNarrBtn").addEventListener("click", async () => {
    const payload = {
      month: state.currentMonth,
      report_text: $("#narrReport").value,
      next_month_focus: $("#narrFocus").value,
      notes: $("#narrNotes").value,
      updated_by: state.userName,
    };
    const { error } = await sb.from("monthly_narrative").upsert(payload, { onConflict: "month" });
    if (error) { alert("저장 실패: " + error.message); return; }
    toast("저장되었습니다");
  });
}

// ---------- 06 신규오픈관리 ----------
function renderNewStore(main) {
  return mountCrudTable(main, {
    table: "new_store_openings",
    title: "신규오픈관리",
    addDefaults: { store_name: "신규매장", type: "가맹", opening_stage: "계약" },
    columns: [
      { key: "store_name", label: "매장명" },
      { key: "type", label: "구분", type: "select", category: "매장구분" },
      { key: "opening_stage", label: "오픈단계", type: "select", category: "오픈단계" },
      { key: "expected_open_date", label: "예정오픈일", type: "date" },
      { key: "construction_status", label: "공사상태" },
      { key: "training_status", label: "교육상태" },
      { key: "equipment_status", label: "기물/집기" },
      { key: "menu_test_status", label: "메뉴테스트" },
      { key: "assignee", label: "담당자" },
      { key: "next_action", label: "다음액션" },
      { key: "notes", label: "비고" },
    ],
  });
}

// ---------- 07 본부장업무관리 ----------
function renderTasks(main) {
  return mountCrudTable(main, {
    table: "manager_tasks",
    title: "본부장 업무관리",
    orderCol: "start_at",
    addDefaults: { start_at: toDatetimeLocal(new Date()), status: "미처리", priority: "중", ceo_check: "미확인" },
    columns: [
      { key: "start_at", label: "시작일", type: "datetime" },
      { key: "task_type", label: "업무구분" },
      { key: "task_content", label: "업무내용" },
      { key: "target_store", label: "대상매장" },
      { key: "priority", label: "우선순위", type: "select", category: "우선순위" },
      { key: "assignee", label: "담당자" },
      { key: "due_at", label: "마감일", type: "datetime" },
      { key: "status", label: "진행상태", type: "select", category: "처리상태" },
      { key: "ceo_check", label: "대표확인", type: "select", category: "확인여부" },
    ],
  });
}

// ---------- 09 가맹문의관리 ----------
async function renderFranchiseInquiries(main) {
  const { data: leads } = await sb.from("franchise_inquiries").select("status");
  const rows = leads || [];
  const countOf = (...statuses) => rows.filter(r => statuses.includes(r.status)).length;
  const total = rows.length;
  const won = countOf("계약완료");
  const lost = countOf("보류", "거절");
  const rate = total ? Math.round((won / total) * 1000) / 10 : 0;
  const summaryHtml = `
    <div class="kpiGrid" style="margin-bottom:12px">
      ${kpi("전체 문의", total)}
      ${kpi("신규문의", countOf("신규문의"))}
      ${kpi("상담중", countOf("상담중"))}
      ${kpi("현장방문", countOf("현장방문예정", "현장방문완료"))}
      ${kpi("계약검토", countOf("계약검토"))}
      ${kpi("계약완료", won)}
      ${kpi("보류/거절", lost)}
      ${kpi("전환율(계약완료/전체)", rate + "%")}
    </div>`;

  return mountCrudTable(main, {
    table: "franchise_inquiries",
    title: "가맹문의관리",
    orderCol: "inquiry_date",
    addDefaults: { inquiry_date: new Date().toISOString().slice(0, 10), status: "신규문의" },
    summaryHtml,
    columns: [
      { key: "inquiry_date", label: "문의일", type: "date" },
      { key: "contact_name", label: "문의자명" },
      { key: "phone", label: "연락처" },
      { key: "interested_area", label: "관심지역" },
      { key: "budget", label: "예산" },
      { key: "channel", label: "문의경로", type: "select", category: "문의경로" },
      { key: "status", label: "상담상태", type: "select", category: "상담상태" },
      { key: "assignee", label: "담당자" },
      { key: "next_action", label: "다음액션" },
      { key: "next_action_date", label: "다음액션일", type: "date" },
      { key: "notes", label: "비고" },
    ],
  });
}

// ---------- 설정 ----------
async function renderSettings(main) {
  await loadAlertSettings();
  const s = state.alertSettings;
  main.innerHTML = `
    <div class="panel">
      <h2>내 정보</h2>
      <div class="settingsGrid">
        <div><label>표시 이름</label><input id="myName" value="${escapeHtml(state.userName)}"></div>
      </div>
      <div style="margin-top:12px"><button class="primary" id="saveNameBtn">이름 저장</button>
      <button class="iconBtn" id="logoutBtn" style="margin-left:8px">로그아웃</button></div>
    </div>

    <div class="panel">
      <h2>자동 알림 기준 설정 <small>대시보드 경고 색상 기준</small></h2>
      <div class="settingsGrid">
        <div><label>계약만료 임박 알림 (일)</label><input type="number" id="a_contract" value="${s.contract_expiry_days ?? 60}"></div>
        <div><label>이슈 완료예정일 임박 알림 (일)</label><input type="number" id="a_issue" value="${s.issue_due_days ?? 3}"></div>
        <div><label>신규오픈 예정일 임박 알림 (일)</label><input type="number" id="a_newstore" value="${s.new_store_due_days ?? 14}"></div>
        <div><label>본부장 업무 마감 임박 알림 (일)</label><input type="number" id="a_task" value="${s.manager_task_due_days ?? 3}"></div>
        <div><label>미수금 경고 기준액 (원)</label><input type="number" id="a_unpaid" value="${s.unpaid_threshold ?? 0}"></div>
        <div><label>가맹문의 후속조치 임박 알림 (일)</label><input type="number" id="a_lead" value="${s.lead_followup_due_days ?? 3}"></div>
      </div>
      <div style="margin-top:12px"><button class="primary" id="saveAlertBtn">저장</button></div>
    </div>

    <div class="panel">
      <h2>설정값 (드롭다운 목록) 관리</h2>
      <div class="dropdownEditor" id="ddEditor"></div>
    </div>
  `;
  $("#saveNameBtn").addEventListener("click", () => {
    state.userName = $("#myName").value.trim() || state.userName;
    localStorage.setItem("jdg_name", state.userName);
    $("#userName").textContent = state.userName;
    toast("이름이 저장되었습니다");
  });
  $("#logoutBtn").addEventListener("click", logout);
  $("#saveAlertBtn").addEventListener("click", async () => {
    const payload = {
      id: 1,
      contract_expiry_days: Number($("#a_contract").value) || 0,
      issue_due_days: Number($("#a_issue").value) || 0,
      new_store_due_days: Number($("#a_newstore").value) || 0,
      manager_task_due_days: Number($("#a_task").value) || 0,
      unpaid_threshold: Number($("#a_unpaid").value) || 0,
      lead_followup_due_days: Number($("#a_lead").value) || 0,
      updated_by: state.userName,
    };
    const { error } = await sb.from("alert_settings").upsert(payload, { onConflict: "id" });
    if (error) { alert("저장 실패: " + error.message); return; }
    await loadAlertSettings();
    toast("알림 기준이 저장되었습니다");
  });

  await renderDropdownEditor();
}
async function renderDropdownEditor() {
  await loadDropdowns();
  const cats = ["매장구분", "운영상태", "입금상태", "처리상태", "우선순위", "보고구분", "오픈단계", "확인여부", "문의경로", "상담상태"];
  const box = $("#ddEditor");
  box.innerHTML = cats.map(cat => `
    <div class="cat" data-cat="${escapeHtml(cat)}">
      <h4>${escapeHtml(cat)}</h4>
      ${(state.dropdowns[cat] || []).map(o => `<div class="item" data-id="${o.id}"><span>${escapeHtml(o.value)}</span><button class="delOpt">삭제</button></div>`).join("")}
      <div class="addRow"><input placeholder="새 값 추가" class="newOptInput"><button class="iconBtn addOpt">추가</button></div>
    </div>
  `).join("");

  box.addEventListener("click", async (e) => {
    const catEl = e.target.closest(".cat");
    if (!catEl) return;
    const category = catEl.dataset.cat;
    if (e.target.closest(".delOpt")) {
      const id = e.target.closest(".item").dataset.id;
      if (!confirm("이 값을 삭제할까요?")) return;
      await sb.from("dropdown_options").delete().eq("id", id);
      await renderDropdownEditor();
    }
    if (e.target.closest(".addOpt")) {
      const input = $(".newOptInput", catEl);
      const value = input.value.trim();
      if (!value) return;
      await sb.from("dropdown_options").insert({ category, value, sort_order: (state.dropdowns[category]?.length || 0) + 1 });
      await renderDropdownEditor();
    }
  }, { once: true });
}

// ---------- 시작 ----------
document.addEventListener("DOMContentLoaded", initLogin);
