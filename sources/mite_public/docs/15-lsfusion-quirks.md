# Нюансы LSfusion и паттерны доработки «Кода Урожая»

Рабочий справочник для LLM: платформенные ловушки, проверенные паттерны и
процесс правок, выведенные из итераций 09.2026–10.2026 (UX-циклы карточки
культуры, правил севооборота, НСИ и Земли). Дополняет `09-architecture.md`
(раздел «Платформенные особенности») и `10-llm-handoff.md` (пункты 24–28 —
хронология с контекстом). Читать целиком перед правками UI/логики.

---

## 1. Цикл правок: где что проверять

```
правка .lsf → ~/mite_dev/rebuild_logic.sh (~6–10 мин) → docker logs mite_server
→ проверки в БД → браузер → доки → fossil commit --no-verify-comment
```

- **Maven не ловит ошибки LSF.** `BUILD SUCCESS` — это только упаковка jar;
  грамматика и семантика LSF проверяются при старте сервера. Ошибка →
  сервер падает и уходит в crash-loop (`restart: unless-stopped`), стенд
  недоступен. Текст ошибки:
  `docker logs mite_server 2>&1 | grep -A6 "Exception while starting"`.
  Без `-A6` можно не увидеть текст (иногда он на второй строке).
- Старт сервера 190–260 с (маркер `Server has successfully started`).
  Ускорения нет — закладывать тайминг в планирование пакетов правок.
  ⚠ «Starting Scheduler» в логе — НЕ признак готовности: при взрыве
  компиляции (см. ниже про один SET из многих секций) сервер печатает
  его через ~15 с, а маркер — через десятки минут; 100% CPU одним
  потоком `pool-6-taskRunner-pool-N` (jstack) = взрыв компиляции.
- Одна пересборка на пакет правок: правки копятся списком, потом один rebuild.
- Fossil: `fossil commit --no-verify-comment -m "..."` из корня `mite_dev`.
  `sources/platform` в ignore (патчи платформы живут в рабочей папке и в
  `rebuild_logic.sh`).

## 2. Числовые id вместо значений (главная ловушка UI)

В этом пине платформы объектные свойства — **включая статические enum** —
в ячейках форм всегда показывают числовой `key0`. `minInterfaceStatForValueUnique`
мёртв (нуль использований), `SELECT 'dropdown'` не работает. Рабочая схема:

- **Отображение** — только вычисляемыми свойствами:
  - enum: `nameCropTypeItem 'Тип' (CropType t) = staticCaption(t);`
  - ссылка: `nameVarCrop 'Культура' (Variety v) = OVERRIDE nameCrop(varCrop(v)), '';`
- **Изменение** — только DIALOG-пикером (см. §3); редактирование сырой
  ссылки в ячейке не давать.
- То же для заголовков в тулбарах/панелях: `READONLY nameX` вместо `x`.

Если где-то в форме осталось объектное свойство без READONLY-имени — на
экране будет число. Искать: `PROPERTIES (o) <prop>` где `<prop>` — DATA-ссылка.

## 3. Паттерн пикера (проверен на ~30 справочниках)

```
FORM pickCrop 'Выбор культуры'
    OBJECTS pc = Crop
    PROPERTIES (pc) READONLY name, code, nameCropType
    ORDERS name(pc)
;
setXAct 'Выбрать культуру' (X x) {
    DIALOG pickCrop OBJECTS pc = varCrop(v) INPUT pc NULL DO varCrop(v) <- pc;
}
```

- `OBJECTS` называет **объект формы** (`pc`), не произвольное имя;
  `= varCrop(v)` — начальное значение (можно опустить);
  алиас после `INPUT` — **параметр DO-блока** (`INPUT pc NULL DO ... <- pc`).
- «Ещё не связанные» значения скрыть фильтром: `FILTERS NOT predByCropPair(h, p)`
  (трёхзначная логика: `NOT NULL = TRUE` — см. §6).
- Кнопку выбора прятать по заполненности:
  `PROPERTIES (v) setVarCropAct SHOWIF NOT varCrop(v)`
  (появляется только у новой записи, когда обязательная ссылка пуста).
- Хелпер уникальности пары для фильтра:
  `predByCropPair = GROUP AGGR CropPredecessor p BY crop(p), predecessor(p);`
  ⚠ GROUP AGGR создаёт constraint уникальности — перед вводом проверить БД
  на дубли (иначе сервер не стартанёт).

## 4. Гриды в карточках: добавление, удаление, двойной клик

- **Стандартный NEW на гриде открывает автоформу класса с числовым ИД** —
  никогда не использовать. Замена — one-click действие:
  ```
  addBbchStageAct 'Добавить стадию…' (Crop c) {
      DIALOG pickBbchStage OBJECTS st INPUT st NULL FILTERS NOT cbsByCropStage(c, st) DO
          NEW s = CropBbchStage { cbsCrop(s) <- c; cbsStage(s) <- st; }
  }
  ```
  Кнопка — в кастомный контейнер через DESIGN (§5). Отмена пикера = ничего
  не создано.
