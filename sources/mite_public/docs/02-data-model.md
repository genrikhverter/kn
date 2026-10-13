# 02. Модель данных прототипа «Код Урожая»

> Спецификация классов/свойств LSfusion, готовая к генерации кода.
> Источник атрибутов — `spec-source.md` (дословно, с указанием отступлений).
> Покрытие: все модули СТ (полная версия от 2026-09-25).
> Конвенции и эталоны — `00-context.md` §4.

## 0. Общие правила маппинга СТ → LSfusion

| Тип СТ | Тип LSfusion | Комментарий |
|---|---|---|
| UUID / GUID | суррогатный ключ объекта | отдельное поле не заводим; внешний UUID (интеграция) — `STRING[36]` при необходимости |
| Строка | `STRING[n]` по максимуму из СТ | |
| Целое | `INTEGER` | |
| Вещественное | `NUMERIC[12,2]` (цены/площади), `DOUBLE` (физические величины) | |
| Дата / Дата-время | `DATE` / `DATETIME` | |
| Перечисление | статик-`CLASS { имя 'Подпись', ... }` — для статусов документов и значений с логикой; иначе `STRING[30]` | статусы документов — всегда статик-класс |
| Диапазон (мин-макс) | два свойства `...Min` / `...Max` | |
| Массив ссылок | реестр: отдельный класс `(владелец, элемент)` | паттерн «reified many-to-many» |
| GeoJSON / JSON | `TEXT` | координаты центра — отдельные `DOUBLE` (как `Location` в MITE) |
| Ссылка на пользователя | `CustomUser` | |
| Бинарные данные/фото | `IMAGEFILE` / `RAWFILE` | |

Общие механизмы (на каждый справочник/документ):
- `TABLE имя (Класс);` — обязательно.
- Бизнес-код: `code 'Код' = DATA STRING[..] (X) NONULL IN id;` + уникальность
  `CONSTRAINT` или `GROUP AGGR`.
- Аудит-поля СТ (версия записи, дата создания/изменения, автор) — в прототипе
  упрощение: `created 'Создано' = DATA DATETIME`, `createdBy 'Автор' = DATA
  CustomUser` заполняются при `NEW` (WHEN SET / явным присваиванием в
  действии); полное версионирование записей справочников — отложено (05).
- Статусы справочников («Активен/На утверждении/Устарел/Архив») — единый
  статик-класс `NsStatus` в KuCrop... — нет, каждому справочнику свой
  статик-класс статуса не заводим: в прототипе `status = DATA STRING[20]`
  со значениями из списка + `isArchived = DATA BOOLEAN` для главного
  фильтра «действующих». Документы (план, ТК) — полноценные статик-классы
  статусов с логикой переходов (см. 03-logic).

## 1. KuCrop — справочник культур (`Crop.lsf`)

`NAMESPACE Ku; REQUIRE Utils, SystemEvents;`

### CLASS Crop 'Культура'
TABLE crop (Crop);

| Свойство | Тип | Подпись | Обяз. | Примечание |
|---|---|---|---|---|
| `name` | `STRING[100]` | Наименование | да (NONULL IN id) | пример «Пшеница озимая» |
| `code` | `STRING[16]` | Код культуры | да, уникальный | формат `[ТИП]-NNNNN`, напр. `ЗЕР-00123` |
| `registryCode` | `STRING[24]` | Код Госсорткомиссии | да, уникальный | реестр селекционных достижений |
| `variety` | `STRING[100]` | Сорт/Гибрид | да | |
| `cropType` | статик-`CropType` | Тип культуры | да | { зерновая, техническая, кормовая, овощная, плодовая, прочая } |
| `seasonKind` | статик-`SeasonKind` | Сезонность | да | { весенняя, зимняя, многолетняя } |
| `vegetationDays` | `INTEGER` | Вегетация, дн | да | продолжительность вегетационного периода |
| `targetYield` | `NUMERIC[10,2]` | Целевая урожайность, ц/га | нет | |
| `phMin`/`phMax` | `DOUBLE` | pH почвы мин/макс | нет | |
| `humusMin`/`humusMax` | `DOUBLE` | Гумус, % мин/макс | нет | |
| `nMin`/`nMax`, `pMin`/`pMax`, `kMin`/`kMax` | `DOUBLE` | N/P/K, мг/кг мин/макс | нет | |
| `moistMin`/`moistMax` | `DOUBLE` | Влажность почвы, % мин/макс | нет | |
| `tempMin`/`tempMax` | `DOUBLE` | Температура роста, °C мин/макс | нет | |
| `returnYears` | `INTEGER` | Мин. период возврата, лет | да | **ключевое правило севооборота** |
| `image` | `IMAGEFILE` | Изображение | нет | |
| `description` | `TEXT` | Описание | нет | |
| `source` | `STRING[100]` | Источник информации | нет | |
| `actualized` | `DATE` | Дата актуализации | нет | |
| `gostLink` | `STRING[100]` | ГОСТ/ТУ | нет | |
| `note` | `TEXT` | Примечания | нет | |
| `status` | `STRING[20]` | Статус | да, умолч. «Активен» | активен/на утверждении/устарел/архив |
| `created`/`createdBy` | `DATETIME`/`CustomUser` | Создано/Автор | да (авто) | |

Правила севооборота — **массивы ссылок СТ → реестры**:

```
CLASS CropPredecessor 'Допустимый предшественник';   // (культура, предшественник)
TABLE cropPredecessor (CropPredecessor);
crop = DATA Crop (CropPredecessor);
predecessor = DATA Crop (CropPredecessor);

CLASS CropTaboo 'Запрещённый предшественник';        // аналогично
```

Отложено из СТ (в `05-deferred.md`, но поля-заглушки заводим):
`bbchStages 'Феностадии BBCH' = DATA TEXT (Crop)` — период.
**Нет** в прототипе: пороговые значения стрессов, рекомендуемые
удобрения/пестициды (появятся с Номенклатурой в KuTechCard — связь через
реестр `CropRecommendNuance` потом), устойчивость к болезням, генетические
коэффициенты (нужны KuSimulation — завести `geneticCoeffs = DATA TEXT (Crop)`
JSON-заглушкой), совместимость с техникой (нет справочника техники в скоупе).

Сид: 8–10 культур (пшеница озимая, ячмень, кукуруза, подсолнечник
`returnYears=4`, рапс, соя, сахарная свёкла, картофель, томат, пар),
предшественники: паслёновые табу друг другу, зерновые после зерновых 2 года
— данные подобрать так, чтобы валидации севооборота демонстрировались.

## 2. KuLand — земля (`Land.lsf`)

`NAMESPACE Ku; REQUIRE Location, OrgLocation, Organization, Geo, Country;`

