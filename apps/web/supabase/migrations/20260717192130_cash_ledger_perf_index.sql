-- Speed up cash ledger queries: filter by association + order by date
create index if not exists cash_ledger_assoc_date_idx
  on public.cash_ledger (association_id, entry_date desc, created_at desc);
