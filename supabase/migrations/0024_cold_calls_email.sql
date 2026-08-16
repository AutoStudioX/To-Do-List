-- E-mail k záznamu hovoru.
--
-- Nepovinný a bez kontroly v databázi schválně: kontrolu dělá appka (musí mít
-- zavináč a tečku), ale check constraint by při první divné adrese z importu
-- shodil celý insert, místo aby se řádek označil v náhledu. Prázdná hodnota
-- je normální stav — spousta leadů má jen telefon.

alter table public.cold_calls
  add column if not exists email text;
