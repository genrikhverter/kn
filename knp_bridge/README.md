# knp_bridge — мост «Код Урожая» (LSfusion) ⇄ платформа KNP

Пункт интеграции №1: LSfusion-прототип встаёт за api-gateway платформы
KNP (АО «КНП», репозиторий rensys/knp) и закрывает её пустые слоты.

## Архитектура

```
клиент → api-gateway KNP (:8088) → knp_bridge (:8090) → LSfusion /exec (:8080) → PostgreSQL
```

* **api-gateway KNP** — их код (~/knp-dev/aoknp/knp), локально пропатчен:
  4 маршрутных файла `lsfusion_*.py` + подключение в `app/main.py`.
  Воспроизводимый патч: `gateway-knp-integration.patch`
  (применить в корне их репо: `git apply < патч`).
* **knp_bridge** (этот каталог, наш код, в fossil) — FastAPI без бизнес-логики:
  каждый эндпоинт = один вызов действия `Ku.*` на LSfusion-сервере.
* **LSfusion** — модуль `src/main/lsfusion/ku/KuKnpApi.lsf` (12 действий,
  JSON собирает платформа через `EXPORT JSON FROM`).

## Слоты KNP, закрытые прототипом

| Слот KNP | Что в KNP | Что отдаём |
|---|---|---|
| `/api/v1/economics/*` | knp_economics — заготовка без API | БДР, БДДС, сценарии цен, P&L-витрины (KuBudget/KuEtl) |
| `/api/v1/simulation/*` | knp_ai_simulation — пустышка | сценарии GDD, LRO-паттерн runId/status (KuSimulation) |
| `/api/v1/yield/*` | — | баланс NPK по полю (KuYield) |
| `/api/v1/ku/*` | — | события (CloudEvents 1.0), поля (GeoJSON) |

Эндпоинты и модели — в OpenAPI: `http://<хост>:8090/docs` (мост) /
`:8088/docs` (шлюз).

## Запуск (на стенде host-128)

```bash
# мост (host-сеть: видит LSfusion на 127.0.0.1:8080)
sudo docker build -t knp-bridge ~/knp-dev/mite_dev/knp_bridge
sudo docker run -d --name knp-bridge --network host --restart unless-stopped \
    -e LSFUSION_URL=http://127.0.0.1:8080 knp-bridge

# шлюз (порт 8088, т.к. 8080 занят веб-клиентом LSfusion)
cd ~/knp-dev/aoknp/knp && sudo docker compose build api-gateway
sudo docker run -d --name knp-gateway -p 8088:8080 --restart unless-stopped \
    --env-file app.env --env-file dev.env --env-file secrets/secrets.env \
    -e LSFUSION_BRIDGE_URL=http://192.168.189.129:8090 knp-api-gateway
```

Проверка:

```bash
curl -s "http://127.0.0.1:8088/api/v1/economics/bdr?year=2027"
curl -s "http://127.0.0.1:8088/api/v1/yield/npk?field=KH-001"
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"field":"KH-001","days":10}' "http://127.0.0.1:8088/api/v1/simulation/run"
curl -s "http://127.0.0.1:8088/api/v1/ku/events?limit=5"
```

## Тесты

`tests/test_contract.py` — контрактный тест (паттерн KNP): подписи действий
парсятся из `KuKnpApi.lsf`/`KuSimulation.lsf`, мост не может разойтись с
логикой. Запуск: `python -m pytest tests/` (из каталога моста, venv в
`.venv/`).

## Переменные окружения моста

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `LSFUSION_URL` | `http://127.0.0.1:8080` | веб-клиент LSfusion (используется как `/exec`) |
| `LSFUSION_USER` / `LSFUSION_PASSWORD` | `admin` / `fusion` | Basic-авторизация `/exec` |
| `BRIDGE_PORT` | `8090` | порт моста |

⚠ Доступ `/exec` открыт только админу LSfusion (настройка enableAPI) —
креды моста не светятся наружу: шлюз аутентификацию не проксирует.

## Слот recycling (п.3) и logistics/VRP (п.2)

* `GET /api/v1/ku/recycling/{kind}?mass_t=...` — конвертер к knp_recycling
  (kind = biogas|bsf|pellets|microwave|hemp); допущения профиля — в
  `app/routes/recycling.py`. Вызывается и из LSfusion:
  `Ku.apiKnpRecycling(поле, способ)`.
* `POST /api/v1/logistics/vrp/solve` — VRP-MVP ФТ4.4 (Urgency Score +
  nearest-neighbour + 2-opt), контракт Demand-M1 из постановки KNP.

## Стек интеграции и патчи — docs/13-knp-integration.md

Полная карта контейнеров, патчи KNP, чек-лист проверки и ловушки —
в `sources/mite_public/docs/13-knp-integration.md`.
