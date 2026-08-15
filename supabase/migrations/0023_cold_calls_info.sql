-- „Info o firmě" — co o firmě vím před hovorem: obor, velikost, obrat, čím se
-- živí. Patří k záznamu, ne k reflexi: čte se PŘED vytáčením, ne po něm.
--
-- Volný text schválně. Strukturovaná pole (obor, počet zaměstnanců, obrat) by
-- se vyplňovala hůř, než se čtou, a leady chodí z různých zdrojů s různými
-- údaji — tohle si má uživatel nalepit tak, jak mu to přišlo.

alter table public.cold_calls
  add column if not exists info text;