### CLASS Field 'Поле' (агрономическое, СТ «Справочник полей»)
TABLE field (Field);

| Свойство | Тип | Подпись | Обяз. | Примечание |
|---|---|---|---|---|
| `name` | `STRING[60]` | Название | да (NONULL IN id) | пример «Северное-1» |
| `code` | `STRING[16]` | Код поля | да, уникальный | формат `KH-NNN` |
| `organization` | `Organization` | Организация | да | «код хозяйства» из формата СТ |
| `areaHa` | `NUMERIC[10,2]` | Площадь, га | да | ручной ввод в прототипе |
| `boundaryGeoJson` | `TEXT` | Границы (GeoJSON) | нет | ввод/импорт; расчёт площади по геометрии — О (05) |
| `centerLat`/`centerLon` | `DOUBLE` | Центр (широта/долгота) | нет | |
| `location` | `Location` | Точка размещения | нет | привязка к площадкам/погоде MITE |
| `soilType` | ссылка `SoilType` | Тип почвы | да | мини-справочник, см. ниже |
| `landClass` | статик `LandClass` | Класс земель | нет | { I, II, III, IV, V } |
| `bonitet` | `INTEGER` | Бонитет (1–100) | нет | CONSTRAINT 1..100 |
| `slope` | `NUMERIC[5,2]` | Уклон, % | нет | 0–30 |
| `erosion` | `STRING[16]` | Эрозионная опасность | нет | низкая/средняя/высокая |
| `lastCrop` | `Crop` | Последняя культура | нет | из истории/факта |
| `lastSowDate` | `DATE` | Дата последнего посева | нет | |
| `currentCrop` | `Crop` | Текущая культура | нет | |
| `fieldState` | `STRING[24]` | Состояние поля | нет | чистое/засорённое/болезни/вредители |
| `stateScore` | `INTEGER` | Оценка состояния (1–5) | нет | |
| `planYield` | `NUMERIC[10,2]` | Плановая урожайность, ц/га | нет | умолчание — `targetYield(currentCrop)` |
| `factYield` | `NUMERIC[10,2]` | Фактическая урожайность, ц/га | нет | после уборки |
| `note` | `TEXT` | Примечания | нет | |
| `created`/`createdBy` | | | авто | |

Вычисляемые (READONLY, не DATA):
- `lastAnalysis 'Последний агрохиманализ' (Field f) = GROUP LAST
  SoilAnalysis a ORDER date(a) WHERE field(a) = f;` — после появления класса
  (каркас SoilAnalysis в этом же модуле, заполнение — по разделу СТ модуля 2).
- `lastAnalysisDate` — аналогично GROUP MAX.
- `rotationHistory 'История севооборота'` — GROUP CONCAT по годам из строк
  утверждённых планов + факта (см. 03-logic; ⚠ правило §5.1 00-context о
  конкатенациях — собирать из простых полей).
- Ссылки «на текущий план» / «на техкарту» — обратные вычисляемые
  (GROUP MAX по строкам планов/назначений), не хранимые.

Реестр связи с участками (СТ: «возможно несколько участков»):
```
CLASS FieldPlot 'Поле ↔ участок';  TABLE fieldPlot (FieldPlot);
field = DATA Field (FieldPlot); plot = DATA LandPlot (FieldPlot);
```

### CLASS LandPlot 'Земельный участок'
Полный атрибутный состав — §7 (земельный банк); здесь от `LandPlot`
нужна только ссылка для реестра `FieldPlot`.

### CLASS SoilType 'Тип почвы' — мини-справочник
TABLE soilType (SoilType): `name` (чернозём, дерново-подзолистая, серая
лесная, каштановая, торфяная...), `code STRING[8]`, `note TEXT`.
Атрибутный состав в СТ отсутствует — ⚠ допущение прототипа.

Сид: 2 организации, 10–12 полей двух площадок (координаты существующих
`Location`-площадок из `agroSeed` — Кубань/Дон), участки 1:1 к полям.

## 3. KuRotation — план севооборота (`Rotation.lsf`)

`NAMESPACE Ku; REQUIRE KuCrop, KuLand, Authentication;`

### CLASS RotationPlanStatus (статик) 'Статус плана'
{ draft 'Черновик', approved 'Утверждён', archived 'Архивный' }

### CLASS RotationPlan 'Долгосрочный план севооборота'
TABLE rotationPlan (RotationPlan);

| Свойство | Тип | Подпись | Обяз. |
|---|---|---|---|
| `number` | `STRING[20]` | Номер | да, формат `СС-ГГ-НННН`, умолчание — генерировать |
| `planDate` | `DATE` | Дата | да, умолч. текущая |
| `status` | `RotationPlanStatus` | Статус | да, умолч. draft |
| `author` | `CustomUser` | Автор | да, умолч. текущий |
| `organization` | `Organization` | Организация | да |
| `startYear` | `INTEGER` | Год начала | да, умолч. следующий год |
| `horizonYears` | `INTEGER` | Горизонт, лет | да, умолч. 5, CONSTRAINT 1..10 |
| `version` | `INTEGER` | Версия | да, умолч. 1 |
| `approvedAt` | `DATETIME` | Дата утверждения | нет |
| `approvedBy` | `CustomUser` | Утвердивший | нет |
| `basedOn` | `RotationPlan` | План на основе | нет (для копий/версий) |
| `note` | `TEXT` | Примечания | нет |
| `created`/`createdBy` | | | авто |

### CLASS RotationPlanItem 'Строка плана (поле)'
TABLE rotationPlanItem (RotationPlanItem);
```
plan = DATA RotationPlan (RotationPlanItem);
field = DATA Field (RotationPlanItem);
note  = DATA TEXT (RotationPlanItem);
```
Матрица «поля × годы» — свойство с параметром-годом (не N колонок):
```
crop (RotationPlanItem i, INTEGER yearNo) = DATA Crop;  // yearNo: 1..horizon
nameCrop 'Культура' (RotationPlanItem i, INTEGER yearNo) = crop(i, yearNo);
yearOf (RotationPlanItem i, INTEGER yearNo) = startYear(plan(i)) + yearNo - 1; // READONLY
```
В форме строки выводятся полем, культура — редактируемой матрицей
`crop[1..horizon]` (см. 04-ui). `CONSTRAINT` уникальность (plan, field).

