# 08. Инструкция по эксплуатации стенда «Код Урожая»

> Контейнерный стенд на LSfusion 7.0-SNAPSHOT (Docker Compose).
> Хост: VirtualBox VM (ALT Linux), SSH на `127.0.0.1:2222`, порт 8080 (веб), 3000 (Grafana).

## 1. Состав стенда

| Контейнер | Назначение | Порт |
|---|---|---|
| `mite_db` | PostgreSQL 16 + PostGIS 3.5, БД `iot`; данные в volume `mite_pgdata` | 5432 |
| `mite_server` | LSfusion-сервер (логика + API) | 7651, 7652 |
| `mite_web` | Tomcat с веб-клиентом (war) | 8080 |
| `mite_grafana` | Grafana (дашборды MITE) | 3000 |
| builder | одноразовый: компиляция Maven | — |

Каталоги на хосте (проброшены в контейнеры):

```
~/mite_dev/
├── sources/mite_public/    # бизнес-логика (наши модули Ku* в src/main/lsfusion/ku/)
├── sources/platform/       # внешний клон LSfusion (git, пин 2221b1992f3b)
├── docker/                 # Dockerfile.* + docker-compose.yml
├── artifacts/              # собранные jar/war → монтируются в server/web
├── .m2/                    # кэш Maven + settings.xml (зеркала)
├── rebuild_logic.sh        # быстрый цикл пересборки
├── backup_db.sh            # бэкап БД (pg_dump+gzip, ротация 14 дней)
├── backups/                # копии БД (не в fossil)
├── SETUP_NOTES.md          # статус окружения
└── mite.fossil             # VCS (fossil)
```

## 2. Первый запуск (с нуля)

```bash
cd ~/mite_dev/docker

# 1) собрать образы
docker compose build

# 2) полный цикл сборки (платформа + логика + клиенты + патч war)
docker compose run --rm builder

# 3) запустить стек
docker compose up -d db server grafana web

# 4) ждать старта сервера (~1-2 мин)
docker logs -f mite_server
# ждать: "Server has successfully started"
```

Данные БД живут в именованном volume `mite_pgdata` (объявлен в compose) —
пересоздание контейнера `db` и пересборка её образа данных НЕ стирают
(стирает только `docker compose down -v` или удаление volume).
Volume заполняется одним из способов:
- с нуля — сидами демо-данных при первом старте сервера (onStarted);
- из бэкапа — процедурой восстановления (§4а).

⚠ builder запускать только явно (`docker compose run --rm builder`);
`docker compose up -d` без списка сервисов поднимет и его — начинается
полная ~часовая сборка. Если поднялся случайно: `docker compose stop builder`.

После этого веб-клиент доступен на `http://<IP-ВМ>:8080/main`.

## 3. Ежедневная работа

### Изменили логику (`.lsf`, Java, ресурсы)

```bash
~/mite_dev/rebuild_logic.sh
```

Скрипт: компилирует Maven → копирует jar в `artifacts/` → патчит war (localhost→server) → перезапускает `server` и `web` → тейлит лог. Занимает 2–5 минут.

Признаки успеха:
- `Server has successfully started` в логе
- нет `EXCEPTION` в `docker logs mite_server`
- веб `http://<IP>:8080/main` отвечает 200

### Изменили только JS/CSS (`resources/web/*.js`)

```bash
~/mite_dev/rebuild_logic.sh   # тоже полный цикл (JS упаковывается в jar)
```

### Изменили docker-compose / Dockerfile

```bash
cd ~/mite_dev/docker
docker compose build
docker compose up -d          # пересоздаст изменённые контейнеры
```

## 4. Выключение

```bash
# остановить всё (данные БД сохранятся — они в volume mite_pgdata):
cd ~/mite_dev/docker
docker compose down

# остановить + УДАЛИТЬ volume с данными БД (крайне осторожно!):
docker compose down -v
```

## 4а. Резервное копирование и восстановление (ФТ8.4)

