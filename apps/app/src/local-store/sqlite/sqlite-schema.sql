create table if not exists notes (
  id text primary key,
  user_id text not null,
  schema_version integer not null,
  title text,
  preview text,
  is_locked integer not null default 0,
  document text,
  encrypted_payload text,
  encryption text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  parent_folder_id text,
  local_revision integer not null default 0,
  remote_revision integer,
  base_remote_revision integer,
  sync_status text not null default 'dirty',
  last_op_id text,
  device_id text not null
);

create table if not exists folders (
  id text primary key,
  user_id text not null,
  name text not null,
  parent_folder_id text,
  sort_index real not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  local_revision integer not null default 0,
  sync_status text not null default 'dirty',
  device_id text not null
);

create table if not exists note_ops (
  op_id text primary key,
  note_id text not null,
  user_id text not null,
  device_id text not null,
  type text not null,
  payload text not null,
  base_remote_revision integer,
  created_at text not null,
  attempt_count integer not null default 0,
  last_error text,
  status text not null default 'pending'
);

create table if not exists sync_state (
  key text primary key,
  value text not null,
  updated_at text not null
);

create table if not exists crypto_profiles (
  user_id text primary key,
  version integer not null,
  kdf text not null,
  salt text not null,
  wrapped_master_key text not null,
  wrap_nonce text not null,
  updated_at text not null
);

create table if not exists automation_events (
  id text primary key,
  user_id text not null,
  note_id text,
  event_type text not null,
  payload text not null,
  created_at text not null,
  delivered_at text
);

create index if not exists notes_updated_idx
on notes (updated_at desc);

create index if not exists notes_sync_status_idx
on notes (sync_status);

create index if not exists notes_parent_folder_idx
on notes (parent_folder_id);

create index if not exists folders_parent_idx
on folders (parent_folder_id);

create index if not exists note_ops_status_idx
on note_ops (status, created_at);
