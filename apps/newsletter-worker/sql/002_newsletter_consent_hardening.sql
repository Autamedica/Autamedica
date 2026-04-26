alter table public.profiles
  add column if not exists newsletter_subscribed boolean;

alter table public.profiles
  alter column newsletter_subscribed set default false;

update public.profiles
set newsletter_subscribed = false
where newsletter_subscribed is null;

alter table public.profiles
  alter column newsletter_subscribed set not null;

create index if not exists idx_profiles_newsletter_active_email
  on public.profiles (lower(email))
  where newsletter_subscribed = true and email is not null;
