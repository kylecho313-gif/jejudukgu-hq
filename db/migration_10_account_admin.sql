-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 10: 본사 앱 안에서 계정 관리
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- 본사 앱 "계정 관리" 탭에서 쓰는 함수들. 모두 로그인한 관리자(is_admin)만 실행할 수 있다.
--   admin_list_accounts    : 계정 목록 (이메일, 이름, 권한, 마지막 로그인)
--   admin_create_account   : 새 계정 만들기 (이메일 인증 없이 바로 사용 가능 상태로)
--   admin_update_account   : 이름·권한 변경 (권한을 비우면 접근 해제)
--   admin_reset_password   : 비밀번호 재설정 (잊어버린 경우)
--   admin_delete_account   : 계정 삭제
-- 신규 가입은 대시보드에서 막아둔 상태로 두고, 계정은 이 함수로만 만든다.

create extension if not exists pgcrypto with schema extensions;

create or replace function _require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception '관리자만 할 수 있습니다' using errcode = '42501';
  end if;
end $$;
revoke execute on function _require_admin() from public, anon, authenticated;

create or replace function admin_list_accounts()
returns table (user_id uuid, email text, display_name text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform _require_admin();
  return query
    select u.id, u.email::text, a.display_name, a.role, u.created_at, u.last_sign_in_at
    from auth.users u left join admin_users a on a.user_id = u.id
    order by (a.role is null), a.role, u.created_at;
end $$;

create or replace function admin_create_account(p_email text, p_password text, p_name text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid(); e text := lower(trim(p_email));
begin
  perform _require_admin();
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception '이메일 형식이 올바르지 않습니다'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception '비밀번호는 8자 이상이어야 합니다'; end if;
  if p_role not in ('admin', 'reader') then raise exception '권한 값이 올바르지 않습니다'; end if;
  if exists (select 1 from auth.users where lower(email) = e) then raise exception '이미 있는 이메일입니다'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', p_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true),
          'email', now(), now(), now());
  insert into admin_users (user_id, email, display_name, role) values (uid, e, nullif(trim(p_name), ''), p_role);
  return uid;
end $$;

create or replace function admin_update_account(p_user_id uuid, p_name text, p_role text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare e text;
begin
  perform _require_admin();
  if p_role is not null and p_role not in ('admin', 'reader') then raise exception '권한 값이 올바르지 않습니다'; end if;
  if p_user_id = auth.uid() and coalesce(p_role, '') <> 'admin' then
    raise exception '자기 자신의 관리자 권한은 해제할 수 없습니다';
  end if;
  select email into e from auth.users where id = p_user_id;
  if e is null then raise exception '계정을 찾을 수 없습니다'; end if;
  if p_role is null then
    delete from admin_users where user_id = p_user_id;          -- 접근 해제 (계정은 남음)
  else
    insert into admin_users (user_id, email, display_name, role)
    values (p_user_id, e, nullif(trim(p_name), ''), p_role)
    on conflict (user_id) do update set display_name = excluded.display_name, role = excluded.role;
  end if;
end $$;

create or replace function admin_reset_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  perform _require_admin();
  if length(coalesce(p_password, '')) < 8 then raise exception '비밀번호는 8자 이상이어야 합니다'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  if not found then raise exception '계정을 찾을 수 없습니다'; end if;
end $$;

create or replace function admin_delete_account(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  perform _require_admin();
  if p_user_id = auth.uid() then raise exception '자기 자신은 삭제할 수 없습니다'; end if;
  delete from auth.users where id = p_user_id;                -- admin_users는 연쇄 삭제됨
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_list_accounts()', 'admin_create_account(text,text,text,text)',
    'admin_update_account(uuid,text,text)', 'admin_reset_password(uuid,text)', 'admin_delete_account(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