- **Двойной клик по строке открывает EDIT-форму класса**; без явной EDIT-формы
  — та самая заглушка с ИД. ⇒ у каждого редактируемого класса должна быть
  своя карточка:
  `FORM variety 'Сорт/гибрид' ... EDIT Variety OBJECT v;`
  Для связок-справочников (CropBbchStage, CropRegion) — READONLY-карточка
  «что это» (cbsInfo/crInfo): стадия с номером, источник, культуры применения.
- **Удаление и буферизация сессий** (важнейший урок):
  - EDIT-диалог (карточка): и поля, и добавленные строки живут в сессии
    формы до «ОК». `NEWSESSION DELETE` **не видит** неприменённые строки —
    «кнопка не работает». Правильно: plain `NEW` + plain `DELETE`
    (применение по «ОК», отмена по «Закрыть» с вопросом).
  - NEWSESSION внутри DO-блока DIALOG **молча не выполняется** — не
    использовать вообще (см. handoff №27).
  - Standalone-форма (SHOW, без ОК): `NEWSESSION DELETE` работает (строки
    в БД), добавление — buffered с применением по «Сохранить»/OK формы.
- **Сортировка**: без `ORDERS` новая/пересозданная строка встаёт в конец.
  В форму грида: `ORDERS bsCode(cbsStage(bs))` / `ORDERS arCode(crRegion(rg))`.

## 5. DESIGN: компоновка без сюрпризов

Проверенный паттерн блока «заголовок + грид + кнопка» (карточка культуры):

```
DESIGN cropCard {
    NEW stages {
        caption = 'Фенологические стадии (BBCH)';
        MOVE BOX(bs);
        MOVE PROPERTY(addBbchStageAct(c));
    }
    BOX(bs) { caption = ''; }   // внутренний авто-заголовок гасим
}
```

- `MOVE PROPERTY(...)` — один раз на свойство (второй MOVE = ошибка).
- Переносимое свойство должно быть на форме **и объявлено в файле раньше**
  DESIGN; если действие объявлено ниже формы (карта ↔ участок) — не тащить
  в форму, использовать `EXTEND FORM` (кнопка появится в хвосте — это норма).
- 0-арные действия: на форме `PROPERTIES () myAct`, в дизайне
  `MOVE PROPERTY(myAct())`.
- Горизонтальные строки полей: `NEW row { horizontal = TRUE; MOVE ...; }`;
  две таблицы бок о бок — общий `horizontal` контейнер с двумя `MOVE BOX`.
- Ширины колонок: `PROPERTY(varDescription(v)) { charWidth = 80; }`.
- Условный показ полей по типу (контрагент): группы SHOWIF
  `ckIsPerson(x) = contractorKind(x) = ContractorKind.person OR ...` —
  вынести в именованные свойства, не размножать выражения.

## 6. Языковые ловушки LSF

