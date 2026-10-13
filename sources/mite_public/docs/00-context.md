# 00. Контекст репозитория MITE и конвенции разработки

> Входной документ для генерации кода. Читается первым; остальные документы
> пакета (`01`–`06`) ссылаются сюда и не повторяют этот материал.
> Аудитория: модель-генератор (GLM) и разработчики.

## 1. Проект

MITE — IoT-платформа мониторинга объектов и устройств на **LSfusion 7.0-SNAPSHOT**.
Развёртывается в прототип Цифровой платформы АПК **«Код Урожая»** (агрохолдинг:
земельный банк, севооборот, техкарты, бюджеты, программирование урожая, симуляция).

Раскладка корня `/home/vboxalt/mite_dev`:

| Путь | Что это | Версионирование |
|---|---|---|
| `sources/mite_public/` | бизнес-логика (этот пакет документации — в `docs/`) | **fossil** (`~/mite_dev/mite.fossil`) |
| `sources/platform/` | внешний git-клон LSfusion, пин `2221b1992f3b` | git (в fossil НЕ включён — см. ignore-glob) |
| `docker/` | compose-стек: db, builder, server, grafana, web | fossil |
| `artifacts/` | сборочные выходы (jar/war/lib/logs) | не версионируется |
| `.m2/` | кэш Maven + `settings.xml` (зеркала); монтируется в builder | только `settings.xml` в fossil |
| `rebuild_logic.sh`, `SETUP_NOTES.md` | быстрый цикл пересборки; статус окружения | fossil |

Ограничения стенда: 1 ядро CPU, 7,8 ГБ RAM → полная сборка ~50 мин,
пересборка только логики — минуты. Демо-режим БД в контейнере без volume.

## 2. Сборка и обязательный цикл проверки

Изменена логика (`.lsf`, Java, ресурсы) — обязательно:

```bash
~/mite_dev/rebuild_logic.sh          # mvn package + рестарт mite_server + лог
```

Признаки успеха: `Server has successfully started`, рост числа загруженных
модулей, отсутствие EXCEPTION в `docker logs mite_server`, приложение
отвечает на `http://<IP-ВМ>:8080/main`. Любая ошибка компиляции lsf —
исправлять до зелёной сборки, не оставлять «на потом».

Полный цикл (платформа + клиенты + патч war) — `cd ~/mite_dev/docker &&
docker compose run --rm builder`; в обычной работе НЕ нужен.

Docker из SSH-сессии требует членства в группе `docker` (применяется после
переподключения); скрипты выше запускать из переподключённой сессии.

## 3. Архитектура модулей

Точка сборки — `topModule = MiteApp` (`src/main/resources/lsfusion.properties`).
Строковые литералы — русские (`logics.lsfStrLiteralsLanguage = ru`).

### 3.1. Модули MITE (верхний уровень `src/main/lsfusion/`)

| Модуль | Назначение | NAMESPACE | Ключевые REQUIRE |
|---|---|---|---|
| `Base` | каркас навигатора (папки верхнего уровня) | — | — |
| `Options` | настройки приложения (логотип, Grafana-авторизация, ключи API) | — | Utils |
| `Country` | страны, производственный календарь, выходные | — | System, MasterData, I18n |
| `Location` | точки размещения, атрибуты, области с полигонами | — | Controller, Device, Geo, Measurement, Hierarchy |
| `Mite` | ядро телеметрии: настройки датчиков, расписания корректировок, отчёты, роли | — | Organization, Org*, GrafanaDashboard, Modbus, StoreTaskMite и др. (полный список — `Mite.lsf:3`) |
| `Agro` | ДЕМО агро-кейс (грядки/поля/теплицы на EquipmentUnit, погода, NPK-эвристика, 3D-сцена) | Agro | Scheme, Weather, WeatherOpenWeatherMap |
| `Scheme` | схемы объектов, 3D-визуализация, оборудование, ТОиР | Mite | Mite, MachineBot, StoreTaskMite |
| `StoreTaskLib` / `StoreTaskMite` | подсистема задач/чек-листов (восстановлена по Приложению А) | StoreTask | Authentication, SystemEvents, Utils / StoreTaskLib, ExternalApp, Org* |
| `ExternalApp` | каталог внешних мобильных приложений + REST-ручка | — | — |
| `Export` | экспорт данных, REST-ручки | Export | Device, OrgMeasurement |
| `MachineBot` / `BackfillBot` | Telegram-боты: диспетчер техники / дозаполнение | — | Mite, Telegram, Scheduler, Management |
| `MiteTestData` | генератор тестовых данных (не зависит от Mite — иначе цикл REQUIRE) | — | Org*, StoreTaskLib, DefaultData |
| `SosediDemo` | демо-данные ритейл-сети «Соседи» | — | Org*, StoreTaskMite, DefaultData |
| `MiteApp` | «зонтик»: REQUIRE всех фич-модулей | — | MachineBot, Weather, WeatherOpenWeatherMap, Scheme, SosediDemo |