### CLASS RotationViolationType (статик) 'Тип нарушения'
{ returnPeriod 'Период возврата', predecessor 'Предшественник' }
### CLASS Severity (статик) 'Критичность'
{ info 'Информационное', warning 'Предупреждение', critical 'Критическое' }
### CLASS RotationViolation 'Нарушение севооборота'
TABLE rotationViolation (RotationViolation):
`item = DATA RotationPlanItem`, `yearNo = DATA INTEGER`, `vType =
DATA RotationViolationType`, `severity = DATA Severity`, `message = DATA
STRING[250]`. Заполняется действием проверки (03-logic), критические
блокируют утверждение. Интеграционные данные СТ (JSON события, денормализованная
копия) — REST-ручкой (03-logic §KuRotation), не хранятся.

## 4. KuTechCard — технологические карты (`TechCard.lsf`)

`NAMESPACE Ku; REQUIRE KuCrop, KuLand, Organization, Authentication;`

### CLASS TechCardStatus (статик)
{ draft 'Черновик', approved 'Утверждена', archived 'Архивная' }

### CLASS TechCard 'Технологическая карта'
TABLE techCard (TechCard):

| Свойство | Тип | Подпись | Обяз. |
|---|---|---|---|
| `name` | `STRING[150]` | Наименование | да (NONULL IN id), пример «Пшеница озимая — Интенсивная 2.0» |
| `version` | `INTEGER` | Версия | да, автоинкремент при «новой версии» |
| `status` | `TechCardStatus` | Статус | да, умолч. draft |
| `crop` | `Crop` | Культура | да |
| `organization` | `Organization` | Организация | да |
| `author` | `CustomUser` | Автор | да, авто |
| `createdAt` | `DATETIME` | Дата создания | да, авто |
| `approvedAt` | `DATETIME` | Дата утверждения | нет |
| `approvedBy` | `CustomUser` | Утвердивший | нет |
| `validFrom`/`validTo` | `DATE` | Период действия с/по | нет |
| `basedOn` | `TechCard` | Создана на основе | нет |
| `description` | `TEXT` | Описание | нет |

### CLASS TechOperation 'Операция технологической карты'
TABLE techOperation (TechOperation):
`card = DATA TechCard`, `seqNo '№' INTEGER` (порядок, CONSTRAINT>0),
`workType = DATA WorkType` (обяз.), `tempMin/tempMax DOUBLE`, `phaseTrigger =
DATA Phase` (фенологический триггер), `gapMinDays/gapMaxDays INTEGER`,
`dateFrom/dateTo DATE` (сроки), `outputRate 'Норма выработки' NUMERIC[10,2]`,
`outputUnit = DATA Unit`.

### CLASS OperationMaterial 'Материал операции'
TABLE operationMaterial: `operation = DATA TechOperation`,
`nomenclature = DATA Nomenclature` (обяз.), `rate 'Норма расхода'
NUMERIC[12,3]` (обяз.), `unit = DATA Unit` (обяз.), `method = DATA
ApplicationMethod`, `depth 'Глубина, см' NUMERIC[6,1]`, `note TEXT`.

### CLASS OperationFuel 'ГСМ операции'
TABLE operationFuel: `operation`, `nomenclature` (обяз. — тип ГСМ),
`rate NUMERIC[12,3]`, `unit`, `usageFactor 'Коэф. использования' DOUBLE`.

### CLASS OperationLabor 'Трудозатраты операции'
TABLE operationLabor: `operation`, `profession = DATA Profession` (обяз.),
`timeRate 'Норма времени' NUMERIC[10,2]` (обяз.), `unit` (обяз.),
`workersCount 'Кол-во работников' INTEGER`.

### Справочники (атрибутные составы — СТ дословно; ниже — реализуемое подмножество)

**CLASS WorkType 'Вид работы'** TABLE workType:
`name STRING[255]` (обяз.), `code STRING[12]` (обяз., уникальный, формат
`АГРО-XXX`/`ЛОГ-XXX`), `groupKind STRING[20]` (агротехнические/
логистические/иные), `kind STRING[50]` (детальная: пахота, посев, уборка...),
`season STRING[16]`, `bbch STRING[8]`, `tempMin/tempMax DOUBLE`,
`gapMinDays/gapMaxDays INTEGER`, `outputRate NUMERIC[10,2]`, `outputUnit
Unit`, `allowedCrops` — реестр `WorkTypeCrop (workType, crop)`,
`description TEXT`, `status STRING[20]`, `created/createdBy`.
⚠ Не в прототипе: совместимость с техникой/почвами, файлы документации.

**CLASS Phase 'Фаза развития (BBCH)'** TABLE phase:
`bbchCode STRING[8]` (обяз., уникальный, напр. «13»), `name STRING[100]`
(обяз., напр. «3 листа»), `phaseGroup STRING[40]` (обяз.),
`crop = DATA Crop` (обяз. — привязка фазы к культуре по СТ),
`detailLevel INTEGER` (1–3), `tempMin/tempMax DOUBLE`, `gdd INTEGER`
(градусодни), `photoperiod STRING[100]`, `durationDays INTEGER`,
`visualSigns TEXT`, `agrotechNotes TEXT`, `description TEXT`,
`status STRING[20]`, `created/createdBy`.
Реестры: `PhaseRecommendsWork (phase, workType)`, `PhaseForbidsWork (phase,
workType)`. ⚠ Не в прототипе: стресс-факторы как объекты (текстом
`stressNotes TEXT`), фотоматериалы, совместимость с моделями симуляции.

**CLASS Nomenclature 'Номенклатура'** TABLE nomenclature:
`code STRING[20]` (обяз., уникальный, `N-XXXXX`), `name STRING[255]`
(обяз.), `shortName STRING[100]`, `nomType` статик `NomType` (обяз.:
семена, удобрения, СЗР, ГСМ, запчасти, продукция, вода, электроэнергия,
отходы, прочее), `group STRING[60]` (обяз.), `subGroup STRING[60]`,
`unit = DATA Unit` (обяз.), `vatRate NUMERIC[5,2]`, `basePrice
NUMERIC[14,2]` (без НДС; валюта — только RUB, поле валюты не заводим),
`okpd2 STRING[20]`, `minStock NUMERIC[12,3]`, `shelfLifeDays INTEGER`,
`storageTerms TEXT`, — специфические параметры СТ (сорт, всхожесть, ДВ%,
класс опасности, тип ГСМ и т.п.) — компактно: `spec TEXT` (свободный
набор «параметр: значение»), ключевые для расчётов заводим при
необходимости в KuBudget/KuYield; `description TEXT`, `status STRING[20]`,
`created/createdBy`. ⚠ Не в прототипе: файлы, ТН ВЭД, внешние
идентификаторы (кроме `gosRegistryCode STRING[24]` — Госреестр/ФГИС).

