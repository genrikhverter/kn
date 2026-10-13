# MITE dev — состояние окружения (2026-09-18)

Подготовлено по инструкции от 29.08.2026. Проект жил в
`/home/vboxalt/mite_dev` (вместо `/opt/mite`); **04.10.2026 мигрировал на
ВМ host-128 в `/home/vmalt/knp-dev/mite_dev`** — см. раздел «Миграция»
в конце файла.

Хост: Docker 29.2.1 + Compose v2 установлены и запущены, ahttpd остановлен
(порт 8080 свободен), пользователь `vboxalt` в группе `docker` (членство
применяется после переподключения по SSH; до этого — `sudo docker`).

## Исходники (sources/) — git-клоны

| Каталог | Что | Версия |
|---|---|---|
| `platform/` | LSfusion, ветка `mite-dev` | 7.0-SNAPSHOT, пин sha `2221b1992f3b` (2026-09-18) |
| `mite_public/` | бизнес-логика MITE, ветка `mite-dev` | база — пин `d6c41109` (2026-08-26) + коммит `7263a7e` (восстановление) |

Почему mite_public запинен: инструкция написана против состояния на 29.08.
Позже в master пришли `b03d52d4` (31.08, `REQUIRE SubjectStock` — модуль
утрачен вместе с артефактом) и `2ca5dc23` (02.09, мост `own*`-шов под новую
версию storetask-logics от 31.08). Текущий master с Приложением А не соберётся.
Пока Приложения А/Б не обновят под новый контракт артефакта — держим `d6c41109`.
Правки логики закоммичены локально в `mite_public` (коммит `7263a7e`).

## Правки логики (этап 2, всё по инструкции)

- `pom.xml` — зависимость `lsfusion.solutions:storetask-logics` закомментирована;
- `src/main/lsfusion/StoreTaskLib.lsf` — создан дословно из Приложения А;
- `src/main/lsfusion/ExternalApp.lsf` — **восстановлен по описанию**: Приложение Б
  к инструкции прилагалось не было. Модуль самодостаточен (таблица + форма +
  ручка `apiExternalApps`, поля по демо-стенду #36840: пакет `by.luxsoft.tsd`,
  URI-шаблон). Ничто в mite_public его элементы не использует; при получении
  оригинального Приложения Б — заменить файл целиком;
- `Options.lsf` — `fillGrafanaAuth`: добавлен `headers('Content-Type') <- 'application/json'`;
- `resources/web/warehouse3d.js` — защита от пустого `st.zones` (пустой склад);
- `Modbus.lsf`, `StoreTaskMite.lsf`, `SosediDemo.lsf`, `Scheme.lsf` — не тронуты.

## Docker (docker/)

`Dockerfile.{db,builder,server,web,grafana}` — дословно из инструкции.
`docker-compose.yml` — из инструкции с двумя отличиями: хост-пути
`/opt/mite/*` → `/home/vboxalt/mite_dev/*`, и builder монтирует
`~/mite_dev/.m2:/root/.m2` (кэш Maven на хосте — зависимости качаются один раз,
пересборки не тянут сотни мегабайт заново; settings.xml с зеркалами лежит в
`~/mite_dev/.m2/settings.xml`).

## Текущее состояние: всё запущено (2026-09-18)

- Образы собраны; builder отработал: `lsfusion-client` war 245 М, `lsfusion-server`
  140 М, `iot` 623 К, `lib/` 196 jar (jlibmodbus на месте);
- `mite_db`, `mite_server`, `mite_grafana`, `mite_web` — Up;
- Сервер: «Server has successfully started», 67 модулей, исключений нет;
- БД `iot`: UTF8, PostGIS 3.5, 236 таблиц;
- Веб `http://<IP-ВМ>:8080/main` отвечает (title «MiteApp»), Grafana `:3000` здорова.

## Разработка

- Правки логики — в `sources/mite_public` (ветка `mite-dev`), правки платформы —
  в `sources/platform` (ветка `mite-dev`);
- Быстрая пересборка только логики + рестарт сервера: `~/mite_dev/rebuild_logic.sh`
  (платформа не перекомпилируется — её target/ и кэш .m2 уже на хосте);
- Полный цикл (платформа + клиенты + патч war): `cd ~/mite_dev/docker && docker compose run --rm builder`;
- Доступ из браузера хоста при VirtualBox NAT: пробросить порты 8080 и 3000
  (SSH уже проброшен на 127.0.0.1:2222);
- Логины: веб `admin`/`fusion` (при первом входе смена), Grafana `admin`/`admin`
  (пароль в веб-морде Grafana не менять — рассинхронизируется с настройкой в MITE);
- Настройка дашбордов и демо-данные — этапы 5.4–5.6 инструкции.

## Особенности этой ВМ

- Актуально на 02.10.2026 (проверено в гостевой ОС): **8 vCPU** (AMD Ryzen 9
  9950X3D), RAM 7,8 ГБ (+7,8 ГБ swap). Ранняя запись «1 ядро CPU» от 18.09
  устарела (конфигурация ВМ менялась) — не полагаться на неё;
  пересборка логики ~4–6 мин (maven + рестарт сервера, старт ~75 с —
  ограничение однопоточной инициализации LSfusion, а не CPU);
- БД в контейнере без volume (как в инструкции) — пересоздание контейнера
  `db` (`--force-recreate`, пересборка образа) сбрасывает данные; для рабочей
  эксплуатации добавить volume на `/var/lib/pgsql/data`.

## Миграция на ВМ host-128 (04.10.2026)

Проект перенесён архивом (см. ПЕРЕДАЧА.md) с VirtualBox/vboxalt на
физическую ВМ **host-128**: ALT Server 11.1, 8 vCPU, 15 ГБ RAM,
IP 192.168.189.129. Каталог — `/home/vmalt/knp-dev/mite_dev`.

- sudo для wheel включён drop-in'ом `/etc/sudoers.d/10-wheel` (режим
  `rootpw` — sudo спрашивает пароль root);
- ОС: docker-engine 29.2.1 + compose v2 (плагин `docker compose`),
  git 2.50.1, fossil 2.26; пользователь `vmalt` в группе docker;
- пути `/home/vboxalt/mite_dev` в compose и скриптах заменены на
  фактические; fossil открыт поверх файлов (`fossil open --force`),
  чекаут = trunk 93ca21ec;
- платформа переклонирована и запинена (2221b1992f3b);
- БД восстановлена из `backups/iot-20261004-0146.gz`;
- пошаговая инструкция развёртывания с нуля — `docs/12-deploy-guide.md`.

Старые записи ниже относятся к прежней ВМ (vboxalt) и оставлены для
истории; порты/доступы не изменились.
