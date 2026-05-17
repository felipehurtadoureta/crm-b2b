-- Glosa contable por movimiento (ejecutar si ya creó bank_book.sql sin esta columna).

alter table public.bank_transactions
  add column if not exists glosa text;

comment on column public.bank_transactions.glosa is
  'Clasificación contable del movimiento (selector en libro de banco).';