**Бэкап** — ежедневно в 02:30 (cron пользователя, `crontab -l`), вручную:

```bash
~/mite_dev/backup_db.sh        # pg_dump | gzip → backups/iot-ГГГГММДД-ЧЧММ.gz
```

Хранение 14 дней (ротация в скрипте). Проверено на реальном восстановлении
02.10.2026 — процедура ниже отработана на живом стенде.

**Восстановление** (в свежий или существующий контейнер `db`):

```bash
# 1) остановить потребителей БД
cd ~/mite_dev/docker && docker compose stop server web grafana

# 2) (если нужна чистая БД) пересоздать контейнер с пустым volume
docker compose rm -f db && docker compose build db && docker compose up -d db
sleep 20   # initdb + создание БД iot + postgis (entrypoint)

# 3) залить дамп (ошибок быть не должно, «уже существует» — норма)
gunzip -c ~/mite_dev/backups/iot-<ДАТА>.gz | docker exec -i mite_db psql -U postgres -d iot -q

# 4) контроль и запуск стека
docker exec mite_db psql -U postgres -d iot -t -A -c \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public';"   # ≈354
docker compose up -d db server grafana web
```

Сиды не дублируются (все гварды `IF NOT (GROUP MAX ...)`), пароль postgres
выставляет entrypoint, роли/пользователи/события восстанавливаются из дампа.

## 4б. Инцидент после жёсткой перезагрузки ВМ: БД не поднимается

Симптомы: веб — «AppServerNotAvailable / Connection refused»,
`docker logs mite_db`: `pg_ctl: could not start server` / «another server
might be running», в `/var/lib/pgsql/data/log/*.log` — «файл блокировки
/tmp/.s.PGSQL.5432.lock уже существует».

Причина: жёсткий рестарт ВМ оставил lock-файл сокета postgres с мёртвым PID.

Лечение (лечит образ, начиная с fc4f00f5 от 02.10.2026, автоматически; для
старых контейнеров — вручную):

```bash
docker exec mite_db rm -f /tmp/.s.PGSQL.5432.lock /tmp/.s.PGSQL.5432
docker restart mite_db && sleep 12
docker exec mite_db psql -U postgres -d iot -t -A -c "SELECT 1;"   # проверка
docker restart mite_server   # вывести сервер из петли переподключения
```

## 5. Диагностика

```bash
# статус контейнеров
docker ps --format 'table {{.Names}}\t{{.Status}}'

# логи сервера (последние 100 строк)
docker logs --tail 100 mite_server

# ошибки запуска логики
docker logs mite_server 2>&1 | grep -A5 "Exception while starting"

# проверить БД
docker exec mite_db psql -U postgres -d iot -c "SELECT count(*) FROM ku_field;"

# проверить REST API (кириллицу в параметрах кодируем через -G --data-urlencode)
curl -s -G -u admin:fusion "http://localhost:8080/exec" \
  --data-urlencode "action=Ku.apiRotationGet" --data-urlencode "p=СС-2027-1"

# перезапустить только сервер (без пересборки)
docker restart mite_server
```

## 6. Логины

| Система | Логин | Пароль |
|---|---|---|
| Веб-клиент | `admin` | `fusion` (смена при первом входе) |
| Grafana | `admin` | `admin` (не менять — рассинхрон с MITE) |
| PostgreSQL | `postgres` | `11111` |

## 7. Версионирование (fossil)

```bash
cd ~/mite_dev
fossil timeline          # история коммитов
fossil diff              # несохранённые изменения
fossil commit -m "..."   # зафиксировать
fossil revert .          # откатить всё
```

**Не коммитить в git `sources/mite_public`** — это чужой проект (MITE), наш код только в fossil.

## 8. Известные особенности

- Данные БД — в volume `mite_pgdata` (с 02.10.2026): контейнер можно
  пересоздавать и пересобирать образ; стирает только `down -v`
