-- 18: чистка организаций (решение владельца 10.10):
-- 1) «Агрохолдинг «Код Урожая»» (27030) переименовывается в «Омский АНЦ»
--    и получает реальные реквизиты ФГБНУ «Омский АНЦ» (из удаляемой строки
--    62663, созданной миграцией 09: УНН 5503001927, СИБНИИСХОЗ);
-- 2) поля Омского АНЦ KH-201..205 (5 шт., без геометрии — стёрта
--    10-knp-reference-restore.sql:23) перебрасываются в 27030;
-- 3) «Демо-организация» (70126, из ручного генератора MiteTestData,
--    полей/участков нет) удаляется; её пользователи demo.admin/user1/user2
--    переводятся в «Агро-Север (демо RLS)» (57728), где их 2 поля KH-101/102 —
--    сценарий изоляции данных сохраняется.
-- Сиды lsf синхронно патчатся (литералы «Агрохолдинг «Код Урожая»» -> «Омский
-- АНЦ», 10 мест в 7 модулях) — иначе landSeed воскресил бы старую оргу при
-- рестарте. Идемпотентно. Применять на остановленном сервере.

-- 1. Поля АНЦ -> бывший Агрохолдинг
UPDATE ku_field SET ku_organization_field = 27030
WHERE ku_organization_field = 62663;

-- 2. Переименование + реальные реквизиты (только при старом имени — идемпотентно)
UPDATE organization_organization SET
  organization_name_organization = 'Омский АНЦ',
  organization_unn_organization = '5503001927',
  organization_address_organization = 'г. Омск, проспект Академика Королёва (СИБНИИСХОЗ)',
  organization_contact_organization = 'Демо-стенд',
  organization_phone_organization = '+7 (3812) 77-67-34',
  organization_site_organization = 'https://anc55.ru',
  organization_email_organization = 'office@anc55.ru'
WHERE key0 = 27030
  AND organization_name_organization = 'Агрохолдинг «Код Урожая»';

-- 3. Удаление дубля-организации АНЦ (полей у неё больше нет)
DELETE FROM organization_organization WHERE key0 = 62663;

-- 4. Пользователи Демо-организации -> Агро-Север (RLS-демо сохраняется)
UPDATE authentication_customuser SET organization_organization_customuser = 57728
WHERE organization_organization_customuser = 70126;

-- 5. Удаление Демо-организации (полей/участков нет; генератор MiteTestData
--    ручной, автосидом не воскреснет)
DELETE FROM organization_organization WHERE key0 = 70126;
