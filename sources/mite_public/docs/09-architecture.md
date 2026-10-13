# 09. Архитектура кода «Код Урожая»

> Описание всех модулей, их связей и механики работы.
> Для разработчиков и LLM-агентов, продолжающих работу.

## Общая схема

```
MiteApp (зонтик, topModule)
└── KuApp (зонтик «Код Урожая»)
    ├── KuCrop          → НСИ культур
    ├── KuLand          → земельный банк + карта
    ├── KuRotation      → план севооборота
    ├── KuTechCard      → техкарты + 6 справочников
    ├── KuProdPlan      → годовой план + акт урожая
    ├── KuBudget        → цены, МТР, БДР, БДДС
    ├── KuYield         → NPK, сезонные ТК, коррекции
    ├── KuSimulation    → задачи, модель KuGDD, сценарии
    └── KuAnalytics     → панели, дашборд, глоссарий
```

Все модули — в `src/main/lsfusion/ku/`, единый `NAMESPACE Ku`.
Подключены одной строкой `REQUIRE KuApp;` в `MiteApp.lsf`.

## Модули

### KuCrop (`Crop.lsf`, 217 строк)

**Классы:** `Crop` (культура), `CropPredecessor` (допустимый предшественник), `CropTaboo` (запрещённый).

**Ключевые свойства:**
- `returnYears` — минимальный период возврата (подсолнечник=4, пшеница=1)
- `removalN/removalP/removalK` — вынос NPK, кг/т (потребляет KuYield)
- `allowedAfter` — GROUP CONCAT допустимых предшественников (для подсказок)

**Механика:** справочник культур с агроправилами. При создании (`WHEN SET`) выставляется статус «Активен». Само-табу и само-предшественник разрешены (подсолнечник нельзя после подсолнечника = само-табу).

**Сид:** 10 культур (пшеница, ячмень, кукуруза, подсолнечник, рапс, соя, свёкла, картофель, томат, пар) + правила (паслёновые — взаимное табу, подсолнечник/рапс — самозапрет).

### KuLand (`Land.lsf`, ~620 строк)

**Классы:** `LandPlot` (участок), `Field` (поле), `FieldPlot` (связь), `SoilType`, `SoilAnalysis`, `Contractor`, `LeaseContract`, `LeaseEntry` (взаиморасчёты), `PaymentSheet`/`PaymentSheetItem`, `LeaseNotification`, `LeaseNotificationLog`.

**Ключевая механика:**
- **ФЛК участка:** кадастровая маска `XX:XX:XXXXXX:XXX` через `LIKE '__:__:______:___'`
- **Взаиморасчёты:** `LeaseEntry` (obligation/payment) → сальдо = `obligationSum - paymentSum`; ведомость → утверждение → создаёт payments
- **Уведомления:** `notifyDueRent/notifyDueExpiry` — вычисляемые; `kuLandDaily()` пишет в `LeaseNotificationLog`
- **Карта:** `kuMapData` (DATA TEXT) — снапшот в формате `~name^lon^lat^area^crop^fact^plan^code||FLEET~id^lon^lat^status^field`

**Карта (`kumap.js`):**
- рендерит maptalks.js (локально, 636 КБ)
- парсит `~/^`-разделители, строит GeoJSON на клиенте
- 4 темы раскраски: культура / урожайность / NDVI (JS-симуляция) / статус договора
- fleet: маркеры с popup, треки пунктиром
- экспорт: PRINT XLSX полей

### KuRotation (`Rotation.lsf`, ~400 строк)

**Классы:** `RotationPlan`, `RotationPlanItem` (строка = поле), `RotationViolation`.

**Матрица севооборота:** свойство `cropYear(RotationPlanItem, INTEGER yearNo)` — DATA Crop. В форме — 5 редактируемых колонок (k1–k5) + READONLY-маркеры нарушений (mk1–mk5) + тексты (vt1–vt5).

**Валидация (ядро прототипа):**
```
validateRotationPlan(p):
  1. Удалить старые нарушения
  2. Правило A (период возврата): prevSameYear(i, y) — ближайший предыдущий год
     той же культуры; если y - prevSameYear < returnYears → critical
  3. Правило B (предшественники):
     - табу: predCrop(i,y) ∈ CropTaboo для cropYear(i,y) → critical
     - невхождение: allowedCount > 0 AND NOT allowedPair → warning
```

