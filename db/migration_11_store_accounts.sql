-- 제주덕구 본사 통합관리 웹앱 - 마이그레이션 11: 가맹점 계정 (자기 매장 손익만)
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run
-- 재실행해도 안전합니다.
--
-- admin_users.role 에 'store'(가맹점) 추가 + 매장(store_id) 지정.
-- 가맹점 계정이 볼 수 있는 것: 자기 매장 정보, 자기 매장 손익(store_pnl / store_pnl_items), 항목 목록(읽기만).
-- 그 외 모든 표(알바·매출로열티·이슈·다른 매장 손익 등)는 is_admin()/is_reader() 정책만 있어서 보이지 않는다.
-- 본사가 '확인완료'로 잠근 달은 가맹점이 고칠 수 없다.

-- ---------- 1) 가맹점 권한 ----------
alter table admin_users add column if not exists store_id uuid references stores(id) on delete set null;
alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users add constraint admin_users_role_check check (role in ('admin', 'reader', 'store'));

create or replace function my_store_id() returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from admin_users where user_id = auth.uid() and role = 'store';
$$;
revoke execute on function my_store_id() from public, anon;
grant execute on function my_store_id() to authenticated;

-- ---------- 2) 가맹점이 볼 수 있는 범위 ----------
drop policy if exists "store own store" on stores;
create policy "store own store" on stores for select to authenticated using (id = my_store_id());

drop policy if exists "store read presets" on store_pnl_presets;
create policy "store read presets" on store_pnl_presets for select to authenticated using (my_store_id() is not null);

drop policy if exists "store select pnl" on store_pnl;
create policy "store select pnl" on store_pnl for select to authenticated
  using (store_id = my_store_id());
drop policy if exists "store insert pnl" on store_pnl;
create policy "store insert pnl" on store_pnl for insert to authenticated
  with check (store_id = my_store_id() and status in ('작성중', '제출'));
drop policy if exists "store update pnl" on store_pnl;
create policy "store update pnl" on store_pnl for update to authenticated
  using (store_id = my_store_id() and status <> '확인완료')
  with check (store_id = my_store_id() and status in ('작성중', '제출'));

drop policy if exists "store select items" on store_pnl_items;
create policy "store select items" on store_pnl_items for select to authenticated
  using (pnl_id in (select id from store_pnl where store_id = my_store_id()));
drop policy if exists "store write items" on store_pnl_items;
create policy "store write items" on store_pnl_items for all to authenticated
  using (pnl_id in (select id from store_pnl where store_id = my_store_id() and status <> '확인완료'))
  with check (pnl_id in (select id from store_pnl where store_id = my_store_id() and status <> '확인완료'));

-- ---------- 3) 계정 관리 함수에 가맹점(매장 지정) 추가 ----------
drop function if exists admin_list_accounts();
create function admin_list_accounts()
returns table (user_id uuid, email text, display_name text, role text, store_id uuid, store_name text,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform _require_admin();
  return query
    select u.id, u.email::text, a.display_name, a.role, a.store_id, s.name, u.created_at, u.last_sign_in_at
    from auth.users u
    left join admin_users a on a.user_id = u.id
    left join stores s on s.id = a.store_id
    order by (a.role is null), a.role, s.name, u.created_at;
end $$;

drop function if exists admin_create_account(text, text, text, text);
create or replace function admin_create_account(p_email text, p_password text, p_name text, p_role text, p_store_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid(); e text := lower(trim(p_email));
begin
  perform _require_admin();
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception '이메일 형식이 올바르지 않습니다'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception '비밀번호는 8자 이상이어야 합니다'; end if;
  if p_role not in ('admin', 'reader', 'store') then raise exception '권한 값이 올바르지 않습니다'; end if;
  if p_role = 'store' and p_store_id is null then raise exception '가맹점 계정은 매장을 선택해야 합니다'; end if;
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
  insert into admin_users (user_id, email, display_name, role, store_id)
  values (uid, e, nullif(trim(p_name), ''), p_role, case when p_role = 'store' then p_store_id end);
  return uid;
end $$;

drop function if exists admin_update_account(uuid, text, text);
create or replace function admin_update_account(p_user_id uuid, p_name text, p_role text, p_store_id uuid default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare e text;
begin
  perform _require_admin();
  if p_role is not null and p_role not in ('admin', 'reader', 'store') then raise exception '권한 값이 올바르지 않습니다'; end if;
  if p_role = 'store' and p_store_id is null then raise exception '가맹점 계정은 매장을 선택해야 합니다'; end if;
  if p_user_id = auth.uid() and coalesce(p_role, '') <> 'admin' then
    raise exception '자기 자신의 관리자 권한은 해제할 수 없습니다';
  end if;
  select email into e from auth.users where id = p_user_id;
  if e is null then raise exception '계정을 찾을 수 없습니다'; end if;
  if p_role is null then
    delete from admin_users where user_id = p_user_id;
  else
    insert into admin_users (user_id, email, display_name, role, store_id)
    values (p_user_id, e, nullif(trim(p_name), ''), p_role, case when p_role = 'store' then p_store_id end)
    on conflict (user_id) do update set display_name = excluded.display_name, role = excluded.role, store_id = excluded.store_id;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_list_accounts()', 'admin_create_account(text,text,text,text,uuid)',
    'admin_update_account(uuid,text,text,uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 로그인한 사람이 자기 권한·매장을 확인하는 용도 (가맹점 화면에서 매장 이름 표시)
create or replace function my_account() returns table (role text, store_id uuid, store_name text, display_name text)
language sql stable security definer set search_path = public as $$
  select a.role, a.store_id, s.name, a.display_name
  from admin_users a left join stores s on s.id = a.store_id
  where a.user_id = auth.uid();
$$;
revoke execute on function my_account() from public, anon;
grant execute on function my_account() to authenticated;
