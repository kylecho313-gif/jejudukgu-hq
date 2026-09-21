/* 제주덕구 가맹점 월별 손익 입력 (db/migration_09_store_pnl.sql)
 * 2025년 본점 결산표 양식을 그대로 옮긴 것 — 지출은 거래처별로 한 줄씩 입력한다.
 * 저장은 화면 전체를 한 번에 저장한다(줄마다 저장하면 다른 줄 입력이 날아가므로).
 * 관리자 개별 로그인 적용 전까지는 매장을 직접 고르는 방식이며, 적용 후에는 계정에 묶인 매장만 열린다.
 */

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const CATEGORIES = [
  { key: "고정비", label: "고정비", hint: "임대료·관리비·렌탈·보험 등 매달 고정으로 나가는 비용" },
  { key: "식자재", label: "식자재", hint: "거래처별로 한 줄씩 입력해주세요 (원가율 분석에 쓰입니다)" },
  { key: "공과금운영비", label: "공과금·운영비", hint: "전기·가스·수도·통신, 주방 부자재, 광고, 소모품, 회식비, 카드수수료 등" },
  { key: "세금보험", label: "세금·4대보험", hint: "4대 보험, 사업소득세, 부가세, 지방세 등" },
  { key: "인건비", label: "인건비", hint: "직원·알바 인건비, 성과급, 퇴직금" },
];

const state = {
  userName: localStorage.getItem("jdgpnl_name") || "",
  stores: [],
  storeId: localStorage.getItem("jdgpnl_store") || "",
  month: monthNow(),
  pnl: null,
  sales: { cash: 0, card: 0, delivery: 0 },
  items: [],      // 화면에서 편집 중인 줄들 (id가 없으면 새 줄)
  removed: [],    // 삭제한 기존 줄의 id
  presets: [],
  dirty: false,
};

// ---------- 유틸 ----------
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function escapeHtml(s) { return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function monthNow() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function num(v) { return Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0; }
function fmtNum(n) { return Math.round(Number(n) || 0).toLocaleString("ko-KR"); }
function pct(part, whole) { return whole > 0 ? (part / whole * 100).toFixed(1) + "%" : "-"; }
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}
function setDirty(v) {
  state.dirty = v;
  const btn = $("#saveAllBtn");
  if (btn) { btn.disabled = !v; btn.textContent = v ? "변경사항 모두 저장 *" : "변경사항 모두 저장"; }
  window.onbeforeunload = v ? () => "저장하지 않은 입력이 있습니다." : null;
}

// ---------- 로그인 (본사 앱과 같은 공유 비밀번호 — 개별 로그인 적용 시 교체) ----------
function initLogin() {
  const authed = localStorage.getItem("jdgpnl_authed") === "true";
  if (authed && state.userName) { startApp(); return; }
  $("#loginScreen").style.display = "flex";
  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#loginName").value.trim();
    if (!name) { $("#loginErr").textContent = "이름을 입력해주세요."; return; }
    if ($("#loginPw").value !== CONFIG.APP_PASSWORD) { $("#loginErr").textContent = "비밀번호가 올바르지 않습니다."; return; }
    localStorage.setItem("jdgpnl_authed", "true");
    localStorage.setItem("jdgpnl_name", name);
    state.userName = name;
    startApp();
  });
}
function logout() {
  if (state.dirty && !confirm("저장하지 않은 입력이 있습니다. 로그아웃할까요?")) return;
  localStorage.removeItem("jdgpnl_authed");
  window.onbeforeunload = null;
  location.reload();
}

async function startApp() {
  $("#loginScreen").style.display = "none";
  $("#app").style.display = "block";
  $("#userName").textContent = state.userName;

  const [{ data: stores, error }, { data: presets }] = await Promise.all([
    sb.from("stores").select("id,name,store_code").order("store_code"),
    sb.from("store_pnl_presets").select("*").order("category").order("sort_order"),
  ]);
  if (error) { $("#mainContent").innerHTML = `<div class="panel">매장 목록을 불러오지 못했습니다: ${escapeHtml(error.message)}</div>`; return; }
  state.stores = stores || [];
  state.presets = presets || [];
  if (!state.storeId && state.stores.length) state.storeId = state.stores[0].id;
  await loadMonth();
}