**Блокировка при сохранении (Б3):**
```
CONSTRAINT cellReturnCritical(i, y) OR cellTabooCritical(i, y)
  CHECKED BY cropYear MESSAGE 'Критическое нарушение...'
```
Это CONSTRAINT на lsFusion-уровне: отклоняет изменение клетки, создающей критическое нарушение. Warning не блокируется. Для REST-пути — валидация с откатом внутри `apiRotationSave`.

**Живая перепроверка:** `WHEN CHANGED(cropYear)` → `validateRotationPlan(plan)` — пересчёт при каждом изменении матрицы.

**REST:** `apiRotationSave/Versions/Copy/Get/Violations` — параметры по именам действия (`&planCode=...&cellsJson=...`).

### KuTechCard (`TechCard.lsf`, ~660 строк)

**Классы:** `TechCard`, `TechOperation`, `OperationMaterial`, `OperationFuel`, `OperationLabor` + 6 справочников (`Unit`, `Nomenclature`, `WorkType`, `Phase`, `ApplicationMethod`, `Profession`).

**Мастер-детейл:** форма `techCard` содержит операции (OBJECTS o), а под каждой — три подтаблицы (материалы/ГСМ/труд) с `FILTERS operation(m) = o`.

**Защита утверждённой карты (Б4):**
- READONLYIF на свойствах при `cardStatus != draft`
- CONSTRAINT на `CHANGED(tcName)` при approved

**REST:** `apiTechCardCreate(cardName, cropCode, opsJson)` + `apiTechCardApprove(cardName)`.

### KuProdPlan (`ProdPlan.lsf`, ~310 строк)

**Классы:** `ProdPlan`, `ProdPlanItem`, `HarvestAct`, `HarvestActItem`.

**Автозаполнение:** `newProdPlan(org, year)` — берёт культуры из утверждённого плана севооборота на заданный год (`cropYear(ri, year - startYear + 1)`) и подбирает ТК по культуре.

**Акт урожая:**
- `netWeight = grossWeight × (100 - moisture - impurity) / 84` (⚠ базовые 14/2)
- `factYieldT = netWeight / areaHa` (т/га)
- `devPct = (fact - plan) / plan × 100`
- Проведение (`postHarvestAct`) обновляет `Field.factYield` и `Field.lastCrop` — замыкание цикла

### KuBudget (`Budget.lsf`, ~500 строк)

**Классы:** `PriceScenario`/`PriceScenarioItem`, `MtrPlan`/`MtrPlanItem`, `BudgetPL`/`BudgetPLItem`, `BudgetCF`/`BudgetCFItem`, `CostItem`, `PaymentTerm`, `ServiceLog`.

**Расчёт МТР:** по операциям ТК назначений плана: `matRate × ppArea` (месяц = 5, ⚠ допущение).

**Расчёт БДР:**
- материалы: `rate × area × priceOf(scenario, nomenclature)`
- ФОТ: `timeRate × 500 × area` (⚠ константа)
- доход: `targetYield/10 × area × priceOf(продукция)` (месяц 8)

**Расчёт БДДС:** по БДР с сдвигом отсрочки (⚠ N/30 месяцев).

**Сценарный анализ:** второй сценарий ×1.15 («Оптимистичный»), форма `budgetCompare` сравнивает.

### KuYield (`Yield.lsf`, ~590 строк)

**Классы:** `ComplexPlan`, `NutrientBalance`, `SeasonalTechCard`/`Operation`/`Material`, `GenerationTask`, `KbRule`, `CorrectionRecommendation`/`Item`, `CalibrationSession`/`Proposal`, `OptimizationSession`, `MtrRequest`/`Item`, `RoutingTask`/`Step`, `CollisionLog`, `PrescriptionFile`.

**Баланс NPK (⚠ допущения прототипа):**
```
requiredDoseAi = max(0, removalPerTon × targetYield/10 - soilReserve × soilAssimilation/100)
```

**Утверждение → сезонная ТК:** `approveComplexPlan` копирует операции шаблона, дозы удобрений пересчитываются из `doseForBalance(cp, element)`.

**Файл-предписание:** `generatePrescription` — 3 зоны по N агрохимии (низкая <20/средняя 20–35/высокая >35), дозы = баланс × 1.2/1.0/0.8. Формат — плоская строка (⚠ фигурные скобки в lsFusion — локализация).

**Коррекции:** `createCorrection(field, crop)` подбирает правило БЗ по стрессу/культуре/приоритету, создаёт `CorrectionRecommendation` + `CorrectionItem` с экономикой.

