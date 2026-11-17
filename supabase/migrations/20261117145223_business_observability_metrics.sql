create schema if not exists autamedica_observability;
create table if not exists autamedica_observability.business_metric_snapshots (
 id bigint generated always as identity primary key,captured_at timestamptz not null default now(),metrics jsonb not null check(jsonb_typeof(metrics)='object')
);
revoke all on schema autamedica_observability from public,anon,authenticated;
revoke all on all tables in schema autamedica_observability from public,anon,authenticated;
grant usage on schema autamedica_observability to service_role;
grant select,insert on autamedica_observability.business_metric_snapshots to service_role;
grant usage,select on sequence autamedica_observability.business_metric_snapshots_id_seq to service_role;
create or replace function autamedica_observability.capture_business_metrics()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,autamedica_observability as $$
declare v_metrics jsonb;
begin
 select jsonb_build_object(
 'pending_payments_over_15m',(select count(*) from public.pharmacy_dispatch_payments p where p.status='pending' and p.created_at<now()-interval '15 minutes'),
 'pending_dispatch_payment_over_30m',(select count(*) from public.pharmacy_dispatch_requests r where r.status::text='pending_payment' and r.payment_started_at is not null and r.payment_started_at<now()-interval '30 minutes'),
 'approved_payment_request_not_completed',(select count(*) from public.pharmacy_dispatch_payments p join public.pharmacy_dispatch_requests r on r.id=p.dispatch_request_id where p.status='approved' and r.status::text not in ('completed','cancelled','expired')),
 'commissions_without_completed_dispatch',(select count(*) from public.commercial_referral_commissions c join public.pharmacy_dispatch_requests r on r.id=c.dispatch_request_id where r.status::text<>'completed'),
 'active_dispatch_offers_expired_unresolved',(select count(*) from public.dispatch_offers o where o.status not in ('accepted','declined','expired','cancelled') and o.expires_at<now()),
 'sampled_at',now()) into v_metrics;
 insert into autamedica_observability.business_metric_snapshots(metrics) values(v_metrics);
 delete from autamedica_observability.business_metric_snapshots where captured_at<now()-interval '30 days';
 return v_metrics;
end;$$;
revoke all on function autamedica_observability.capture_business_metrics() from public,anon,authenticated;
grant execute on function autamedica_observability.capture_business_metrics() to service_role;
do $$ begin
 if exists(select 1 from cron.job where jobname='autamedica-business-observability') then perform cron.unschedule('autamedica-business-observability');end if;
 perform cron.schedule('autamedica-business-observability','*/5 * * * *','select autamedica_observability.capture_business_metrics();');
end;$$;