### 3.2. Базовые модули внутри проекта (вложенные каталоги)

`organization/` (Organization, OrgLocation, OrgDevice, OrgController,
OrgMeasurement, OrgUser, OrgManagement, OrgManagementReport, OrgCommand,
grafana/Grafana, GrafanaDashboard, GrafanaDevice, GrafanaMeasurement),
`controller/` (Command, Controller, ControllerDevice), `device/` (Device,
Measurement), `server/` (MqttServer, Modbus, Server),
`integration/weather/` (Weather, WeatherOpenWeatherMap), `management/`
(Management, ManagementReport + Employee).

### 3.3. Внешние модули (из jar-ов lsfusion-solutions, НЕ редактировать)

Utils, DefaultData, MasterData, I18n, SystemEvents, Authentication, Geo,
Hierarchy, ProcessMonitor, SQLUtils, Backup, Eval, Scheduler, Telegram,
Viber, Skype, Slack, Icon.

### 3.4. Механика пространств имён

Модуль объявляет `NAMESPACE X;` — его элементы извне видны как `X.имя`
(пример: `Mite.standMode()` в `Agro.lsf:675`). Модули без NAMESPACE —
глобальные. Общий граф зависимостей обязателен к соблюдению: новые модули
REQUIRE'ят существующие, но никогда наоборот; циклы запрещены
(эталон-комментарий — заголовок `MiteTestData.lsf`).

## 4. Конвенции кода (эталоны — по образцам репозитория)

### 4.1. Данные
- `CLASS Name 'Русская подпись'` — PascalCase; `TABLE name (Name);` — на каждый класс.
- Свойства: `camelCase 'Подпись' = DATA TYPЕ[...] (Class)`; имя сущности:
  `name 'Название' = DATA STRING[100] (X) NONULL IN id;`
- NULL-безопасность: `OVERRIDE value(x), default` или `(OVERRIDE ('' + v), '')`.
- «Последняя запись»: `GROUP LAST T t ORDER dateTime(t), t WHERE ...` (`Agro.lsf:261`).
- Бизнес-уникальность: `GROUP AGGR X x BY key(x)` (`Mite.lsf:41`).
- Ссылочная целостность бизнес-правилами:
  `CONSTRAINT ... CHECKED BY ... MESSAGE '...'` (`organization/OrgDevice.lsf`).
- Реакция на изменение: `WHEN CHANGED(...) DO действие` (`Mite.lsf:71`).

### 4.2. Действия
- Формат: `имя 'Подпись' (Параметры) { NEW x = Class { ... } APPLY; }`;
  `APPLY` — после пачки изменений, внутри одного действия один-два раза.
- Java-действие: `updateDeviceSettings 'Обновить' INTERNAL 'mite.UpdateDeviceSettingsAction' (Device)`
  (`Mite.lsf:70`), класс в `src/main/java/mite/`.

### 4.3. Формы и навигатор
- `FORM имя 'Подпись' OBJECTS ... PROPERTIES (o) [READONLY] ... FILTERS ... ORDERS ...`;
  раскладка через `DESIGN { OBJECTS { MOVE PROPERTY/BOX ... fill = N; caption } }`
  (`Agro.lsf:414`–`461`).
- Папки навигатора объявлены в `Base.lsf`; новые модули добавляют свои папки
  в `NAVIGATOR { ... }` по образцу `Agro.lsf:464`.
- Расширение чужой формы: `EXTEND FORM devices PROPERTIES ... DESIGN ...`
  (`Mite.lsf:77`).

### 4.4. RBAC
Роли — платформенные `UserRole`; свой признак роли + скрытие:
`isLogist = DATA BOOLEAN (UserRole)`, `SHOWIF notLogistUser()` на свойствах,
`EXTEND FORM securityPolicy` (`Mite.lsf:14`–`31`). Новые роли «Код Урожая» —
тем же паттерном.

