-- 06: вариативность для тематических раскрасок карты:
-- 1) факт-урожайность на всех полях (тема «По урожайности»);
-- 2) разнообразный севооборот плана «Базовый 2027» (тема «По культуре»):
--    5 шаблонов чередования по индексу кода поля (зерновые <-> бобовые/пар,
--    возврат культуры не раньше 4-го года).
-- Культуры: 24951 пшеница, 24952 ячмень, 24953 кукуруза, 24954 подсолнечник,
--           24956 соя, 24960 пар.
UPDATE ku_field f SET ku_factyield_field = v.fy FROM (VALUES
  ('KH-001', 42.50), ('KH-002', 51.00), ('KH-003', 66.43), ('KH-004', 72.00),
  ('KH-005', 68.00), ('KH-006', 57.00), ('KH-007', 84.00), ('KH-008', 60.80),
  ('KH-009', 79.20), ('KH-010', 61.00)
) AS v(code, fy) WHERE f.ku_code_field = v.code;

WITH tpl(suffix, y1, y2, y3, y4, y5) AS (VALUES
  (1, 24953, 24960, 24951, 24956, 24953),
  (2, 24952, 24956, 24951, 24960, 24952),
  (3, 24954, 24951, 24956, 24953, 24960),
  (4, 24956, 24953, 24951, 24960, 24956),
  (5, 24951, 24956, 24953, 24960, 24951),
  (6, 24953, 24960, 24951, 24956, 24953),
  (7, 24952, 24956, 24951, 24960, 24952),
  (8, 24954, 24951, 24956, 24953, 24960),
  (9, 24956, 24953, 24951, 24960, 24956),
  (0, 24951, 24956, 24953, 24960, 24951)
),
items AS (
  SELECT i.key0 AS item, f.ku_code_field,
         (regexp_replace(f.ku_code_field, '\D', '', 'g'))::int % 10 AS suffix
  FROM ku_rotationplanitem i
  JOIN ku_rotationplan p ON p.key0 = i.ku_plan_rotationplanitem
  JOIN ku_field f ON f.key0 = i.ku_field_rotationplanitem
  WHERE p.ku_note_rotationplan = 'Базовый 2027'
)
DELETE FROM _auto_integer_ku_rotationplanitem v USING items
WHERE v.key1 = items.item;

WITH tpl(suffix, y1, y2, y3, y4, y5) AS (VALUES
  (1, 24953, 24960, 24951, 24956, 24953),
  (2, 24952, 24956, 24951, 24960, 24952),
  (3, 24954, 24951, 24956, 24953, 24960),
  (4, 24956, 24953, 24951, 24960, 24956),
  (5, 24951, 24956, 24953, 24960, 24951),
  (6, 24953, 24960, 24951, 24956, 24953),
  (7, 24952, 24956, 24951, 24960, 24952),
  (8, 24954, 24951, 24956, 24953, 24960),
  (9, 24956, 24953, 24951, 24960, 24956),
  (0, 24951, 24956, 24953, 24960, 24951)
),
items AS (
  SELECT i.key0 AS item,
         (regexp_replace(f.ku_code_field, '\D', '', 'g'))::int % 10 AS suffix
  FROM ku_rotationplanitem i
  JOIN ku_rotationplan p ON p.key0 = i.ku_plan_rotationplanitem
  JOIN ku_field f ON f.key0 = i.ku_field_rotationplanitem
  WHERE p.ku_note_rotationplan = 'Базовый 2027'
)
INSERT INTO _auto_integer_ku_rotationplanitem (key0, key1, ku_cropyear_rotationplanitem_integer)
SELECT y.year, items.item,
       CASE y.year WHEN 1 THEN tpl.y1 WHEN 2 THEN tpl.y2 WHEN 3 THEN tpl.y3 WHEN 4 THEN tpl.y4 ELSE tpl.y5 END
FROM items JOIN tpl ON tpl.suffix = items.suffix,
     (VALUES (1),(2),(3),(4),(5)) AS y(year);
