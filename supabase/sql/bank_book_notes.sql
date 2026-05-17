-- Nota editable por movimiento en libro de banco
alter table public.bank_transactions
  add column if not exists notes text;

comment on column public.bank_transactions.notes is
  'Nota interna del usuario sobre el movimiento.';