- ВМ (проверено 02.10.2026): 8 vCPU (Ryzen 9), 15 ГБ RAM; пересборка логики
  ~4–6 мин, старт LSfusion ~40–90 с (ограничение — однопоточная инициализация)
- после жёсткой перезагрузки ВМ у БД мог остаться stale lock сокета — см. §4б
  (в образах от 02.10.2026 чистится автоматически)
- `sources/platform` — внешний git-клон, не редактируется
- `rebuild_logic.sh` патчит war (localhost→server) — это критично, без патча веб не подключится


## 9. Миграция на другую ВМ

Проект самодостаточен и переносится целиком копированием одного каталога.

### Быстрый путь (если обе ВМ доступны по SSH)

```bash
# на новой ВМ (получить всё одной командой со старой):
rsync -avz --progress vboxalt@СТАРАЯ_ВМ:~/mite_dev/ ~/mite_dev/
# если старая ВМ за NAT: пробросить SSH (порт 2222 хоста) и наоборот
```

### Ручной путь (через архив)

```bash
# на старой ВМ: снять бэкап БД и упаковать каталог
~/mite_dev/backup_db.sh
cd ~ && tar czf mite_dev.tar.gz --exclude='sources/platform' --exclude='artifacts' \
    --exclude='.m2/repository' --exclude='target' mite_dev/
# mite_dev.tar.gz ~50–100 МБ (fossil + исходники + бэкапы + settings.xml)

# передать: scp / флешка / cloud
# на новой ВМ:
tar xzf mite_dev.tar.gz -C ~/
```

### Что переносится и что нет

| Артефакт | Переносится? | Комментарий |
|---|---|---|
| `mite.fossil` | ✅ | Вся история коммитов — ядро проекта |
| `sources/mite_public/` | ✅ | Бизнес-логика (внутри fossil и отдельно) |
| `docker/` | ✅ | Compose-стек + Dockerfile'ы |
| `docs/` | ✅ | Документация (внутри fossil) |
| `backups/*.gz` | ✅ | Бэкапы БД — для восстановления данных |
| `.m2/settings.xml` | ✅ | Зеркала Maven |
| `SETUP_NOTES.md`, `rebuild_logic.sh`, `backup_db.sh` | ✅ | Скрипты и статус |
| `sources/platform/` | ❌ | Внешний git-клон LSfusion (пин 2221b1992f3b); клонировать заново: `git clone https://github.com/lsfusion/platform.git && cd platform && git checkout 2221b1992f3b` |
| `.m2/repository/` | ❌ | Кэш Maven (~2 ГБ); загрузится при первой сборке |
| `artifacts/` | ❌ | Сборочные выходы; собрать заново (см. §2) |

### Развёртывание на новой ВМ (кратко)

```bash
# 1) развернуть каталог (см. выше)
# 2) поставить Docker + Compose v2
# 3) клонировать платформу:
cd ~/mite_dev/sources && git clone https://github.com/lsfusion/platform.git
cd platform && git checkout 2221b1992f3b
# 4) собрать образы и полный цикл:
cd ~/mite_dev/docker && docker compose build && docker compose run --rm builder
# 5) запустить стек:
docker compose up -d db server grafana web
# 6) (опционально) восстановить данные из бэкапа — §4а
# 7) настроить cron бэкапов: crontab -e → 30 2 * * * ~/mite_dev/backup_db.sh
```

Полная сборка на новой ВМ: ~50 мин (платформа) + ~5 мин (логика);
без `.m2` кэша первая сборка дольше — зависимости качаются с зеркал.

### Возможные проблемы

- **SSH-доступ**: если новая ВМ тоже за NAT VirtualBox — пробросить порт 2222
- **Права**: `chown -R vboxalt:vboxalt ~/mite_dev` после распаковки под root
- **Docker**: убедиться что пользователь в группе docker (`usermod -aG docker`)
- **Пароль БД**: зашит в Dockerfile.db (11111) и docker-compose — не меняется
