alter table public.social_agent_investors
  add column if not exists outreach_message text;

comment on column public.social_agent_investors.outreach_message is
  'Owner-editable LinkedIn connection draft; never interpreted as a sent invitation.';
