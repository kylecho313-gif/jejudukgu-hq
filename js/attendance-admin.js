/* 제주덕구 하남본점 알바관리 (출퇴근/급여정산 관리자용) */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const STORE_CODE = "S001"; // 하남 본점

const state = {
  storeId: null,
  userName: localStorage.getItem("jdgstaff_name") || "",
  currentMonth: monthNow(),
};

// ---------- 유틸 ----------
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function escapeHtml(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtNum(n) { return (Number(n) || 0).toLocaleString("ko-KR"); }
function monthNow() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtHm(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
// datetime-local 입력값(타임존 표기 없음)은 브라우저 로컬시각으로 해석해 UTC로 변환 후 저장한다.
// (그대로 문자열을 보내면 DB 세션 타임존 기준으로 재해석되어 시각이 어긋날 수 있음)
function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d.toISOString();
}
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}
function monthPickerHtml(value) {
  return `<input type="month" class="monthPicker" id="monthPicker" value="${value}">`;
}
function bindMonthPicker(root, onChange) {
  const el = $("#monthPicker", root);
  if (!el) return;
  el.addEventListener("change", () => { state.currentMonth = el.value; onChange(); });
}

// ---------- 로그인 ----------
function initLogin() {
  const authed = localStorage.getItem("jdgstaff_authed") === "true";
  if (authed && state.userName) { startApp(); return; }
  $("#loginScreen").style.display = "flex";
  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = $("#loginPw").value;
    const name = $("#loginName").value.trim();
    if (!name) { $("#loginErr").textContent = "이름을 입력해주세요."; return; }
    if (pw !== CONFIG.APP_PASSWORD) { $("#loginErr").textContent = "비밀번호가 올바르지 않습니다."; return; }
    localStorage.setItem("jdgstaff_authed", "true");
    localStorage.setItem("jdgstaff_name", name);
    state.userName = name;
    startApp();
  });
}
function logout() {
  localStorage.removeItem("jdgstaff_authed");
  location.reload();
}
async function startApp() {
  $("#loginScreen").style.display = "none";
  $("#app").style.display = "block";
  $("#userName").textContent = state.userName;

  const { data: store, error } = await sb.from("stores").select("id,name").eq("store_code", STORE_CODE).single();
  if (error || !store) {
    $("#mainContent").innerHTML = `<div class="panel">하남 본점 매장 정보를 찾을 수 없습니다: ${escapeHtml(error?.message || "")}</div>`;
    return;
  }
  state.storeId = store.id;
  await renderApp($("#mainContent"));
}

