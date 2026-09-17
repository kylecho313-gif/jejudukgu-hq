/* 관리자 개별 로그인 (Supabase Auth) — 본사 통합관리(index.html)·알바관리(attendance-admin.html) 공용
 * 계정은 Supabase 대시보드 > Authentication > Users 에서 만들고,
 * admin_users 테이블에 등록된 계정만 데이터에 접근할 수 있음 (db/migration_07_admin_login.sql).
 * 두 페이지가 같은 로그인 세션을 공유하므로 한쪽에서 로그인하면 다른 쪽도 바로 열림.
 */

async function loadAdminProfile(sb) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from("admin_users")
    .select("display_name,role").eq("user_id", session.user.id).maybeSingle();
  if (error || !data || data.role !== "admin") return { denied: true };
  return { name: data.display_name || session.user.email, email: session.user.email };
}

let signingOutSelf = false; // 직접 로그아웃할 때는 아래 SIGNED_OUT 새로고침을 건너뜀

function initAdminLogin(sb, onReady) {
  const screen = document.getElementById("loginScreen");
  const errEl = document.getElementById("loginErr");
  const form = document.getElementById("loginForm");
  const showLogin = (msg) => { screen.style.display = "flex"; errEl.textContent = msg || ""; };

  const enter = async () => {
    const p = await loadAdminProfile(sb);
    if (!p) { showLogin(); return; }
    if (p.denied) {
      signingOutSelf = true;
      await sb.auth.signOut();
      signingOutSelf = false;
      showLogin("관리자로 등록되지 않은 계정입니다. 본사에 문의해주세요.");
      return;
    }
    onReady(p.name, p.email);
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
