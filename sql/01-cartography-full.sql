-- 01: консолидированная картография стенда «Код Урожая» (эталон KNP, СКО,
-- Петропавловск): полигоны и центры 10 полей, 11 объектов инфраструктуры.
-- Соседние полигоны KH-001..006 сжаты к центроиду (0.90) — визуальный зазор
-- между участками; KH-007..010 — сгенерированные контуры SW-кластера.
-- Все поля проверены на попарные пересечения (скрипт).
-- Идемпотентна; применять на остановленном сервере:
--   docker exec -i mite_db psql -U postgres -d iot < 01-cartography-full.sql



UPDATE ku_field SET ku_centerlat_field = 54.937268, ku_centerlon_field = 71.422202,
  ku_boundarygeojson_field = '{"type":"Polygon","coordinates":[[[71.41687,54.940806],[71.427236,54.941502],[71.427028,54.934476],[71.426521,54.934557],[71.425999,54.934851],[71.425478,54.934906],[71.424986,54.935301],[71.424889,54.936216],[71.424406,54.936654],[71.424339,54.937031],[71.424271,54.937525],[71.42372,54.937652],[71.422852,54.937503],[71.422108,54.937103],[71.421548,54.937003],[71.42148,54.937675],[71.421017,54.937957],[71.420032,54.937952],[71.417985,54.937542],[71.417271,54.937535],[71.416971,54.937419],[71.416778,54.937191],[71.41687,54.940806]]]}'
WHERE ku_code_field = 'KH-001';  -- Северное-1

UPDATE ku_field SET ku_centerlat_field = 54.936781, ku_centerlon_field = 71.430714,
  ku_boundarygeojson_field = '{"type":"Polygon","coordinates":[[[71.428212,54.941475],[71.437057,54.942074],[71.436265,54.934086],[71.43026,54.934186],[71.430317,54.934442],[71.42968,54.934542],[71.428502,54.93433],[71.427922,54.934419],[71.428212,54.941475]]]}'
WHERE ku_code_field = 'KH-002';  -- Северное-2

UPDATE ku_field SET ku_centerlat_field = 54.933936, ku_centerlon_field = 71.421241,
  ku_boundarygeojson_field = '{"type":"Polygon","coordinates":[[[71.416817,54.934645],[71.41674,54.936487],[71.418227,54.936309],[71.418594,54.936343],[71.418884,54.935899],[71.419598,54.935843],[71.419772,54.935555],[71.420081,54.935355],[71.42066,54.935333],[71.42093,54.935255],[71.420853,54.934812],[71.420622,54.934634],[71.420525,54.934301],[71.420544,54.933891],[71.420061,54.933658],[71.419946,54.933502],[71.420273,54.933358],[71.421027,54.933481],[71.4218,54.933258],[71.422302,54.933269],[71.422746,54.933458],[71.421336,54.933935],[71.421587,54.934301],[71.421819,54.934312],[71.423403,54.933868],[71.423981,54.934135],[71.424426,54.934279],[71.42489,54.934168],[71.425044,54.933935],[71.424755,54.933647],[71.423789,54.933525],[71.423287,54.932825],[71.423403,54.932692],[71.424349,54.932715],[71.424445,54.932415],[71.425584,54.932626],[71.423171,54.928099],[71.416083,54.929874],[71.41645,54.932781],[71.416817,54.934645]]]}'
WHERE ku_code_field = 'KH-003';  -- Южное-1

UPDATE ku_field SET ku_centerlat_field = 54.930896, ku_centerlon_field = 71.428918,
  ku_boundarygeojson_field = '{"type":"Polygon","coordinates":[[[71.430736,54.931312],[71.436008,54.931013],[71.435332,54.924943],[71.427801,54.926862],[71.423958,54.927817],[71.426429,54.932366],[71.426797,54.932765],[71.426932,54.932888],[71.427029,54.932721],[71.426797,54.932355],[71.427125,54.9321],[71.428052,54.931622],[71.428516,54.931301],[71.42921,54.931545],[71.429984,54.931245],[71.430157,54.931068],[71.430736,54.931312]]]}'
WHERE ku_code_field = 'KH-004';  -- Южное-2

UPDATE ku_field SET ku_centerlat_field = 54.938729, ku_centerlon_field = 71.401637,
  ku_boundarygeojson_field = '{"type":"Polygon","coordinates":[[[71.397534,54.939673],[71.41478,54.940938],[71.414645,54.935768],[71.397013,54.936822],[71.39707,54.938553],[71.397148,54.938996],[71.39737,54.939412],[71.397534,54.939673]]]}'
WHERE ku_code_field = 'KH-005';  -- Заречное-1

UPDATE ku_field SET ku_centerlat_field = 54.934571, ku_centerlon_field = 71.401814,
  ku_boundarygeojson_field = '{"type":"Polygon","coordinates":[[[71.397031,54.936273],[71.414759,54.935252],[71.413987,54.929971],[71.396181,54.934342],[71.396798,54.934609],[71.396914,54.935275],[71.397031,54.936273]]]}'