| Ловушка | Правильно |
|---|---|
| `IS NULL` не существует | `NOT x` (трёхзначная логика: NULL = «не связано») |
| Сравнения не дают FALSE, только TRUE/NULL | фильтры «ещё не связано» строить на `NOT link(...)` |
| `FOR X o WHERE cond DO` — синтаксическая ошибка | `FOR X o IS X AND cond DO` |
| `WHERE` в выражениях | только `IF ... AND ...` |
| `CASE n WHEN 1` | `CASE WHEN n = 1 THEN` |
| Порядок деклараций: свойство/форма/класс используются до объявления | всё объявлять ВЫШЕ места использования (в т.ч. name-item до пикера, хелпер до формы) |
| `WHEN CHANGED(a(C c)) OR CHANGED(b(c))` — параметр дважды | класс объявить один раз, в первом операнде |
| `GROUP CONCAT` не принимает выражение-колонку из CASE/OVERRIDE напрямую | сворачивать одно свойство; выражение — в отдельное свойство |
| `NEWSESSION` внутри `DO` DIALOG | не работает молча — plain NEW |
| два `DIALOG` в одном действии | второй DO не выполняется — разбивать на шаги/панель |
| переименование свойства | старая колонка БД → `_deleted_<имя>`; данные переносить SQL |
| одноимённые свойства в модулях | перегрузки нет; `имя (Класс)` и `имя (ДругойКласс)` можно |
| JSON на сервере | строки со `{}` — локализация; JSON собирать конкатенацией |
| DATE из ZDATETIME (функции извлечения в пине нет) | сравнение полуинтервалом с приведением границы: `time(f) >= toZDateTime(dt) AND time(f) < toZDateTime(dt + 1)` — ZDATETIME и DATE напрямую не сравниваются (ошибка классов при старте) |
| общий код для сиблингов REQUIRE (KuSimulation↔KuYield друг друга не видят) | слой в общем предке (KuLand) — там же REQUIRE базового модуля (Weather) |
| GROUP CONCAT без разделителя | строковый CONCAT требует второй операнд-разделитель: `GROUP CONCAT x(f) IF …, '' ORDER …` (иначе «single aggregate (JSON) OR two (separator)» при старте) |
| NEW-алиас за скобками блока | не виден; ссылка дальше — LOCAL-паттерн; присвоения свойств нового объекта — строго ВНУТРИ его NEW-блока (за скобками алиас разрешается контекстно — запись уходит «всем объектам», волна 2: kuDeviceField всем устройствам) |
| `INPUT j = JSON` в REST-/exec | падает (UnsupportedOperationException requestUserData) — парсить через `stringToFile(s)` → `IMPORT JSON FROM resultFile() TO …` (LOCAL NESTED) |
| `IMPORT … FIELDS…DO` из строки-параметра | DO-блок молча не выполняется (ни с FIELDS, ни с FIELDS()) — только TO в LOCAL NESTED массивы + обход по ним |
| вложенный FOR (row → объект, cross-условие) | ТИХО не срабатывает (счётчики пишутся, значения нет); канонический паттерн Mite.lsf: `FOR [GROUP SUM 1 IF Obj o = <join(row)> BY o](Obj o) DO { APPLY FOR o = <join(row)> [INLINE NEW …] DO …; IF canceled() THEN BREAK; }` (эталоны: apiTelemetryPush, doImportPlanYield) |
| исключение из вложенного действия с собственным APPLY | летит МИМО TRY-CATCH вызывающего (sendMessageTelegram) — внешние вызовы прямым EXTERNAL в своём TRY |
| тригонометрия от географных координат | всегда `Math.toRadians(градусы)` до cos/sin — cos(55°-как-радианы) занижал площадь ×7,4 (КФ-3) |
| голый INTERNAL-действие из /exec | HTTP 200, изменения НЕ применяются — только через LSF-обёртку с APPLY |
| MessageClientAction в /exec | не виден в ответе — диагностику писать в DATA-свойства |
| `GROUP MAX obj ORDER …` | «property null is always NULL» — для «последнего по дате» использовать `GROUP LAST obj ORDER d, obj IF …` |
| колонки групп-таблиц | ИНВЕРТИРОВАНЫ относительно сигнатуры свойства: (Item, INTEGER) → key0=INTEGER, key1=Item — SQL-контроль не перепутать (кодфикс 09.10: 6 «пустых» проверок работающего кода) |
| `OVERRIDE(a, b)` | не парсится — OVERRIDE оператор: `(OVERRIDE a, b)` |
| GROUP SUM с параметром | объявление параметра в суммируемом выражении = «WHERE forbidden with SUM» — параметр объявлять в IF-части |
| GROUP внутри EXPORT … WHERE | конфликтует — выносить в DATA-свойство до EXPORT |
| много-ключевая DATA-запись из row-контекста | `cropYear(itemRef(row), yr(row)) <- x` молча не работает — писать через ДЕЙСТВИЕ с явными параметрами `setCellAct(i, y, c)` |
| `format` в DESIGN PROPERTY | НЕ поддерживается этим пином («unable to set property 'format'») — числовые INTEGER всегда с разделителем разрядов по локали GWT |
| READONLY в списке PROPERTIES | применяется ко всем свойствам строки — действие рядом с READONLY-именем выносить отдельной строкой `PROPERTIES () actName` (волна-фикс: кнопка «Выбрать культуру» гасилась) |
| `ORDER … DESC` внутри FOR | синтаксическая ошибка — DESC только в ORDERS форм/агрегатах; в FOR сортировка по возрастанию |
| параметры в списке выражений (EXPORT/агрегаты) | класс параметра объявляется один раз — в первом выражении (`GROUP SUM 1 IF x(C row), MAX y(row)`) |
| параметры CONSTRAINT в MESSAGE | НЕДОСТУПНЫ — текст сообщения без подстановок (номер черновика не вставить; КФ-С1) |
| inline-переопределения в PROPERTIES-строке | `k1 'Год 1' = cropYear(i,1) READONLYIF …` НЕ парсится — READONLYIF работает только с ИМЕНОВАННЫМИ свойствами (сначала `k1 'Год 1' (I) = …;` в модуле, потом в форме) |
| LOCAL после отменённого APPLY | читается как ни в чём не бывало (Copy «врал успех») — надёжный маркер отката только `canceled()` |
| LOCAL-аргумент действия-хука | хук вызывать ПЕРВЫМ в теле: kuPublish/kuNotify содержат APPLY, а LOCAL после APPLY умирает (КФ-А5: sev приходил пустым) |
| `IS NOT` | не существует — `NOT (x IS Class)` |
| имя параметра `def` | зарезервировано — парсер молча даёт «property not found» |
| OVERRIDE-выражение как аргумент вызова | только в скобках `(OVERRIDE a, b)` |
| GROUP MAX obj в аргументе действия | «multiple aggregate properties» — передавать через GROUP AGGR-свойство (stressByName) |
| `extractMonth` | возвращает класс Month (не INTEGER!) — для чисел `extractMonthNumber`; `extractMonthNumber` возвращает INTEGER |
| `make_date(y, 13, 1)` | SQL date out of range — перенос года при month=12 (декабрь→январь следующего года) |
| `extractYearNumber` / `extractMonthNumber` — этих имён НЕТ | платформенные: `extractYear` и `extractMonthNumber` |
| PRINT-форма выше PRINT-действия | форма ОБЯЗАНА объявляться раньше действия PRINT (иначе «form not found») |
| PaymentRequest и другие классы KuIntegration | видны только из KuIntegration и ниже по графу REQUIRE (KuLand их НЕ видит — обратная зависимость) |
| смена типа колонки ISTRING→ссылка/енум на живой БД | платформа делает in-place ALTER varchar→bigint с кастом → возвращает ошибку; ЛЕЧЕНИЕ: остановить сервер → переименовать старую колонку → добавить новую varchar с ЧИСЛОВЫМИ id значений → старт (ALTER пройдёт) |
| статик-енумы в БД | НЕ имеют строковой id-колонки в _auto_* таблицах — маппинг при миграции по ПОРЯДКУ ОБЪЯВЛЕНИЯ (active = МЕНЬШИЙ key0) |
| `INPUT from = DATE DO` + `INPUT to = DATE DO` вложенно | работает, но для /exec нужны программные ядра без INPUT (обёртка accrueRentFor) |
| `CONSTRAINT … organization(x) = organization(y)` | неоднозначность (одно имя в 3+ модулях) — выносить в именованный хелпер (draftSibling) |
| строка даты в числовое поле | `'' + INTEGER` даёт разделитель разрядов GWT («2 027») — показывать строкой READONLY + правка INPUT-диалогом |
| `!` после FILTERS в форме | двойной `;;` — синтаксическая ошибка (лишняя точка с запятой при вставке) |
| имя объекта пикера ≠ имени фильтра | FILTERS ссылается на имя из OBJECTS (`OBJECTS st = …` → `FILTERS … (st)`), не на имя свойства |
| `PROPERTIES (s) nameNgStatus` до объявления nameNgStatus | имя-свойство должно быть объявлено выше формы (ошибка «not found» на форме) |
| действие-обёртка `setVarCropAct` до FORM pickCrop | DIALOG в действии требует форму выше действия |
| WHEN CHANGED-цепочка с гардом | `WHEN (CHANGED(a) OR CHANGED(b)) AND x IS Class DO` — скобки вокруг OR-цепочки ОБЯЗАТЕЛЬНЫ (AND сильнее OR: гвард ограничит только последний операнд) |
| Constraint ChangeOf `CONSTRAINT CHANGED(cropYear(RotationPlanItem i, INTEGER y)) AND …` | CHANGED в CONSTRAINT работает, но объявлять ПОСЛЕ самого свойства |
| `GROUP CONCAT expr, ', ' IF cond` | порядок: expr **IF cond**, разделитель ПОСЛЕ: `GROUP CONCAT x(o) IF cond, ', ' ORDER …` (иначе «expecting ORDER») |
| `FALSE`-литерал в аргументах действия | «use NULL instead of FALSE» — передавать NULL (в IF NULL = ложь); TRUE проходит |
| /exec: параметры действия | повторяющиеся `p` (позиционно): `&p=v1&p=v2`; BOOLEAN — строками `true`/`false`; p1/p2-имена НЕ биндятся; объекты — key0 числом |
| `[FORMULA TYPE 'expr'];` в скобках | не парсится — канонический формат БЕЗ скобок: `name (T p) = FORMULA TYPE 'expr($1)';` (эталон round1); многопараметрических FORMULA в проекте нет — составные выражения собирать из именованных однопараметрических свойств (sinD/cosD/acosD в KuSimulation) |
| класс параметра в EXPORT FROM повторён | «class of parameter was already defined» — класс объявляется в ПЕРВОМ выражении (`field = name(SimTask t)`), далее голое имя (`engine = name(t)`) |
| LOCAL-объект после APPLY в REST-действии | пустые поля в ответе — перевыборка именованным GROUP LAST-свойством (`lastTaskOfField`) + FOR по нему; параметры-примитивы действия выживают APPLY (расширение урока про LOCAL/параметры) |
| InternalAction из /exec И /eval | executeInternal НЕ выполняется ВООБЩЕ (проверено A7: безусловные throw-диагностики в подтверждённом md5 jar не срабатывают; bare/обёртка/LOCAL — одинаково тихо). Работает только в UI-контексте форм. Диагностика: null-параметр и «контур не распознан» неотличимы — throw на каждом тихом return'е |
| WHEN + INTERNAL + запись свойства в eval-сессии | POS_RACE (SQLUniqueViolation в recursiveApply): триггер геометрии на запись boundaryGeoJson из /eval — рекурсивный APPLY конфликтует с внешней сессией. Паттерн для действий: контур писать → свой APPLY → recalcFieldGeometryAct ПОСЛЕ (не полагаться на WHEN) |
| большой payload в /exec через GET | Request header too large: ~5 КБ JSON с кириллицей = ~12 КБ URL > лимит Tomcat 8 КБ. Решение: POST с параметрами в теле (--data-urlencode без --get) |
| генерация кодов справочника из count+1 | коллизия при «дырках» в нумерации (NG-14 нет → count 30 → NG-31 существует) → GROUP AGGR уникальность отменяет APPLY ТИХО. Правильно: max числовой суффикс + 1 (ngNextCode, эталон integerSuffix handoff-20) |
| LOCAL после APPLY — МАТЕРИАЛЬНО: писал recommendation=NULL (сироты в БД); **параметры действия выживают APPLY** (эталон copyPriceScenario) — ссылки через параметр или перевыборку GROUP LAST после каждого APPLY |
| 3VL травит OR-цепочки сравнений | `NOT(a AND b)` / `a OR b OR (x<=y)` при любом NULL → NULL → строка отпадает; однозначный TRUE/FALSE — именованный хелпер с IF-цепочкой (эталон bbchWindowOk) |
| единицы цен сценариев | ₽/Т (карбамид 24 500, зерно 14 500); дозы — кг/га: произведение /1000 (иначе ×1000 — BR-02 отвергал все коррекции) |
| `toInteger(NUMERIC)` | SQL-функции convert_to_integer(numeric) НЕТ (только строковый toInteger) — целочисленное деление с округлением вверх: `(h + 23) / 24` (INTEGER/INTEGER) |
| JSON-строка в действии | фигурные скобки — chr-хелперы: `[FORMULA STRING[1] 'chr(123)']()` (паттерн nl() из KuEtl) |
| FOR по объектам + APPLY в теле БЕЗ NEWSESSION | ТИХО умирает после первой итерации (backfill: 1 поле из 12, HTTP 200); итерацию оборачивать `NEWSESSION { … }` (паттерн kuSimDaily) |
| реализация ABSTRACT-действия | `name (params) + { … }` — плюс и блок; `+=` (для свойств) не парсится |
| EXPORT JSON: скаляры + NESTED-массив | «Операция над множеством некорректна» — все поля FROM должны быть от ОДНОГО множества строк; сводка-строка или отдельная ручка (apiImportRun/quarantineTop10) |
| ORDER в FOR по объектному DATA-свойству | та же «операция над множеством» — сортировать по примитивам (ireLineNo) и объекту-итератору |
| ОДИН SET из ~13 GROUP CONCAT-секций (снапшот карты) | после ~11 секций дерево запроса переходит экспоненциальный порог: компиляция при старте 36 мин (100% CPU одним taskRunner-потоком). ЛЕЧЕНИЕ: append-шаги `x() <- (OVERRIDE x(), '') + секции;` по 3–4 секции (refreshKuMap, 11.10: 2147 с → 131 с) |
| вложенный GROUP SUM (GROUP SUM pnlIncome(Crop)) | уровень вложенности агрегатов удлиняет дерево — выпрямлять в плоский GROUP SUM по строкам-источникам + джойны-условия выносить в именованные свойства-флаги (bplIncomeApproved) |
| SQL-сброс пароля CustomUser | формат checkPassword: `base64(sha256(парол + '{sdkvswhw34839h}'))` (UserInfo.salt, mergePasswordAndSalt) — несолёный хэш даёт вечный 401 на /exec; контрольный пример: sha256('demo{sdkvswhw34839h}') = хэш всех demo-пользователей |
| /exec 401 при «живом» сервере | пока бизнес-логика не доинициализирована (нет маркера старта) — веб-аутентификация отвечает 401; /main (статика) при этом 200 — не путать с проблемой пароля/RMI. Дифдиагностика: другой пользователь с сид-паролем (demo.banker:demo → 500 = канал жив) |

