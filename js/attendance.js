/* 제주덕구 알바 출퇴근 앱 (하남 본점) */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const STORE_CODE = "S001"; // 하남 본점

// 알바 앱은 테이블을 직접 읽거나 쓰지 않고 DB 함수(clock_*)만 호출함 — PIN 확인도 서버에서 함 (db/migration_07)
const state = { staffList: [], selected: null, pin: "", openClockIn: null };

function $(sel) { return document.querySelector(sel); }
function escapeHtml(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pad2(n) { return String(n).padStart(2, "0"); }
function fmtHm(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
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
  const { data: storeName, error } = await sb.rpc("clock_store_name", { p_store_code: STORE_CODE });
  if (error || !storeName) {
    $("#nameGrid").innerHTML = `<p class="empty">매장 정보를 불러오지 못했습니다.<br>관리자에게 문의해주세요.</p>`;
    return;
  }
  $("#storeName").textContent = storeName;
  await loadStaff();
  renderNameGrid();
  bindEvents();
}

async function loadStaff() {
  const { data, error } = await sb.rpc("clock_staff_list", { p_store_code: STORE_CODE });
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
  const { data, error } = await sb.rpc("clock_check", { p_staff_id: state.selected.id, p_pin: val });
  if (error || !data || data.status !== "OK") {
    $("#pinErr").textContent = pinErrorMessage(error ? "ERR" : data?.status);
    $("#pinInput").value = "";
    updatePinDots("");
    return;
  }
  $("#pinErr").textContent = "";
  state.pin = val;
  state.openClockIn = data.open ? data.clock_in : null;
  openActionScreen();
}

function pinErrorMessage(status) {
  if (status === "PIN") return "PIN이 올바르지 않습니다. 다시 입력해주세요.";
  if (status === "LOCKED") return "PIN을 여러 번 틀려 잠시 잠겼습니다. 10분 후 다시 시도하거나 관리자에게 문의해주세요.";
  return "확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
}

function openActionScreen() {
  const open = !!state.openClockIn;

  const title = $("#actionTitle"), sub = $("#actionSub"), info = $("#actionInfo"), btn = $("#actionBtn");
  if (open) {
    const inT = new Date(state.openClockIn);
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
    const mode = btn.dataset.mode;
    const { data, error } = await sb.rpc("clock_punch", { p_staff_id: state.selected.id, p_pin: state.pin, p_mode: mode });
    if (error) throw error;
    if (data?.status === "STATE") {
      alert("출퇴근 상태가 방금 바뀌었습니다. 처음부터 다시 진행해주세요.");
      resetToName();
      return;
    }
    if (data?.status !== "OK") throw new Error(pinErrorMessage(data?.status));
    const at = new Date(data.at);
    if (mode === "in") showDone(`출근 처리되었습니다 (${fmtHm(at)})`, "✅");
    else showDone(`퇴근 처리되었습니다 (${fmtHm(at)})`, "🙌");
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
  state.pin = "";
  state.openClockIn = null;
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