// ---------- 불러오기 ----------
async function loadMonth() {
  const { data: pnl, error } = await sb.from("store_pnl").select("*")
    .eq("month", state.month).eq("store_id", state.storeId).maybeSingle();
  if (error) { $("#mainContent").innerHTML = `<div class="panel">불러오지 못했습니다: ${escapeHtml(error.message)}<br><small style="color:var(--muted)">db/migration_09_store_pnl.sql을 Supabase SQL Editor에서 실행했는지 확인해주세요.</small></div>`; return; }
  state.pnl = pnl || null;
  state.sales = { cash: pnl?.sales_cash ?? 0, card: pnl?.sales_card ?? 0, delivery: pnl?.sales_delivery ?? 0 };
  state.removed = [];
  let items = [];
  if (pnl) {
    const { data } = await sb.from("store_pnl_items").select("*").eq("pnl_id", pnl.id).order("category").order("sort_order");
    items = data || [];
  }
  state.items = buildRows(items);
  render();
  setDirty(false);
}

// 항목은 고정 목록으로 보여주고 금액만 입력받는다.
// 고정 목록(store_pnl_presets) + 저장된 내역 중 목록에 없는 항목(과거 데이터) + 묶음별 "기타" 한 줄.
function rowKey(r) { return [r.category, r.account || "", r.item || "", r.vendor || ""].join("|"); }

function buildRows(savedItems) {
  const saved = {};
  for (const it of savedItems) saved[rowKey(it)] = it;
  const rows = [];
  const used = new Set();

  for (const p of state.presets) {
    const base = { category: p.category, account: p.account || "", item: p.item || "", vendor: p.vendor || "" };
    const hit = saved[rowKey(base)];
    if (hit) used.add(rowKey(base));
    rows.push({ ...base, id: hit?.id, supply_amount: hit?.supply_amount ?? "", tax_amount: hit?.tax_amount ?? "", amount: hit?.amount ?? "" });
  }
  // 고정 목록에 없는 저장 내역(2025년 이관분 등)은 그대로 아래에 붙여 보여준다
  for (const it of savedItems) {
    if (used.has(rowKey(it))) continue;
    rows.push({
      category: it.category, account: it.account || "", item: it.item || "", vendor: it.vendor || "",
      id: it.id, supply_amount: it.supply_amount ?? "", tax_amount: it.tax_amount ?? "", amount: it.amount ?? "", extra: true,
    });
  }
  // 목록에 없는 지출을 적을 수 있도록 묶음마다 "기타" 한 줄 (거래처·비고만 직접 입력)
  for (const c of CATEGORIES) {
    rows.push({ category: c.key, account: "기타", item: "기타(직접 입력)", vendor: "", supply_amount: "", tax_amount: "", amount: "", freeVendor: true });
  }
  return rows;
}

// ---------- 계산 ----------
function totals() {
  // 매출은 state.sales에 보관한다 — 줄을 추가해 화면을 다시 그려도 입력한 매출이 사라지지 않게
  const sales = num(state.sales.cash) + num(state.sales.card) + num(state.sales.delivery);
  const byCat = {};
  for (const c of CATEGORIES) byCat[c.key] = 0;
  for (const it of state.items) byCat[it.category] = (byCat[it.category] || 0) + num(it.amount);
  const expense = Object.values(byCat).reduce((a, b) => a + b, 0);
  return { sales, byCat, expense, profit: sales - expense };
}

