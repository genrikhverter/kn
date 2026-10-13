# 12. Развёртывание стенда «Код Урожая» с нуля (для персонала)

> Пошаговая инструкция: от чистой ВМ с ALT Server до работающего стенда.
> Написана по фактическому развёртыванию 04.10.2026 (ВМ host-128,
> каталог `/home/vmalt/knp-dev/mite_dev`), актуализирована 05.10.2026
> (быстрый путь из архива, интеграционный контур, sql/миграции). Каждый шаг можно копировать в
> терминал целиком; после каждого — контрольный вывод, по которому видно,
> что шаг удался.

## 0. Что должно получиться

| Контейнер | Назначение | Порт |
|---|---|---|
| `mite_db` | PostgreSQL 16 + PostGIS, БД `iot` (данные в volume `mite_pgdata`) | 5432 |
| `mite_server` | LSfusion-сервер (вся бизнес-логика) | 7651, 7652 |
| `mite_web` | Tomcat с веб-клиентом | **8080** |
| `mite_grafana` | Grafana | 3000 |

Веб-клиент: `http://<IP-ВМ>:8080/main` (admin/fusion; демо-входы —
`demo.agronom/demo`, `demo.banker/demo` и др., полный список в
`docs/08-operations.md` §6).

Опционально, интеграционный контур KNP (см. `docs/13-knp-integration.md`):
`knp-bridge` (:8090, host-сеть — REST-мост к LSfusion и VRP-решатель),
`knp-gateway` (:8088), `ollama-llm`+`openwebui` (:8091),
`ai-agent-service` (:8085), `neo4j-logistics`, `recycling-service` (:8095).
Для базового стенда «Код Урожая» не требуются; без них недоступны только
AI-ассистент и внешний VRP (кнопка «Маршруты вывоза» сообщит «мост недоступен»).

**Требования к ВМ:** ALT Server 11.1 (p11), 8 vCPU, ≥15 ГБ RAM, ≥30 ГБ
свободного места на диске, доступ в интернет (github.com,
registry.altlinux.org, registry.red-soft.ru, mvn-mirror.gitverse.ru,
repo.lsfusion.ru). Время: ~1,5–2 часа, из них ~1 час — автоматическая
сборка (шаг 7), участия человека не требует.

## 1. Подготовка ОС: root и sudo

Вход в ВМ под пользователем-администратором (в примере — `vmalt`).

Проверьте, что пользователь входит в группу `wheel`:

```bash
id | grep -o wheel    # должно вывести: wheel
```

На ALT Server право sudo для wheel по умолчанию закомментировано. Если
`sudo id` отвечает «не может запустить sudo» — включите его drop-in'ом
(пароль root; далее sudo тоже спрашивает пароль root — режим `rootpw`):

```bash
su -c 'cat > /etc/sudoers.d/10-wheel <<"EOF"
# Разрешить членам группы wheel запускать sudo (пароль root — режим rootpw)
Defaults rootpw
%wheel ALL=(ALL:ALL) ALL
EOF
chmod 0400 /etc/sudoers.d/10-wheel && visudo -c'
```

Контроль: `visudo -c` выводит «успешно обработан» для обоих файлов, а

```bash
sudo id    # спросит пароль root, выведет uid=0(root)
```

## 2. Подготовка ОС: Docker, Compose v2, git, fossil

