-- Liora: login obrigatório e limites diários do plano Free
-- Aplicar no Supabase antes de depender exclusivamente do limite server-side.

create table if not exists public.liora_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  feature text not null check (feature in ('tema', 'simulado')),
  usage_count integer not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, feature)
);

alter table public.liora_usage_daily enable row level security;

create policy "users can read own liora usage"
on public.liora_usage_daily
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.consume_liora_usage(
  p_feature text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_usage_date date := (timezone('utc', now()))::date;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if p_feature not in ('tema', 'simulado') then
    raise exception 'invalid_feature';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_limit';
  end if;

  insert into public.liora_usage_daily (
    user_id,
    usage_date,
    feature,
    usage_count,
    updated_at
  )
  values (
    v_user_id,
    v_usage_date,
    p_feature,
    1,
    now()
  )
  on conflict (user_id, usage_date, feature)
  do update set
    usage_count = public.liora_usage_daily.usage_count + 1,
    updated_at = now()
  returning usage_count into v_used;

  if v_used > p_limit then
    update public.liora_usage_daily
       set usage_count = greatest(usage_count - 1, 0),
           updated_at = now()
     where user_id = v_user_id
       and usage_date = v_usage_date
       and feature = p_feature;

    return jsonb_build_object(
      'ok', false,
      'used', p_limit,
      'limit', p_limit,
      'feature', p_feature,
      'date', v_usage_date
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'used', v_used,
    'limit', p_limit,
    'feature', p_feature,
    'date', v_usage_date
  );
end;
$$;

revoke all on function public.consume_liora_usage(text, integer) from public;
grant execute on function public.consume_liora_usage(text, integer) to authenticated;
grant select on public.liora_usage_daily to authenticated;
