-- 02: разведение полигонов KH-007..010 (юго-западный кластер, без пересечений
-- с полями KH-001..006 и инфраструктурой) + вариативные агрохиманализы.
-- Размеры прямоугольников соответствуют areaHa (3:2, 1° lat=111 км, 1° lon≈64.2 км).

-- Луговое-1 (60 га): 949×632 м
UPDATE ku_field SET
  ku_centerlat_field = 54.8960,
  ku_centerlon_field = 71.3450,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3302, 54.8903], [71.3598, 54.8903], [71.3598, 54.9017], [71.3302, 54.9017], [71.3302, 54.8903]]]}'
WHERE ku_code_field = 'KH-007';

-- Луговое-2 (38 га): 755×503 м
UPDATE ku_field SET
  ku_centerlat_field = 54.8790,
  ku_centerlon_field = 71.3450,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3332, 54.8745], [71.3568, 54.8745], [71.3568, 54.8835], [71.3332, 54.8835], [71.3332, 54.8745]]]}'
WHERE ku_code_field = 'KH-008';

-- Приозёрное (48 га): 848×566 м
UPDATE ku_field SET
  ku_centerlat_field = 54.8960,
  ku_centerlon_field = 71.3950,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3818, 54.8909], [71.4082, 54.8909], [71.4082, 54.9011], [71.3818, 54.9011], [71.3818, 54.8909]]]}'
WHERE ku_code_field = 'KH-009';

-- Балка-1 (25 га): 612×408 м
UPDATE ku_field SET
  ku_centerlat_field = 54.8790,
  ku_centerlon_field = 71.3950,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3855, 54.8753], [71.4045, 54.8753], [71.4045, 54.8827], [71.3855, 54.8827], [71.3855, 54.8753]]]}'
WHERE ku_code_field = 'KH-010';

-- Агрохиманализы 2026-04-15: значения по убыванию плодородия почв поля
UPDATE ku_soilanalysis s SET
  ku_n_soilanalysis  = v.n,  ku_p_soilanalysis = v.p,  ku_k_soilanalysis = v.k,
  ku_ph_soilanalysis = v.ph, ku_humus_soilanalysis = v.h
FROM (
  SELECT f.key0 AS fkey, v.n, v.p, v.k, v.ph, v.h
  FROM (VALUES
    ('KH-001', 28.0, 34.0, 210.0, 6.4, 6),
    ('KH-002', 25.0, 30.0, 195.0, 6.2, 5),
    ('KH-003', 31.0, 38.0, 240.0, 7.0, 6),
    ('KH-004', 18.0, 22.0, 160.0, 5.8, 4),
    ('KH-005', 27.0, 33.0, 205.0, 6.5, 5),
    ('KH-006', 23.0, 29.0, 185.0, 6.1, 5),
    ('KH-007', 20.0, 26.0, 175.0, 5.9, 4),
    ('KH-008', 16.0, 20.0, 150.0, 5.6, 4),
    ('KH-009', 22.0, 27.0, 180.0, 6.0, 5),
    ('KH-010', 14.0, 18.0, 140.0, 5.5, 3)
  ) AS v(code, n, p, k, ph, h)
  JOIN ku_field f ON f.ku_code_field = v.code
) v
WHERE s.ku_field_soilanalysis = v.fkey
  AND s.ku_analysisdate_soilanalysis = DATE '2026-04-15';

-- история: предыдущие циклы анализа для демонстрации динамики.
-- ключи берём из счётчика LSfusion (idtable id=1) — после рестарта сервера
-- он перечитает счётчик, коллизий не будет
UPDATE idtable SET value = value + 2 WHERE id = 1;
INSERT INTO ku_soilanalysis
  (key0, system__class_ku_soilanalysis, ku_analysisdate_soilanalysis, ku_field_soilanalysis,
   ku_n_soilanalysis, ku_p_soilanalysis, ku_k_soilanalysis, ku_ph_soilanalysis, ku_humus_soilanalysis)
SELECT (SELECT value - 2 FROM idtable WHERE id = 1),
       (SELECT system__class_ku_soilanalysis FROM ku_soilanalysis LIMIT 1),
       DATE '2024-09-20', f.key0, 22.0, 28.0, 190.0, 6.0, 5
FROM ku_field f WHERE f.ku_code_field = 'KH-001'
  AND NOT EXISTS (SELECT 1 FROM ku_soilanalysis s WHERE s.ku_field_soilanalysis = f.key0
                  AND s.ku_analysisdate_soilanalysis = DATE '2024-09-20');
INSERT INTO ku_soilanalysis
  (key0, system__class_ku_soilanalysis, ku_analysisdate_soilanalysis, ku_field_soilanalysis,
   ku_n_soilanalysis, ku_p_soilanalysis, ku_k_soilanalysis, ku_ph_soilanalysis, ku_humus_soilanalysis)
SELECT (SELECT value - 1 FROM idtable WHERE id = 1),
       (SELECT system__class_ku_soilanalysis FROM ku_soilanalysis LIMIT 1),
       DATE '2023-10-05', f.key0, 26.0, 33.0, 215.0, 6.8, 5
FROM ku_field f WHERE f.ku_code_field = 'KH-003'
  AND NOT EXISTS (SELECT 1 FROM ku_soilanalysis s WHERE s.ku_field_soilanalysis = f.key0
                  AND s.ku_analysisdate_soilanalysis = DATE '2023-10-05');