## 7. Что декларативно НЕ сделать (не тратить время)

- **Динамические столбцы** («один договор = одна колонка», пивот) — паттерн
  фиксированных колонок Д1–Д5 + легенда соответствия (см. `contractPlotMatrix`,
  матрица севооборота М1–М5 — тот же приём).
- **Гриды правил севооборота внутри карточки культуры** — платформа не
  наполняет грид, чей класс ссылается на Crop дважды (культура+предшественник).
  Сводки GROUP CONCAT работают ⇒ на карточке сводки, правка — отдельная форма.
- **Мини-карта внутри карточки** (web-компонент в форме) — только кастомный
  React-рендер (`custom` в DESIGN); пока обходимся кнопкой «Показать на карте».
- **Выпадающий список с именами вместо ИД** для объектного свойства — нет.

## 8. Русский веб-клиент (GWT)

Приоритет локали: `?locale=` > cookie `LSFUSION_LOCALE` > meta
`gwt:property` > язык браузера. Ловушки:

- Сервер (`LSFAuthenticationSuccessHandler`) пишет в куку локаль JVM
  (`en_US`) при каждом логине ⇒ мета-тега мало, нужен скрипт в `<head>`
  main.jsp **до** загрузки `nocache.js`:
  `document.cookie = 'LSFUSION_LOCALE=ru;path=/';`