WHERE ku_code_field = 'KH-006';  -- Заречное-2

UPDATE ku_field SET ku_centerlat_field = 54.896, ku_centerlon_field = 71.345,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3302, 54.8903], [71.3598, 54.8903], [71.3598, 54.9017], [71.3302, 54.9017], [71.3302, 54.8903]]]}'
WHERE ku_code_field = 'KH-007';  -- Луговое-1

UPDATE ku_field SET ku_centerlat_field = 54.879, ku_centerlon_field = 71.345,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3332, 54.8745], [71.3568, 54.8745], [71.3568, 54.8835], [71.3332, 54.8835], [71.3332, 54.8745]]]}'
WHERE ku_code_field = 'KH-008';  -- Луговое-2

UPDATE ku_field SET ku_centerlat_field = 54.896, ku_centerlon_field = 71.395,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3818, 54.8909], [71.4082, 54.8909], [71.4082, 54.9011], [71.3818, 54.9011], [71.3818, 54.8909]]]}'
WHERE ku_code_field = 'KH-009';  -- Приозёрное

UPDATE ku_field SET ku_centerlat_field = 54.879, ku_centerlon_field = 71.395,
  ku_boundarygeojson_field = '{"type": "Polygon", "coordinates": [[[71.3855, 54.8753], [71.4045, 54.8753], [71.4045, 54.8827], [71.3855, 54.8827], [71.3855, 54.8753]]]}'
WHERE ku_code_field = 'KH-010';  -- Балка-1


-- кадастровые участки: контур поля x1.05 от центроида (ФТ3.4)

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.38512,54.875359],[71.40507,54.875359],[71.40507,54.882611],[71.38512,54.882611],[71.38512,54.875359]]]}'
WHERE ku_name_landplot = 'Балка-1';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.397329,54.939654],[71.415437,54.940894],[71.415295,54.935827],[71.396782,54.93686],[71.396842,54.938557],[71.396924,54.938991],[71.397157,54.939398],[71.397329,54.939654]]]}'
WHERE ku_name_landplot = 'Заречное-1';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.396792,54.936239],[71.415406,54.935238],[71.414596,54.930063],[71.395899,54.934347],[71.396547,54.934608],[71.396669,54.935261],[71.396792,54.936239]]]}'
WHERE ku_name_landplot = 'Заречное-2';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.329608,54.890391],[71.360688,54.890391],[71.360688,54.901563],[71.329608,54.901563],[71.329608,54.890391]]]}'
WHERE ku_name_landplot = 'Луговое-1';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.332728,54.874572],[71.357508,54.874572],[71.357508,54.883392],[71.332728,54.883392],[71.332728,54.874572]]]}'
WHERE ku_name_landplot = 'Луговое-2';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.381272,54.890982],[71.408992,54.890982],[71.408992,54.900978],[71.381272,54.900978],[71.381272,54.890982]]]}'
WHERE ku_name_landplot = 'Приозёрное';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.416603,54.940735],[71.427488,54.941417],[71.427269,54.934532],[71.426737,54.934611],[71.426189,54.934899],[71.425642,54.934953],[71.425125,54.93534],[71.425023,54.936237],[71.424516,54.936666],[71.424446,54.937036],[71.424374,54.93752],[71.423796,54.937644],[71.422884,54.937498],[71.422103,54.937106],[71.421515,54.937008],[71.421444,54.937667],[71.420958,54.937943],[71.419923,54.937938],[71.417774,54.937537],[71.417024,54.93753],[71.416709,54.937416],[71.416507,54.937193],[71.416603,54.940735]]]}'
WHERE ku_name_landplot = 'Северное-1';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.428087,54.941381],[71.437374,54.941968],[71.436543,54.93414],[71.430237,54.934238],[71.430297,54.934489],[71.429628,54.934587],[71.428391,54.934379],[71.427782,54.934466],[71.428087,54.941381]]]}'
WHERE ku_name_landplot = 'Северное-2';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.416596,54.934631],[71.416515,54.936436],[71.418076,54.936262],[71.418462,54.936295],[71.418766,54.93586],[71.419516,54.935805],[71.419699,54.935523],[71.420023,54.935327],[71.420631,54.935305],[71.420914,54.935229],[71.420834,54.934794],[71.420591,54.93462],[71.420489,54.934294],[71.420509,54.933892],[71.420002,54.933664],[71.419881,54.933511],[71.420225,54.93337],[71.421016,54.93349],[71.421828,54.933272],[71.422355,54.933282],[71.422821,54.933468],[71.421341,54.933935],[71.421604,54.934294],[71.421848,54.934304],[71.423511,54.933869],[71.424118,54.934131],[71.424585,54.934272],[71.425072,54.934163],[71.425234,54.933935],[71.424931,54.933653],[71.423916,54.933533],[71.423389,54.932847],[71.423511,54.932717],[71.424504,54.932739],[71.424605,54.932445],[71.425801,54.932652],[71.423268,54.928216],[71.415825,54.929955],[71.41621,54.932804],[71.416596,54.934631]]]}'
WHERE ku_name_landplot = 'Южное-1';