// ---------- 화면 ----------
function summaryHtml() {
  const t = totals();
  return `<table>
    <tbody>
      <tr><td>매출 합계</td><td style="text-align:right"><strong>${fmtNum(t.sales)}원</strong></td>
        <td style="color:var(--muted)">현금 ${fmtNum(num(state.sales.cash))} · 카드 ${fmtNum(num(state.sales.card))} · 배달 ${fmtNum(num(state.sales.delivery))}</td></tr>
      ${CATEGORIES.map(c => `<tr><td>${c.label}</td><td style="text-align:right">${fmtNum(t.byCat[c.key])}원</td><td style="color:var(--muted)">매출 대비 ${pct(t.byCat[c.key], t.sales)}</td></tr>`).join("")}
      <tr><td>지출 합계</td><td style="text-align:right"><strong>${fmtNum(t.expense)}원</strong></td><td></td></tr>
      <tr style="font-weight:700;background:#f5f0e8">
        <td>순수익 (매출 - 지출)</td>
        <td style="text-align:right;color:${t.profit < 0 ? "#b3261e" : "inherit"}">${fmtNum(t.profit)}원</td>
        <td>순수익율 ${pct(t.profit, t.sales)} · 원가율(식자재) ${pct(t.byCat["식자재"], t.sales)} · 인건비율 ${pct(t.byCat["인건비"], t.sales)}</td>
      </tr>
    </tbody>
  </table>`;
}

// 항목 이름은 고정(글자), 금액만 입력
function itemRowHtml(it, idx, locked) {
  const dis = locked ? "disabled" : "";
  const vendorCell = it.freeVendor
    ? `<input type="text" data-key="vendor" value="${escapeHtml(it.vendor)}" placeholder="직접 입력" ${dis}>`
    : escapeHtml(it.vendor || "");
  return `<tr data-idx="${idx}"${it.extra ? ' title="고정 목록에 없는 항목(과거 입력분)"' : ""}>
    <td>${escapeHtml(it.account || "")}</td>
    <td>${escapeHtml(it.item || "")}${it.extra ? ` <small style="color:var(--muted)">(추가분)</small>` : ""}</td>
    <td>${vendorCell}</td>
    <td><input type="number" data-key="supply_amount" value="${it.supply_amount ?? ""}" placeholder="0" ${dis}></td>
    <td><input type="number" data-key="tax_amount" value="${it.tax_amount ?? ""}" placeholder="0" ${dis}></td>
    <td><input type="number" data-key="amount" value="${it.amount ?? ""}" placeholder="0" ${dis}></td>
  </tr>`;
}