- Реализация: исходник `sources/platform/web-client/.../view/main.jsp` +
  патч war в `rebuild_logic.sh` (war копируется из target платформы со старым
  JSP). Патч должен ставить **свежую zip-метку времени** у main.jsp — иначе
  Jasper считает JSP неизменённым и отдаёт старую компиляцию.
- Service worker (`lsf`-кеш) может отдавать устаревшую main.jsp — при
  странном поведении клиента: DevTools → unregister SW + очистить кеш
  (или два F5).
- Русские литералы логики: `MiteResourceBundle.properties` = копия `_ru`
  (детали — handoff «Платформенные правила», п. 11).

## 9. БД стенда

- Доступ: `docker exec mite_db psql -U postgres -d iot -tc "SQL"`.
- `psql -c` с несколькими утверждениями = одна транзакция: упавший SELECT
  откатывает и успешные UPDATE — проверочные SELECT делать отдельно.
- Имена: `ku_<prop>_<class>` (см. `\d ku_croppredecessor`); id — `key0`;
  class-колонка `system__class_<class>`.
- Сид идемпотентен по коду/наличию класса: изменённые поверх сида данные
  он НЕ перезаписывает; но и разовые демо-изменения (напр., «Архив» у двух
  культур) сид НЕ воспроизводит — при пересоздании БД повторить руками.