```bash
sudo apt-get update
sudo apt-get install -y docker-engine docker-compose git fossil
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Контроль:

```bash
sudo docker ps                 # строка заголовка таблицы, пустой список — норма
docker --version               # Docker version 29.x
docker compose version         # Docker Compose version v5.x (плагин v2)
git --version && fossil version
```

`usermod` добавляет пользователя в группу `docker` — она применится после
выхода/входа (или перезагрузки). До перелогина docker запускается через
`sudo docker ...`; после — без sudo.

Освободите порт 8080 — его по умолчанию занимает веб-морда установщика
ALT (ahttpd), а он нужен веб-клиенту стенда:

```bash
sudo systemctl disable --now ahttpd
ss -ltn | grep :8080 || echo "8080 свободен"
```

## 3. Развернуть каталог проекта

Если проект пришёл архивом `mite_dev.tar.gz`:

```bash
tar xzf mite_dev.tar.gz -C <родительский-каталог>
sudo chown -R $USER:$USER <путь-до>/mite_dev
```

На этой ВМ проект живёт в `/home/vmalt/knp-dev/mite_dev` — далее пути
такие; при другом расположении заменяйте путь в командах и в файлах
шага 4.

Внутри должно быть: `mite.fossil`, `sources/mite_public/` (исходники +
`docs/`), `docker/` (compose и Dockerfiles), `sql/` (миграции картографии
и демо-данных 01–07), `knp_bridge/` (мост KNP), `backups/` (дамп демо-БД),
`artifacts/` (готовая сборка: jar логики, jar сервера, war веб-клиента,
`lib/`), `docs-screenshots/`, `deck/` (материалы показа), `.m2/settings.xml`,
`SETUP_NOTES.md`, скрипты `rebuild_logic.sh`, `backup_db.sh`.

### 3а. Быстрый путь (если в архиве есть `artifacts/`) — без сборки

Готовая сборка позволяет пропустить шаги 5–7 (клон платформы и ~часовую
компиляцию): после шагов 1–4 и 6 сразу переходите к шагу 8 (поднять БД,
restore дампа), затем шаг 9 — сервер и веб стартуют из `artifacts/`.
Полная сборка из исходников понадобится только при доработке логики
(тогда выполните шаг 5 и используйте `rebuild_logic.sh`).

## 4. Подключить fossil и поправить пути

Архив переносит файлы, но не файл-метку чекаута fossil, поэтому
репозиторий нужно «открыть» поверх существующих файлов (проверку, что
файлы совпадают с HEAD, fossil делает сам; `--force` перезаписывает
метку, содержимое остаётся вашим):

```bash
cd ~/knp-dev/mite_dev        # или ваш путь
fossil open mite.fossil --force
fossil status                # checkout: ... trunk; EDITED — только правки путей
```

В `docker/docker-compose.yml`, `rebuild_logic.sh`, `backup_db.sh` зашит
путь прежней ВМ (`/home/vboxalt/mite_dev`). Замените его на
фактический (одной командой, из корня `mite_dev`):

```bash
sed -i 's|/home/vboxalt/mite_dev|'"$PWD"'|g' \
    docker/docker-compose.yml rebuild_logic.sh backup_db.sh
grep -rn vboxalt docker/ *.sh   # пусто — всё заменено
```

Создайте каталог для сборочных выходов и закоммитьте правки в fossil:

```bash
mkdir -p artifacts
fossil commit -m "Миграция на новую ВМ: пути в compose и скриптах"
```

## 5. Склонировать платформу LSfusion (внешний git-клон)

```bash
cd sources
git clone https://github.com/lsfusion/platform.git
cd platform && git checkout 2221b1992f3b
```

`2221b1992f3b` — проверенный пин, на котором собран проект. Контроль:

```bash
git log --oneline -1        # 2221b1992f Docs update
```

## 6. Собрать образы

```bash
cd ~/knp-dev/mite_dev/docker
sudo docker compose build
```

Качает базовые образы (ALT p11, РЕД UBI8) и ставит в них пакеты;
~5–15 минут. Контроль — в конце список:
`Image docker-db Built` … `Image docker-web Built` (все пять).

⚠ Если сборка образа упала на `apt-get install` с exit code 100 и
«Couldn't find package …» — это разовый сбой загрузки списков пакетов с
ftp.altlinux.org. Лечится повторным запуском той же команды (образы
собираются с кэшем, повтор быстрее).

## 7. Полная сборка (платформа + логика + веб-клиент)

```bash
sudo docker compose run --rm builder
```

Компилирует LSfusion и MITE Maven'ом (первый раз ~50–70 минут: качает
~2 ГБ зависимостей с зеркала GitVerse в `.m2/repository`), собирает
jar/war в `artifacts/`. Успешное окончание — строка
**«Сборка успешно завершена!»**.

⚠ builder запускать только явно (как выше). `docker compose up -d` без
списка сервисов поднимет и его — начнётся эта же часовая сборка; если
поднялся случайно: `docker compose stop builder`.

## 8. Поднять БД и восстановить данные демо-стенда

```bash
cd ~/knp-dev/mite_dev/docker
sudo docker compose up -d db
sleep 20     # initdb, создание БД iot и postgis — делает entrypoint
```

Контроль (должен ответить 1, ошибок быть не должно):

```bash
sudo docker exec mite_db psql -U postgres -d iot -t -A -c "SELECT 1;"
```

Залить свежий дамп из `backups/` (сообщения «уже существует» — норма;
в архиве — `iot-20261005-demo.gz`, полный демо-контур со сквозными данными:

```bash
gunzip -c ~/knp-dev/mite_dev/backups/iot-20261005-demo.gz | \
  sudo docker exec -i mite_db psql -U postgres -d iot -q
