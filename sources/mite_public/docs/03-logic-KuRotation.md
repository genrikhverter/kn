# 03-logic. KuRotation — логика плана севооборота (`Rotation.lsf`)

> Модель данных — `02-data-model.md` §3. Источник — СТ ФТ1.1.1–1.1.4,
> «Правила валидации», REST API (помечено в СТ как «взгляд нейросети» —
> контракты адаптированы). Статус: П. Ядро демо-сценария прототипа.

## 1. Действия и жизненный цикл (ФТ1.1.1–1.1.4)

- `newRotationPlan (Organization org)`: `NEW RotationPlan { number <-
  'СС-' + year + '-' + seq; status <- draft; author <- currentUser();
  startYear <- next year; horizonYears <- 5; version <- 1 }` + FOR полей
  org `NEW RotationPlanItem` (матрица пустая, культура года 1 — умолчание
  из `Field.currentCrop`/`lastCrop`).
- Редактирование — только `draft`: свойства матрицы `crop(item, yearNo)`
  на форме редактируемые при draft, READONLY иначе + CONSTRAINT
  `WHEN CHANGED(crop) AND status != draft → MESSAGE 'План утверждён'`.
- `validateRotationPlan (RotationPlan p)` — пересчёт нарушений, см. §2.
  Вызывается: кнопкой на форме, `WHEN CHANGED (crop(...))` (лениво —
  по одной строке), и обязательно перед утверждением.
- `approveRotationPlan (RotationPlan p)`: предусловие — status=draft и
  нет critical-нарушений (CONSTRAINT); эффекты: `status <- approved`,
  `approvedAt/By`, `version + 1`; предыдущий утверждённый план той же
  организации → `archived` (если не был basedOn-связан); обновление
  поля: `FOR items(i) WHERE yearNo=1 DO currentCrop(field(i)) <- crop(i,1)`
  (фактическая культура сезона). Событие утверждения в шину — 05.
- `copyRotationPlan (RotationPlan p, STRING name)` — «на основании» /
  новая версия: новый draft, `basedOn <- p`, копия всех items и crop;
  версия = max(версии планов на основе того же корня)+1 (упрощённо:
  `version(p)` — прототип: version нового = version(basedOn)+1).
- `archiveRotationPlan (p, reason)`.

## 2. Правила валидации севооборота (ядро)

`validateRotationPlan(p)`:
```
DELETE RotationViolation WHERE plan(item) = p;
FOR RotationPlanItem i WHERE plan(i)=p, INTEGER y1 = 1..horizon(p) DO {
  // A. Период возврата: та же культура раньше, чем returnYears лет
  FOR INTEGER y0 = max(1,y1-returnYears(crop(i,y1))+1)..y1-1 DO
    IF crop(i,y1) AND crop(i,y1) = crop(i,y0) THEN
      NEW RotationViolation { item <- i; yearNo <- y1; vType <- returnPeriod;
        severity <- critical; message <- 'Нарушен период возврата: ' +
        name(crop) + ' — не чаще раза в ' + returnYears + ' лет (год ' +
        yearOf(i,y0) + ')' };
  // B. Предшественник: y-1 внутри плана или факт прошлого года
  pred = OVERRIDE crop(i,y1-1), lastCrop(field(i)) IF y1=1;
  IF crop(i,y1) AND pred THEN {
    IF pred IN CropTaboo WHERE crop = crop(i,y1) THEN NEW violation
      { vType <- predecessor; severity <- critical; message <- 'Запрещённый
        предшественник: ' + name(pred) };
    ELSE IF NOT pred IN CropPredecessor WHERE crop = crop(i,y1) AND
      EXISTS CropPredecessor WHERE crop = crop(i,y1) THEN NEW violation
      { vType <- predecessor; severity <- warning; message <- 'Культура не
        входит в допустимых предшественников (допустимо после: ' +
        allowedAfter(crop(i,y1)) + ')' } }
}
APPLY;
```
Критичность (СТ ФТ1.1.1): `critical` блокирует утверждение; `warning` —
только индикация. Справочник «Пар» (`returnYears=1`, без предшественников)
разрешает всё. Показ нарушений: колонки-вычисляемые на строке матрицы
(`violationMark (i,y)` = '✖'/'⚠'/'' и `violationText (i,y)` = GROUP
CONCAT message — из простых полей, `00-context.md` §5.1).

## 3. Расчётные свойства

- `yearOf (item, yearNo) = startYear(plan(item)) + yearNo - 1`.
- `cropCount 'Культур в плане' (p) = GROUP SUM 1 IF crop(...)` — прогресс
  заполнения матрицы.
- `criticalCount (p) = GROUP SUM 1 IF severity=v critical`.
- `fieldRotationHistory 'История по полю' (Field f) = GROUP CONCAT
  nameCrop(crop(i,y)) ORDER yearOf` по утверждённым планам — для карточки
  поля (⚠ из простого поля nameCrop).

## 4. REST-ручки (статус У, паттерн `ExternalApp.lsf:31`)

- `apiRotationSave()`: вход JSON {planName, startYear, rotationData[{fieldId,
  cropYear1..N}]} → создаёт/обновляет draft, прогоняет валидацию, ответ
  {planId, status, version}. Вход — `IMPORT JSON FROM j FIELDS() ...`
  (`Agro.lsf:391`); fieldId/cropId во входе — строки `code` (в прототипе
  нет внешних UUID, конвертация по кодам).
- `apiRotationGet(planId)` → полная структура плана (EXPORT JSON).
- `apiRotationVersions(planId)` → [{version, status, approvalDate, author}].
- `apiRotationCopy(planId, newPlanName, adjustmentFactor?)` → {newPlanId,
  status:'Черновик'}; adjustmentFactor в прототипе игнорируется (нет
  количественных показателей) — пометка в ответе `unsupported`.

## 5. Сид

План A (демо-нарушения, draft): подсолнечник 2 года подряд (critical,
период возврата), томат после картофеля (critical, табу) + одно warning.
План B (чистый, approved, on basedOn=∅): корректный севооборот по всем
сид-полям. Утверждение плана A в демо блокируется — сценарий для приёмки.

## 6. Критерии приёмки

1. Матрица редактируется в draft, READONLY после утверждения.
2. validateRotationPlan на сид-плане A создаёт ровно 2 critical + 1 warning
   с осмысленными русскими сообщениями.
3. approveRotationPlan план A блокируется; план B проходит: статус,
   archived у прежнего утверждённого, `Field.currentCrop` обновился.
4. copyRotationPlan создаёт draft-копию с basedOn и версией+1.
5. Все 4 REST-ручки отвечают через `/exec?action=Ku.api...` (проверка curl).