- Случайно удалённые сид-строки восстанавливать INSERT'ом с высоким `key0`
  (напр., 2000000001) — коллизия с генератором практически исключена;
  id-счётчики per-class, block-based.
- Открытые вкладки пользователя хранятся в `systemevents_connectionform`
  (+ in-memory сервера): сброс = рестарт сервера + DELETE из таблицы.

## 10. Браузерная проверка (CDP, headless)

- Chromium: `--remote-debugging-port=9222`, python с websocket —
  `~/knp-dev/venvs/bridge/bin/python`. Логин admin/fusion (форма
  `loginForm`, поля `username`/`password`).
- GWT **игнорирует** синтетические `element.dispatchEvent(click)` в гридах —
  только доверенные `Input.dispatchMouseEvent` по координатам элемента
  (`scrollIntoView` → `getBoundingClientRect` → центр).
- Кнопки диалога: в DOM последний `button` с текстом — это кнопка активного
  (верхнего) диалога; у пикеров кнопка называется латинским `OK`.
- Выделение строки: клик по всей строке (tr, `.data-grid-row`), признак —
  класс `table-active`.
- **Карта (maptalks, WebGL) в headless без GPU роняет рендер** всего окна
  («clearColor», модаль «Закрыть»). Модаль закрывать и продолжать; для
  стабильности — чистить восстановленные вкладки (§9). В браузере
  пользователя с GPU этого нет.
- Сессия авторизации живёт в Tomcat (web): рестарт web/server = перелогин.

## 11. Чек-лист доработки

1. Прочитать этот файл + `10-llm-handoff.md` (пункты последних итераций).
2. Найти форму/класс в `03-logic-*.md` и в `.lsf`; проверить порядок
   деклараций в будущих правках.
3. UI: имена вместо ИД (§2), пикер (§3), EDIT-карточка класса (§4),
   сортировки ORDERS, SHOWIF-условность, DESIGN-компоновка (§5).
4. Данные: нужны справочники/сид — идемпотентно по коду; миграцию
   существующих — `FOR X o IS X AND NOT prop(o) DO ...`.
5. `rebuild_logic.sh` → `docker logs` на «Exception while starting».
6. Проверить БД (данные сида), при необходимости — браузер (§10).
7. Обновить: тест-доку (`docs/tests/этап-00-…`), пункт в handoff (нумерация
   сквозная), при новом паттерне — этот файл.
8. `fossil commit --no-verify-comment -m "…"`.

## 12. Карта часто правимых мест

| Что | Где |
|---|---|
| Культуры, стадии/пороги/регионы, правила севооборота, субъекты РФ | `ku/KuCrop.lsf` |
| Погодный слой (живая погода MITE Weather, окна, порог осадков) | `ku/KuLand.lsf` (kuWf*/kuSeasonLoc/kuWindowRainy) |
| Флот/телеметрия: машины KU-FLK, генератор kuSimTelemetry, форма «Флот и телеметрия» | `ku/KuLand.lsf` (kuDeviceField, kuMapFleetDeviceRows); приём REST — `ku/KuIntegration.lsf` (apiTelemetryPush) |
| Календарь сезона/живые температуры/GDD, формы «Живая погода»/«Календарь сезона» | `ku/KuSimulation.lsf` (refreshSeasonWeather) |
| Сорта/гибриды + заявки на ДС + PaymentRequest + apiTelemetryPush | `ku/KuIntegration.lsf` (Variety, PaymentRequest, registerPaymentByRequest) |
| Пороги стресса культуры (NDVI_DEV/CRIT/PRECIP10), StressType (STRESS-*), NomGroup (NG-*), NsiStatus | `ku/KuCrop.lsf` (cslValueOf, cropDevThreshold; справочники) |
| NPK-баланс (пересчёт через плотность nkToKgHa), база знаний (kbStressRef→StressType), серьёзность crSeverity | `ku/KuYield.lsf` |
| Геометрия поля (Java), взаиморасчёты (accrueRentFor, mkDate), ведомости (PRINT), LeaseNotification (90 дн) | `ku/KuLand.lsf` + `java/mite/FieldGeometryAction.java` |
| Севооборот: иммутабельность k1–k5 (matrixLocked), draftSibling, REST errors[] | `ku/KuRotation.lsf` |
| Участки, поля, контрагенты, типы почв, договоры, матрица ФТ3.5, карта | `ku/KuLand.lsf` |
| Навигатор/сид-точка входа | `ku/KuApp.lsf` (`onStarted`, `standModeKu()`) |
| Патч war (русская локаль + тема «ЦУП КНП») | `~/mite_dev/rebuild_logic.sh`; файлы темы — `~/mite_dev/theme/` |
| Тест-сценарии НСИ | `docs/tests/этап-00-администрирование-НСИ.md` |