```

Альтернатива — чистая БД без дампа: пропустите заливку, сервер при первом
старте создаст схему и сиды сам; затем выполните миграции картографии и
демо-данных (на ОСТАНОВЛЕННОМ сервере, порядок важен):

```bash
for f in ~/knp-dev/mite_dev/sql/0*.sql; do
  echo "== $f"; sudo docker exec -i mite_db psql -U postgres -d iot -q < "$f"
done
```

Контроль — количество таблиц (ожидается ~354):

```bash
sudo docker exec mite_db psql -U postgres -d iot -t -A \
  -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
```

## 9. Поднять сервер, веб и Grafana

```bash
sudo docker compose up -d server grafana web
sudo docker logs -f mite_server     # ждать «Server has successfully started» (~1–2 мин), Ctrl+C
```

Контроль из браузера машины в той же сети:

- `http://<IP-ВМ>:8080/main` — экран входа MiteApp (admin/fusion);
- `http://<IP-ВМ>:3000` — Grafana (admin/admin; пароль в Grafana не менять).

Если ВМ за NAT VirtualBox — пробросить порты 8080 и 3000 в настройки
сети ВМ.

## 10. Включить ежедневный бэкап БД

```bash
crontab -e        # добавить строку (актуальный путь проекта!):
30 2 * * * /home/vmalt/knp-dev/mite_dev/backup_db.sh
```

Контроль: `~/knp-dev/mite_dev/backup_db.sh && ls -lh backups/` — появится
`iot-<дата>.gz`, запись в `backups/backup.log`.

## 11. Итоговый чек-лист

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'   # db, server, web, grafana — Up
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/main   # 200
# REST (кириллицу в параметрах кодируем через -G --data-urlencode):
curl -s -G -u admin:fusion "http://localhost:8080/exec" \
  --data-urlencode "action=Ku.apiRotationGet" --data-urlencode "p=СС-2027-1"
```

REST-ответ непустой (JSON со строками плана севооборота) — стенд жив.

Дополнительно из браузера: дашборд «Код Урожая» (вкладка «Код Урожая») —
карточки кликабельны; «Интерактивная карта» (папка «Земля») — полигоны
полей, участки, слайдер NDVI, инструменты. Для нового JS после переноса
браузерному кэшу нужен жёсткий Ctrl+F5.

## 12. Типовые проблемы

| Симптом | Причина и лечение |
|---|---|
| `permission denied ... docker.sock` | Пользователь не в группе docker либо не перелогинился: `sudo usermod -aG docker $USER`, выйти/зайти; до этого — `sudo docker` |
| `vmalt отсутствует в файле sudoers` | Не подключён drop-in из шага 1, либо в нём опечатка (`%wheel`, права 0400) |
| Сборка образов: `Couldn't find package postgresql16-postgis`, exit 100 | Разовый сбой `apt-get update` внутри сборки — просто повторить шаг 6 |
| ВМ перезагружена «жёстко», БД не стартует | Stale lock сокета postgres — см. `docs/08-operations.md` §4б (свежие образы чистят сами) |
| Веб: «AppServerNotAvailable» | Сервер ещё стартует (~90 с) или упал — `docker logs --tail 100 mite_server` |
| Сборка (шаг 7) упала на середине | Повторить `docker compose run --rm builder`; прерывание maven чинится повторным запуском, см. также `docs/10-llm-handoff.md` п.18 |
| Maven тянет свежий SNAPSHOT платформы | Сломан пин: не удалять `.m2/maven-metadata-local.xml` (см. handoff п.18) |
| Дамп не заливается (`relation does not exist` в начале) | Не дождались initdb — повторить залвку через 10–20 с |
| Сборка логики падает: `cannot access lsfusion.base`, `com.google.common does not exist` | Побился кэш `.m2` (исчезли jar платформы/guava): `cd docker && sudo docker compose run --rm builder bash -c 'cd /build/platform && export JAVA_HOME=/usr/lib/jvm/java-21-openjdk && mvn install -DskipTests -q -pl api,server -am'`, затем повторить сборку |
| Карта после доработок не меняется / «Field … not found» | Клиент кэширует статические JS и jar мог собрать не тот файл: перезапустить mite_web и mite_server, в браузере Ctrl+F5 |

Дальнейшая эксплуатация (пересборка логики, логи, восстановление,
миграция) — `docs/08-operations.md`.