**Оптимизация (эвристика без VRP):** `runOptimization` строит `MtrRequest` по материалам сезонных карт + `RoutingTask` по операциям + `CollisionLog`.

### KuSimulation (`Simulation.lsf`, ~350 строк)

**Классы:** `SimTask`, `SimResult`, `SimResultPoint`, `ScenarioRun`, `ModelCoeff`, `StressType`.

**Модель KuGDD-1.0 (⚠ упрощение):**
```
gddPctOf(month): апр=0.10, май=0.28, июн=0.52, июл=0.75, авг=0.92, сен=1.00
biomass = biomassMaxT × gddPctOf(month)
yieldForecast = targetYield × gddPctOf(month)
ndvi = 0.2 + 0.6 × gddPctOf(month)
```

**Временной ряд:** 6 месячных точек (15 апреля — 15 сентября).

**Сценарный анализ:** `runScenario` — модификация входа по `scenarioKind` (засуха/удобрение/полив/вредители/дата сева), снижение прогноза для засухи/вредителей.

**Суточный прогон:** `kuSimDaily` — создаёт плановые задачи на все поля + выполняет все queued.

### KuAnalytics (`Analytics.lsf`, ~200 строк)

**Панель процесса:** 9 вычисляемых статусов (`stepLandReady`…`stepCycleClosed`), `stepCurrent` — первый незавершённый, `processHtml` — горизонтальная полоса ✓/○.

**Аналитические панели (КП08):**
- `harvestProgress`: план/факт уборки (га, т, %)
- `cropPnL`: доход/расход/маржа/рентабельность по культурам (сортировка по рентабельности)
- `costStructure`: статьи затрат
- `fleetPanel`: сезонные операции + маршрутные задания

## Сквозные механики

### ABSTRACT-паттерн для кнопок на формах

Проблема: кнопка на форме требует действие объявленным раньше, но PRINT требует форму объявленной раньше → цикл.

Решение:
```lsf
// ДО формы:
myAction 'Подпись' (Param) ABSTRACT;
FORM myForm ... PROPERTIES (o) myAction ...

// ПОСЛЕ формы:
myAction (Param) + { ... реализация ... };
```

### Императивный сбор строк-снапшотов

Проблема: большой GROUP CONCAT из CASE/OVERRIDE → SQL-взрыв.

Решение (паттерн Agro.lsf):
```lsf
myData = DATA TEXT ();
refreshMyData () {
    myData() <- '';
    FOR Obj o IS Obj ORDER name(o) DO {
        myData() <- (OVERRIDE myData(), '') + '~' + prop1(o) + '^' + prop2(o);
    }
    APPLY;
}
```

### Дозаправка сида (WHEN SET затирает)

Проблема: `WHEN SET` выставляет умолчание ПОСЛЕ присвоений в NEW-блоке.

Решение: статусы выставляются отдельным идемпотентным проходом:
```lsf
FOR Obj o IS Obj AND code(o) = 'XX' AND status(o) != Status.approved DO
    status(o) <- Status.approved;
APPLY;
```

### LOCAL после APPLY

Проблема: `LOCAL`-переменная обнуляется после `APPLY`.

Решение: ссылки после APPLY — только lookup'ами по коду/имени (`GROUP MAX Obj o IF code(o) = 'XX'`), не через LOCAL.

## Платформенные особенности lsFusion (выученные)

| Правило | Причина |
|---|---|
| Один `REQUIRE` на модуль | два блока — синтаксическая ошибка |
| `WHERE` не существует в FOR | только `IF` в свойствах, `AND` в FOR |
| `CASE n WHEN 1` не работает | только `CASE WHEN n = 1 THEN` |
| Фигурные скобки `{}` в строках — локализация | JSON не строится на сервере |
| `IN (a, b, c)` в FOR — не работает | только OR-цепочки или `IS` |
| Свойство с одним именем — один модуль | перегрузка по сигнатуре внутри модуля запрещена |
| `EXPORT xlsx FROM` — не поддерживается | только `PRINT форма XLSX TO exportFile` |
| `DELETE v` (без класса) внутри FOR | повторное объявление класса — ошибка |
| `EXTEND FORM` с нуль-арным свойством | не работает — кнопки в объявлениях форм |
| `WHEN CHANGED` в CONSTRAINT | не поддерживается — только READONLYIF + CONSTRAINT с CHANGED |
| Алхические имена (`NONNULL`) | правильно: `NONULL` (одна N) |