## 13. Тема оформления «ЦУП КНП» (war-патч)

Фирменный вид стенда: тёмно-синий навигатор #11305e, акцент #BED6A5,
логотип/фавикон «ЦУП КНП». Механизм — расширение патча war в
`rebuild_logic.sh` (как русская локаль):

- **Файлы** (`mite_dev/theme/`, в fossil): `ku-theme.css` (после
  `themeCss`=light.css в main.jsp — переменные :root выигрывают каскад),
  `ku-login.css` (в login.jsp после login.css; кладётся в `noauth/` —
  до авторизации грузится только noauth-статика), `logo.png` +
  `favicon.ico` (замена фолбэков `static/noauth/images/…` — logicsLogo/
  logicsIcon в БД пустые, таблицы не создаются).
- **Итерации темы**: `rebuild_logic.sh --war-only` — патч war + рестарт
  web без maven (~30 с; сервер не трогается, сессия LSfusion живёт).
- **Ловушки**:
  - фон навигатора задаётся bootstrap-утилитой `.bg-body-secondary` с
    захардкоженным цветом и `!important` — переменной `--bs-secondary-bg`
    не перекрыть (задекларировалась, а фон прежний); лечится явным
    `background-color: … !important` в теме;
  - навигатор МНОГОУРОВНЕВЫЙ: подменю — вложенные `.navbar.p-0` БЕЗ
    `bg-body-secondary` ⇒ селекторы ссылок/фона писать на все `.navbar`
    (проверять по DOM: активная ссылка часто в глубоком вложенном navbar);
  - версия ссылок `?v=<штамп времени>` обязательна: браузер кэширует
    CSS по URL, при CDP-проверке старой версии —
    `Network.setCacheDisabled` или новый штамп;
  - динамические стили платформы (table.css и пр.) грузятся ПОЗЛЕ
    head-ссылок — цветные правила против них помечать `!important`;
    `:root`-переменные этому не мешают (их определяет только light.css).
- **Дизайн-токены КНП** (источник `aoknp/knp/knp_frontend/app/static/css/`):
  `--color-dark #0b2142`, `--color-bg-main #11305e`,
  `--color-green-light #BED6A5`, карточки `#fff`/рамка `#e2e8f0`/radius 8,
  заголовки `#1e3f20`, вторичный текст `#64748b`, вкладки: неактивная
  `#f0f2f5` + рамка `#e0e0e0`, hover `#e4e6e9`. Скриншоты эталона:
  `docs-screenshots/knp-theme-{login,dashboard,navbar}.png`.
- **Логотип в углу навигатора** — платформенный дефолт-глиф
  `i.lsfi-logo-vertical` (в пине SystemEvents.lsf:87 `logo() =
  defaultLogo()`, БД-переопределение закомментировано; logicsLogo/
  logicsIcon лежат в таблице `_auto`, колонки system_logicslogo/
  system_logicsicon bytea). Замена — CSS в ku-theme.css: font-size:0
  на глиф + background logo-square.png. На странице логина `<img
  src="${logicsLogo}">` — war-патч подменяет на версионированный
  статический путь (фолбэк = наш logo.png).
- **Кэш браузера пользователя** — сервис-воркер lsf держит старый
  app-shell (login.jsp/main.jsp/статику): после смен темы/логотипов
  пользователю нужен один Ctrl+Shift+R. Все новые статические URL в
  war-патче версионируются штампом (?v=ММДДЧЧММ), CDP-проверки —
  с Network.setCacheDisabled.

## Пакет «карта» (11.10, п.91 handoff)

- **CUSTOM-свойство в форме показывает имя свойства вместо подписи** —
  caption из декларации DATA на форму не действует; лечится только
  `DESIGN <форма> { PROPERTY(<свойство>()) { caption = ''; } }` (образец:
  kuFleet3d, kuMap).
- **Снапшот карты — секции по порядку**: данные секций, от которых зависят
  другие (GEOM → поля), должны разбираться ДВУМЯ проходами: первый собирает
  сырые строки, второй строит features после разбора всех секций.
- **maptalks v1.12**: в maptalks.css НЕТ стилей InfoWindow (только zoom) —
  попап без фона; DOM InfoWindow: корень (+опция containerClass) → h2 →
  a.maptalks-close → .maptalks-msgContent. Клики внутри InfoWindow не
  всплывают (eventsPropagation) — делегирование только в capture-фазе.
- **Повторное открытие GWT-формы = НОВЫЙ DOM-контейнер**: любой JS-компонент,
  держащий карту/сцену в замыкании, обязан сравнивать сохранённый контейнер
  с текущим (map.getContainer()) и пересоздавать инстанс + сбрасывать кэши
  маркеров/слоёв/observers.
