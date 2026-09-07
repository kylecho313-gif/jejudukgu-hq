/* 제주덕구 알바 출퇴근 앱 (하남 본점) */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const STORE_CODE = "S001"; // 하남 본점

const state = { storeId: null, staffList: [], selected: null, pendingLog: null };

function $(sel) { return document.querySelector(sel); }
function escapeHtml(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pad2(n) { return String(n).padStart(2, "0"); }
function fmtHm(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtElapsed(ms) { const total = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(total / 60)}시간 ${total % 60}분`; }

function showScreen(id) {
  ["screenName", "screenPin", "screenAction", "screenDone"].forEach(s => {
    $("#" + s).hidden = (s !== id);
  });
}

function tickClock() {
  $("#liveClock").textContent = new Date().toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", month: "2-digit", day: "2-digit", weekday: "short" });
}

async function init() {
  tickClock();
  setInterval(tickClock, 30000);
  const { data: store, error } = await sb.from("stores").select("id,name").eq("store_code", STORE_CODE).single();
  if (error || !store) {
    $("#nameGrid").innerHTML = `<p class="empty">매장 정보를 불러오지 못했습니다.<br>관리자에게 문의해주세요.</p>`;
    return;
  }
  state.storeId = store.id;
  $("#storeName").textContent = store.name;
  await loadStaff();
  renderNameGrid();
  bindEvents();
}

async function loadStaff() {
  const { data, error } = await sb.from("staff").select("id,name,pin").eq("store_id", state.storeId).eq("active", true).order("name");
  state.staffList = error ? [] : (data || []);
}

function renderNameGrid() {
  const grid = $("#nameGrid");
  if (!state.staffList.length) {
    grid.innerHTML = `<p class="empty">등록된 알바가 없습니다.<br>관리자에게 문의해주세요.</p>`;
    return;
  }
  grid.innerHTML = state.staffList.map(s => `<button data-id="${s.id}">${escapeHtml(s.name)}</button>`).join("");
}

function selectStaff(id) {
  state.selected = state.staffList.find(s => s.id === id);
  if (!state.selected) return;
  $("#pinStaffName").textContent = state.selected.name;
  $("#pinInput").value = "";
  $("#pinErr").textContent = "";
  updatePinDots("");
  showScreen("screenPin");
  setTimeout(() => $("#pinInput").focus(), 50);
}

function updatePinDots(val) {
  [...document.querySelectorAll("#pinDots span")].forEach((d, i) => d.classList.toggle("filled", i < val.length));
}

async function submitPin() {
  const val = $("#pinInput").value;
  if (val.length !== 4) return;
  if (val !== state.selected.pin) {
    $("#pinErr").textContent = "PIN이 올바르지 않습니다. 다시 입력해주세요.";
    $("#pinInput").value = "";
    updatePinDots("");
    return;
  }
  $("#pinErr").textContent = "";
  await openActionScreen();
}

async function openActionScreen() {
  const { data: logs, error } = await sb.from("attendance_logs")
    .select("*").eq("staff_id", state.selected.id).order("clock_in", { ascending: false }).limit(1);
  if (error) { $("#pinErr").textContent = "출퇴근 기록을 불러오지 못했습니다."; return; }
  const last = (logs || [])[0];
  const open = !!(last && !last.clock_out);
  state.pendingLog = open ? last : null;

  const title = $("#actionTitle"), sub = $("#actionSub"), info = $("#actionInfo"), btn = $("#actionBtn");
  if (open) {
    const inT = new Date(last.clock_in);
    title.textContent = `${state.selected.name}님, 퇴근하시나요?`;
    sub.textContent = "";
    info.hidden = false;
    info.innerHTML = `
      <div class="row"><span>출근 시각</span><span>${fmtHm(inT)}</span></div>
      <div class="row"><span>현재까지 근무</span><span>${fmtElapsed(Date.now() - inT)}</span></div>`;
    btn.textContent = "퇴근하기";
    btn.className = "bigBtn out";
    btn.dataset.mode = "out";
  } else {
    title.textContent = `${state.selected.name}님, 출근하시나요?`;
    sub.textContent = `현재 시각 ${fmtHm(new Date())} 기준으로 출근 처리됩니다.`;
    info.hidden = true;
    info.innerHTML = "";
    btn.textContent = "출근하기";
    btn.className = "bigBtn";
    btn.dataset.mode = "in";
  }
  showScreen("screenAction");
}

async function handleAction() {
  const btn = $("#actionBtn");
  btn.disabled = true;
  try {
    const now = new Date();
    if (btn.dataset.mode === "in") {
      const { error } = await sb.from("attendance_logs").insert({
        staff_id: state.selected.id,
        work_date: ymd(now),
        clock_in: now.toISOString(),
      });
      if (error) throw error;
      showDone(`출근 처리되었습니다 (${fmtHm(now)})`, "✅");
    } else {
      const { error } = await sb.from("attendance_logs").update({ clock_out: now.toISOString() }).eq("id", state.pendingLog.id);
      if (error) throw error;
      showDone(`퇴근 처리되었습니다 (${fmtHm(now)})`, "🙌");
    }
  } catch (err) {
    alert("처리 중 오류가 발생했습니다: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

function showDone(msg, icon) {
  $("#doneIcon").textContent = icon;
  $("#doneMsg").textContent = msg;
  showScreen("screenDone");
  setTimeout(resetToName, 2500);
}

function resetToName() {
  state.selected = null;
  state.pendingLog = null;
  showScreen("screenName");
}

function bindEvents() {
  $("#nameGrid").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) selectStaff(b.dataset.id);
  });
  $("#pinBackBtn").addEventListener("click", resetToName);
  $("#actionBackBtn").addEventListener("click", () => showScreen("screenPin"));
  $("#pinInput").addEventListener("input", (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    e.target.value = digits;
    updatePinDots(digits);
    if (digits.length === 4) submitPin();
  });
  $("#actionBtn").addEventListener("click", handleAction);
}

init();
