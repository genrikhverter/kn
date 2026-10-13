# 03-logic. KuLand — логика земельного банка (`Land.lsf`)

> Модель данных — `02-data-model.md` §2, §7. Источник — СТ модуль
> «Управление земельным банком», ФТ3.1–ФТ3.7. Статусы — `01-scope.md`.

## 1. Действия и жизненные циклы

### Участок (ФТ3.1)
- Создание/редактирование — форма (NEW/EDIT), автозаполнение
  `created/createdBy`, `plotStatus` умолчание `free`.
- Историчность изменений (СТ) — упрощение: только даты создания/правки;
  полное версионирование записи — 05.

### Договор (ФТ3.2)
- `newLeaseContract`: автозаполнение сторон, `status <- draft`.
- `activateContract 'Провести' (LeaseContract c)`: ФЛК пройден →
  `status <- active` + `NEW LeaseEntry` вида `obligation` (первое
  начисление по `rentAmount`) — проводка обязательства.
- Автопролонгация: `WHEN CHANGED (currentDate())` не используем;
  суточная задача планировщика (см. §4): `FOR LeaseContract c WHERE
  status(c)=active AND dateTo(c) < currentDate() AND autoProlong(c) DO
  dateTo(c) <- dateTo(c) + 365\*24\*60\*60` (плюс запись в ServiceLog);
  без автопролонгации → `status <- expired`.
- Расторжение: `terminateContract (c, reason)`: status → terminated,
  обязательства не начисляются.

### Взаиморасчёты (ФТ3.7)
- `accrueRent 'Начислить аренду за период' (DATE from, DATE to)`:
  FOR активных договоров — по каждому наступившему `paymentDay` в
  интервале `NEW LeaseEntry { entryKind <- obligation; amount <-
  rentAmount; entryDate <- дата платежа; sourceDoc <- 'начисление' }`.
- `registerPayment 'Зарегистрировать оплату' (LeaseContract c, DATE d,
  NUMERIC amount)`: `NEW LeaseEntry { payment; amount; d }` — вручную
  из карточки договора или ведомостью (ниже).
- Расчётные:
  `obligationSum (LeaseContract c) = GROUP SUM amount(LeaseEntry e) IF
  kind=obligation AND contract=c`;
  `paymentSum (...)` — аналогично;
  `balance 'Сальдо' = obligationSum - paymentSum`;
  `overdue 'Просрочено' (c) = IF paymentDay+порог < currentDate() AND
  balance > 0 THEN balance` (упрощение: без графика — по последнему
  платежному дню; ⚠ допущение прототипа).
- `buildPaymentSheet 'Сформировать ведомость' (Organization org, DATE
  from, DATE to)`: `NEW PaymentSheet` + FOR договоров org со сальдо ≠ 0:
  `NEW PaymentSheetItem` (accrued/debt — GROUP SUM за период / до
  периода, READONLY). `approvePaymentSheet (sheet)`: status → approved,
  FOR items `NEW LeaseEntry { payment; amount <- toPay; sourceDoc <-
  'ведомость №…' }`; CONSTRAINT: `toPay != accrued+debt` требует
  непустое `adjustReason`.

### Агрохиманализ (ФТ3.6)
- `NEW SoilAnalysis` с формы (или карточки поля); связка `Field.lastAnalysis`
  уже вычисляемая (02 §2). `WHEN SET` не требуется.

## 2. Валидации (ФЛК из СТ, CONSTRAINT)

Участок: кадастровый номер по маске `XX:XX:XXXXXX:XXX` — CONSTRAINT по
длине/двоеточиям (в прототипе — проверка формата строковой функцией
platformUtils или простым LIKE-паттерном; полный regex — 05);
`areaSqm >= 1`; статус `encumbered` ⇔ непустое `encumbrance`.
Договор: `dateTo > dateFrom`; `isPartial` ⇒ `partialAddress` и
`partialAreaHa` заданы; арендатор ≠ арендодатель; уникальность
(`number`, `plot+tenant`); при активации — все обязательные реквизиты.
Ведомость: `periodTo >= periodFrom`; утверждать можно только draft.
Агрохиманализ: N/P/K/pH ≥ 0; гумус 0–100.

## 3. Уведомления (ФТ3.3)

Суточная задача (Scheduler, время из настроек — умолч. 07:00):
`FOR LeaseNotification n WHERE enabled(n)`:
- `rent`: до ближайшего `paymentDay` осталось ≤ `daysBefore` → уведомление;
- `expiry`: до `dateTo` осталось ≤ `daysBefore` → уведомление.
Прототип: запись в `ServiceLog` (operKind='уведомление') + свойство-
флаг «показать на дашборде земли». Telegram-канал — по образцу
`MachineBot` (если бот настроен в Options), пометка У в 01-scope.

## 4. Планировщик

Одна суточная задача `kuLandDaily()` (планировщик платформы, образец —
`Scheduler` в REQUIRE): уведомления §3 + пролонгация/истечение §1 +
`Field.planYield <- targetYield(currentCrop)` пересчёт умолчаний.
⚠ время исполнения: итерации по договорам — маленькие FOR, без тяжёлых
агрегатов (`00-context.md` §5).

## 5. Матричная визуализация (ФТ3.5)

Форма-реестр «Земельный банк»: участок × (кадастровый номер, статус,
арендодатель, срок, сальдо, состояние). «Состояние» — вычисляемая
строка: `''` / `'⚠ истекает (<90 дн)'` / `'✖ просрочено'` — по ней
сортировка/фильтр; цветовая подсветка ячеек — 04-ui (через custom
отображение, если штатно недоступно — строковый индикатор достаточен).

## 6. Сид

См. `02-data-model.md` §7 (сид-состав). Дополнительные демо-состояния:
договор с истечением через 30 дней (жёлтый), договор с просрочкой
платежа 20 дней (красный), ведомость в статусе draft с корректировкой.

## 7. Критерии приёмки

1. ФЛК участка/договора воспроизводятся (ошибочные кадастровый номер,
   dateTo<dateFrom блокируются с русским сообщением).
2. Начисление+оплата меняют сальдо; ведомость утверждается и создаёт
   оплаты; корректировка без основания блокируется.
3. Суточная задача на стенде: вручную вызванная `kuLandDaily()`
   создаёт уведомления по сид-договорам.
4. Реестр земельного банка показывает истекающие/просроченные договоры.
