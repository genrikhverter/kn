# Снапшот проекта «Код Урожая» (MITE + КУ) — 05.10.2026

Полная передаваемая копия стенда: исходный код, документация, миграции,
готовая сборка и демо-данные. Fossil-репозиторий `mite.fossil` содержит
всю историю разработки (ветка trunk, HEAD на момент снапшота).

## Состав архива

| Путь | Что это |
|---|---|
| `mite.fossil` | Fossil-репозиторий: вся история коммитов исходников |
| `sources/mite_public/` | Исходники приложения (.lsf-модули Ku*, java, web/JS-компоненты карты и дашбордов) + `docs/` (01–13: модель, логика, развёртывание, интеграции, сценарии показа) |
| `docker/` | docker-compose.yml и Dockerfiles (db/server/web/grafana/builder) |
| `sql/` | Идемпотентные миграции: 01 картография (полигоны/инфраструктура/вода), 02 агрохимия, 03–05 зазоры полигонов, 06 демо-разнообразие, 07 акты урожая |
| `knp_bridge/` | Python/FastAPI-мост к платформе KNP (REST-слоты economics/yield/simulation/ku, VRP-решатель, переработка) + тесты |
| `artifacts/` | **Готовая сборка** (без компиляции): iot-1.0-SNAPSHOT.jar (логика), lsfusion-server-7.0-SNAPSHOT.jar, веб-клиент war, lib/ |
| `backups/iot-20261005-demo.gz` | Дамп демо-БД (сквозной контур: земля → севооборот → бюджеты → NPK → симуляции → урожай → витрины → отчёты) |
| `docs-screenshots/` | Скриншоты проверок UI (карта v6, дашборд, карточки) |
| `deck/` | Материалы живого показа (15-мин презентация) |
| `gossort/` | Реестровые данные культур (актуализация справочника) |
| `docs-external/` | Конспекты внешних API (ФГИС Зерно/Сатурн/ВетИС, 1С) |
| `rebuild_logic.sh`, `backup_db.sh`, `SETUP_NOTES.md` | Скрипты пересборки/бэкапа, заметки |
| `SNAPSHOT_README.md` | Этот файл |

## Быстрый старт (полностью — в `sources/mite_public/docs/12-deploy-guide.md`)

1. Распаковать: `tar xzf <архив> -C ~/<родительский каталог>`
2. `cd mite_dev && fossil open mite.fossil --force && sed -i "s|/home/vmalt/knp-dev/mite_dev|$PWD|g" docker/docker-compose.yml rebuild_logic.sh backup_db.sh`
3. `cd docker && sudo docker compose build && sudo docker compose up -d db && sleep 20`
4. `gunzip -c ../backups/iot-20261005-demo.gz | sudo docker exec -i mite_db psql -U postgres -d iot -q`
5. `sudo docker compose up -d server grafana web` → `http://<IP>:8080/main`

Сборка из исходников не нужна (в архиве `artifacts/`); нужна только при
доработке логики — тогда по разделу 5 гайда клонируется платформа LSfusion
(git-пин `2221b1992f3b`) и запускается `rebuild_logic.sh`.

## Входы

- Веб-клиент: `http://<IP>:8080/main` — admin/fusion; демо: `demo.agronom`/`demo`, `demo.banker`/`demo`
- REST `/exec` (basic admin/fusion), REST моста KNP `:8090/api/v1/...`
- Grafana `:3000` (admin/admin)

## Интеграционный контур (опционально)

`knp_bridge` (образ собирается из `knp_bridge/Dockerfile`), `knp-gateway`,
`ollama-llm`+`openwebui`, `ai-agent-service`, `neo4j-logistics`,
`recycling-service` — назначение и запуск: `sources/mite_public/docs/13-knp-integration.md`.

## Известные особенности стенда

- Кэш Maven (.m2) иногда теряет jar платформы — лечение в 12-deploy-guide §12.
- После доработок JS — рестарт `mite_web` + Ctrl+F5 браузера (кэш статики).
- Kaspersky в сети перехватывает TLS к ollama-регистри — сертификат уже
  вшит в контейнер (см. 13-knp-integration.md §Ловушки).
