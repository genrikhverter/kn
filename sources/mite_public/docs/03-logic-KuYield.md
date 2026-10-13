# 03-logic. KuYield — программирование урожая (`Yield.lsf`)

> Модель — `02-data-model.md` §8. Источник — СТ ФТ4.1.1–4.4.4.
> Статусы: 4.1 — У (балансовый метод упрощён), 4.2 — У, 4.3 — К,
> 4.4 — К. Все формулы — ⚠ допущения прототипа (уточнить агрономом).

## 1. Балансовый расчёт NPK (ФТ4.1.1)

`recalcNutrients (ComplexPlan p)` — по каждому элементу N/P/K:
1. `removalPerTon` — из агрокоэффициентов культуры (в прототипе — сид
   в `Crop.geneticCoeffs` JSON: `removalN/P/K`, кг/т; разбор — при
   генерации завести отдельные READONLY-поля `cropRemovalN (Crop)` с
   GROUP MAX по JSON не нужен — прототип: три числовых DATA-поля на
   Crop, добавляемые KuCrop-сидом; зафиксировать в коде комментарием).
2. `plannedRemoval = targetYield/10 × removalPerTon` (т/га → кг/га).
3. `soilReserve = мг/кг × плотность × 22` (плотность почвы — константа
   1.2 г/см³, слой 22 см; ⚠ классика: запас кг/га = мг/кг × d × h × 0.1
   — при генерации проверить размерность и зафиксировать одну формулу).
4. `usableSoil = soilReserve × soilAssimilation/100`.
5. `requiredDoseAi = max(0, plannedRemoval − usableSoil)` — доза д.в.
6. Экономика: `fertCost = requiredDoseAi / (ДВ%/100) × price(scenario,
   номенклатура-носитель)`; `income = targetYield/10 × price(продукция)`;
   `marginPercent = (income − fertCost − прочие расходы из БДР-строк
   поля)/income × 100` (прочие — упрощённо из BudgetPLItem по культуре;
   если БДР нет — только удобрения; ⚠ допущение).
`warnings`: урожайность > targetYield культуры × 1.3 → «недостижимо»;
pH поля вне диапазона культуры → предупреждение; дефицит без носителя
в номенклатуре → предупреждение.

## 2. «Что-если» (ФТ4.1.2)

Форма-калькулятор: изменение targetYield/сценария пересчитывает п.1
кнопкой «Рассчитать» (без сохранения — параметр формы, затем
«Сохранить как версию» → version+1 draft-копия).

## 3. Утверждение и сезонная ТК (ФТ4.1.3)

`approveComplexPlan (p)`: нет critical warnings → approved; автоматом:
- `NEW GenerationTask { techcard }` + `generateSeasonalCard (p)`:
  `NEW SeasonalTechCard { complexPlan <- p; templateTechCard <-`
  выбор пользователя (форма INPUT); FOR операций шаблона —
  `SeasonalOperation` (даты по `plannedDate` шаблона + смещение к дате
  сева текущего года); FOR материалов: если тип «Удобрения» и элемент
  совпадает — доза пересчитывается из NutrientBalance (`doseAi`,
  `dosePhysical = doseAi / (ДВ%/100)`), остальное копируется;
- сезонная карта → статус `formed`.

## 4. Файл-предписание (ФТ4.1.4, У)

`generatePrescription (SeasonalOperation o)`: NEW GenerationTask
{shapefile→json}; результат: `PrescriptionFile { zonesGeoJson <-` один
полигон поля из `Field.boundaryGeoJson` (или bbox-прямоугольник по
центру, если границ нет — ⚠ допущение) с атрибутом дозы; `resultFile <-
EXPORT` JSON-файла. SHP/ISO-XML — 05.

## 5. Корректирующие мероприятия (ФТ4.2)

`matchKbRules (Field f, StressType s)` = GROUP MAX KbRule ORDER
priority WHERE stressType=s AND (crop IS NULL OR crop=currentCrop(f))
AND фаза поля в [minBbch..maxBbch] (фаза поля — из последнего
SimResultPoint, если есть, иначе пропуск критерия).
`createCorrection (f, s)`: NEW CorrectionRecommendation: правило →
CorrectionItem (дозы по формуле п.1 для дефицитного элемента или
фикс-доза правила); `totalCost` = Σ price×physicalDose + 300 руб/га
операция (⚠ константа); `expectedBenefit` = доля спасения 30% ×
доход поля (⚠ допущение); `netEffect`; `analysisText` — шаблонная
строка «Стресс: …; рекомендация: …; экономика: …» (LLM — 05).
`approve/rejectCorrection` — решения агронома; approved → SeasonalCard
добавляется операция коррекции (NEW SeasonalOperation + Material).

## 6. Калибровка (ФТ4.3, К)

Каркас без LLM: экспериментатор создаёт сессию, вручную добавляет
`CalibrationProposal` (current из действующих констант модели),
решает; `finalValue` утверждённых предложений применяется: константы
модели роста (KuSimulation) хранит таблица `ModelCoeff` (code, value) —
вводится при генерации KuSimulation, `applyProposal` обновляет value.
Снимок DWH/отчёт LLM/журнал НСИ — 05.

## 7. Оптимизация графика (ФТ4.4, К)

`runOptimization (ProdPlan p)`: NEW OptimizationSession; эвристика
(⚠ вместо VRP): FOR сезонных операций плана по полям —
- `MtrRequest` на материалы операций (qty из сезонных карт,
  requiredBy = plannedDate − 2 дня);
- `RoutingTask` на технику-константу (по типу работы: «Уборка» →
  «Комбайн №1» — сид-справочник строк в ModelCoeff или текст);
  шаги `RoutingStep` — по одной операции, start=plannedDate,
  expectedVolume = норма × площадь; конфликтующие по времени операции
  на одной технике → сдвиг на +1 день и `CollisionLog {warning}`;
- коллизии: операция в дождливый день (Weather-прогноз по Location
  поля, есть интеграция) → CollisionLog {weather, critical} +
  suggestedAction «перенести на +1 день».
Никакой маршрутизации расстояний — только расписание (VRP — 05).

## 8. Сид

Комплексный план по полю «Северное-1» (пшеница, сценарий «Базовый
2027», целевая 65 ц/га) с расчётом; утверждён со сезонной картой.
StressType-стресс «Дефицит азота» → сид-рекомендация approved.
Оптимизационная сессия по сид-плану с 2 коллизиями.

## 9. Критерии приёмки

1. Балансовый расчёт: контрольный пример N (65 ц/га, вынос 30 кг/т,
   запас 30 мг/кг, усвоение 30% → потребность считать по зафиксированной
   формуле, сходится ручным пересчётом).
2. Предупреждение при pH вне диапазона культуры появляется.
3. Утверждение плана создаёт сезонную карту с пересчитанными дозами.
4. createCorrection подбирает правило по стрессу/фазе, экономика
   сходится: netEffect = benefit − cost.
5. runOptimization строит заявки/маршруты без пересечений по технике.