**CLASS Unit 'Единица измерения'** TABLE unit:
`okeiCode STRING[8]` (обяз., уникальный), `name STRING[100]` (обяз.),
`symbol STRING[10]` (обяз., «кг», «га», «л», «ц»), `unitGroup STRING[16]`
(обяз.: масса/площадь/объём/время/проценты/прочее), `unitKind STRING[12]`
(основная/производная), `baseUnit = DATA Unit`, `factor NUMERIC[14,6]`
(коэффициент к базовой), `isInteger BOOLEAN`, `formatMask STRING[16]`,
`description TEXT`, `status STRING[20]`. ⚠ Не в прототипе:
доменные ограничения применения, коды ISO/ФГИС (поля `isoCode STRING[8]`
достаточно).

**CLASS ApplicationMethod 'Метод внесения'** TABLE applicationMethod:
`code STRING[12]` (обяз., уникальный, `MV-XXX`), `name STRING[100]`
(обяз.), `applyKind STRING[20]` (обяз.: поверхностное/глубокое/ленточное/
точечное/капельное/воздушное), `resourceKind STRING[16]` (обяз.:
удобрения/СЗР/семена/известкование/прочее), `season STRING[16]`,
`depthRange STRING[16]` (напр. «5-10»), `speed NUMERIC[6,2]` (км/ч),
`widthM NUMERIC[8,2]` (захват, м), `tempMin/tempMax DOUBLE`,
`moistRange STRING[16]`, `description TEXT`, `status STRING[20]`,
`created/createdBy`. Реестр `MethodCrop (method, crop)` — рекомендуемые
культуры. ⚠ Не в прототипе: требуемая техника, совместимость с почвами.

**CLASS Profession 'Профессия'** TABLE profession:
`code STRING[16]` (обяз., уникальный, `PROF-XXX`), `name STRING[100]`
(обяз.), `shortName STRING[50]`, `category STRING[30]` (обяз.:
руководители/специалисты/рабочие/вспомогательные), `profGroup STRING[40]`
(обяз.: агрономическая/механизаторская/финансовая/логистика/прочее),
`qualGroup STRING[16]`, `okzCode STRING[12]`, `education STRING[40]`
(обяз.), `speciality STRING[100]`, `experience STRING[60]`, `skills TEXT`,
`duties TEXT`, `baseRate NUMERIC[12,2]` (руб/час), `rateUnit = DATA Unit`,
`description TEXT`, `status STRING[20]`, `created/createdBy`. ⚠ Не в
прототипе: сертификаты как объекты, права/зоны ответственности (текстом
в `duties`), тип занятости, файлы.

Сид: 2–3 техкарты (пшеница озимая интенсивная, кукуруза, пар сидеральный)
по 6–10 операций с материалами/ГСМ/трудозатратами; справочники —
15 видов работ, ~20 фаз BBCH, 15–20 номенклатуры, 12 ед. (ОКЕИ),
6 методов внесения, 6 профессий.

## 5. KuProdPlan — годовой план и акт урожая (`ProdPlan.lsf`)

`NAMESPACE Ku; REQUIRE KuRotation, KuTechCard, KuLand, Authentication;`

### CLASS ProdPlanStatus (статик) { draft 'Черновик', approved 'Утвержден', archived 'Архивный' }

### CLASS ProdPlan 'Годовой производственный план'
TABLE prodPlan (ProdPlan): `number STRING[20]` (обяз., формат
`ГП-ГГГГ-XXX`, генерировать), `planYear INTEGER` (обяз.),
`status ProdPlanStatus` (умолч. draft), `version INTEGER` (умолч. 1),
`author CustomUser`, `createdAt DATETIME`, `approvedAt DATETIME`,
`approvedBy CustomUser`, `approvalNote TEXT 'Комментарий к утверждению'`,
`archivedAt DATETIME`, `archiveReason TEXT`, `rotationPlan = DATA
RotationPlan` (обяз. — утверждённая версия долгосрочного плана).
Интеграционные атрибуты СТ (индикатор синхронизации, время, связанные
документы) — не заводим (прототип, 05).

### CLASS ProdPlanItem 'Назначение (поле и культура)'
TABLE prodPlanItem: `plan = DATA ProdPlan`, `field = DATA Field` (обяз.),
`areaHa NUMERIC[10,2]` (READONLY-умолчание из поля), `crop = DATA Crop`
(обяз., умолчание — культура из строки плана севооборота на planYear),
`techCard = DATA TechCard` (обяз., фильтр по культуре и статус
«Утверждена»), `techCardVersion INTEGER` (READONLY из карты),
`deviationNote TEXT 'Отклонения от плана'`. CONSTRAINT (plan, field)
уникален.

### CLASS HarvestActStatus (статик) { draft 'Черновик', posted 'Проведён' }

### CLASS HarvestAct 'Акт учёта урожая'
TABLE harvestAct: `number STRING[20]` (формат `АУ-ГГГГ-XXXX`, авто),
`createdAt DATETIME`, `postedAt DATETIME`, `status HarvestActStatus`
(умолч. draft), `author CustomUser`, `postedBy CustomUser`, `note TEXT`,
`prodPlan = DATA ProdPlan` (обяз.).

### CLASS HarvestActItem 'Фактические данные акта'
TABLE harvestActItem: `act = DATA HarvestAct`, `field = DATA Field`
(обяз.), `crop = DATA Crop` (обяз.), `grossWeight NUMERIC[12,3] 'Валовой
вес, т'` (обяз.), `moisture NUMERIC[5,2] 'Влажность, %'` (обяз.),
`impurity NUMERIC[5,2] 'Сорность, %'` (обяз.), `netWeight NUMERIC[12,3]
'Зачётный вес, т'` (**расчётный** — формула-допущение в 03-logic),
`factYield 'Урожайность факт, т/га'` (расчётный), `planYield 'Урожайность
план, т/га'` (READONLY из годового плана), `devAbs/devPct` (расчётные:
абсолютное т/га и %), `gradeCode STRING[24] 'Класс/сорт (Госреестр)'`
(обяз.), `purpose статик { seed 'Семенной', food 'Продовольственный',
feed 'Фуражный' }` (обяз.), `threshFloorNo STRING[30] 'Номер акта на
току'` (обяз.), `dataSource статик { scale 'Весовой комплекс', combine
'Комбайн', manual 'Ручной ввод' }` (обяз.). Атрибутика «интеграции и
аудита» (публикация события, журнал изменений) — не заводим (05).

Сид: годовой план на следующий год по сид-плану севооборота (все поля
получили культуру + ТК), 2 акта урожая (один проведён, один черновик;
в одном поле — отклонение от плана >10%).

## 6. KuBudget — цены и бюджеты (`Budget.lsf`)

`NAMESPACE Ku; REQUIRE KuTechCard, KuProdPlan, Authentication;`

