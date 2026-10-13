# 13. Интеграция с платформой KNP (АО «КНП»)

> Выполнено 04.10.2026 по шести направлениям. Исходники KNP — `~/knp-dev/aoknp/`
> (gitflic rensys/knp, ветка develop_nauka1; НЕ коммитить в наш fossil).
> Наши наработки — `knp_bridge/` (в fossil) + патчи KNP рядом.

## Архитектура

```
                       ┌── ai-agent (:8085) ── tool-calling ──┐
клиент → knp-gateway ──┤                                      ├── knp-bridge (:8090) ── /exec ── mite_web (:8080) → LSfusion → PostgreSQL
          (:8088)      └── (mdm/agronomic/supply-chain —      │
                          не подняты на этом стенде)          └── recycling-service (:8095)
ollama (:11434, qwen2.5:3b) + openwebui (:8091) + neo4j (:7474/:7687)
```

Слоты KNP за нашим прототипом: **economics** (knp_economics — пустышка),
**simulation** (knp_ai_simulation — пустышка), **yield** (NPK), **ku**
(события CloudEvents, карта GeoJSON, переработка), **logistics** (VRP ФТ4.4).

## Контейнеры стенда интеграции

| Контейнер | Порт | Запуск |
|---|---|---|
| knp-bridge | 8090 (host net) | образ `knp-bridge` из `~/knp-dev/mite_dev/knp_bridge` |
| knp-gateway | 8088 | образ `knp-api-gateway` из `~/knp-dev/aoknp/knp` + `docker network connect knp_ai knp-gateway` |
| knp-frontend | 8092 | образ `knp-frontend` из `~/knp-dev/aoknp/knp/knp_frontend` (см. «Витрина» ниже) |
| ollama-llm | 11434 (knp_ai) | `ollama/ollama` + **`-e SSL_CERT_FILE=/root/.ollama/ca-kaspersky.crt`** |
| openwebui | 8091 | `ghcr.io/open-webui/open-web-ui:main` |
| neo4j-logistics | 7474/7687 | `neo4j:5-community` |
| ai-agent-service | 8085 | образ `knp-ai-agent` (патченный) |
| recycling-service | 8095 | образ `knp-recycling-service` |
| jupyter-lab | 8888 | `jupyter/scipy-notebook`, токен `dev_jupyter_token` (волна 5) |

Точные команды запуска — `knp_bridge/README.md` §Запуск.

## Витрина knp_frontend на живых данных прототипа (08.10)

Фронтенд «ЦУП КНП» (их FastAPI+Jinja, порт **8092**, вход
demo/demo12345 — пользователи заводятся
`docker exec knp-frontend python -c "from app.auth import create_user; create_user('<логин>','<пароль≥8>')"`)
показывает **наши живые поля**: главная карта грузит
`API_BASE/ku/map/fields` (GeoJSON прототипа через шлюз), фолбэк — их
статический демо-макет. Патч их кода — `knp_bridge/frontend-knp-integration.patch`
(map.js: живые поля + guard от null-геометрий + попап с культурой/площадью;
применять в корне их репо). Запуск:

```bash
cd ~/knp-dev/aoknp/knp/knp_frontend && docker build -t knp-frontend . && \
docker run -d --name knp-frontend -p 8092:8000 --restart unless-stopped \
  -e SESSION_SECRET_KEY=<секрет> \
  -e API_BASE_URL=http://192.168.189.129:8088/api/v1 knp-frontend
```

⚠ **API_BASE_URL должен быть достижим ИЗ БРАУЗЕРА пользователя** (IP ВМ,
не host.docker.internal — тот резолвится только внутри контейнера);
при смене IP ВМ поправить (как и прочие URL из доки 13). Мост
`/api/v1/ku/map/fields` не отдаёт фичи без контура (KH-201..205:
geometry:null ломал maptalks — toGeometry→null→getProperties TypeError).
Предупреждение «Сервис core-mdm недоступен» в консоли — штатный фолбэк
(их MDM на стенде не поднят). Скриншот: `docs-screenshots/knp-vitrina-map.png`.

## Что сделано по пунктам

1. **Слот /api/v1 за шлюзом KNP.** `KuKnpApi.lsf` (17 REST-действий),
   мост `knp_bridge`, патч шлюза `gateway-knp-integration.patch`
   (5 маршрутных файлов). Проверено сквозно.
2. **ИИ-ассистент на данных прототипа.** Патч ai-agent
   (`ai-agent-knp-integration.patch`): инструменты get_budget_summary /
   get_crop_pnl / get_npk_balance / get_fields. Проверено: /api/v1/ai/chat
   отвечает цифрами LSfusion (маржа −454 155 ₽; NPK 187,8 кг/га) с
   `grounded=true` и источниками. VRP-MVP в мосте (`/api/v1/logistics/vrp/solve`,
   Urgency Score + NN + 2-opt).
3. **Переработка остатков.** recycling развернут; LSfusion-действие
   `apiKnpRecycling(поле, способ)` считает сырьё из факта урожая, зовёт
   калькулятор через конвертер моста, пишет RecyclingCalc + событие.