UPDATE ku_landplot SET ku_polygongeojson_landplot = '{"type":"Polygon","coordinates":[[[71.430827,54.931304],[71.436363,54.931011],[71.435653,54.925062],[71.427745,54.926943],[71.42371,54.927879],[71.426305,54.932337],[71.426691,54.932728],[71.426833,54.932848],[71.426935,54.932685],[71.426691,54.932326],[71.427035,54.932076],[71.428009,54.931607],[71.428496,54.931293],[71.429225,54.931532],[71.430037,54.931238],[71.430219,54.931065],[71.430827,54.931304]]]}'
WHERE ku_name_landplot = 'Южное-2';


-- инфраструктура: полная пересборка слоя (3 точки + 8 зданий, эталон KNP)

DELETE FROM ku_mapinfra;

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+1 FROM ku_mapinfra), NULL, 'Весы', 'Тип: автомобильные весы(грузовые)<br>Номер: ЕМП 40069672-23<br>Грузоподъемность: 120 т<br>Состояние: рабочее', 54.932628, 71.434457, NULL);

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+2 FROM ku_mapinfra), NULL, 'Коровник 1', 'Тип скота: дойное стадо<br>Количество: 120 голов<br>Состояние: рабочее, покормлены', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.434452, 54.931668], [71.435849, 54.931619], [71.435831, 54.931414], [71.43442, 54.931469], [71.434452, 54.931668]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+3 FROM ku_mapinfra), NULL, 'Коровник 2', 'Тип скота: молодняк<br>Количество: 80 голов<br>Состояние: рабочее, покормлены', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.437231, 54.931753], [71.438942, 54.931771], [71.438939, 54.931556], [71.437236, 54.931536], [71.437231, 54.931753]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+4 FROM ku_mapinfra), NULL, 'Мастерская', 'Тип: ремонтная<br>Характеристика: тракторная , тяжелая техника<br>Состояние: рабочее', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.43465, 54.93271], [71.435026, 54.932702], [71.435023, 54.932542], [71.434634, 54.932554], [71.43465, 54.93271]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+5 FROM ku_mapinfra), NULL, 'Насосная станция', 'Тип: повысительная насосная станция<br>Номер: ЕМП 40239672-23<br>Работоспособность: 15 м^3/ч<br>Состояние: рабочее', 54.933183, 71.435648, NULL);

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+6 FROM ku_mapinfra), NULL, 'Подвес', 'Тип: подвесная дорога( транспортная галерея)<br>Назначение: починка грузовой техники на опорах<br>Протяженность: 80 м<br>Состояние: рабочее', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.435055, 54.932659], [71.435334, 54.932648], [71.435326, 54.932494], [71.435042, 54.932496], [71.435055, 54.932659]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+7 FROM ku_mapinfra), NULL, 'Скважина', 'Тип: открытая<br>Номер: ЕМП 408662-23<br>Глубина: 85м<br>Работоспособность: 12 м^3/ч<br>Состояние: рабочее', 54.932952, 71.433797, NULL);

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+8 FROM ku_mapinfra), NULL, 'Склад 1', 'Тип: зерносклад<br>Вместимость: 500 т<br>Состояние: рабочее', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.434693, 54.933799], [71.436013, 54.93375], [71.436024, 54.933602], [71.434704, 54.933658], [71.434693, 54.933799]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+9 FROM ku_mapinfra), NULL, 'Склад 2', 'Тип: химсклад<br>Вместимость: 70 т<br>Состояние: рабочее', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.434608, 54.932974], [71.435938, 54.932937], [71.435927, 54.932813], [71.434618, 54.932838], [71.434608, 54.932974]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+10 FROM ku_mapinfra), NULL, 'Стоянка для техники', 'Тип: открытая парковка для агро техники<br>Площадь: 2000 км^2, бетон<br>Режим работы: 6:00-20:00 c пн по пт<br>Состояние: рабочее', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.437, 54.933334], [71.439484, 54.933374], [71.439516, 54.931793], [71.436839, 54.931784], [71.437, 54.933334]]]}');

INSERT INTO ku_mapinfra (key0, system__class_ku_mapinfra, ku_miname_mapinfra, ku_minote_mapinfra, ku_milat_mapinfra, ku_milon_mapinfra, ku_mipolygon_mapinfra)
VALUES ((SELECT coalesce(max(key0), 900000)+11 FROM ku_mapinfra), NULL, 'Управление хозяйством', 'Тип: служебное жилое здание<br>Назначение: проживание<br>Площадь: 120 м^2, деревянное<br>Состояние: рабочее <a href=http://192.168.8.183:8501/dashboard target='_blank'>123</a>', NULL, NULL, '{"type": "Polygon", "coordinates": [[[71.434736, 54.933534], [71.435122, 54.933516], [71.435122, 54.933343], [71.434747, 54.933356], [71.434736, 54.933534]]]}');