### CLASS PriceScenarioStatus (статик) { draft 'Черновик', approved 'Утверждён', archived 'Архивный' }
### CLASS DocCalcStatus (статик) { draft 'Черновик', calculated 'Рассчитан', approved 'Утверждён' }

### CLASS PriceScenario 'Сценарий цен'
TABLE priceScenario: `name STRING[255]` (обяз.), `validFrom/validTo DATE`
(обяз.), `status PriceScenarioStatus`, `version INTEGER` (умолч. 1),
`created/createdBy`, `approvedAt/approvedBy`, `basedOn = DATA
PriceScenario`, `copyFactor NUMERIC[8,4] 'Коэффициент копирования'`.

### CLASS PriceScenarioItem 'Цены по номенклатуре'
TABLE priceScenarioItem: `scenario = DATA PriceScenario`,
`nomenclature = DATA Nomenclature` (обяз.), `price NUMERIC[14,2]`
(обяз.); `unit` — READONLY из номенклатуры; валюта — только RUB (поле не
заводим). CONSTRAINT (scenario, nomenclature) уникален.

### CLASS ServiceLog 'Журнал операций модуля'
TABLE serviceLog: `operKind STRING[40]` (создание/утверждение/версия...),
`subject = DATA CustomUser`, `objectKind STRING[30]`, `objectId STRING[36]`,
`at DATETIME`, `details TEXT` (JSON), `isError BOOLEAN`, `errorMessage
STRING[250]`. Единый журнал на все документы KuBudget (вместо четырёх
сущностей «журнал/событие» СТ; бизнес-события шины — 05).

### CLASS MtrPlan 'План потребности в МТР'
TABLE mtrPlan: `prodPlan = DATA ProdPlan` (обяз.), `priceScenario = DATA
PriceScenario` (обяз.), `status DocCalcStatus`.
### CLASS MtrPlanItem: `plan = DATA MtrPlan`, `monthNo INTEGER` (1–12,
обяз.), `nomenclature = DATA Nomenclature` (обяз.), `qty NUMERIC[14,3]`
(обяз.), `unit` READONLY.