// ---------- 알바관리(출퇴근/급여정산) ----------
function isoWeekMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // 월=0 ... 일=6
  d.setDate(d.getDate() - day);
  return ymd(d);
}
function computeSettlement(logs, hourlyWage, monthStr) {
  const weekTotals = {};
  let monthHours = 0;
  const monthDays = new Set();
  for (const l of logs) {
    if (!l.clock_out) continue;
    const hrs = (new Date(l.clock_out) - new Date(l.clock_in)) / 3600000;
    if (hrs <= 0) continue;
    const monday = isoWeekMonday(l.work_date);
    weekTotals[monday] = (weekTotals[monday] || 0) + hrs;
    if (l.work_date.startsWith(monthStr)) { monthHours += hrs; monthDays.add(l.work_date); }
  }
  let weeklyAllowance = 0;
  for (const [monday, hrs] of Object.entries(weekTotals)) {
    if (monday.startsWith(monthStr) && hrs >= 15) weeklyAllowance += Math.min(hrs, 40) / 40 * 8 * hourlyWage;
  }
  const basePay = monthHours * hourlyWage;
  return {
    days: monthDays.size,
    hours: monthHours,
    basePay: Math.round(basePay),
    weeklyAllowance: Math.round(weeklyAllowance),
    total: Math.round(basePay + weeklyAllowance),
  };
}
function staffRowHtml(s) {
  const wh3 = s.withhold_3_3 !== false;
  return `<tr data-id="${s.id}">
    <td><input type="text" data-key="name" value="${escapeHtml(s.name)}"></td>
    <td><input type="text" maxlength="4" inputmode="numeric" data-key="pin" value="${escapeHtml(s.pin)}"></td>
    <td><input type="number" data-key="hourly_wage" value="${s.hourly_wage ?? 0}"></td>
    <td style="text-align:center"><input type="checkbox" data-key="withhold_3_3" ${wh3 ? "checked" : ""}></td>
    <td style="text-align:center"><input type="checkbox" data-key="active" ${s.active ? "checked" : ""}></td>
    <td><input type="text" data-key="notes" value="${escapeHtml(s.notes)}"></td>
    <td class="rowActions"><button class="iconBtn save">저장</button><button class="iconBtn del">삭제</button></td>
  </tr>`;
}
function logRowHtml(l, staffName) {
  return `<tr data-id="${l.id}">
    <td>${escapeHtml(staffName)}</td>
    <td><input type="date" data-key="work_date" value="${l.work_date || ""}"></td>
    <td><input type="datetime-local" data-key="clock_in" value="${toDatetimeLocal(l.clock_in)}"></td>
    <td><input type="datetime-local" data-key="clock_out" value="${toDatetimeLocal(l.clock_out)}"></td>
    <td><input type="text" data-key="notes" value="${escapeHtml(l.notes)}"></td>
    <td class="rowActions"><button class="iconBtn save">저장</button><button class="iconBtn del">삭제</button></td>
  </tr>`;
}
async function renderApp(main) {
  const storeId = state.storeId;
  const monthStr = state.currentMonth;
  const [y, m] = monthStr.split("-").map(Number);
  const monthStart = `${monthStr}-01`;
  const monthEnd = ymd(new Date(y, m, 0));
  const padStartDate = new Date(y, m - 1, 1); padStartDate.setDate(padStartDate.getDate() - 7);
  const padEndDate = new Date(y, m, 0); padEndDate.setDate(padEndDate.getDate() + 7);
  const padStart = ymd(padStartDate);
  const padEnd = ymd(padEndDate);
  const today = ymd(new Date());

  const { data: staffList, error: staffErr } = await sb.from("staff").select("*").eq("store_id", storeId).order("name");
  if (staffErr) { main.innerHTML = `<div class="panel">알바 명단을 불러오지 못했습니다: ${escapeHtml(staffErr.message)}<br><small style="color:var(--muted)">db/migration_03_attendance.sql을 Supabase SQL Editor에서 실행했는지 확인해주세요.</small></div>`; return; }
  const staffIds = (staffList || []).map(s => s.id);
  const staffMap = Object.fromEntries((staffList || []).map(s => [s.id, s]));

  let todayLogs = [], rangeLogs = [];
  if (staffIds.length) {
    const [{ data: t }, { data: r }] = await Promise.all([
      sb.from("attendance_logs").select("*").in("staff_id", staffIds).eq("work_date", today).order("clock_in"),
      sb.from("attendance_logs").select("*").in("staff_id", staffIds).gte("work_date", padStart).lte("work_date", padEnd).order("work_date", { ascending: false }).order("clock_in", { ascending: false }),
    ]);
    todayLogs = t || []; rangeLogs = r || [];
  }
  const monthLogs = rangeLogs.filter(l => l.work_date >= monthStart && l.work_date <= monthEnd);

  const todayRows = !staffList.length ? `<tr><td colspan="5" style="color:var(--muted)">등록된 알바가 없습니다.</td></tr>` :
    staffList.map(s => {
      const logs = todayLogs.filter(l => l.staff_id === s.id);
      if (!logs.length) return `<tr><td>${escapeHtml(s.name)}</td><td colspan="3" style="color:var(--muted)">출근 기록 없음</td><td><span class="badge muted">미출근</span></td></tr>`;
      return logs.map(l => {
        const inT = new Date(l.clock_in);
        const working = !l.clock_out;
        const hrs = working ? (Date.now() - inT) / 3600000 : (new Date(l.clock_out) - inT) / 3600000;
        return `<tr><td>${escapeHtml(s.name)}</td><td>${fmtHm(inT)}</td><td>${l.clock_out ? fmtHm(new Date(l.clock_out)) : "-"}</td><td>${hrs.toFixed(1)}시간</td><td>${working ? '<span class="badge ok">근무중</span>' : '<span class="badge muted">퇴근</span>'}</td></tr>`;
      }).join("");
    }).join("");

  let settleRows = "", totalBase = 0, totalAllow = 0, totalPay = 0, totalHours = 0, totalWithhold = 0, totalNet = 0;
  for (const s of staffList) {
    const logs = rangeLogs.filter(l => l.staff_id === s.id);
    const r = computeSettlement(logs, Number(s.hourly_wage) || 0, monthStr);
    const wh3 = s.withhold_3_3 !== false;
    const withholdAmt = wh3 ? Math.round(r.total * 0.033) : 0;
    const netPay = r.total - withholdAmt;
    totalBase += r.basePay; totalAllow += r.weeklyAllowance; totalPay += r.total; totalHours += r.hours;
    totalWithhold += withholdAmt; totalNet += netPay;
    settleRows += `<tr><td>${escapeHtml(s.name)}</td><td>${r.days}일</td><td>${r.hours.toFixed(1)}시간</td><td>${fmtNum(r.basePay)}원</td><td>${fmtNum(r.weeklyAllowance)}원</td><td>${fmtNum(r.total)}원</td><td>${wh3 ? "-" + fmtNum(withholdAmt) + "원" : "미적용"}</td><td><strong>${fmtNum(netPay)}원</strong></td></tr>`;
  }
  if (!staffList.length) settleRows = `<tr><td colspan="8" style="color:var(--muted)">등록된 알바가 없습니다.</td></tr>`;

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">알바 명단 <small>하남 본점 · 출퇴근 앱(attendance.html) 로그인용 이름/PIN 관리</small></h2>
        <div class="right"><button class="primary" id="staffAddBtn">+ 알바 추가</button></div>
      </div>
      <div class="tableWrap">
      <table>
        <colgroup><col style="width:140px"><col style="width:110px"><col style="width:120px"><col style="width:80px"><col style="width:80px"><col><col style="width:100px"></colgroup>
        <thead><tr><th>이름</th><th>PIN(4자리)</th><th>시급(원)</th><th>3.3% 공제</th><th>재직중</th><th>메모</th><th>작업</th></tr></thead>
        <tbody id="staffBody">${(staffList || []).map(staffRowHtml).join("")}</tbody>
      </table>
      </div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">PIN은 <a href="attendance.html" target="_blank" rel="noopener">출퇴근 앱</a>에서 본인 확인용으로만 쓰이는 간단한 번호이며 강한 보안이 아닙니다. "3.3% 공제"는 사업소득(프리랜서) 원천징수 적용 여부이며, 알바마다 다르게 설정할 수 있습니다.</p>
    </div>

    <div class="panel">
      <h2 style="margin:0 0 12px">오늘 출퇴근 현황</h2>
      <div class="tableWrap"><table>
        <thead><tr><th>이름</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>상태</th></tr></thead>
        <tbody>${todayRows}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">근태기록 (수정 가능)</h2>
        <div class="right">월 ${monthPickerHtml(monthStr)}</div>
      </div>
      <div class="tableWrap"><table>
        <colgroup><col style="width:110px"><col style="width:130px"><col style="width:170px"><col style="width:170px"><col><col style="width:100px"></colgroup>
        <thead><tr><th>이름</th><th>근무일</th><th>출근시각</th><th>퇴근시각</th><th>메모</th><th>작업</th></tr></thead>
        <tbody id="logsBody">${monthLogs.map(l => logRowHtml(l, staffMap[l.staff_id]?.name || "(삭제된 알바)")).join("") || `<tr><td colspan="6" style="color:var(--muted)">이번 달 기록이 없습니다.</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <h2 style="margin:0 0 4px">월별 정산 · ${monthStr}</h2>
      <p style="color:var(--muted);font-size:12px;margin:0 0 12px">
        기본급 = 시급 × 근무시간. 주휴수당(추정)은 해당 주(월~일요일) 실근무시간이 15시간 이상일 때
        (주 근무시간 ÷ 40시간, 최대 1) × 8 × 시급 으로 간이 계산한 값이며, 결근 여부는 반영하지 못합니다.
        3.3% 공제는 (기본급+주휴수당) 합계에 사업소득 원천징수 3.3%를 적용한 금액이며, 알바 명단에서 알바별로 켜고 끌 수 있습니다.
        정확한 지급액·세무 처리는 세무사·노무사 확인을 권장합니다. 퇴근 처리가 안 된 기록은 위 근태기록에서 퇴근시각을 채운 뒤 다시 계산됩니다.
      </p>
      <div class="tableWrap"><table>
        <thead><tr><th>이름</th><th>근무일수</th><th>근무시간</th><th>기본급</th><th>주휴수당(추정)</th><th>합계</th><th>3.3% 공제액</th><th>실지급액</th></tr></thead>
        <tbody>${settleRows}</tbody>
        <tfoot><tr style="font-weight:700;background:#f5f0e8">
          <td>합계</td><td></td><td>${totalHours.toFixed(1)}시간</td><td>${fmtNum(totalBase)}원</td><td>${fmtNum(totalAllow)}원</td><td>${fmtNum(totalPay)}원</td><td>-${fmtNum(totalWithhold)}원</td><td>${fmtNum(totalNet)}원</td>
        </tr></tfoot>
      </table></div>
    </div>
  `;

  bindMonthPicker(main, () => renderApp(main));

  $("#staffAddBtn").addEventListener("click", async () => {
    const payload = { store_id: storeId, name: "새 알바", pin: "0000", hourly_wage: 10030, active: true, updated_by: state.userName };
    const { error } = await sb.from("staff").insert(payload);
    if (error) { alert("추가 실패: " + error.message); return; }
    toast("알바가 추가되었습니다");
    renderApp(main);
  });

  const staffBody = $("#staffBody");
  staffBody.addEventListener("input", (e) => { const tr = e.target.closest("tr"); if (tr) tr.classList.add("dirty"); });
  staffBody.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest(".save")) {
      const payload = { updated_by: state.userName };
      $all("[data-key]", tr).forEach(el => { payload[el.dataset.key] = el.type === "checkbox" ? el.checked : (el.value === "" ? null : el.value); });
      const { error } = await sb.from("staff").update(payload).eq("id", id);
      if (error) { alert("저장 실패: " + error.message); return; }
      toast("저장되었습니다");
      renderApp(main);
    }
    if (e.target.closest(".del")) {
      if (!confirm("이 알바를 삭제할까요? 관련 출퇴근 기록도 함께 삭제됩니다.")) return;
      const { error } = await sb.from("staff").delete().eq("id", id);
      if (error) { alert("삭제 실패: " + error.message); return; }
      toast("삭제되었습니다");
      renderApp(main);
    }
  });

  const logsBody = $("#logsBody");
  if (logsBody) {
    logsBody.addEventListener("input", (e) => { const tr = e.target.closest("tr"); if (tr) tr.classList.add("dirty"); });
    logsBody.addEventListener("click", async (e) => {
      const tr = e.target.closest("tr"); if (!tr) return;
      const id = tr.dataset.id;
      if (e.target.closest(".save")) {
        const payload = { updated_by: state.userName };
        $all("[data-key]", tr).forEach(el => {
          let v = el.value === "" ? null : el.value;
          if (v && (el.dataset.key === "clock_in" || el.dataset.key === "clock_out")) v = localInputToIso(v);
          payload[el.dataset.key] = v;
        });
        const { error } = await sb.from("attendance_logs").update(payload).eq("id", id);
        if (error) { alert("저장 실패: " + error.message); return; }
        toast("저장되었습니다");
        renderApp(main);
      }
      if (e.target.closest(".del")) {
        if (!confirm("이 기록을 삭제할까요?")) return;
        const { error } = await sb.from("attendance_logs").delete().eq("id", id);
        if (error) { alert("삭제 실패: " + error.message); return; }
        toast("삭제되었습니다");
        renderApp(main);
      }
    });
  }
}

// ---------- 시작 ----------
document.addEventListener("DOMContentLoaded", initLogin);
