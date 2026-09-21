/* 개별 로그인 (Supabase Auth) — 본사 통합관리(index.html)·알바관리(attendance-admin.html)·가맹점 손익(store-pnl.html) 공용
 * 계정은 본사 앱 "계정 관리" 탭에서 만든다 (db/migration_10, 11).
 * admin_users 에 등록된 권한에 따라 들어갈 수 있는 화면이 다르다.
 *   admin  : 모든 화면
 *   store  : 가맹점 손익 화면만 (자기 매장만) — 다른 화면으로 오면 손익 화면으로 보낸다
 *   reader : 자동 백업용 (화면 사용 안 함)
 * 세 페이지가 같은 로그인 세션을 공유하므로 한쪽에서 로그인하면 다른 쪽도 바로 열림.
 */

async function loadAdminProfile(sb) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from("admin_users")
    .select("display_name,role,store_id").eq("user_id", session.user.id).maybeSingle();
  if (error || !data) return { role: null, email: session.user.email };
  return { name: data.display_name || session.user.email, email: session.user.email, role: data.role, storeId: data.store_id };
}

let signingOutSelf = false; // 직접 로그아웃할 때는 아래 SIGNED_OUT 새로고침을 건너뜀

// allow: 이 화면에 들어올 수 있는 권한 목록 (기본: 관리자만)
function initAdminLogin(sb, onReady, allow = ["admin"]) {
  const screen = document.getElementById("loginScreen");
  const errEl = document.getElementById("loginErr");
  const form = document.getElementById("loginForm");
  const showLogin = (msg) => { screen.style.display = "flex"; errEl.textContent = msg || ""; };

  const enter = async () => {
    const p = await loadAdminProfile(sb);
    if (!p) { showLogin(); return; }
    if (!allow.includes(p.role)) {
      // 가맹점 계정이 본사 화면으로 들어오면 손익 입력 화면으로 보낸다
      if (p.role === "store" && allow.indexOf("store") === -1) { location.replace("store-pnl.html"); return; }
      signingOutSelf = true;
      await sb.auth.signOut();
      signingOutSelf = false;
      showLogin(p.role ? "이 화면을 쓸 수 있는 권한이 없습니다. 본사에 문의해주세요."
                       : "등록되지 않은 계정입니다. 본사에 문의해주세요.");
      return;
    }
    onReady(p.name, p.email, p);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    errEl.textContent = "";
    const { error } = await sb.auth.signInWithPassword({
      email: document.getElementById("loginEmail").value.trim(),
      password: document.getElementById("loginPw").value,
    });
    btn.disabled = false;
    if (error) { showLogin("이메일 또는 비밀번호가 올바르지 않습니다."); return; }
    document.getElementById("loginPw").value = "";
    await enter();
  });

  // 다른 탭에서 로그아웃하면 이 탭도 로그인 화면으로
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && !signingOutSelf) location.reload(); });

  enter();
}

async function adminLogout(sb) {
  signingOutSelf = true;
  await sb.auth.signOut();
  location.reload();
}
