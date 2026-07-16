create sequence if not exists public.notes_revision_seq;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bump_note_revision()
returns trigger
language plpgsql
as $$
begin
  new.server_revision = nextval('public.notes_revision_seq');
  new.server_updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_crypto (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1,
  kdf text not null,
  kdf_params jsonb not null,
  salt text not null,
  wrapped_master_key text not null,
  wrap_nonce text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  title text,
  preview text,
  is_locked boolean not null default false,
  document jsonb,
  encrypted_payload text,
  encryption jsonb,
  payload jsonb not null,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  server_revision bigint not null default nextval('public.notes_revision_seq'),
  last_op_id text,
  device_id text,
  deleted_at timestamptz,
  constraint notes_payload_snapshot_check check (payload ->> 'kind' = 'note.snapshot'),
  constraint notes_lock_payload_check check (
    (
      is_locked = false
      and document is not null
      and encrypted_payload is null
      and encryption is null
    )
    or
    (
      is_locked = true
      and document is null
      and encrypted_payload is not null
      and encryption is not null
    )
  )
);

drop trigger if exists user_crypto_set_updated_at on public.user_crypto;
create trigger user_crypto_set_updated_at
before update on public.user_crypto
for each row
execute function public.set_updated_at();

drop trigger if exists notes_bump_revision on public.notes;
create trigger notes_bump_revision
before update on public.notes
for each row
execute function public.bump_note_revision();

create index if not exists devices_user_idx
on public.devices (user_id, last_seen_at desc);

create index if not exists notes_user_revision_idx
on public.notes (user_id, server_revision);

create index if not exists notes_user_updated_idx
on public.notes (user_id, server_updated_at desc)
where deleted_at is null;

create index if not exists notes_user_locked_idx
on public.notes (user_id, is_locked)
where deleted_at is null;

alter table public.user_crypto enable row level security;
alter table public.devices enable row level security;
alter table public.notes enable row level security;

drop policy if exists "Users can read their crypto profile" on public.user_crypto;
create policy "Users can read their crypto profile"
on public.user_crypto
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their crypto profile" on public.user_crypto;
create policy "Users can insert their crypto profile"
on public.user_crypto
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their crypto profile" on public.user_crypto;
create policy "Users can update their crypto profile"
on public.user_crypto
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can read their devices" on public.devices;
create policy "Users can read their devices"
on public.devices
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their devices" on public.devices;
create policy "Users can insert their devices"
on public.devices
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their devices" on public.devices;
create policy "Users can update their devices"
on public.devices
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their devices" on public.devices;
create policy "Users can delete their devices"
on public.devices
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their notes" on public.notes;
create policy "Users can read their notes"
on public.notes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their notes" on public.notes;
create policy "Users can insert their notes"
on public.notes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their notes" on public.notes;
create policy "Users can update their notes"
on public.notes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their notes" on public.notes;
create policy "Users can delete their notes"
on public.notes
for delete
to authenticated
using (user_id = auth.uid());

grant usage on sequence public.notes_revision_seq to authenticated, service_role;
grant select, insert, update, delete on public.user_crypto to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.user_crypto to service_role;
grant all on public.devices to service_role;
grant all on public.notes to service_role;

do $$
begin
  alter publication supabase_realtime add table public.notes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