4. **Паттерны KNP в прототипе.** Hash-chain журнал (`KuAuditLog.alHash`,
   md5-цепочка; `apiKnpAudit`); версионирование участков
   (`LandPlotVersion` со снимком JSON; `apiKnpPlotVersions`); CloudEvents
   (`/api/v1/ku/events`).
5. **Данные и макет.** 6 полигонов полей из их `fields.geojson` перенесены
   на наши поля KH-001…006 (недра: `/tmp/polygons.sql`); отдаются в
   GeoJSON API. Макет UI — `aoknp/knp/knp_frontend/maket/Код урожая.fig`
   (открыть в Figma вручную).
6. **Тест-паттерны.** Контрактный тест моста читает подписи действий из
   `.lsf` (паттерн test_seed_lots.py); тесты VRP; флик-LLM — их
   `tests_e2e/test_chat_chain.py`.

## Проверка (чек-лист)

```bash
curl -s "http://127.0.0.1:8088/api/v1/economics/bdr?year=2027" | head -c 200
curl -s "http://127.0.0.1:8088/api/v1/yield/npk?field=KH-001" | head -c 150
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"message":"Какая маржа по базовому БДР 2027?"}' \
     "http://127.0.0.1:8088/api/v1/ai/chat"
curl -s "http://127.0.0.1:8088/api/v1/ku/events?limit=3"
curl -s "http://127.0.0.1:8088/api/v1/ku/map/fields" | grep -o Polygon | wc -l   # 6
cd ~/knp-dev/mite_dev/knp_bridge && ~/knp-dev/venvs/bridge/bin/python -m pytest tests/ -q
```

## Ловушки (зафиксировано ценой отладки)

- **Kaspersky перехватывает TLS** к registry.ollama.ai — в контейнер ollama
  монтируется его корневой сертификат через `SSL_CERT_FILE` (Go уважает;
  update-ca-certificates недостаточно, рестарт контейнера стирает).
- **`/exec` не коммитит без `APPLY`** — действия с побочными эффектами
  обязаны завершаться `APPLY;` (kuAuditChange молча терял строки).
- **Объектные параметры /exec** парсятся по `key0` (числом), не по IN id —
  тестировать действия с объектными параметрами через id из БД.
- **`EXPORT JSON FROM` встраивает TEXT с валидным JSON как объект**, а не
  строку — мост принимает оба варианта (см. ku.py).
- **`OVERRIDE name(nullable-объект), ''`** не компилируется — использовать
  `name(x)` с NULL-результатом или GROUP MAX-обёртку.
- **URL с хост-IP** (192.168.189.129) зашиты в `kuRecyclingBridgeUrl` и
  env шлюза — при смене IP ВМ поправить (иначе переработка/шлюз отваливаются).
- **Fossil не любит «-» в начале строк комментария** коммита —
  использовать `--no-verify-comment` или переформулировать.

## Следующие шаги (кандидаты)

- REST `apiMapGeoJson` и кадастровые контуры в снапшот карты (из v3-списка);
- VRP: дорожная сеть/метаэвристика, интеграция с лотами;
- sha256 вместо md5 (pgcrypto) и CloudEvents-идентификаторы ULID в KuEvent;
- транслитерация type в CloudEvents (сейчас ru.knp.event для кириллических);
- прогон их `tests_e2e` против нашего контура.

## Картография стенда: sql/миграции (04.10.2026, v5 карты)

Картография больше не «живёт только в БД» — вынесена в идемпотентные
миграции репозитория `mite_dev/sql/` (применять на ОСТАНОВЛЕННОМ сервере,
`docker exec -i mite_db psql -U postgres -d iot < NN-*.sql`):

- **01-cartography-full.sql** — полигоны+центры всех полей, слой
  инфраструктуры (3 точки, 8 зданий) из эталона KNP (СКО, Петропавловск),
  кадастровые ореолы участков;
- **02-field-geometry-soil.sql** — вариативные агрохиманализы по плодородию
  почв полей + история анализов KH-001/KH-003. Ключи новых строк берутся из
  счётчика `idtable` (LSfusion перечитает его после рестарта);
- **06–08** — демо-разнообразие (факт-урожайность, севооборот 5 шаблонов),
  проведённые акты урожая, **реальные контуры полей из OpenStreetMap**
  (KH-007..010/101/102 — way id OSM в файле; KH-001..006 возвращены к 97%
  границ KNP, areaHa синхронизирована с площадью контура).

Водные объекты (озеро/река, вводились для сценария буферных зон
ФТ.GEO.2.1) удалены из демо 05.10 по решению заказчика: предмет системы —
сельское хозяйство. Инструмент «Буфер» на карте работает по клику в любую
точку; для демонстрации водоохранной зоны объекты можно вернуть по
инструкции docs/14-field-contours.md §2 (источники реальной гидрографии).

Уроки: (а) «наезд» полигонов — стык fallback-прямоугольников вплотную,
лечится реальными контурами; (б) при INSERT в таблицы LSfusion напрямую
key0 NOT NULL и без default — выделять из `idtable` (id=1) самому.