### CLASS BudgetPL 'БДР'
TABLE budgetPL: `prodPlan`, `priceScenario` (обяз.), `status DocCalcStatus`.
### CLASS BudgetPLItem: `budget = DATA BudgetPL`, `costItem = DATA
CostItem` (обяз.; тип доход/расход — READONLY из статьи), `monthNo
INTEGER` (обяз.), `amount NUMERIC[16,2]` (обяз.), `crop = DATA Crop`
(нет — распределение по культурам).

### CLASS BudgetCF 'БДДС'
TABLE budgetCF: `budgetPL = DATA BudgetPL` (обяз.), `status DocCalcStatus`.
### CLASS BudgetCFItem: `budget = DATA BudgetCF`, `monthNo INTEGER`,
`moveKind статик { income 'Поступление', payment 'Выплата' }`, `amount
NUMERIC[16,2]`, `source STRING[100] 'Источник/получатель'`,
`paymentTerm = DATA PaymentTerm` (обяз.).

### Справочники
**CLASS PaymentTerm 'Условие оплаты'** TABLE paymentTerm: `code
STRING[20]` (обяз., уникальный, `PAY-01`), `name STRING[255]` (обяз.),
`shortName STRING[100]`, `payKind статик { prepay 'Предоплата', deferral
'Отсрочка', onFact 'Оплата по факту' }` (обяз.), `prepayPercent
NUMERIC[5,2]`, `deferralDays INTEGER`, `overdueDays INTEGER 'Порог
просрочки'`, `penaltyPercent NUMERIC[5,2] 'Штраф, %/день'`, `status
STRING[20]`, `created/createdBy`.
**CLASS CostItem 'Статья затрат'** TABLE costItem: `code STRING[20]`
(обяз., уникальный, `EXP-001`), `name STRING[255]` (обяз.),
`shortName STRING[100]`, `itemKind статик { income 'Доход', expense
'Расход' }` (обяз.), `groupKind STRING[60]` (обяз.: прямые материалы,
прямой труд, ОПР, коммерческие, управленческие, доходы от реализации),
`subGroup STRING[60]`, `accountPlan STRING[20] 'Рубрика плана счетов'`,
`status STRING[20]`, `created/createdBy`.

Сид: сценарий «Базовый 2027» (15–25 цен из номенклатуры), статьи затрат
8–10 (семена, удобрения, СЗР, ГСМ, ФОТ, амортизация, доходы зерно/масличные),
условия оплаты 3–4, рассчитанные МТР/БДР/БДДС по сид-плану (демо
сценарного анализа: второй сценарий цен «Оптимистичный» с коэффициентом).

## 7. KuLand — земельный банк, полный состав (`Land.lsf`, продолжение §2)

### CLASS LandPlot 'Земельный участок' (полный, вместо каркаса §2)
TABLE landPlot: `cadastralNumber STRING[40]` (обяз., уникальный, формат
`XX:XX:XXXXXX:XXX`, CONSTRAINT по маске), `name STRING[60]`,
`polygonGeoJson TEXT 'Полигон (GeoJSON)'`, `areaSqm NUMERIC[14,2]
'Площадь, кв.м'` (обяз., ≥1), `pkkUrl STRING[500] 'Ссылка на ПКК'`,
`plotStatus статик { free 'Свободен', leased 'В аренде', encumbered 'Под
обременением', disputed 'Спорный' }` (обяз.), `encumbrance TEXT
'Обременения (JSON)'` (обяз. если статус = encumbered),
`egrnExtract RAWFILE 'Выписка ЕГРН'` (обяз.), `organization =
DATA Organization` (обяз.), `created/createdBy`.
Химанализ участка — через SoilAnalysis (ниже) и Field.

### CLASS LeaseContractStatus (статик) { draft 'Черновик', active 'Действует', expired 'Истёк', terminated 'Расторгнут досрочно' }
### CLASS ContractorKind (статик) { person 'Физическое лицо',
entrepreneur 'ИП', company 'Юридическое лицо', government 'Гос. орган',
foreign 'Иностранное лицо' }
### CLASS LeaseContract 'Договор аренды'
TABLE leaseContract: `number STRING[40] 'Номер'` (обяз.), `signDate DATE
'Дата заключения'` (обяз.), `status LeaseContractStatus` (обяз.),
`tenant = DATA Contractor 'Арендатор'` (обяз.), `tenantKind
ContractorKind`, `landlord = DATA Contractor 'Арендодатель'` (обяз.),
`landlordKind ContractorKind`, `plot = DATA LandPlot` (обяз.),
`isPartial BOOLEAN 'Арендована часть участка'` (обяз.), `partialAddress
STRING[200]` (если isPartial), `partialAreaHa NUMERIC[10,2]` (если
isPartial), `dateFrom/dateTo DATE 'Срок действия'` (обяз.),
`autoProlong BOOLEAN`, `rentAmount NUMERIC[14,2] 'Размер арендной платы'`
(обяз.), `periodicity статик { weekly 'Еженедельно', monthly
'Ежемесячно', quarterly 'Ежеквартально', yearly 'Ежегодно' }` (обяз.),
`paymentDay DATE 'День платежа'` (обяз.), `paymentMethod STRING[30]
'Способ оплаты'` (обяз.), `indexation STRING[30] 'Порядок индексации'`
(обяз.), `scan RAWFILE 'Скан договора'`, `addendum RAWFILE 'Доп.
соглашения'`, `organization` (обяз.), `created/createdBy`.
CONSTRAINT dateTo > dateFrom.

### CLASS Contractor 'Контрагент (юр/физлицо)'
TABLE contractor: `contractorKind ContractorKind` (обяз.), `status
статик { active, archived, liquidated, reorganizing, contested }`,
`inn STRING[12] 'ИНН'` (обяз., уникальный, длина 10/12 по типу —
контрольную сумму ФНС в прототипе проверяем только по длине),
`fullName STRING[255]` (обяз.; для физлиц — ФИО), `shortName
STRING[100]`, `lastName/firstName/middleName STRING[60]` (физлица),
`birthDate DATE`, `snils STRING[14]`, `citizenship STRING[8] 'Гражданство
(ОКСМ)'`, `passport TEXT 'Паспорт (JSON)'`, `kpp STRING[9]`, `ogrn
STRING[15] 'ОГРН/ОГРНИП'` (уникальный), `okpo STRING[10]`, `opf
STRING[20] 'Правовая форма'`, `legalAddress STRING[255] 'Юридический
адрес'`, `postalAddress STRING[255]`, `director TEXT 'Руководитель
(JSON)'`, `contacts TEXT 'Контакты (JSON)'`, `bankAccounts TEXT 'Счета
(JSON)'`, `created/createdBy`. Шифрование персданных и audit-trail ФЗ-152
— 05.

### CLASS SoilAnalysis 'Агрохиманализ'
TABLE soilAnalysis: `analysisDate DATE` (обяз.), `field = DATA Field`
(обяз. — прототип-решение: анализ привязан к полю; в СТ таблица без
поля, но сценарий и справочник полей предполагают связь), `n DOUBLE
'N, мг/кг'` (обяз., ≥0), `p DOUBLE 'P, мг/кг'` (обяз.), `k DOUBLE 'K,
мг/кг'` (обяз.), `ph DOUBLE 'pH'` (обяз., ≥0), `humus INTEGER 'Гумус, %'`
(обяз., 0–100), `document RAWFILE 'Документ'`, `created/createdBy`.

### Аренда: взаиморасчёты (ФТ3.7)
`CLASS LeaseEntry 'Запись взаиморасчётов'` TABLE leaseEntry: `contract =
DATA LeaseContract`, `contractor` (READONLY из договора), `organization`
(READONLY), `entryKind статик { obligation 'Начисление', payment
'Оплата' }`, `amount NUMERIC[16,2]` (обяз.), `entryDate DATE` (обяз.),
`sourceDoc STRING[40]`. Сальдо/задолженность — расчётные GROUP SUM
(03-logic), отдельного «регистра накопления» в LSfusion не нужно.
`CLASS PaymentSheetStatus (статик) { draft 'Черновик', approved 'Утверждена' }`
`CLASS PaymentSheet 'Платёжная ведомость'` TABLE paymentSheet:
`organization`, `periodFrom/periodTo DATE` (обяз.), `responsible =
DATA CustomUser`, `status PaymentSheetStatus`.
`CLASS PaymentSheetItem` TABLE paymentSheetItem: `sheet = DATA
PaymentSheet`, `contract = DATA LeaseContract` (обяз.), `contractor`
(READONLY), `accrued NUMERIC[16,2] 'Начислено'` (READONLY — расчёт по
LeaseEntry), `debt NUMERIC[16,2] 'Задолженность'` (READONLY), `toPay
NUMERIC[16,2] 'К выплате'` (редактируемое), `adjustReason STRING[200]`
(обяз. если toPay ≠ accrued+debt).

### CLASS LeaseNotification 'Уведомление по договору'
TABLE leaseNotification: `contract = DATA LeaseContract` (обяз.),
`notifyKind статик { rent 'Арендная плата', expiry 'Окончание договора' }`
(обяз.), `daysBefore INTEGER 'За сколько дней'` (обяз.), `channel
STRING[20]` (умолч. 'system'; Telegram — 03-logic), `enabled BOOLEAN`.

Сид: 8–10 участков с кадастровыми номерами, 6–8 контрагентов (2 юр, 4
физ), 5–6 договоров (один истекает <90 дней, один с просрочкой платежа),
агрохиманализы на все поля, 3–4 записи взаиморасчётов + ведомость.

## 8. KuYield — программирование урожая (`Yield.lsf`)

`NAMESPACE Ku; REQUIRE KuCrop, KuLand, KuBudget, Weather,
WeatherOpenWeatherMap, Authentication;`

### CLASS YieldPlanStatus (статик) { draft 'Черновик', approved 'Утвержден', archived 'Архив' }
### CLASS ComplexPlan 'Комплексный план (интерактивный)'
TABLE complexPlan: `field = DATA Field` (обяз.), `crop = DATA Crop`
(обяз.), `variety STRING[100] 'Сорт/гибрид'` (обяз.; отдельный
справочник сортов — 05, в прототипе строка), `priceScenario = DATA
PriceScenario` (обяз.), `targetYield NUMERIC[10,2] 'Целевая
урожайность, ц/га'` (обяз.), `status YieldPlanStatus`, `version
INTEGER`, `soilAnalysis = DATA SoilAnalysis 'Срез агрохиманализа'`
(обяз.), `warnings TEXT 'Предупреждения (JSON)'`, `marginPercent
NUMERIC[6,2] 'Маржинальность, %'` (**расчётный**), `created/createdBy`.

### CLASS NutrientBalance 'Баланс питательных веществ'
TABLE nutrientBalance: `plan = DATA ComplexPlan`, `element статик { n
'Азот', p 'Фосфор', k 'Калий' }`, `removalPerTon NUMERIC[8,3] 'Вынос,
кг/т'` (обяз.; умолчание — из Crop.geneticCoeffs/агрономических
коэффициентов сидов), `soilReserve NUMERIC[10,2] 'Запас в почве, кг/га'`
(расчёт из SoilAnalysis, редактируемое переопределение — прототип:
DATA + авто-заполнение), `soilAssimilation NUMERIC[5,2] 'Усвоение из
почвы, %'`, `fertAssimilation NUMERIC[5,2] 'Усвоение из удобрений, %'`,
`requiredDoseAi NUMERIC[10,2] 'Потребность, кг д.в./га'` (**расчётный**,
балансовая формула — 03-logic, ⚠ допущение прототипа).

### CLASS SeasonalTechCard 'Сезонная техкарта (фактическая)'
TABLE seasonalTechCard: `complexPlan = DATA ComplexPlan` (обяз.),
`templateTechCard = DATA TechCard 'Шаблон'` (обяз.), `field` (READONLY из
плана), `status статик { formed 'Сформирована', agreed 'Согласована',
inWork 'В работе' }`.
`CLASS SeasonalOperation` TABLE seasonalOperation: `card = DATA
SeasonalTechCard`, `workType = DATA WorkType` (обяз.), `phase = DATA
Phase`, `plannedDate DATE`.
`CLASS SeasonalMaterial` TABLE seasonalMaterial: `operation = DATA
SeasonalOperation`, `nomenclature = DATA Nomenclature` (обяз.),
`method = DATA ApplicationMethod`, `doseAi NUMERIC[10,2] 'Доза д.в./га'`,
`dosePhysical NUMERIC[10,2] 'Физическая доза'` (**расчётный** из ДВ%
номенклатуры), `unit = DATA Unit`.

### CLASS GenTaskStatus (статик) { queued 'В очереди', running
'Выполняется', done 'Завершено', error 'Ошибка' }
`CLASS GenerationTask 'Задача фоновой генерации'` TABLE generationTask:
`taskKind статик { techcard 'Генерация ТЗ', shapefile 'Shapefile',
isoxml 'ISO-XML' }`, `complexPlan = DATA ComplexPlan`,
`seasonalCard = DATA SeasonalTechCard` (одно из двух обязательно),
`status GenTaskStatus`, `resultFile RAWFILE` (прототип: файл в БД вместо
S3, 05), `errorLog TEXT`, `created/createdBy`.
`CLASS PrescriptionFile 'Файл-предписание'` TABLE prescriptionFile:
`operation = DATA SeasonalOperation`, `field = DATA Field` (READONLY),
`zoningSrc STRING[60] 'Источник зонирования'`, `zonesGeoJson TEXT`,
`fileFormat STRING[10] 'SHP/ISOXML/JSON'`. Генерация реальных
SHP/ISO-XML — упрощённо JSON (05).