### 4.5. Демо-данные (сиды)
Эталон — `agroSeed` (`Agro.lsf:486`): вызов в `onStarted()` под guard
`IF Mite.standMode() THEN ...`; каждый блок сида идемпотентный
(`IF NOT (GROUP MAX X x IF ...)`); демо-значения подобраны так, чтобы
показать все ветки логики (дефициты N/P/K, истекающие сроки и т.п.).

### 4.6. Интеграции
- REST-ручка: действие `EXPORT JSON FROM поле = ... WHERE ...; RETURN
  JSONFILE(exportFile());` — вызов снаружи `/exec?action=Module.action`
  (эталоны: `ExternalApp.lsf:31`, `Export.lsf`). Вход JSON:
  `INPUT j = JSON DO IMPORT JSON FROM j FIELDS() ...` (`Agro.lsf:391`).
- Погода: `Weather`/`WeatherOpenWeatherMap` — прогноз по `Location`
  (координаты), ключ API в настройках; эталон использования — `Agro.lsf:50`.
- Grafana: создание/удаление дашбордов из логики (`organization/grafana/`,
  Java `grafana/GrafanaAction.java`), JSON-шаблоны в
  `src/main/resources/grafana/`.
- Отчёты: Jasper `.jrxml` в `src/main/lsfusion/reports/`, печать `PRINT`.

### 4.7. Кастомные JS-компоненты
Свойство-снимок `... CUSTOM 'имяКомпонента' ON CHANGE действие()`
(`Agro.lsf:415`); скрипт подключается
`onWebClientInit() + { onWebClientInit('файл.js') <- N; }`; данные —
строка с разделителями `^` (поля) и `~` (записи), клиент парсит;
события клиента возвращаются JSON в `ON CHANGE`. Эталоны: `agro3d.js`,
`agrodash.js`, `warehouse3d.js`.

### 4.8. i18n
Литералы — русские (см. §3); ресурсы `MiteResourceBundle(_ru).properties`;
в JS — `mitei18n.js`; локализация дат/стран — через `Country`/I18n.

## 5. Платформенные ловушки (ОБЯЗАТЕЛЬНЫЕ правила)

1. **Не строить большой `GROUP CONCAT` из nullable/OVERRIDE/CASE-выражений** —
   SQL-взрыв (TOO LONG QUERY, минуты пересчёта). Решение: собирать
   DATA-строку императивно, маленькими чанками (`Agro.lsf:328`–`368`,
   комментарий `lsfusion-scene-data-sql-explosion`).
2. **CASE/IF с разными строками материализовать** перед использованием в
   агрегатах: `MATERIALIZED` (`Agro.lsf:236` growthStage); но в записях
   сцены-снимка — обычные DATA, заполняемые действием (`Agro.lsf:244`,
   комментарий `complex-property-preread-crash`).
3. Тяжёлые агрегаты-снимки помечать `NOCOMPLEX NOHINT` (`Agro.lsf:336`).
4. Комментарии в коде со ссылками на «память» (`lsfusion-*`) — читать
   и учитывать; это зафиксированные уроки стенда.
5. Циклы REQUIRE запрещены (§3.4).
6. Правки платформы (`sources/platform`) — вне скоупа; логика должна
   собираться на запиненной версии.

## 6. Правила «не трогать»

- `sources/platform/**`, `.m2/settings.xml`, `docker/**` (только по явной
  задаче на инфраструктуру), `SETUP_NOTES.md`, `.fossil-settings/`.
- Демо-модули (`Agro`, `SosediDemo`, `MiteTestData`) не расширять
  функциональностью «Код Урожая» — для неё создаются отдельные модули
  (см. `01-scope.md`, ADR-1).
- После каждого логически завершённого изменения — `fossil commit`
  (сообщение по-русски, суть + что задето).

## 7. Критерий «готово» для любого шага генерации

1. `rebuild_logic.sh` завершился без ошибок компиляции;
2. сервер стартовал, в логе нет новых исключений;
3. новый функционал виден в навигаторе веб-клиента;
4. демо-сид отработал (объекты появились, повторный запуск не дублирует);
5. для валидаций/расчётов — поведение воспроизводится на демо-данных;
6. изменения закоммичены в fossil.
