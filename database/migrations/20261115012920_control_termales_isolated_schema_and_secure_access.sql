
create schema if not exists termales_private;
create table if not exists public.termales_users(
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[A-Za-z0-9._-]{3,50}$'),
 full_name text not null,
 email text not null unique,
 profile text not null check(profile in ('operativo','admin','super')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.termales_responsables(
 id bigint generated always as identity primary key,
 nombre text not null unique,
 activo boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.termales_incidencias(
 id bigint generated always as identity primary key,
 fecha date not null default current_date,
 actividad text not null check(actividad in ('Soda','Termales')),
 responsable_id bigint not null references public.termales_responsables(id),
 descripcion text not null check(length(trim(descripcion)) between 1 and 2000),
 estado text not null default 'Abierta' check(estado in ('Abierta','Finalizada')),
 created_by uuid not null default auth.uid() references public.termales_users(id),
 created_at timestamptz not null default now(),
 cierre date,
 cerrado_por uuid references public.termales_users(id),
 constraint termales_close_consistency check ((estado='Abierta' and cierre is null and cerrado_por is null) or (estado='Finalizada' and cierre is not null and cerrado_por is not null))
);
create table if not exists public.termales_comentarios(
 id bigint generated always as identity primary key,
 incidencia_id bigint not null references public.termales_incidencias(id),
 texto text not null check(length(trim(texto)) between 1 and 2000),
 autor_id uuid not null default auth.uid() references public.termales_users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.termales_cambios(
 id bigint generated always as identity primary key,
 incidencia_id bigint not null references public.termales_incidencias(id),
 anterior_id bigint not null references public.termales_responsables(id),
 nuevo_id bigint not null references public.termales_responsables(id),
 actor_id uuid not null default auth.uid() references public.termales_users(id),
 created_at timestamptz not null default now()
);
create or replace function termales_private.current_role() returns text
language sql stable security definer set search_path='' as $$
select profile from public.termales_users where id=(select auth.uid()) and active limit 1
$$;
create or replace function termales_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
select coalesce(termales_private.current_role() in ('admin','super'),false)
$$;
create or replace function termales_private.is_super() returns boolean
language sql stable security definer set search_path='' as $$
select coalesce(termales_private.current_role()='super',false)
$$;
revoke all on schema termales_private from public;
grant usage on schema termales_private to authenticated;
revoke all on function termales_private.current_role() from public;
revoke all on function termales_private.is_admin() from public;
revoke all on function termales_private.is_super() from public;
grant execute on function termales_private.current_role() to authenticated;
grant execute on function termales_private.is_admin() to authenticated;
grant execute on function termales_private.is_super() to authenticated;
alter table public.termales_users enable row level security;
alter table public.termales_responsables enable row level security;
alter table public.termales_incidencias enable row level security;
alter table public.termales_comentarios enable row level security;
alter table public.termales_cambios enable row level security;
create policy termales_users_read on public.termales_users for select to authenticated
 using ((select termales_private.current_role()) is not null);
create policy termales_responsables_read on public.termales_responsables for select to authenticated
 using ((select termales_private.current_role()) is not null);
create policy termales_responsables_write on public.termales_responsables for all to authenticated
 using ((select termales_private.is_admin())) with check ((select termales_private.is_admin()));
create policy termales_incidencias_read on public.termales_incidencias for select to authenticated
 using ((select termales_private.current_role()) is not null);
create policy termales_incidencias_insert on public.termales_incidencias for insert to authenticated
 with check ((select termales_private.current_role()) is not null and created_by=(select auth.uid()) and estado='Abierta' and cierre is null and cerrado_por is null
 and exists(select 1 from public.termales_responsables r where r.id=responsable_id and r.activo));
create policy termales_comentarios_read on public.termales_comentarios for select to authenticated
 using ((select termales_private.current_role()) is not null);
create policy termales_comentarios_insert on public.termales_comentarios for insert to authenticated
 with check ((select termales_private.current_role()) is not null and autor_id=(select auth.uid())
 and exists(select 1 from public.termales_incidencias i where i.id=incidencia_id and i.estado='Abierta'));
create policy termales_cambios_read on public.termales_cambios for select to authenticated
 using ((select termales_private.current_role()) is not null);
grant select on public.termales_users,public.termales_responsables,public.termales_incidencias,public.termales_comentarios,public.termales_cambios to authenticated;
grant insert on public.termales_incidencias,public.termales_comentarios,public.termales_responsables to authenticated;
grant update on public.termales_responsables to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke update,delete on public.termales_users,public.termales_incidencias,public.termales_comentarios,public.termales_cambios from authenticated;
create or replace function public.termales_reassign(p_incident bigint,p_responsible bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_old bigint;
begin
 if not termales_private.is_admin() then raise exception 'Acceso denegado'; end if;
 select responsable_id into v_old from public.termales_incidencias where id=p_incident and estado='Abierta' for update;
 if v_old is null then raise exception 'Incidencia no disponible'; end if;
 if not exists(select 1 from public.termales_responsables where id=p_responsible and activo) then raise exception 'Responsable no disponible'; end if;
 if v_old=p_responsible then raise exception 'Elegí otro responsable'; end if;
 update public.termales_incidencias set responsable_id=p_responsible where id=p_incident;
 insert into public.termales_cambios(incidencia_id,anterior_id,nuevo_id,actor_id)
 values(p_incident,v_old,p_responsible,auth.uid());
end $$;
create or replace function public.termales_close(p_incident bigint,p_date date,p_comment text)
returns void language plpgsql security definer set search_path='' as $$
declare v_report date;
begin
 if not termales_private.is_admin() then raise exception 'Acceso denegado'; end if;
 select fecha into v_report from public.termales_incidencias where id=p_incident and estado='Abierta' for update;
 if v_report is null then raise exception 'Incidencia no disponible'; end if;
 if p_date is null or p_date<v_report or p_date>(now() at time zone 'America/Costa_Rica')::date then raise exception 'Fecha no válida'; end if;
 if length(trim(coalesce(p_comment,''))) not between 1 and 2000 then raise exception 'Comentario requerido'; end if;
 update public.termales_incidencias set estado='Finalizada', cierre=p_date,cerrado_por=auth.uid() where id=p_incident;
 insert into public.termales_comentarios(incidencia_id,texto,autor_id) values(p_incident,'FINALIZACIÓN: '||trim(p_comment),auth.uid());
end $$;
create or replace function public.termales_user_update(p_id uuid,p_name text,p_profile text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_email text;v_current text;
begin
 if not termales_private.is_super() then raise exception 'Acceso denegado'; end if;
 if p_profile not in ('operativo','admin','super') or length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Datos inválidos'; end if;
 select email,profile into v_email,v_current from public.termales_users where id=p_id for update;
 if not found then raise exception 'Usuario inexistente'; end if;
 if lower(v_email)='keycr91@gmail.com' and (p_profile<>'super' or not p_active) then raise exception 'No se puede desactivar el administrador principal'; end if;
 if v_current='super' and (p_profile<>'super' or not p_active) and
 (select count(*) from public.termales_users where profile='super' and active and id<>p_id)=0 then
 raise exception 'Debe permanecer un superusuario activo';end if;
 update public.termales_users set full_name=trim(p_name),profile=p_profile,active=p_active where id=p_id;
end $$;
revoke all on function public.termales_reassign(bigint,bigint),public.termales_close(bigint,date,text),public.termales_user_update(uuid,text,text,boolean) from public,anon;
grant execute on function public.termales_reassign(bigint,bigint),public.termales_close(bigint,date,text),public.termales_user_update(uuid,text,text,boolean) to authenticated;
insert into public.termales_responsables(nombre) values('Mantenimiento'),('Administración'),('Operaciones') on conflict(nombre) do nothing;
insert into public.termales_users(id,username,full_name,email,profile,active)
select id,'admin','Luis Keylor Murillo',email,'super',true from auth.users where lower(email)='keycr91@gmail.com' and email_confirmed_at is not null
on conflict(id) do nothing;