### База знаний и корректирующие мероприятия (ФТ4.2)
`CLASS KbRule 'Правило базы знаний'` TABLE kbRule: `stressType = DATA
StressType` (обяз., справочник — в KuSimulation §9), `crop = DATA Crop`
(NULL = универсально), `minBbch STRING[8]`, `maxBbch STRING[8]`,
`nomenclature = DATA Nomenclature` (обяз.), `workType = DATA WorkType`
(обяз.), `method = DATA ApplicationMethod` (обяз.), `priority INTEGER`
(обяз.), `assimilationCoeff NUMERIC[5,2]`, `needsWeatherWindow BOOLEAN`.
`CLASS RecommendationStatus (статик) { new 'Новая', approved
'Утверждена', rejected 'Отклонена', error 'Ошибка' }`
`CLASS CorrectionRecommendation 'Комплексная рекомендация'` TABLE
correctionRecommendation: `stressEventId STRING[36] 'ID события-
триггера'` (в прототипе создаётся вручную/сидом; шина — 05), `field`
(обяз.), `crop` (обяз.), `currentPhase = DATA Phase`, `priceScenario`
(обяз.), `status RecommendationStatus`, `analysisText TEXT 'Обоснование'`
(прототип: эвристический текст вместо LLM — 05), `totalCost
NUMERIC[14,2] 'Затраты, руб/га'` (расчётный), `expectedBenefit
NUMERIC[14,2] 'Выгода, руб/га'` (расчётный), `netEffect NUMERIC[14,2]`
(расчётный), `logisticsWarnings TEXT`, `decidedBy = DATA CustomUser`,
`decisionComment TEXT`, `created/createdBy`.
`CLASS CorrectionItem 'Спецификация мероприятия'` TABLE correctionItem:
`recommendation = DATA CorrectionRecommendation`, `nomenclature`,
`workType`, `method` (обяз.), `requiredAiDose NUMERIC[10,2]`,
`physicalDose NUMERIC[10,2]` (**расчётный**: AiDose / (ДВ%/100 ×
коэф.усвоения)), `unit = DATA Unit`, `pricePerUnit NUMERIC[14,2]`
(READONLY из сценария цен), `operationCost NUMERIC[14,2]` (расчётный).

### Калибровка моделей (ФТ4.3) — КАРКАС (статусы и структура без LLM)
`CLASS CalibrationSession` TABLE calibrationSession: `seasonYear
INTEGER`, `crop = DATA Crop` (обяз.), `expert = DATA CustomUser`,
`status статик { initiated 'Инициирована', aggregating 'Агрегация
данных', awaitingDecision 'Ожидание решения', completed 'Завершена',
error 'Ошибка' }`, `llmModel STRING[30]` (справочно), `created/
completed DATETIME`. Снимок данных/отчёт LLM/журнал НСИ — не заводим (05).
`CLASS CalibrationProposal` TABLE calibrationProposal: `session = DATA
CalibrationSession`, `coeffCode STRING[40]` (обяз., напр.
`Kp_soil`), `coeffDescription TEXT`, `currentValue DOUBLE`,
`proposedValue DOUBLE`, `justification TEXT`, `decision статик {
approved 'Утверждено', rejected 'Отклонено', corrected 'Скорректировано' }`,
`finalValue DOUBLE`, `expertComment TEXT`. Коэффициенты применяются в
NutrientBalance/модели (03-logic).

