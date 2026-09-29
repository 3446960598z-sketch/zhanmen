create table if not exists profiles (
  user_id text primary key,
  role text not null default 'user' check (role in ('user', 'admin')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists traffic (
  user_id text primary key,
  total_bytes bigint not null default 0,
  used_bytes bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists nodes (
  user_id text primary key,
  uuid text not null,
  sub_token text not null unique,
  rotated_at timestamptz not null default now()
);

create table if not exists redeem_codes (
  id serial primary key,
  code text not null unique,
  grant_bytes bigint not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  enabled boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists redemptions (
  id serial primary key,
  code_id integer not null references redeem_codes (id) on delete cascade,
  user_id text not null,
  grant_bytes bigint not null,
  created_at timestamptz not null default now(),
  unique (code_id, user_id)
);

create table if not exists allowlist (
  id serial primary key,
  domain text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists redemptions_user_idx on redemptions (user_id);

insert into redeem_codes (code, grant_bytes, max_uses, note)
values
  ('ZHMEN-10G-DEMO', 10737418240, 100, '预览体验，10 GB'),
  ('ZHMEN-1G-DEMO', 1073741824, 100, '预览体验，1 GB')
on conflict (code) do nothing;