function render() {
  const t = totals();
  const p = state.pnl || {};
  const locked = p.status === "확인완료";
  const main = $("#mainContent");

  main.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h2 style="margin:0">월별 손익 입력
          <small>${locked ? "본사 확인완료 — 수정하려면 본사에 문의해주세요" : "입력 후 아래 '변경사항 모두 저장'을 눌러주세요"}</small>
        </h2>
        <div class="right">
          <select id="storeSel">${state.stores.map(s => `<option value="${s.id}" ${s.id === state.storeId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>
          <input type="month" id="monthSel" value="${state.month}">
          <button class="primary" id="saveAllBtn" disabled>변경사항 모두 저장</button>
        </div>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:0">
        상태: <strong>${escapeHtml(p.status || "작성 전")}</strong>
        ${p.updated_by ? ` · 마지막 수정 ${escapeHtml(p.updated_by)}` : ""}
        · 항목은 고정입니다. 해당되는 줄에 금액만 넣으시면 되고, 없는 달은 비워두시면 됩니다.
        목록에 없는 지출은 각 묶음 맨 아래 "기타" 줄에 내용을 적고 금액을 넣어주세요.
      </p>
    </div>

    <div class="panel">
      <h2 style="margin:0 0 12px">매출</h2>
      <div class="settingsGrid">
        <div><label>현금매출</label><input type="number" id="salesCash" value="${state.sales.cash}" ${locked ? "disabled" : ""}></div>
        <div><label>카드매출</label><input type="number" id="salesCard" value="${state.sales.card}" ${locked ? "disabled" : ""}></div>
        <div><label>배달매출</label><input type="number" id="salesDelivery" value="${state.sales.delivery}" ${locked ? "disabled" : ""}></div>
        <div><label>매출 합계</label><input value="${fmtNum(t.sales)} 원" disabled></div>
      </div>
    </div>

    ${CATEGORIES.map((c, ci) => {
      const rows = state.items.map((it, idx) => ({ it, idx })).filter(x => x.it.category === c.key);
      const sum = rows.reduce((a, x) => a + num(x.it.amount), 0);
      return `<div class="panel">
        <div class="toolbar">
          <h2 style="margin:0">${c.label} <small>${c.hint}</small></h2>
          <div class="right"><strong id="catSum${ci}">${fmtNum(sum)}원</strong></div>
        </div>
        <div class="tableWrap"><table>
          <colgroup><col style="width:150px"><col style="width:180px"><col><col style="width:120px"><col style="width:110px"><col style="width:130px"></colgroup>
          <thead><tr><th>계정</th><th>항목</th><th>거래처 및 비고</th><th>공급가</th><th>세액</th><th>합계금액</th></tr></thead>
          <tbody class="itemsBody" data-cat="${c.key}">
            ${rows.map(x => itemRowHtml(x.it, x.idx, locked)).join("")}
          </tbody>
        </table></div>
      </div>`;
    }).join("")}

    <div class="panel">
      <h2 style="margin:0 0 12px">요약 · ${state.month}</h2>
      <div class="tableWrap" id="summaryBox">${summaryHtml()}</div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">2025년 본점 평균: 원가율 35% · 순수익율 13%</p>
      ${locked ? "" : `<div style="margin-top:12px"><button class="primary" id="saveAllBtn2" disabled>변경사항 모두 저장</button>
      <button class="iconBtn" id="submitBtn" style="margin-left:8px">본사에 제출</button></div>`}
    </div>

    <datalist id="accountList">${[...new Set(state.presets.map(p => p.account).filter(Boolean))].map(v => `<option value="${escapeHtml(v)}">`).join("")}</datalist>
    <datalist id="itemList">${[...new Set(state.presets.map(p => p.item).filter(Boolean))].map(v => `<option value="${escapeHtml(v)}">`).join("")}</datalist>
    <datalist id="vendorList">${[...new Set(state.presets.map(p => p.vendor).filter(Boolean))].map(v => `<option value="${escapeHtml(v)}">`).join("")}</datalist>
  `;

  bind(locked);
}

function bind(locked) {
  $("#storeSel").addEventListener("change", async (e) => {
    if (state.dirty && !confirm("저장하지 않은 입력이 있습니다. 매장을 바꾸면 사라집니다. 계속할까요?")) { e.target.value = state.storeId; return; }
    state.storeId = e.target.value;
    localStorage.setItem("jdgpnl_store", state.storeId);
    await loadMonth();
  });
  $("#monthSel").addEventListener("change", async (e) => {
    if (state.dirty && !confirm("저장하지 않은 입력이 있습니다. 월을 바꾸면 사라집니다. 계속할까요?")) { e.target.value = state.month; return; }
    state.month = e.target.value;
    await loadMonth();
  });
  $all("#saveAllBtn, #saveAllBtn2").forEach(b => b.addEventListener("click", saveAll));
  if (state.dirty) setDirty(true);

  if (locked) return;

  [["salesCash", "cash"], ["salesCard", "card"], ["salesDelivery", "delivery"]].forEach(([id, key]) => {
    $("#" + id).addEventListener("input", (e) => { state.sales[key] = e.target.value; setDirty(true); updateSummary(); });
  });
  $all(".itemsBody").forEach(body => {
    body.addEventListener("input", (e) => {
      const tr = e.target.closest("tr[data-idx]"); if (!tr) return;
      const it = state.items[Number(tr.dataset.idx)];
      it[e.target.dataset.key] = e.target.value;
      // 공급가와 세액을 넣으면 합계금액을 자동 계산 (합계금액을 직접 고치면 그 값을 그대로 둠)
      if (e.target.dataset.key === "supply_amount" || e.target.dataset.key === "tax_amount") {
        const auto = num(it.supply_amount) + num(it.tax_amount);
        if (auto > 0) { it.amount = auto; tr.querySelector("[data-key=amount]").value = auto; }
      }
      setDirty(true);
      updateSummary();
    });
  });
  const submitBtn = $("#submitBtn");
  if (submitBtn) submitBtn.addEventListener("click", submitToHq);
}

// 합계·요약만 다시 계산 (입력 중에 화면 전체를 다시 그리면 커서가 튀므로)
function updateSummary() {
  const t = totals();
  CATEGORIES.forEach((c, i) => {
    const el = $("#catSum" + i);
    if (el) el.textContent = fmtNum(t.byCat[c.key]) + "원";
  });
  const box = $("#summaryBox");
  if (box) box.innerHTML = summaryHtml();
}

// ---------- 저장 ----------
async function saveAll() {
  const btns = $all("#saveAllBtn, #saveAllBtn2");
  btns.forEach(b => b.disabled = true);
  try {
    const header = {
      month: state.month,
      store_id: state.storeId,
      sales_cash: num(state.sales.cash),
      sales_card: num(state.sales.card),
      sales_delivery: num(state.sales.delivery),
      updated_by: state.userName,
      updated_at: new Date().toISOString(),
    };
    if (!state.pnl) header.status = "작성중";
    const { data: saved, error } = await sb.from("store_pnl")
      .upsert(header, { onConflict: "month,store_id" }).select().single();
    if (error) throw error;
    state.pnl = saved;

    if (state.removed.length) {
      const { error: delErr } = await sb.from("store_pnl_items").delete().in("id", state.removed);
      if (delErr) throw delErr;
      state.removed = [];
    }
    // 금액이 0인 줄은 저장하지 않는다. 전에 저장됐다가 0으로 지운 줄은 DB에서도 지운다.
    const cleared = state.items.filter(it => it.id && !num(it.amount) && !num(it.supply_amount) && !num(it.tax_amount));
    if (cleared.length) {
      const { error: clrErr } = await sb.from("store_pnl_items").delete().in("id", cleared.map(it => it.id));
      if (clrErr) throw clrErr;
      cleared.forEach(it => { delete it.id; });
    }
    // 새 줄(id 없음)은 insert, 기존 줄은 update — id를 빈 값으로 보내면 오류가 남
    const rows = state.items
      .filter(it => num(it.amount) || num(it.supply_amount) || num(it.tax_amount))
      .map((it, i) => ({
        _id: it.id, pnl_id: saved.id, category: it.category,
        account: it.account || null, item: it.freeVendor ? "기타" : (it.item || null), vendor: it.vendor || null,
        supply_amount: num(it.supply_amount), tax_amount: num(it.tax_amount), amount: num(it.amount),
        sort_order: i, updated_by: state.userName, updated_at: new Date().toISOString(),
      }));
    const newRows = rows.filter(r => !r._id).map(({ _id, ...rest }) => rest);
    const oldRows = rows.filter(r => r._id).map(({ _id, ...rest }) => ({ id: _id, ...rest }));
    if (newRows.length) {
      const { error: insErr } = await sb.from("store_pnl_items").insert(newRows);
      if (insErr) throw insErr;
    }
    if (oldRows.length) {
      const { error: upErr } = await sb.from("store_pnl_items").upsert(oldRows);
      if (upErr) throw upErr;
    }
    toast("저장되었습니다");
    await loadMonth();
  } catch (err) {
    alert("저장 실패: " + (err.message || err));
    btns.forEach(b => b.disabled = false);
  }
}

async function submitToHq() {
  if (state.dirty) { alert("먼저 '변경사항 모두 저장'을 눌러주세요."); return; }
  if (!state.pnl) { alert("입력된 내용이 없습니다."); return; }
  if (!confirm(`${state.month} 손익을 본사에 제출할까요? 제출 후에도 본사가 확인완료하기 전까지는 수정할 수 있습니다.`)) return;
  const { error } = await sb.from("store_pnl")
    .update({ status: "제출", submitted_at: new Date().toISOString(), updated_by: state.userName })
    .eq("id", state.pnl.id);
  if (error) { alert("제출 실패: " + error.message); return; }
  toast("본사에 제출되었습니다");
  await loadMonth();
}

document.addEventListener("DOMContentLoaded", initLogin);