### Оптимизация графика обеспечения (ФТ4.4) — КАРКАС
`CLASS OptimizationSession` TABLE optimizationSession: `triggerEvent
STRING[60]`, `horizonHours INTEGER`, `objective TEXT 'Веса целевой
функции (JSON)'`, `snapshotAt DATETIME`, `status статик { queued,
running, done, error }`, `prodPlan = DATA ProdPlan`, `errorLog TEXT`.
`CLASS MtrRequest 'Заявка на обеспечение МТР'` TABLE mtrRequest:
`session = DATA OptimizationSession`, `status статик { formed
'Сформирована', sent 'Отправлена в ERP', done 'Исполнена', rejected
'Отклонена' }`, `field = DATA Field` (обяз.), `requiredBy DATETIME`.
`CLASS MtrRequestItem`: `request = DATA MtrRequest`, `nomenclature`,
`unit`, `qty NUMERIC[14,3]`, `workType` (опц.).
`CLASS RoutingTask 'Маршрутное задание'` TABLE routingTask: `session`,
`equipmentId STRING[40] 'ID телематики'`, `equipmentKind STRING[30]
'Тип техники'`, `status статик { planned 'Запланировано', awaitingSync
'Ожидает синхронизации', cancelled 'Отменено' }`.
`CLASS RoutingStep` TABLE routingStep: `task = DATA RoutingTask`,
`field = DATA Field`, `workType = DATA WorkType` (обяз.), `startTime/
endTime DATETIME` (обяз.), `expectedVolume NUMERIC[12,2]`,
`syncWith = DATA RoutingStep` (связка «бункер-грузовик»).
`CLASS CollisionLog 'Коллизия/предупреждение'` TABLE collisionLog:
`session`, `collisionKind статик { weather 'Погода', mtrDeficit
'Дефицит МТР', elevatorOverload 'Перегрузка элеватора', noDriver
'Нет водителя' }`, `severity статик { critical 'Критично', warning
'Предупреждение' }`, `field` (опц.), `nomenclature` (опц.),
`description TEXT` (обяз.), `suggestedAction TEXT`.
Заполнение — простая эвристика в 03-logic; VRP-солвер — 05.

## 9. KuSimulation — симуляция (`Simulation.lsf`)

`NAMESPACE Ku; REQUIRE KuRotation, KuLand, KuCrop, Scheduler;`

### CLASS SimTaskStatus (статик) { queued 'В очереди', processing 'В
обработке', done 'Успешно завершена', error 'Ошибка выполнения',
cancelled 'Отменена' }
`CLASS SimTask 'Задача моделирования'` TABLE simTask: `field = DATA
Field` (обяз.), `createdAt DATETIME`, `plannedAt DATETIME`, `taskKind
статик { planned 'Плановая', manual 'Ручная' }`, `horizonDays INTEGER`
(обяз.), `status SimTaskStatus`, `finishedAt DATETIME`, `errorReason
TEXT`, `sourceRef STRING[60] 'Связанный план (тип+код)'` (упрощение
вместо полиморфной ссылки).

### CLASS SimResultStatus (статик) { active 'Активный', archived
'Архивный', onApproval 'На утверждении' }
`CLASS SimResult 'Результат моделирования'` TABLE simResult: `simTask =
DATA SimTask` (обяз.), `sessionGuid STRING[36]`, `field` (READONLY из
задачи), `crop = DATA Crop` (обяз.), `variety STRING[100]`, `calcAt
DATETIME`, `forecastKind статик { basic 'Базовый', scenario 'Сценарный',
corrective 'Корректирующий' }`, `horizonDays INTEGER`, `modelName
STRING[40]` (в прототипе — 'KuGDD-1.0', см. 03-logic), `status
SimResultStatus`.
`CLASS SimResultPoint 'Точка временного ряда'` TABLE simResultPoint:
`result = DATA SimResult`, `pointDate DATE` (обяз.), `biomass
NUMERIC[10,3] 'Биомасса, т/га'`, `ndvi NUMERIC[6,3]`, `phaseCode
STRING[8] 'Фаза (BBCH)'`, `waterUse NUMERIC[8,2] 'Вода, мм/день'`,
`nUse/pUse/kUse NUMERIC[8,2] 'N/P/K, кг/га/день'`, `yieldForecast
NUMERIC[10,2] 'Прогноз урожайности, ц/га'`. CONSTRAINT (result,
pointDate) уникален.

`CLASS ScenarioRun 'Задача сценарного анализа'` TABLE scenarioRun:
`field = DATA Field` (обяз.), `baseResult = DATA SimResult` (опц.),
`scenarioKind статик { fertilizing 'Внесение удобрений', drought
'Засуха', irrigation 'Орошение', pest 'Поражение вредителями/болезнями',
sowDate 'Изменение даты сева' }` (обяз.), `pElement статик { n, p, k }`
(для fertilizing), `pDose NUMERIC[10,2]`, `pAppDate DATE`, `pStartDate
DATE` (drought/pest), `pDays INTEGER` (drought), `pIrrDate DATE`,
`pIrrMm NUMERIC[8,2]` (irrigation), `pPestPercent NUMERIC[5,2]` (pest),
`pNewSowDate DATE` (sowDate), `createdAt DATETIME`, `status SimTaskStatus`
(без cancelled), `finishedAt`, `errorReason`, `result = DATA SimResult`
(заполняется по завершении). Параметры — плоские поля (прототип-решение
вместо «структуры параметров» СТ).

`CLASS StressType 'Тип стресса'` TABLE stressType: `name STRING[60]`
(обяз.), `description TEXT`, `status STRING[20]`. Используется KbRule
(KuYield) и результатами анализа отклонений (сервис выявления отклонений
целиком — 05).

Сид: справочник стрессов (засуха, заморозок, дефицит N, вредители,
болезни), 2–3 выполненные задачи с результатами (GDD-модель) на
сид-полях, один сценарный прогон «Засуха 14 дней» с результатом для
сравнения с базовым.

## 10. Модуль 4 «Отчётность и аналитика» — вне модели прототипа

Сущности СТ (реестр для `05-deferred.md`): конвейер ETL, журнал
выполнения, карантин записей, таблицы DWH (Dimension SCD2/Fact/DataMart/
метаданные), шаблон отчёта, задача генерации отчёта, конфигурация слоя
карты, закладка карты. В прототипе KuAnalytics (`Analytics.lsf`) новых
классов-сущностей не заводит: Jasper-отчёты и Grafana-дашборды
строятся напрямую по данным Ku* (образцы — `GrafanaDashboard`,
`reports/*.jrxml`); перечень отчётов и дашбордов — `04-ui.md`.

## 11. Правила для генерации (сводка)

1. Все новые классы — только в модулях `Ku*`, `NAMESPACE Ku;`.
2. Каждый класс: `TABLE`, бизнес-код с уникальностью, `created/createdBy`
   (авто при NEW), `status` строкой с умолчанием «Активен».
3. Статусы документов — статик-классы; переходы — только действиями
   (03-logic), прямое редактирование статуса в формах — READONLY.
4. Реестры many-to-many — отдельные классы с `TABLE`.
5. CONSTRAINT'ы диапазонов (бонитет 1–100, горизонт 1–10, seqNo>0) —
   `CONSTRAINT ... MESSAGE` по конвенции `00-context.md` §4.1.
6. Сиды — идемпотентные, guard по кодам; значения подбираются так, чтобы
   демонстрировать валидации (нарушения севооборота в сид-плане!).