- **Проверка деплоя статики**: без сессии /file/static → 401, без ?version=
  → 500; достоверно только fetch из залогиненной страницы (фактический URL —
  performance.getEntriesByType('resource')).

## Пакет «карточка участка» (12.10, п.92 handoff)

- **Элемент выбора (select) объектных свойств**: платформа сама строит
  группу кнопок (сумма длин ≤ maxLengthForValueButton=40) / список /
  dropdown (≤ maxInterfaceStatForValueDropdown=20). Явный вид — в форме:
  `PROPERTIES (p) propName SELECT 'Dropdown'` (или SELECT / SELECT AUTO /
  NOSELECT). READONLY-свойства элемент не получают.
- **OVERRIDE с двумя аргументами**: `OVERRIDE (f(), 'x')` — ПАРАСИТ как
  индексное обращение («missing ')' at ','»). Только `OVERRIDE f(), 'x'`
  или `OVERRIDE (expr), 'x'`.
- **/exec не выполняет действия**: HTTP 200 + пустой ответ, эффект нулевой
  (в т.ч. присвоения/NEWSESSION). Действия проверять через /eval:
  `run() { actionName(); RETURN markerProp(); }`.
- **Java InternalAction**: образец LinkFieldPlotsAction — LP.readAll(context)
  (ImMap<ImList,Object> → toJavaMap), findProperty("name[]").change(v,
  context); gson в classpath сервера есть; класс — в корне src/main/java.
- **GWT-автоматизация**: навигатор — <a> с точным текстом; клик —
  Input.dispatchMouseEvent по центру после scrollIntoView; «Земля» и прочие
  папки уже развёрнуты после логина.

## Карта, 2-я порция (12.10, п.93 handoff)

- **showDetailedInfo (тултип «Каноническое имя…»)**: платформа включает
  его роли admin (Service.lsf). Управление: DATA BOOLEAN (UserRole)
  security_showdetailedinfo_userrole; в LSF — `showDetailedInfo(r) <- NULL`
  (FALSE запрещён). Клиент получает флаг в ClientSettings при коннекте —
  смена действует после перелогина.
- **GROUP CONCAT с IF**: обязательна полная форма
  `GROUP CONCAT expr IF cond, 'разделитель' ORDER expr` — без ORDER/sep
  парсер требует 'ORDER'.
- **GWT custom-компонент: первый render до раскладки** — контейнер
  нулевой; всё, что строится по offsetWidth (панели, списки, fitExtent),
  надо дублировать отложенными повторными render'ами.

## 3-я порция (12.10, п.94 handoff)

- **timeoutHttp()** — DATA LOCAL LONG: таймаут внешних HTTP в ТЕКУЩЕЙ сессии;
  платформенный дефолт 30 минут — зависший внешний вызов в onStarted
  блокирует старт сервера целиком (симптом: 401 на все ручки).
- **Грид дочернего объекта может не рендерить строки** (keys-запрос верен,
  values-запрос не формируется) — надёжная альтернатива: READONLY
  GROUP CONCAT список в шапке карточки.
- **SQL-диагностика**: ALTER SYSTEM SET log_statement='all' + reload;
  лог-файлы в /var/lib/pgsql/data/log/ контейнера (НЕ docker logs).
- **alignment = STRETCH** — опция DESIGN-компонента: растяжка по поперечной
  оси контейнера (гриды/длинные поля в карточках).

## 4-я порция (12.10, п.95 handoff)

- **system__class_&lt;table&gt; = NULL → строка невидима в гридах** (keys-
  запрос корректен, values не формируется; «Пустая строка»). Источник —
  NEW внутри IMPORT...DO. Лечение: SQL-бэкфилл id класса (system_staticobject)
  + не создавать объекты в DO-контексте разборов.
- **Java→LSF контракт данных**: DATA BOOLEAN (Класс, Класс) с hit-метками;
  change(true, ctx, new DataObject(Long, ConcreteObjectClass), ...) — классы
  через LM.getClass("Name") с fallback "Namespace.Name".
- **LIKE с ведущим '%' в условии FOR/GROUP** — матчит непредсказуемо (один
  элемент из списка) — не использовать для членства в списках.
- **/eval**: строки в [..] не допускают ',', '%', кириллицу — обходить
  литеральными конструкциями (GROUP MAX, параметры).

## 5-я порция (12.10, п.96 handoff)

- **Гонка SHOW vs больших изменений в одном ответе события**: обновление
  CUSTOM-снапшота (kuMapData) вместе с SHOW могло глотать SHOW —
  интерактивные команды ставить ДО массовых изменений свойства.
- **DIALOG/EDIT из ON CHANGE события формы не показываются** — только SHOW.
  Оператора EDIT в теле действия нет (только editFormDeclaration в FORM).
- **Растяжка в PANEL-карточке**: alignment = STRETCH на КОНТЕЙНЕРЕ
  (NEW box), не на BOX-ребёнке; текстовым полям — charWidth.
