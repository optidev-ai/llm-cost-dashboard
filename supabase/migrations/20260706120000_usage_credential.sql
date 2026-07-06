-- Stores the provider admin key (encrypted) entered once via "Connect your key".
-- One active credential per project (id = 'default'). The key is AES-GCM
-- encrypted by the `usage` edge function before it lands here.
create table if not exists public.app_usage_credential (
  id            text primary key default 'default',
  provider      text not null check (provider in ('anthropic', 'openai')),
  key_encrypted text not null,
  key_iv        text not null,
  updated_at    timestamptz not null default now()
);

-- RLS on with NO policies: the anon/authenticated (browser) roles get zero
-- access; only the service-role key used by the edge function can read/write.
-- The encrypted admin key is therefore never reachable from the client.
alter table public.app_usage_credential enable row level security;
