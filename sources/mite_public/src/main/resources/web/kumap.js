// Код Урожая: интерактивная карта (UI-105, КП09, ФТ.GEO.1–6) — v5, docs/11 §10.
// Единая карта (unified) на maptalks, двусторонняя связность с системой:
//  - клик по полю → controller.change → ON CHANGE на сервере → карточка поля;
//  - «Показать на карте» из форм (поля/участки/планы/результаты) → секция SEL;
//  - секции снапшота: FIELDS (14 полей, v5: +N и pH последнего агрохиманализа),
//    FLEET, ZONES (k-means из KuYield), SEL (выбранное поле — подсветка ★).
// Транспорт — плоская строка (JSON на сервере не строится: {} — локализация).

(function() {
    'use strict';

    // экранирование HTML для инфоокон: имена/описания из БД вставляются в
    // content maptalks (рендерится как HTML) — без экранирования это XSS
    const esc = function(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    // п.4 UI-обзора: клик по объекту — ТОЛЬКО попап; переход на карточку —
    // ссылкой из попапа. Последнее открытое окно регистрируем глобально,
    // чтобы кнопка «Закрыть» в его нижней части могла его спрятать.
    const registerPopup = function(geo) {
        try { window.__kumapIW = geo.getInfoWindow(); } catch (e) {}
    };
    // нижний колонтитул попапа: ссылка на карточку (если есть) + «Закрыть»
    const popupFooter = function(action, obj, linkText) {
        let html = '';
        if (action && obj) {
            html += '<div style="margin-top:6px;border-top:1px solid #e4e4e4;padding-top:6px">'
                + '<a href="#" class="kumap-card-link" data-action="' + esc(action) + '" data-obj="' + esc(obj) + '"'
                + ' style="color:#0b5d2e;font-weight:600;text-decoration:none">→ ' + esc(linkText) + '</a></div>';
        }
        html += '<div style="margin-top:6px;text-align:center">'
            + '<button type="button" class="kumap-close-btn" style="padding:3px 20px;border:1px solid #c9c9c9;'
            + 'border-radius:4px;background:#f4f4f4;cursor:pointer;font-size:12px;color:#37474f">Закрыть</button></div>';
        return html;
    };
    // делегированные клики: живут при любых пересозданиях карты/панели
    document.addEventListener('click', function(ev) {
        const tgt = ev.target;
        if (!tgt || !tgt.closest) return;
        const link = tgt.closest('a.kumap-card-link');
        if (link) {
            ev.preventDefault(); ev.stopPropagation();
            const ctl = window.KuMapComponent && window.KuMapComponent._controller;
            if (ctl && ctl.change) {
                try { ctl.change({ action: link.getAttribute('data-action'), objName: link.getAttribute('data-obj') }); } catch (e) {}
            }
            if (link.getAttribute('data-action') === 'select')
                pendingSelZoomCode = link.getAttribute('data-obj');
            if (window.__kumapIW) { try { window.__kumapIW.hide(); } catch (e) {} }
            return;
        }
        const closeBtn = tgt.closest('.kumap-close-btn');
        if (closeBtn) {
            ev.preventDefault(); ev.stopPropagation();
            if (window.__kumapIW) { try { window.__kumapIW.hide(); } catch (e) {} }
            return;
        }
        // инструменты измерения/буфера (ФТ.GEO.5) — кнопки теперь в ленте под картой
        const tool = tgt.closest('.kumap-tool-btn');
        if (!tool) return;
        const t = tool.getAttribute('data-tool');
        if (t === 'clear') { clearMeasure(); finishMeasure(); scoutMode = false; syncToolButtons(); return; }
        if (t === 'scout') {
            scoutMode = !scoutMode; syncToolButtons();
            measureBanner(scoutMode
                ? 'Наблюдение: кликните точку на карте — система определит поле по контуру, тип и описание спросят отдельно'
                : null);
            return;
        }
        setMeasureMode(measureMode === t ? null : t);
    }, true);   // capture: maptalks глушит bubbling кликов внутри InfoWindow

    let fieldExtents = {};
    let fieldCodesByName = {};   // имя поля → код (попап при выборе из списка)
    let codeByName = {};         // имя поля → код (зоны хранят имя)
    let tractors = {};
    let trails = {};
    let map;
    let fieldLayer, pathLayer, fleetLayer, zoneLayer, infraLayer, plotLayer;
    let infraPts = [];         // секция INFRA: точки инфраструктуры
    let infraPolys = [];       // секция INFRAPOLY: здания/сооружения
    let plotsCache = [];       // секция PLOTS: кадастровые участки (ФТ3.4)
    let currentTheme = 'crop';
    let themeTouched = false;  // пользователь уже сам менял тему (серв. THEME не перекрывает)
    let fieldsCache = [];
    let zonesByCode = {};      // код поля → zones JSON (секция ZONES)
    let phNormByCode = {};     // код поля → {min, max} нормы pH типа почвы (секция PHN)
    let selectedCode = '';     // код выбранного поля (секция SEL)
    let fieldGeoms = {};       // код поля → geometry (подсветка/зум)
    let geomsByCode = {};      // код поля → настоящий полигон (секция GEOM)
    let sizeObserver = null;   // ResizeObserver: контейнер при монтировании бывает нулевым
    let legendBox = null;      // легенда темы: при первом рендере контейнер ещё не в DOM,
                               // document.getElementById его не видит — держим ссылку
    let sliderWeek = 0;        // ФТ.GEO.4: выбранная неделя (0 = сейчас, без слайдера)
    let sliderTimer = null;    // ▶ анимация по неделям
    let routesCache = [];       // секция ROUTES: маршруты вывоза VRP (ФТ4.4.4)
    let scoutsCache = [];       // секция SCOUT: наблюдения скаутинга (UI-801)
    let mapOrgs = [];           // секция ORGS: организации (демо RLS, ФТ.GEO.7)
    let weatherDays = [];       // C2: секция WTHR — погода на 7 дней
    let orgSelBox = null;       // селектор организаций: ссылка (панель при первом
                                // рендере ещё не в DOM, document.querySelector не видит)
    let scoutLayer = null;
    let scoutMode = false;      // режим «+ наблюдение»: клик по карте
    let centersByCode = {};     // код поля → [lon, lat] центров (для маршрутов)
    let routeLayer = null;
    let markersByCode = {};     // поля БЕЗ контура: маркер в центре (карточка/попап работают)
    let measureLayer = null;   // линейка/площадь/буфер (ФТ.GEO.5)
    let measureMode = null;    // 'line' | 'area' | 'buffer' | null
    let measurePts = [];       // точки текущего измерения
    let pendingSelZoomCode = null; // КОД поля, на которое зумить (не selectedCode из снапшота!)
    let viewEverSet = false;    // общий вид выставлен (повторные рендеры вид не сбрасывают)

    // цвет по культуре
    const cropColors = {
        'Пшеница озимая': '#e6b84c', 'Кукуруза на зерно': '#f0d060',
        'Подсолнечник': '#f5c542', 'Соя': '#88c057', 'Томат': '#e8705a',
        'Чистый пар': '#a0a0a0', 'Рапс озимый': '#c5d86d',
        'Сахарная свёкла': '#d4889e', 'Картофель': '#b8865a',
        'Ячмень яровой': '#d4b36a'
    };
    // КФ-ГК2 (ФТ.GEO): пороги <0.3 красный / >0.7 зелёный, между — градиент
    const ndviColor = function(v) {
        if (!v || v < 0.3) return '#c0392b';
        if (v < 0.4) return '#d4702a';
        if (v < 0.5) return '#c8a020';
        if (v < 0.6) return '#b8bc4a';
        if (v < 0.7) return '#7db84d';
        return '#1f9d6b';
    };
    // цвет по урожайности (градиент красный→жёлтый→зелёный, ФТ.GEO.3)
    const yieldColor = function(fact, plan) {
        if (!fact || !plan) return '#a0a0a0';
        const pct = fact / plan;
        if (pct >= 1.0) return '#1f9d6b';
        if (pct >= 0.9) return '#5cb85c';
        if (pct >= 0.8) return '#92bd4d';
        if (pct >= 0.7) return '#c8c04a';
        if (pct >= 0.6) return '#d4a843';
        return '#e07040';
    };
    // цвет по статусу договора
    const statusColors = {
        'Действует': '#1f9d6b', 'Истёк': '#e07040', 'Черновик': '#a0a0a0',
        'Расторгнут досрочно': '#808080', 'Свободен': '#c5d86d',
        'В аренде': '#1f9d6b', 'Под обременением': '#d4a843', 'Спорный': '#e07040'
    };

    // ⚠ NDVI: симуляция по культуре + сезон (прототип; реальные данные — Sentinel)
    const simNdvi = function(crop) {
        const month = new Date().getMonth() + 1;
        const base = { 'Пшеница озимая': 0.45, 'Кукуруза на зерно': 0.50, 'Подсолнечник': 0.42,
                       'Соя': 0.48, 'Томат': 0.40, 'Чистый пар': 0.15, 'Рапс озимый': 0.44,
                       'Сахарная свёкла': 0.46, 'Картофель': 0.42, 'Ячмень яровой': 0.44 };
        const b = base[crop] || 0.3;
        const season = Math.sin((month - 4) / 7 * Math.PI) * 0.3; // пик в июле-августе
        return Math.max(0.05, Math.min(0.92, b + season));
    };

    // ФТ.GEO.4, временной слайдер: NDVI поля на неделе сезона (1..17, от 1 мая).
    // Эталон — сезонная кривая культуры с пиком в начале июля; у стресс-полей
    // факт резко падает с 3-й недели мая (сценарий ФТ.GEO.1.1 спеки)
    const ndviAtWeek = function(props, week) {
        const base = { 'Пшеница озимая': 0.45, 'Кукуруза на зерно': 0.50, 'Подсолнечник': 0.42,
                       'Соя': 0.48, 'Томат': 0.40, 'Чистый пар': 0.15, 'Рапс озимый': 0.44,
                       'Сахарная свёкла': 0.46, 'Картофель': 0.42, 'Ячмень яровой': 0.44 };
        const b = base[props.crop] || 0.3;
        let v = b + Math.sin((week - 2) / 14 * Math.PI) * 0.35;
        if (props.stress && week >= 3) v = v - (week - 2) * 0.045;
        return Math.max(0.05, Math.min(0.92, v));
    };
    const weekLabel = function(week) {
        if (!week) return 'сейчас';
        const d = new Date(2026, 4, 1 + (week - 1) * 7); // сезон-2026, от 1 мая
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return 'нед. ' + week + ' · ' + dd + '.' + mm + '.26';
    };

    // тема «Внесение удобрений»: доза N из комплексного плана (кг д.в./га)
    const fertColor = function(dose) {
        if (!dose || dose <= 0) return '#c9c9c9';       // без плана питания
        if (dose < 40) return '#e8d44d';
        if (dose < 80) return '#a8c04a';
        if (dose < 120) return '#5f9e46';
        return '#2e7d32';
    };

    // UI-106 «Карта обеспеченности»: шкалы по последнему агрохиманализу
    // (мг/кг; пороги по агрохимическим нормам для чернозёмов/каштановых почв)
    const soilNColor = function(v) {
        if (!v) return '#c9c9c9';
        if (v < 15) return '#c62828';
        if (v < 20) return '#e65100';
        if (v < 25) return '#f9a825';
        if (v < 30) return '#9e9d24';
        return '#2e7d32';
    };
    const soilPColor = function(v) {
        if (!v) return '#c9c9c9';
        if (v < 18) return '#c62828';
        if (v < 24) return '#e65100';
        if (v < 30) return '#f9a825';
        if (v < 36) return '#9e9d24';
        return '#2e7d32';
    };
    const soilKColor = function(v) {
        if (!v) return '#c9c9c9';
        if (v < 140) return '#c62828';
        if (v < 170) return '#e65100';
        if (v < 200) return '#f9a825';
        if (v < 230) return '#9e9d24';
        return '#2e7d32';
    };
    // pH: оптимум 5.5–6.5 зелёный, сильнокислая красная, щелочная синяя
    const soilPhColor = function(v) {
        if (!v) return '#c9c9c9';
        if (v < 5.0) return '#c62828';
        if (v < 5.5) return '#ef6c00';
        if (v < 6.5) return '#2e7d32';
        if (v < 7.0) return '#8bc34a';
        return '#0288d1';
    };
    const soilHumusColor = function(v) {
        if (!v) return '#c9c9c9';
        if (v < 3) return '#c62828';
        if (v < 4) return '#e65100';
        if (v < 5) return '#f9a825';
        if (v < 6) return '#7cb342';
        return '#2e7d32';
    };

    // КФ-ГК1: раскраска участков по сроку договора — пороги 90/365
    // (синхронизировано с уведомлениями ФТ3.3 и contractStateMark):
    // красный ≤90 (вкл. истёкшие), жёлтый 91–365, зелёный >365
    const contractDaysColor = function(days) {
        if (days === null || days === undefined || days === 0) return '#9e9e9e'; // без договора
        if (days <= 90) return '#c0392b';                                         // истёк/истекает ≤90
        if (days <= 365) return '#d4a843';
        return '#1f9d6b';
    };

    // имя культуры в снапшоте = «Культура Сорт» (nameCrop) — матчим по префиксу
    const cropColorOf = function(crop) {
        if (!crop) return '#527034';
        if (cropColors[crop]) return cropColors[crop];
        const keys = Object.keys(cropColors);
        for (let i = 0; i < keys.length; i++) {
            if (crop.indexOf(keys[i]) === 0) return cropColors[keys[i]];
        }
        return '#527034';
    };

    const getThemeColor = function(props) {
        if (sliderWeek > 0) {
            // временной слайдер перекрашивает карту в NDVI выбранной недели
            return ndviColor(ndviAtWeek(props, sliderWeek));
        }
        if (currentTheme === 'yield') {
            return yieldColor(props.factYield, props.planYield);
        } else if (currentTheme === 'ndvi') {
            return ndviColor(props.ndvi);
        } else if (currentTheme === 'fert') {
            return fertColor(props.fertDose);
        } else if (currentTheme === 'stress') {
            // ФТ2.6: отклонение факта NDVI от эталона больше порога (флаг с сервера)
            return props.stress ? '#d32f2f' : '#4caf50';
        } else if (currentTheme === 'agroN') {
            return soilNColor(props.nSoil);
        } else if (currentTheme === 'agroP') {
            return soilPColor(props.soilP);
        } else if (currentTheme === 'agroK') {
            return soilKColor(props.soilK);
        } else if (currentTheme === 'agroPh') {
            // п.16 UI-обзора: шкала ОТ НОРМЫ типа почвы поля (не абсолютная):
            // ниже нормы — красно-оранжевый градиент, в норме — зелёный, выше — синий
            const nm = phNormByCode[props.code];
            if (nm && nm.max > nm.min && props.phSoil) {
                const v = props.phSoil;
                if (v < nm.min) {
                    const d = Math.min(1, (nm.min - v) / Math.max(0.5, nm.min - 4.0));
                    return d > 0.5 ? '#c62828' : '#ef6c00';
                }
                if (v > nm.max) return '#0288d1';
                return '#2e7d32';
            }
            return soilPhColor(props.phSoil);
        } else if (currentTheme === 'agroHumus') {
            return soilHumusColor(props.soilHumus);
        }
        return cropColorOf(props.crop);
    };

    // Растяжка на рабочую область. Карта живёт в двух режимах:
    //  (а) вкладка формы в главном окне — GWT кладёт CUSTOM-ячейку в узкую
    //      колонку (prop-value/flex), ширина ячейки не тянется;
    //  (б) модальное окно (SHOW) — узкая .modal-dialog.
    // Паттерн kuhome.js (дашборд, подтверждён в браузере заказчика): инлайны
    // GWT перезаписывает, поэтому (1) !important через setProperty, (2) класс
    // на модали вместо :has() (старые браузеры :has не умеют), (3) периодическая
    // переприменялка — раскладка клиента меняется и после нашего рендера.
    function stretchKumap(el) {
        try {
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('height', '80vh', 'important');
            el.style.setProperty('min-height', '420px', 'important');
            var p = el.parentElement;
            for (var i = 0; i < 9 && p; i++) {
                var cls = (p.className && p.className.toString) ? p.className.toString() : '';
                if (/prop-value|flex/.test(cls)) {
                    p.style.setProperty('width', '100%', 'important');
                    p.style.setProperty('flex-grow', '1', 'important');
                }
                if (/modal-dialog/.test(cls)) {
                    p.classList.add('kumap-modal');
                    p.style.setProperty('width', '98vw', 'important');
                    p.style.setProperty('max-width', '98vw', 'important');
                    p.style.setProperty('height', '96vh', 'important');
                    p.style.setProperty('max-height', '96vh', 'important');
                    p.style.setProperty('margin', '1vh auto', 'important');
                }
                p = p.parentElement;
            }
        } catch (e) {}
    }

    var stretchTimer = null;
    var lastWidth = -1, lastHeight = -1;
    function startStretchGuard(el) {
        if (stretchTimer) return;
        stretchTimer = setInterval(function() {
            if (!el || !el.isConnected) { clearInterval(stretchTimer); stretchTimer = null; return; }
            if (el.clientWidth < Math.floor(window.innerWidth * 0.55)) stretchKumap(el);
            if (map && (el.clientWidth !== lastWidth || el.clientHeight !== lastHeight)) {
                lastWidth = el.clientWidth; lastHeight = el.clientHeight;
                try { map.checkSize(); } catch (e) {}
            }
        }, 1200);
    }

    window.KuMapComponent = {
        render: function(container, dataString) {
            if (!dataString || dataString.trim() === '') return;
            // п.6 UI-обзора: при повторном открытии формы GWT создаёт НОВЫЙ
            // контейнер — старый maptalks.Map остаётся привязан к удалённому
            // DOM («карта больше не открывается»); пересоздаём при смене хоста
            if (map) {
                let oldHost = null;
                try { oldHost = map.getContainer(); } catch (e) {}
                if (!oldHost || oldHost !== container) {
                    try { map.remove(); } catch (e) {}
                    map = null;
                    fieldLayer = pathLayer = fleetLayer = zoneLayer = infraLayer = null;
                    plotLayer = routeLayer = scoutLayer = measureLayer = null;
                    tractors = {}; trails = {};
                    try { if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null; } } catch (e) {}
                } else {
                    // контейнер в момент первого монтирования часто ещё нулевой
                    // (вкладка не разложена) — maptalks размер сам не пересчитывает
                    try { map.checkSize(); } catch (e) {}
                }
            }
            // растяжка ячейки/модали + CSS-подстраховка (см. stretchKumap)
            try {
                if (!document.getElementById('kumap-host-style')) {
                    var st = document.createElement('style');
                    st.id = 'kumap-host-style';
                    st.textContent = [
                        '.kumap-host{width:100%!important;min-width:480px!important;height:82vh!important;min-height:420px}',
                        '.modal-dialog.kumap-modal, .modal-dialog:has(.kumap-host){width:98vw!important;max-width:98vw!important;height:96vh!important;max-height:96vh!important;margin:1vh auto!important}',
                        '.modal-dialog.kumap-modal .modal-content, .modal-content:has(.kumap-host){width:100%!important;height:100%!important}',
                        '.modal-dialog.kumap-modal .display-flex, .modal-dialog:has(.kumap-host) .display-flex{width:100%!important}'
                    ].join('\n');
                    document.head.appendChild(st);
                }
                container.classList.add('kumap-host');
                container.style.minHeight = '560px';
            } catch (e) {}
            stretchKumap(container);
            startStretchGuard(container);
            window.KuMapComponent._container = container;
            const sections = dataString.split('||');
            // лёгкая интроспекция для headless-проверок (количество полей с
            // контуром/без, участков, зон): снаружи замыкания слои не видны
            try {
                window.KuMapComponent.__snapLen = dataString.length;
            } catch (e) {}
            const fields = [];
            const fieldRows = [];   // п.1 UI-обзора: строки полей — вторым проходом (ниже)
            const fleet = [];
            zonesByCode = {};
            selectedCode = '';
            let mode = 'fields';
            infraPts = []; infraPolys = [];
            plotsCache = [];
            mapOrgs = [];
            scoutsCache = [];
            routesCache = [];
            centersByCode = {};
            geomsByCode = {};
            let serverTheme = '';
            sections.forEach(function(sec) {
                if (sec.startsWith('FLEET')) { mode = 'fleet'; return; }
                if (sec.startsWith('ZONES')) { mode = 'zones'; sec = sec.slice(5); }
                else if (sec.startsWith('GEOM')) { mode = 'geom'; sec = sec.slice(4); }
                else if (sec.startsWith('INFRAPOLY')) { mode = 'infrapoly'; sec = sec.slice(9); }
                else if (sec.startsWith('INFRA')) { mode = 'infra'; sec = sec.slice(5); }
                else if (sec.startsWith('PLOTS')) { mode = 'plots'; sec = sec.slice(5); }
                else if (sec.startsWith('THEME')) { mode = 'theme'; sec = sec.slice(5); }
                else if (sec.startsWith('ROUTES')) { mode = 'routes'; sec = sec.slice(6); }
                else if (sec.startsWith('SCOUT')) { mode = 'scout'; sec = sec.slice(5); }
                else if (sec.startsWith('WTHR')) { mode = 'weather'; sec = sec.slice(4); }
                else if (sec.startsWith('ORGS')) { mode = 'orgs'; sec = sec.slice(4); }
                else if (sec.startsWith('PHN')) { mode = 'phn'; sec = sec.slice(3); }
                else if (sec.startsWith('SEL')) { mode = 'sel'; sec = sec.slice(3); }
                else if (sec.trim() === '') { return; }
                else if (!sec.startsWith('~')) { mode = 'fields'; }
                sec.split('~').forEach(function(rec) {
                    if (!rec || rec.trim() === '') return;
                    const p = rec.split('^');
                    if (mode === 'fleet') {
                        if (p.length >= 5 && parseFloat(p[1]) !== 0) {
                            fleet.push({ id: p[0], lon: parseFloat(p[1]), lat: parseFloat(p[2]),
                                        status: p[3], field: p[4],
                                        speed: p.length >= 6 ? p[5] : '',
                                        fuel: p.length >= 7 ? p[6] : '',
                                        op: p.length >= 8 ? p[7] : '' });
                        }
                    } else if (mode === 'geom') {
                        if (p.length >= 2) geomsByCode[p[0]] = p.slice(1).join('^');
                    } else if (mode === 'infra') {
                        if (p.length >= 4 && parseFloat(p[1]) !== 0) {
                            infraPts.push({ name: p[0], lon: parseFloat(p[1]), lat: parseFloat(p[2]), note: p[3] });
                        }
                    } else if (mode === 'infrapoly') {
                        if (p.length >= 2) infraPolys.push({ name: p[0], polygon: p[1], note: p[2] || '' });
                    } else if (mode === 'plots') {
                        // кадастровый^geojson^номер_договора^дней_до_окончания^код_поля^поля-через-запятую
                        if (p.length >= 4 && p[1]) {
                            plotsCache.push({ cadastral: p[0], polygon: p[1],
                                              contract: p[2], days: parseInt(p[3], 10) || 0,
                                              fieldCode: p[4] || '',
                                              fields: p[5] || '' });
                        }
                    } else if (mode === 'theme') {
                        if (p[0]) serverTheme = p[0];
                    } else if (mode === 'weather') {
                        // C2: W^dayOffset^precipPct^tempC
                        if (p.length >= 3 && p[0].startsWith('W')) {
                            weatherDays.push({ day: parseInt(p[0].slice(1)) || 0,
                                               precip: parseFloat(p[1]) || 0,
                                               temp: parseFloat(p[2]) || 0 });
                        }
                    } else if (mode === 'orgs') {
                        if (p[0]) mapOrgs.push(p[0]);
                    } else if (mode === 'scout') {
                        // lon^lat^тип^код_поля^автор^описание
                        if (p.length >= 6 && parseFloat(p[0]) !== 0) {
                            scoutsCache.push({ lon: parseFloat(p[0]), lat: parseFloat(p[1]),
                                               kind: p[2], fieldCode: p[3], author: p[4], descr: p[5] });
                        }
                    } else if (mode === 'routes') {
                        // машина^поля-через-запятую^тонн^вместимость^км^часы
                        if (p.length >= 6) {
                            routesCache.push({ vehicle: p[0], stops: (p[1] || '').split(',').filter(Boolean),
                                               load: parseFloat(p[2]) || 0, cap: parseFloat(p[3]) || 0,
                                               km: parseFloat(p[4]) || 0, eta: parseFloat(p[5]) || 0 });
                        }
                    } else if (mode === 'zones') {
                        if (p.length >= 2) zonesByCode[p[0]] = p.slice(1).join('^');
                    } else if (mode === 'phn') {
                        if (p.length >= 3) phNormByCode[p[0]] = { min: parseFloat(p[1]) || 0, max: parseFloat(p[2]) || 0 };
                    } else if (mode === 'sel') {
                        selectedCode = p[0] || '';
                    } else if (p.length >= 9 && parseFloat(p[1]) !== 0 && parseFloat(p[2]) !== 0) {
                        // секция GEOM идёт в снапшоте ПОСЛЕ полей — контур подмешиваем
                        // вторым проходом (п.1 UI-обзора: поля пропадали с карты)
                        fieldRows.push(p);
                    }
                });
            });
            // второй проход: геометрия полей известна только после разбора GEOM.
            // Без реального контура поле не рисуется; центр остаётся якорем
            // маршрутов/техники.
            fieldRows.forEach(function(p) {
                const lon = parseFloat(p[1]), lat = parseFloat(p[2]);
                let geometry = null;
                if (geomsByCode[p[7]]) {
                    try { geometry = JSON.parse(geomsByCode[p[7]]); } catch (e) {}
                }
                centersByCode[p[7]] = [lon, lat];
                fields.push({
                    type: 'Feature',
                    geometry: geometry,
                    properties: {
                        name: p[0], area: parseFloat(p[3]), crop: p[4],
                        factYield: parseFloat(p[5]), planYield: parseFloat(p[6]),
                        code: p[7], ndvi: simNdvi(p[4]),
                        fertDose: p.length >= 10 ? parseFloat(p[9]) : 0,
                        contractStatus: p.length >= 11 ? p[10] : '',
                        stress: p.length >= 12 && p[11] === '1',
                        nSoil: p.length >= 13 ? parseFloat(p[12]) : 0,
                        phSoil: p.length >= 14 ? parseFloat(p[13]) : 0,
                        soilP: p.length >= 15 ? parseFloat(p[14]) : 0,
                        soilK: p.length >= 16 ? parseFloat(p[15]) : 0,
                        soilHumus: p.length >= 17 ? parseFloat(p[16]) : 0,
                        plots: p.length >= 18 ? p[17] : ''
                    }
                });
            });
            // серверная подсказка темы (например, из кнопки «Карта обеспеченности»):
            // применяется, только пока пользователь не выбирал тему сам
            if (serverTheme && !themeTouched) {
                currentTheme = serverTheme;
                var themeSel0 = document.querySelector('#kumap-theme');
                if (themeSel0) themeSel0.value = serverTheme;
            }
            // ⚠ фикс 04.10: раньше рисовали fieldsCache, который никто не заполнял
            fieldsCache = fields;
            const data = { fields: { features: fields }, fleet: fleet };

            // инициализация (один раз)
            if (!map) {
                map = new maptalks.Map(container, {
                    center: [73.418, 55.065],
                    zoom: 13,
                    pitch: 0,
                    bearing: 0,
                    baseLayer: new maptalks.TileLayer('base', {
                        urlTemplate: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
                    })
                });
                new maptalks.control.Zoom({ position: 'top-left', slider: false, zoomLevel: false }).addTo(map);
                // п.2 обзора (3-я порция): порядок слоёв — кадастровые участки
                // ПОД полями, поля поверх, затем всё остальное (добавленные
                // раньше рисуются ниже)
                plotLayer = new maptalks.VectorLayer('plots').addTo(map);
                fieldLayer = new maptalks.VectorLayer('fields').addTo(map);
                pathLayer = new maptalks.VectorLayer('paths').addTo(map);
                fleetLayer = new maptalks.VectorLayer('fleet').addTo(map);
                zoneLayer = new maptalks.VectorLayer('zones').addTo(map);
                infraLayer = new maptalks.VectorLayer('infra').addTo(map);
                routeLayer = new maptalks.VectorLayer('routes').addTo(map);
                scoutLayer = new maptalks.VectorLayer('scouts').addTo(map);
                measureLayer = new maptalks.VectorLayer('measure').addTo(map);
                // инструменты ФТ.GEO.5: клики по карте набирают точки измерения,
                // двойной клик завершает; буфер строится по клику (в т.ч. по воде)
                map.on('click', function(e) {
                    if (scoutMode) { addScoutObservation({ lon: e.coordinate.x, lat: e.coordinate.y }); return; }
                    if (!measureMode) return;
                    if (measureMode === 'buffer') { buildBuffer({ lon: e.coordinate.x, lat: e.coordinate.y }); return; }
                    measurePts.push({ lon: e.coordinate.x, lat: e.coordinate.y });
                    redrawMeasure();
                });
                map.on('dblclick', function() { if (measureMode) finishMeasure(); });
                buildUI(container);
                // C2: погодный виджет (7 дней из WTHR-секции)
                updateWeatherWidget(container);
                // фикс нулевого canvas: пересчёт размера после раскладки и при
                // любом изменении размеров контейнера (GWT панели меняют layout)
                var ensureSize = function() { if (map) { try { map.checkSize(); } catch (e) {} } };
                [50, 200, 600, 1500, 3000, 6000].forEach(function(ms) { setTimeout(ensureSize, ms); });
                // п.2 обзора (2-я порция): GWT вызывает первый render ДО раскладки —
                // контейнер нулевой и карта рисуется «в никуда» (пустой холст, пустой
                // список полей). Проверяем размеры с задержками и при «оживании»
                // контейнера делаем полный повторный рендер снапшота
                [300, 900, 2500, 5000].forEach(function(ms) {
                    setTimeout(function() {
                        try {
                            if (container.offsetWidth > 0 && container.offsetHeight > 0
                                    && window.KuMapComponent._lastData
                                    && window.KuMapComponent._container === container) {
                                window.KuMapComponent.render(container, window.KuMapComponent._lastData);
                            }
                        } catch (e) {}
                    }, ms);
                });
                if (window.ResizeObserver && !sizeObserver) {
                    sizeObserver = new ResizeObserver(function() { ensureSize(); });
                    sizeObserver.observe(container);
                }
            }

            // переключение подложки при повторном рендере
            if (data.baseLayer === 'satellite') {
                map.setBaseLayer(new maptalks.TileLayer('sat', {
                    urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
                }));
            } else if (data.baseLayer === 'relief') {
                map.setBaseLayer(new maptalks.TileLayer('rel', {
                    urlTemplate: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
                }));
            }

            // очистить и перерисовать поля
            fieldLayer.clear();
            zoneLayer.clear();
            fieldExtents = {};
            fieldCodesByName = {};
            codeByName = {};
            markersByCode = {};
            fieldGeoms = {};
            phNormByCode = {};   // п.16: нормы pH читаются заново из каждого снапшота
            let fullExtent = null;

            fieldsCache.forEach(function(ft, idx) {
                const props = ft.properties || {};
                // п.2 обзора (4-я порция): поля без контура («Поле-11…29») —
                // маркер в центре: видны на карте, попап и карточка работают
                if (!ft.geometry) {
                    const c = centersByCode[props.code];
                    if (!c) return;
                    try {
                        const mk = new maptalks.Marker(c, {
                            symbol: [
                                { markerType: 'ellipse', markerFill: getThemeColor(props), markerFillOpacity: 0.9,
                                  markerLineColor: '#ffffff', markerLineWidth: 1.5, markerWidth: 11, markerHeight: 11 },
                                { textFaceName: 'sans-serif', textName: props.name || '', textSize: 10,
                                  textFill: '#263238', textDy: -12, textHaloFill: '#fff', textHaloRadius: 1.5 }
                            ], cursor: 'pointer'
                        });
                        mk.setInfoWindow({ containerClass: 'kumap-infowindow', title: props.name || ('Поле ' + (props.code || '')),
                            content: '<div style="font-family:sans-serif;font-size:12px;min-width:200px">'
                                + '<b>' + esc(props.name || '') + '</b><br>'
                                + (props.code ? 'Код: ' + esc(props.code) + '<br>' : '')
                                + (props.area ? 'Площадь: ' + esc(props.area) + ' га<br>' : '')
                                + (props.crop ? 'Культура: ' + esc(props.crop) + '<br>' : '')
                                + (props.plots && props.plots !== '-' ? 'Кадастровые участки: ' + esc(props.plots) + '<br>' : '')
                                + '<i style="color:#64748b">контур не задан — позиция по центру</i><br>'
                                + popupFooter('select', props.code, 'Карточка поля') + '</div>' });
                        mk.on('click', function() { registerPopup(mk); });
                        mk.addTo(fieldLayer);
                        markersByCode[props.code] = mk;
                    } catch (e) { console.warn('kumap: marker error', props.code, e); }
                    return;
                }
                const name = props.name || ('Объект ' + (idx+1));
                const color = getThemeColor(props);
                const isSel = selectedCode && props.code === selectedCode;

                try {
                    const geo = maptalks.GeoJSON.toGeometry(ft);
                    if (geo instanceof maptalks.Polygon || geo instanceof maptalks.MultiPolygon) {
                        const sym = {
                            polygonFill: color, polygonOpacity: 0.4,
                            lineColor: isSel ? '#ffd54f' : (props.stress ? '#b71c1c' : color),
                            lineWidth: isSel ? 4 : (props.stress ? 3 : 2)
                        };
                        if (props.stress && !isSel) sym.lineDasharray = [8, 4];
                        geo.setSymbol(sym);
                        // UI-105: hover-эффект — подсветка полигона при наведении
                        geo.on('mouseenter', function() {
                            try {
                                geo.setSymbol({ polygonFill: color, polygonOpacity: 0.65,
                                    lineColor: isSel ? '#ffd54f' : '#ffffff',
                                    lineWidth: (isSel ? 4 : 3) });
                            } catch (e) {}
                        });
                        geo.on('mouseout', function() {
                            try { geo.setSymbol(sym); } catch (e) {}
                        });
                    } else if (geo instanceof maptalks.Marker) {
                        geo.setSymbol({
                            markerType: 'ellipse', markerFill: color,
                            markerWidth: 12, markerHeight: 12,
                            markerLineColor: '#fff', markerLineWidth: 2
                        });
                    }

                    // popup (ФТ.GEO.6: идентификация + переход к карточке)
                    let popupHtml = '<div style="font-family:sans-serif;font-size:12px;min-width:200px">';
                    popupHtml += '<b>' + esc(name) + '</b>' + (isSel ? ' ★' : '') + '<br>';
                    if (props.code) popupHtml += 'Код: ' + esc(props.code) + '<br>';
                    if (props.area) popupHtml += 'Площадь: ' + esc(props.area) + ' га<br>';
                    if (props.crop) popupHtml += 'Культура: ' + esc(props.crop) + '<br>';
                    if (props.contractStatus) popupHtml += 'Участок: ' + esc(props.contractStatus) + '<br>';
                    if (props.factYield) popupHtml += 'Факт: ' + esc(props.factYield) + ' ц/га<br>';
                    if (props.planYield) popupHtml += 'План: ' + esc(props.planYield) + ' ц/га<br>';
                    if (props.ndvi) popupHtml += 'NDVI: ' + (sliderWeek > 0 ? ndviAtWeek(props, sliderWeek).toFixed(2) : props.ndvi.toFixed(2)) + '<br>';
                    if (props.nSoil || props.soilP || props.soilK || props.phSoil || props.soilHumus)
                        popupHtml += '<i style="color:#64748b">Агрохимия (посл. анализ)</i><br>';
                    if (props.nSoil) popupHtml += 'Азот почвы (посл. анализ): ' + esc(props.nSoil) + ' мг/кг<br>';
                    if (props.soilP) popupHtml += 'Фосфор: ' + esc(props.soilP) + ' мг/кг<br>';
                    if (props.soilK) popupHtml += 'Калий: ' + esc(props.soilK) + ' мг/кг<br>';
                    if (props.phSoil) popupHtml += 'pH: ' + esc(props.phSoil) + '<br>';
                    if (props.soilHumus) popupHtml += 'Гумус: ' + esc(props.soilHumus) + ' %<br>';
                    if (props.stress) popupHtml += '<b style="color:#d32f2f">⚠ Стресс: отклонение NDVI выше порога</b><br>';
                    if (props.fertDose) popupHtml += 'Доза N (план): ' + esc(props.fertDose) + ' кг д.в./га<br>';
                    if (props.plots && props.plots !== '-') popupHtml += 'Кадастровые участки: ' + esc(props.plots) + '<br>';
                    popupHtml += popupFooter('select', props.code, 'Карточка поля') + '</div>';
                    geo.setInfoWindow({ containerClass: 'kumap-infowindow', title: name, content: popupHtml });

                    // п.4 UI-обзора: клик — только попап (открывает maptalks);
                    // карточка — по ссылке из попапа, подсветка придёт с сервера
                    geo.on('click', function() {
                        selectedCode = props.code;
                        registerPopup(geo);
                    });

                    fieldLayer.addGeometry(geo);
                    fieldGeoms[props.code] = geo;

                    const ext = geo.getExtent();
                    if (ext) {
                        fieldExtents[name] = ext;
                        fieldCodesByName[name] = props.code;
                        codeByName[name] = props.code;
                        fullExtent = fullExtent ? fullExtent.combine(ext) : ext;
                    }
                } catch(e) { console.warn('kumap: geometry error', name, e); }
            });

            // инфраструктура хозяйства (картография-эталон KNP): здания и точки;
            // водные объекты (note «водный объект…») — синие, цели буферных зон
            try { infraLayer.clear(); } catch (e) {}
            infraPolys.forEach(function(o) {
                let gj;
                try { gj = JSON.parse(o.polygon); } catch (e) { return; }
                try {
                    const geo = maptalks.GeoJSON.toGeometry({ type: 'Feature', geometry: gj });
                    const isWater = (o.note || '').indexOf('водный объект') === 0;
                    geo.setSymbol(isWater ? {
                        polygonFill: '#42a5f5', polygonOpacity: 0.55,
                        lineColor: '#1565c0', lineWidth: 1.5
                    } : {
                        polygonFill: '#8d6e63', polygonOpacity: 0.55,
                        lineColor: '#5d4037', lineWidth: 1.5
                    });
                    geo.setInfoWindow({ containerClass: 'kumap-infowindow', title: o.name,
                        content: '<div style="font-family:sans-serif;font-size:12px">' + esc(o.note || 'Объект инфраструктуры')
                            + (isWater ? '<br><span style="color:#1565c0">водоохранная зона — инструмент «Буфер»</span>' : '')
                            + popupFooter() + '</div>' });
                    // в режиме буфера клик по водному объекту строит водоохранную зону (ФТ.GEO.2.1)
                    geo.on('click', function(ev) {
                        registerPopup(geo);
                        if (measureMode === 'buffer' && ev && ev.coordinate) {
                            buildBuffer({ lon: ev.coordinate.x, lat: ev.coordinate.y });
                        }
                    });
                    geo.addTo(infraLayer);
                } catch (e) { console.warn('kumap: infra poly error', o.name, e); }
            });
            infraPts.forEach(function(o) {
                try {
                    const marker = new maptalks.Marker([o.lon, o.lat], {
                        symbol: [
                            { markerType: 'ellipse', markerFill: '#37474f', markerFillOpacity: 0.9,
                              markerLineColor: '#ffffff', markerLineWidth: 2, markerWidth: 14, markerHeight: 14 },
                            { textFaceName: 'sans-serif', textName: o.name,
                              textSize: 11, textFill: '#263238', textDy: -16,
                              textHaloFill: '#fff', textHaloRadius: 1.5 }
                        ]
                    });
                    marker.setInfoWindow({ containerClass: 'kumap-infowindow', title: o.name,
                        content: '<div style="font-family:sans-serif;font-size:12px">' + esc(o.note || 'Объект инфраструктуры')
                            + popupFooter() + '</div>' });
                    marker.on('click', function() { registerPopup(marker); });
                    marker.addTo(infraLayer);
                } catch (e) { console.warn('kumap: infra pt error', o.name, e); }
            });

            // ФТ3.4: кадастровые участки — контур поверх поля (пунктир),
            // в теме «срок договора» раскрашиваются по dateTo аренды
            try { plotLayer.clear(); } catch (e) {}
            plotsCache.forEach(function(o) {
                let gj;
                try { gj = JSON.parse(o.polygon); } catch (e) { return; }
                try {
                    const geo = maptalks.GeoJSON.toGeometry({ type: 'Feature', geometry: gj });
                    let c = '#795548';
                    let fieldProps = null;
                    if (currentTheme !== 'contract') {
                        // темы (культура/урожайность/NDVI/агрохимия/стресс) красят
                        // полигоны участков по связанному полю — контуры полей убраны
                        for (var fi = 0; fi < fieldsCache.length; fi++) {
                            if (fieldsCache[fi].properties.code === o.fieldCode) {
                                fieldProps = fieldsCache[fi].properties; break;
                            }
                        }
                    } else {
                        c = contractDaysColor(o.days);
                    }
                    if (fieldProps) c = getThemeColor(fieldProps);
                    const expiryTxt = !o.days ? 'договор не найден'
                        : (o.days < 0 ? 'истёк ' + Math.abs(o.days) + ' дн. назад'
                                      : 'истекает через ' + o.days + ' дн.');
                    geo.setSymbol({
                        polygonFill: c,
                        polygonOpacity: currentTheme === 'contract' ? 0.25 : (fieldProps ? 0.30 : 0.06),
                        lineColor: c, lineWidth: currentTheme === 'contract' ? 3 : 2.5,
                        lineDasharray: [10, 6], lineOpacity: 0.9
                    });
                    const fieldName = o.fields && o.fields !== '-'
                        ? o.fields.split(',').filter(Boolean).map(function(c) {
                            const ft = fieldsCache.filter(function(x) { return x.properties.code === c; })[0];
                            return ft ? ft.properties.name : c;
                          }).join(', ')
                        : (fieldProps ? (fieldProps.name + ' · ' + (fieldProps.crop || '—')) : '');
                    geo.setInfoWindow({ containerClass: 'kumap-infowindow',
                        title: 'Участок ' + o.cadastral,
                        content: '<div style="font-family:sans-serif;font-size:12px;min-width:180px">'
                            + 'Кадастровый номер: ' + esc(o.cadastral) + '<br>'
                            + 'Договор аренды: ' + esc(o.contract || '—') + '<br>'
                            + 'Срок: ' + esc(expiryTxt) + '<br>'
                            + (fieldName ? 'Поля: ' + esc(fieldName) + '<br>' : '')
                            + popupFooter('plot', o.cadastral, 'Карточка участка') + '</div>'
                    });
                    // п.4 UI-обзора: карточка — по ссылке из попапа, не по клику
                    geo.on('click', function() { registerPopup(geo); });
                    geo.addTo(plotLayer);
                } catch (e) { console.warn('kumap: plot error', o.cadastral, e); }
            });

            // UI-801: наблюдения скаутинга — маркеры с иконкой типа
            try { scoutLayer.clear(); } catch (e) {}
            const scoutStyle = {
                'вредители':   { color: '#6a1b9a', icon: '\u{1F41B}' },   // гусеница
                'болезни':     { color: '#e65100', icon: '\u{1F9A0}' },   // микроб
                'стресс':      { color: '#d32f2f', icon: '\u26A0' },      // предупреждение
                'фаза развития': { color: '#00897b', icon: '\u{1F331}' }  // росток
            };
            const fieldNameByCode = {};
            fieldsCache.forEach(function(ft) { fieldNameByCode[ft.properties.code] = ft.properties.name; });
            // совпадающие координаты (центр поля) раскладываем золотым углом
            const spotCount = {};
            scoutsCache.forEach(function(o) {
                const key = o.lon.toFixed(5) + '/' + o.lat.toFixed(5);
                const k = spotCount[key] || 0;
                spotCount[key] = k + 1;
                if (k > 0) {
                    const ang = k * 2.399, rad = 0.0009 + k * 0.0002;
                    o.lon = o.lon + rad * Math.cos(ang);
                    o.lat = o.lat + rad * Math.sin(ang) * 0.6;
                }
            });
            scoutsCache.forEach(function(o) {
                const st = scoutStyle[o.kind] || { color: '#455a64', icon: '\u{1F4CD}' };
                try {
                    const scoutMarker = new maptalks.Marker([o.lon, o.lat], {
                        symbol: [
                            { markerType: 'ellipse', markerFill: st.color, markerFillOpacity: 0.95,
                              markerLineColor: '#ffffff', markerLineWidth: 2, markerWidth: 22, markerHeight: 22 },
                            { textFaceName: 'sans-serif', textName: st.icon, textSize: 12, textDy: 0 }
                        ]
                    });
                    // п.4 UI-обзора: клик — только попап; карточка поля — по ссылке
                    scoutMarker.on('click', function() { registerPopup(scoutMarker); });
                    scoutMarker.setInfoWindow({ containerClass: 'kumap-infowindow', title: 'Наблюдение: ' + o.kind,
                        content: '<div style="font-family:sans-serif;font-size:12px;min-width:190px">'
                            + 'Поле: ' + (o.fieldCode !== '-' ? esc(fieldNameByCode[o.fieldCode] || o.fieldCode) : 'вне полей') + '<br>'
                            + 'Автор: ' + esc(o.author || '—') + '<br>'
                            + (o.descr !== '-' ? 'Описание: ' + esc(o.descr) + '<br>' : '')
                            + popupFooter(o.fieldCode && o.fieldCode !== '-' ? 'select' : null, o.fieldCode, 'Карточка поля') + '</div>'
                    });
                    scoutMarker.addTo(scoutLayer);
                } catch (e) { console.warn('kumap: scout error', e); }
            });

            // UI-801: добавление наблюдения — точка клика, поле по контуру
            function addScoutObservation(pt) {
                let fieldCode = '';
                fieldsCache.forEach(function(ft) {
                    if (fieldCode || !ft.geometry || ft.geometry.type !== 'Polygon') return;
                    if (pointInRing(pt, ft.geometry.coordinates[0])) fieldCode = ft.properties.code;
                });
                const kind = window.prompt('Тип наблюдения (вредители / болезни / стресс / фаза развития):', 'вредители');
                if (kind === null) return;
                const descr = window.prompt('Описание наблюдения:', '') || '';
                if (window.KuMapComponent._controller) {
                    // сервер ставит точку в центр определённого поля (числа через
                    // IMPORT JSON от custom-компонента не доходят — строки только)
                    window.KuMapComponent._controller.change(JSON.stringify({ action: 'scoutadd', objName: fieldCode,
                        kind: kind || 'вредители', descr: descr }));   // п.16: серверный IMPORT JSON ждёт строку
                }
                scoutMode = false;
                syncToolButtons();
                measureBanner(null);
            }

            // ФТ4.4.4: маршруты вывоза (VRP от knp-bridge): депо → поля → депо
            try { routeLayer.clear(); } catch (e) {}
            const DEPOT = [73.4423, 55.0679];   // Весы (центр машинного двора, НПХ «Омское»)
            const routeColors = ['#e53935', '#8e24aa', '#00897b', '#f4511e'];
            routesCache.forEach(function(rt, ri) {
                const path = [DEPOT];
                const stopNames = [];
                rt.stops.forEach(function(code) {
                    if (centersByCode[code]) { path.push(centersByCode[code]); stopNames.push(code); }
                });
                if (path.length < 2) return;
                path.push(DEPOT);
                const rc = routeColors[ri % routeColors.length];
                try {
                    const line = new maptalks.LineString(path, {
                        symbol: { lineColor: rc, lineWidth: 3, lineOpacity: 0.85, lineDasharray: [12, 6] },
                        cursor: 'pointer'
                    });
                    line.setInfoWindow({ containerClass: 'kumap-infowindow', title: 'Маршрут ' + rt.vehicle,
                        content: '<div style="font-family:sans-serif;font-size:12px;min-width:170px">'
                            + 'Поля: ' + esc(stopNames.join(' → ') || '—') + '<br>'
                            + 'Загрузка: <b>' + esc(rt.load) + ' / ' + esc(rt.cap) + ' т</b><br>'
                            + 'Пробег: ' + esc(rt.km) + ' км<br>'
                            + 'В пути: ~' + Math.round(rt.eta * 60) + ' мин'
                            + popupFooter() + '</div>' });
                    line.on('click', function() { registerPopup(line); });
                    line.addTo(routeLayer);
                    // номера визитов на остановках
                    rt.stops.forEach(function(code, si) {
                        const c = centersByCode[code];
                        if (!c) return;
                        new maptalks.Marker(c, {
                            symbol: [
                                { markerType: 'ellipse', markerFill: rc, markerFillOpacity: 0.95,
                                  markerLineColor: '#ffffff', markerLineWidth: 1.5, markerWidth: 18, markerHeight: 18 },
                                { textFaceName: 'sans-serif', textName: String(si + 1),
                                  textSize: 10, textFill: '#fff', textDy: 0 }
                            ]
                        }).addTo(routeLayer);
                    });
                } catch (e) { console.warn('kumap: route error', rt.vehicle, e); }
            });
            if (routesCache.length) {
                new maptalks.Marker(DEPOT, {
                    symbol: [
                        { markerType: 'square', markerFill: '#263238', markerFillOpacity: 0.9,
                          markerLineColor: '#ffffff', markerLineWidth: 2, markerWidth: 16, markerHeight: 16 },
                        { textFaceName: 'sans-serif', textName: 'Депо (МТМ)', textSize: 10,
                          textFill: '#263238', textDy: -14, textHaloFill: '#fff', textHaloRadius: 1.5 }
                    ]
                }).addTo(routeLayer);
            }

            // зоны дифференцированного внесения (k-means, KuYield) — слой поверх полей
            Object.keys(zonesByCode).forEach(function(code) {
                let zj;
                try { zj = JSON.parse(zonesByCode[code]); } catch(e) { return; }
                if (!zj || !zj.zones) return;
                zj.zones.forEach(function(z) {
                    if (!z.polygon) return;
                    // п.16: зона — КРУГ равновеликой площади (bbox-прямоугольник
                    // выглядел артефактом сетки генератора)
                    let cx = 0, cy = 0;
                    z.polygon.forEach(function(c) { cx += c[0]; cy += c[1]; });
                    cx /= z.polygon.length; cy /= z.polygon.length;
                    let area2 = 0;
                    for (let i = 0; i < z.polygon.length; i++) {
                        const p1 = z.polygon[i], p2 = z.polygon[(i + 1) % z.polygon.length];
                        area2 += (p1[0] * p2[1] - p2[0] * p1[1]);
                    }
                    const areaM2 = Math.abs(area2 / 2) * Math.pow(111320, 2)
                        * Math.cos(cy * Math.PI / 180);
                    const radiusM = Math.sqrt(areaM2 / Math.PI);
                    try {
                        const poly = new maptalks.Circle([cx, cy], radiusM, {
                            symbol: {
                                polygonFill: fertColor(z.doseKgDW), polygonOpacity: 0.30,
                                lineColor: '#5d4037', lineWidth: 1, lineDasharray: [4, 3]
                            },
                            cursor: 'pointer'
                        });
                        poly.setInfoWindow({ containerClass: 'kumap-infowindow',
                            title: (zj.field || code) + ' — зона ' + z.zone,
                            content: '<div style="font-size:12px">Азот почвы: ~' + z.meanN + ' мг/кг<br>'
                                + 'Доля поля: ' + Math.round(z.share * 100) + '%<br>'
                                + '<b>Доза: ' + z.doseKgDW + ' кг д.в./га</b><br>'
                                + '<span style="color:#11305e">' + (zj.source || '') + '</span><br>'
                                + popupFooter('select', codeByName[zj.field] || code, 'Карточка поля') + '</div>'
                        });
                        // п.4 UI-обзора: карточка — по ссылке из попапа, не по клику
                        poly.on('click', function() { registerPopup(poly); });
                        poly.addTo(zoneLayer);
                    } catch(e) { console.warn('kumap: zone error', code, e); }
                });
            });

            // п.1 обзора (3-я порция): при ЗАХОДЕ — общий вид (раньше остаточный
            // SEL из снапшота зумил на отдельное поле); зум на поле — только
            // после перехода по ссылке карточки/выбора из списка
            // п.1 обзора (4-я порция): зумим на КОД из клика (selectedCode в
            // снапшоте мог ещё не обновиться — зумило не на то поле)
            var zoomCode = pendingSelZoomCode;
            if (zoomCode && fieldGeoms[zoomCode] && fieldGeoms[zoomCode].getExtent()) {
                map.fitExtent(fieldGeoms[zoomCode].getExtent(), 1, { animation: true, duration: 1200 });
            } else if (zoomCode && centersByCode[zoomCode]) {
                try { map.animateTo({ center: centersByCode[zoomCode], zoom: 15 }, { duration: 1200 }); } catch (e) {}
            } else if (!viewEverSet && fullExtent) {
                map.fitExtent(fullExtent, 0, { animation: true, duration: 1000 });
            }
            viewEverSet = true;
            pendingSelZoomCode = null;

            // fleet (КП09: треки техники)
            if (data.fleet && Array.isArray(data.fleet)) {
                data.fleet.forEach(function(v) {
                    if (!v.lat || !v.lon) return;
                    const coord = [v.lon, v.lat];
                    const sc = v.status === 'В работе' ? '#2ecc71' : (v.status === 'Ремонт' || v.status === 'Критично') ? '#e74c3c' : '#3498db';

                    if (!tractors[v.id]) {
                        const marker = new maptalks.Marker(coord, {
                            symbol: [
                                { markerType: 'ellipse', markerFill: sc, markerFillOpacity: 0.9,
                                  markerLineColor: '#ffffff', markerLineWidth: 2,
                                  markerWidth: 28, markerHeight: 28 }
                            ]
                        });
                        marker.setInfoWindow({ containerClass: 'kumap-infowindow', title: 'Борт: ' + v.id,
                            content: '<div style="font-size:12px">Статус: ' + v.status + '<br>Поле: ' + (v.field||'—')
                                + (v.speed ? '<br>Скорость: ' + v.speed + ' км/ч' : '')
                                + (v.fuel ? '<br>Расход: ' + v.fuel + ' л/ч' : '')
                                + (v.op ? '<br>Операция: ' + v.op : '')
                                + popupFooter() + '</div>' });
                        marker.on('click', function() { registerPopup(marker); });
                        marker.addTo(fleetLayer);
                        tractors[v.id] = marker;
                        trails[v.id] = new maptalks.LineString([coord], {
                            symbol: { lineColor: sc, lineWidth: 3, lineDasharray: [10,10], lineOpacity: 0.7 }
                        }).addTo(pathLayer);
                    } else {
                        const marker = tractors[v.id];
                        const sym = marker.getSymbol();
                        sym[0].markerFill = sc;
                        marker.setSymbol(sym);
                        marker.animateTo({ center: coord }, { duration: 2000, easing: 'linear' });
                        if (trails[v.id]) {
                            const path = trails[v.id].getCoordinates();
                            path.push(new maptalks.Coordinate(coord));
                            trails[v.id].setCoordinates(path);
                        }
                    }
                });
            }

            // список организаций для RLS-демо (ФТ.GEO.7)
            var orgSel2 = orgSelBox || document.querySelector('#kumap-org');
            if (orgSel2) {
                var cur = orgSel2.value;
                orgSel2.innerHTML = '<option value="">Все организации</option>';
                mapOrgs.forEach(function(n) {
                    var o = document.createElement('option');
                    o.value = n; o.text = n;
                    orgSel2.appendChild(o);
                });
                if (cur) orgSel2.value = cur;
            }

            syncSliderVisibility();   // п.16: слайдер NDVI — только при теме NDVI
            syncLayersVisibility();   // п.16: чекбоксы слоёв переживают ре-рендер
            updateLegend();
            // лёгкая интроспекция для headless-проверок: слои в замыкании,
            // снаружи видны только числа
            try {
                window.KuMapComponent._debugGeoms = fieldGeoms;   // headless-пробы попапов
                window.KuMapComponent.__stats = {
                    fieldsTotal: fieldsCache.length,
                    fieldsWithGeom: fieldsCache.filter(function(ft) { return !!ft.geometry; }).length,
                    plots: plotsCache.length,
                    zones: Object.keys(zonesByCode).length,
                    fieldLayerCount: fieldLayer ? fieldLayer.getCount() : -1,
                    plotLayerCount: plotLayer ? plotLayer.getCount() : -1,
                    fleetLayerCount: fleetLayer ? fleetLayer.getCount() : -1
                };
            } catch (e) {}
        }
    };

    // п.16: временной слайдер показывается только для темы NDVI; при уходе
    // с темы — сброс недели (карта красится темой, не слайдером)
    function syncSliderVisibility() {
        const tsEl = document.getElementById('kumap-timeslider');
        if (!tsEl) return;
        const on = currentTheme === 'ndvi';
        tsEl.style.display = on ? '' : 'none';
        if (!on && sliderWeek) {
            sliderWeek = 0;
            const r = tsEl.querySelector('#kumap-ts-range');
            if (r) r.value = 0;
            const l = tsEl.querySelector('#kumap-ts-label');
            if (l) l.textContent = 'сейчас';
        }
    }

    // п.16: ре-рендер пересоздаёт содержимое слоёв видимым — состояние
    // чекбоксов повторно применяется к слоям после каждого рендера
    function syncLayersVisibility() {
        [['kumap-layer-fields', fieldLayer], ['kumap-layer-plots', plotLayer],
         ['kumap-layer-routes', routeLayer], ['kumap-layer-scouts', scoutLayer],
         ['kumap-layer-zones', zoneLayer], ['kumap-layer-infra', infraLayer],
         ['kumap-layer-fleet', fleetLayer], ['kumap-layer-paths', pathLayer]
        ].forEach(function(pair) {
            const cb = document.getElementById(pair[0]);
            if (cb && pair[1]) { try { pair[1][cb.checked ? 'show' : 'hide'](); } catch (e) {} }
        });
    }

    // ===================== UI панель (слои, темы, поля) =====================
    // C2: погодный виджет — 7-дневный прогноз (осадки + t°)
    function updateWeatherWidget(container) {
        const wEl = container.querySelector('#kumap-weather');
        if (!wEl || !weatherDays.length) return;
        wEl.style.display = 'block';
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const today = new Date();
        let html = '<p class="kumap-panel__label" style="margin:0 0 4px;">Прогноз (7 дней)</p>';
        html += '<div style="display:flex;gap:2px;flex-wrap:wrap;">';
        for (let i = 0; i < weatherDays.length; i++) {
            const w = weatherDays[i];
            const d = new Date(today.getTime() + (w.day || 0) * 86400000);
            const precipColor = w.precip >= 60 ? '#4a9e5d' : w.precip >= 30 ? '#c8c04a' : '#8a93a0';
            html += '<div style="text-align:center;padding:2px 4px;background:rgba(17,48,94,.5);border-radius:4px;min-width:36px;">'
                + '<div style="font-size:9px;color:#8a93a0">' + days[d.getDay()] + '</div>'
                + '<div style="font-size:11px;font-weight:700;color:' + precipColor + '">' + Math.round(w.precip) + '%</div>'
                + '<div style="font-size:10px;color:#fff">' + Math.round(w.temp) + '°</div>'
                + '</div>';
        }
        html += '</div>';
        wEl.innerHTML = html;
    }

    function buildUI(container) {
        // C2: погодный виджет — 7-дневный прогноз (осадки + t°)
        const panel = document.createElement('div');
        panel.className = 'kumap-panel';
        panel.innerHTML =
            '<div class="kumap-panel__tabs">'
            + '<button class="kumap-panel__tab kumap-panel__tab--active" data-tab="view">Вид</button>'
            + '<button class="kumap-panel__tab" data-tab="layers">Слои</button>'
            + '<button class="kumap-panel__tab" data-tab="fields">Поля</button>'
            + '</div>'
            + '<div class="kumap-panel__body" data-body="view">'
            + '<p class="kumap-panel__label">Подложка</p>'
            + '<button class="kumap-tile-btn kumap-tile-btn--active" data-tile="osm">Схема</button>'
            + '<button class="kumap-tile-btn" data-tile="satellite">Спутник</button>'
            + '<button class="kumap-tile-btn" data-tile="hybrid">Гибрид</button>'
            + '<button class="kumap-tile-btn" data-tile="relief">Рельеф</button>'
            + '<p class="kumap-panel__label" style="margin-top:10px;">Закладки карты</p>'
            + '<div style="display:flex;gap:4px;">'
            + '<button class="kumap-tile-btn" id="kumap-bm-add" title="Сохранить текущий вид">+ Закладка</button>'
            + '<select id="kumap-bm-list" style="flex:1;min-width:90px;padding:3px;font-size:12px;"><option value="">— виды —</option></select>'
            + '</div>'
            + '<p class="kumap-panel__label" style="margin-top:10px;">Организация (демо изоляции данных)</p>'
            + '<select id="kumap-org" style="width:100%;padding:3px;font-size:12px;"><option value="">Все организации</option></select>'
            + '<div id="kumap-weather" style="margin-top:10px;display:none;"></div>'   // C2: погодный виджет
            + '</div>'
            + '<div class="kumap-panel__body kumap-panel__body--hidden" data-body="layers">'
            + '<p class="kumap-panel__label">Тематическая раскраска</p>'
            + '<select id="kumap-theme" style="width:100%;padding:4px;font-size:12px;">'
            + '<option value="crop">По культуре</option>'
            + '<option value="yield">По урожайности (факт/план)</option>'
            + '<option value="ndvi">По NDVI (вегетация)</option>'
            + '<option value="fert">По внесению удобрений (N, кг д.в./га)</option>'
            + '<option value="agroN">Агрохимия: азот почвы (мг/кг)</option>'
            + '<option value="agroP">Агрохимия: фосфор (мг/кг)</option>'
            + '<option value="agroK">Агрохимия: калий (мг/кг)</option>'
            + '<option value="agroPh">Агрохимия: pH</option>'
            + '<option value="agroHumus">Агрохимия: гумус (%)</option>'
            + '<option value="contract">По сроку договора аренды (участки)</option>'
            + '<option value="stress">По стрессу (отклонение NDVI)</option>'
            + '</select>'
            + '<p class="kumap-panel__label" style="margin-top:8px;">Слои</p>'
            + '<label><input type="checkbox" id="kumap-layer-fields" checked> Контуры полей</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-plots" checked> Кадастровые участки</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-zones" checked> Зоны внесения N</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-infra" checked> Инфраструктура</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-fleet" checked> Техника</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-routes" checked> Маршруты вывоза (VRP)</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-scouts" checked> Наблюдения (скаутинг)</label><br>'
            + '<label><input type="checkbox" id="kumap-layer-paths" checked> Треки</label><br>'
            + '</div>'
            + '<div class="kumap-panel__body kumap-panel__body--hidden" data-body="fields">'
            + '<select id="kumap-field-select" style="width:100%;padding:4px;font-size:12px;">'
            + '<option value="">— выбор поля —</option>'
            + '</select>'
            + '</div>';
        // п.2 UI-обзора: панель и лента прошлого монтирования (смена контейнера)
        try {
            Array.prototype.forEach.call(
                container.parentNode.querySelectorAll('.kumap-panel, .kumap-bottombar'),
                function(el) { if (el.parentNode === container.parentNode) el.remove(); });
        } catch (e) {}
        container.parentNode.appendChild(panel);

        // п.2 UI-обзора: кнопки-инструменты — одной строкой ПОД картой
        const bar = document.createElement('div');
        bar.className = 'kumap-bottombar';
        bar.innerHTML =
            '<button class="kumap-tile-btn kumap-tool-btn" data-tool="line">Линейка</button>'
            + '<button class="kumap-tile-btn kumap-tool-btn" data-tool="area">Площадь</button>'
            + '<button class="kumap-tile-btn kumap-tool-btn" data-tool="buffer">Буфер</button>'
            + '<button class="kumap-tile-btn kumap-tool-btn" data-tool="scout">+ Наблюдение</button>'
            + '<button class="kumap-tile-btn kumap-tool-btn" data-tool="clear">Сброс</button>';
        container.parentNode.insertBefore(bar, container.nextSibling);

        // легенда активной темы (ФТ.GEO.3/UI-105): классы или градиент с порогами
        var legend = document.createElement('div');
        legend.id = 'kumap-legend';
        legend.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:9;'
            + 'background:rgba(255,255,255,0.92);color:#263238;padding:8px 10px;'
            + 'border-radius:6px;font:11px/1.35 sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3);'
            + 'max-width:230px;pointer-events:none';
        container.appendChild(legend);
        legendBox = legend;

        // ФТ.GEO.4: временной слайдер NDVI — анимация динамики вегетации по неделям
        var ts = document.createElement('div');
        ts.id = 'kumap-timeslider';
        ts.style.cssText = 'position:absolute;right:12px;bottom:10px;z-index:9;'
            + 'background:rgba(255,255,255,0.92);color:#263238;padding:8px 10px;'
            + 'border-radius:6px;font:11px/1.3 sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)';
        ts.innerHTML = '<div style="font-weight:600;margin-bottom:4px">Временной слайдер NDVI</div>'
            + '<div style="display:flex;align-items:center;gap:6px">'
            + '<button id="kumap-ts-play" title="Анимация по неделям" style="width:24px;height:24px;'
            + 'border:1px solid #90a4ae;border-radius:4px;background:#fff;cursor:pointer;font-size:11px">▶</button>'
            + '<input type="range" id="kumap-ts-range" min="0" max="17" step="1" value="0" style="width:170px">'
            + '<span id="kumap-ts-label" style="min-width:112px">сейчас</span>'
            + '</div>';
        container.appendChild(ts);
        var tsRange = ts.querySelector('#kumap-ts-range');
        var tsLabel = ts.querySelector('#kumap-ts-label');
        var tsPlay = ts.querySelector('#kumap-ts-play');
        tsRange.addEventListener('input', function() {
            sliderWeek = parseInt(this.value, 10) || 0;
            tsLabel.textContent = weekLabel(sliderWeek);
            if (window.KuMapComponent._lastData) {
                window.KuMapComponent.render(window.KuMapComponent._container, window.KuMapComponent._lastData);
            }
        });
        tsPlay.addEventListener('click', function() {
            if (sliderTimer) {
                clearInterval(sliderTimer); sliderTimer = null;
                tsPlay.textContent = '▶';
                return;
            }
            tsPlay.textContent = '❚❚';
            if (!sliderWeek) { sliderWeek = 1; tsRange.value = 1; }
            sliderTimer = setInterval(function() {
                sliderWeek = sliderWeek >= 17 ? 1 : sliderWeek + 1;
                tsRange.value = sliderWeek;
                tsLabel.textContent = weekLabel(sliderWeek);
                if (window.KuMapComponent._lastData) {
                    window.KuMapComponent.render(window.KuMapComponent._container, window.KuMapComponent._lastData);
                }
            }, 700);
        });

        // табы
        panel.querySelectorAll('.kumap-panel__tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                panel.querySelectorAll('.kumap-panel__tab').forEach(function(t) { t.classList.remove('kumap-panel__tab--active'); });
                this.classList.add('kumap-panel__tab--active');
                panel.querySelectorAll('.kumap-panel__body').forEach(function(b) { b.classList.add('kumap-panel__body--hidden'); });
                panel.querySelector('[data-body="' + this.getAttribute('data-tab') + '"]').classList.remove('kumap-panel__body--hidden');
            });
        });
        // подложки
        panel.querySelectorAll('.kumap-tile-btn[data-tile]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                panel.querySelectorAll('.kumap-tile-btn').forEach(function(b) { b.classList.remove('kumap-tile-btn--active'); });
                this.classList.add('kumap-tile-btn--active');
                const t = this.getAttribute('data-tile');
                const urls = {
                    osm: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
                    satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                    hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
                    relief: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
                };
                map.setBaseLayer(new maptalks.TileLayer('bl_' + t, { urlTemplate: urls[t] }));
            });
        });
        // закладки карты (ФТ.GEO.4 «User Map Bookmark»): локальные, прототип
        var bmAdd = panel.querySelector('#kumap-bm-add');
        var bmList = panel.querySelector('#kumap-bm-list');
        var bmAll = function() {
            try { return JSON.parse(localStorage.getItem('kumap_bookmarks') || '[]'); } catch (e) { return []; }
        };
        var bmRender = function() {
            bmList.innerHTML = '<option value="">— виды —</option>';
            bmAll().forEach(function(b, i) {
                var o = document.createElement('option');
                o.value = String(i); o.text = b.name;
                bmList.appendChild(o);
            });
        };
        bmRender();
        bmAdd.addEventListener('click', function() {
            var name = window.prompt('Имя закладки (текущие центр, зум и тема):', 'Вид ' + (bmAll().length + 1));
            if (!name) return;
            var c = map.getCenter();
            var arr = bmAll();
            arr.push({ name: name, lon: c.x, lat: c.y, zoom: map.getZoom(), theme: currentTheme });
            try { localStorage.setItem('kumap_bookmarks', JSON.stringify(arr)); } catch (e) {}
            bmRender();
        });
        bmList.addEventListener('change', function() {
            var b = bmAll()[parseInt(this.value, 10)];
            if (!b) return;
            try { map.animateTo({ center: [b.lon, b.lat], zoom: b.zoom }, { duration: 600 }); } catch (e) {}
            if (b.theme) {
                var ts = panel.querySelector('#kumap-theme');
                if (ts) { ts.value = b.theme; }
                currentTheme = b.theme;
                if (window.KuMapComponent._lastData) {
                    window.KuMapComponent.render(window.KuMapComponent._container, window.KuMapComponent._lastData);
                }
            }
        });
        // организация (демо RLS): перезапрос снапшота с фильтром
        var orgSel = panel.querySelector('#kumap-org');
        orgSelBox = orgSel;
        orgSel.addEventListener('change', function() {
            if (window.KuMapComponent._controller) {
                window.KuMapComponent._controller.change({ action: 'org', objName: this.value });
            }
        });
        // инструменты измерения/буфера (ФТ.GEO.5) — делегированный обработчик
        // в шапке IIFE: кнопки живут в ленте под картой и пересоздаются
        // вместе с контейнером
        // смена темы
        panel.querySelector('#kumap-theme').addEventListener('change', function() {
            currentTheme = this.value;
            themeTouched = true;  // ручной выбор: серверная подсказка THEME больше не применяется
            syncSliderVisibility();
            // перерисовать
            if (window.KuMapComponent._lastData) {
                window.KuMapComponent.render(window.KuMapComponent._container, window.KuMapComponent._lastData);
            }
        });
        // слои вкл/выкл
        panel.querySelector('#kumap-layer-fields').addEventListener('change', function() { fieldLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-plots').addEventListener('change', function() { plotLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-routes').addEventListener('change', function() { routeLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-scouts').addEventListener('change', function() { scoutLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-zones').addEventListener('change', function() { zoneLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-infra').addEventListener('change', function() { infraLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-fleet').addEventListener('change', function() { fleetLayer[this.checked ? 'show' : 'hide'](); });
        panel.querySelector('#kumap-layer-paths').addEventListener('change', function() { pathLayer[this.checked ? 'show' : 'hide'](); });
    }

    // заполнение списка полей (вызывается после render)
    function updateLegend() {
        updateThemeLegend();   // до early-return: при первом рендере панель ещё не в DOM
        const sel = document.querySelector('#kumap-field-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">— выбор поля —</option>';
        var seen = {};
        fieldsCache.forEach(function(ft) {
            var nm = ft.properties && ft.properties.name;
            if (!nm || seen[nm]) return;
            seen[nm] = 1;
            const opt = document.createElement('option');
            opt.value = nm; opt.text = nm;
            sel.appendChild(opt);
        });
        sel.onchange = function() {
            const name = this.value;
            if (!name) return;
            if (fieldExtents[name]) {
                map.fitExtent(fieldExtents[name], 0, { animation: true, duration: 1500 });
            } else if (fieldCodesByName[name] && centersByCode[fieldCodesByName[name]]) {
                try { map.animateTo({ center: centersByCode[fieldCodesByName[name]], zoom: 15 }, { duration: 1500 }); } catch (e) {}
            }
            // при выборе поля — показать его попап (контур или маркер)
            var code = fieldCodesByName[name];
            if (code) {
                pendingSelZoomCode = code;
                var g = fieldGeoms[code] || markersByCode[code];
                try {
                    if (g && g.openInfoWindow) { g.openInfoWindow(); registerPopup(g); }
                } catch (e) {}
            }
        };
        updateThemeLegend();
    }

    // легенда темы: классы либо градиент с подписями порогов (ФТ.GEO.3)
    function updateThemeLegend() {
        var box = legendBox || document.getElementById('kumap-legend');
        if (!box) return;
        // синхронизация списка тем (серверная подсказка THEME могла прийти
        // раньше, чем панель была построена)
        var selTheme = document.querySelector('#kumap-theme');
        if (selTheme && !themeTouched) selTheme.value = currentTheme;
        var rows = [];
        var item = function(color, label) {
            rows.push('<div style="display:flex;align-items:center;margin:2px 0"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:' + color + ';border:1px solid rgba(0,0,0,.35);margin-right:6px;flex:none"></span><span>' + label + '</span></div>');
        };
        var gradient = function(stops, from, to) {
            rows.push('<div style="margin:4px 0"><div style="height:10px;border-radius:2px;border:1px solid rgba(0,0,0,.35);background:linear-gradient(90deg,' + stops + ')"></div><div style="display:flex;justify-content:space-between"><span>' + from + '</span><span>' + to + '</span></div></div>');
        };

        if (sliderWeek > 0) {
            // режим слайдера: карта показывает NDVI выбранной недели
            gradient('#8b6914,#c8c04a,#5cb85c,#1f9d6b', '0.2', '0.8+');
            item('#d32f2f', 'стресс-поле: провал факта NDVI');
            box.innerHTML = '<div style="font-weight:600;margin-bottom:2px">NDVI · ' + weekLabel(sliderWeek) + '</div>' + rows.join('');
            return;
        }
        switch (currentTheme) {
            case 'crop': {
                const seen = {};
                fieldsCache.forEach(function(ft) {
                    const c = ft.properties && ft.properties.crop;
                    if (c && !seen[c]) { seen[c] = 1; item(cropColorOf(c), c); }
                });
                break;
            }
            case 'ndvi':
                gradient('#8b6914,#c8c04a,#5cb85c,#1f9d6b', '0.2', '0.8+');
                break;
            case 'yield':
                gradient('#e07040,#d4a843,#c8c04a,#5cb85c,#1f9d6b', '&lt;60% плана', '100%+');
                item('#a0a0a0', 'нет данных');
                break;
            case 'fert':
                gradient('#e8d44d,#a8c04a,#5f9e46,#2e7d32', '0', '120+ кг д.в./га');
                item('#c9c9c9', 'без плана питания');
                break;
            case 'agroN': gradient('#c62828,#e65100,#f9a825,#9e9d24,#2e7d32', '&lt;15', '30+ мг/кг'); break;
            case 'agroP': gradient('#c62828,#e65100,#f9a825,#9e9d24,#2e7d32', '&lt;18', '36+ мг/кг'); break;
            case 'agroK': gradient('#c62828,#e65100,#f9a825,#9e9d24,#2e7d32', '&lt;140', '230+ мг/кг'); break;
            case 'agroPh':
                item('#c62828', 'сильнокислая &lt;5.0');
                item('#ef6c00', 'кислая 5.0–5.5');
                item('#2e7d32', 'оптимум 5.5–6.5');
                item('#8bc34a', 'близко к нейтр. 6.5–7.0');
                item('#0288d1', 'щелочная &gt;7.0');
                break;
            case 'agroHumus':
                gradient('#c62828,#e65100,#f9a825,#7cb342,#2e7d32', '&lt;3%', '6%+');
                break;
            case 'contract':
                item('#e07040', 'истекает &lt; 1 года');
                item('#d4a843', 'истекает 1–3 года');
                item('#1f9d6b', 'более 3 лет');
                item('#757575', 'истёк');
                item('#9e9e9e', 'без договора');
                break;
            case 'stress':
                item('#d32f2f', '⚠ стресс: отклонение NDVI');
                item('#4caf50', 'норма');
                break;
        }
        box.innerHTML = '<div style="font-weight:600;margin-bottom:2px">Легенда</div>' + rows.join('');
    }

    // ============ Инструменты: линейка, площадь, буфер (ФТ.GEO.5/2.1) =========
    const M_PER_LAT = 111000, M_PER_LON = 64200;   // метры в градусе на широте хозяйства ~54.9°
    const fmtLen = function(m) { return m < 1000 ? Math.round(m) + ' м' : (m / 1000).toFixed(2) + ' км'; };
    const fmtArea = function(m2) { return m2 < 100000 ? Math.round(m2) + ' м²' : (m2 / 10000).toFixed(1) + ' га'; };
    const distM = function(a, b) {
        const dy = (b.lat - a.lat) * M_PER_LAT, dx = (b.lon - a.lon) * M_PER_LON;
        return Math.sqrt(dx * dx + dy * dy);
    };
    const areaM2 = function(pts) {
        if (pts.length < 3) return 0;
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            s += (a.lon * M_PER_LON) * (b.lat * M_PER_LAT) - (b.lon * M_PER_LON) * (a.lat * M_PER_LAT);
        }
        return Math.abs(s / 2);
    };
    const pointInRing = function(pt, ring) {
        let cnt = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i], b = ring[i + 1];
            if ((a[1] > pt.lat) !== (b[1] > pt.lat) &&
                pt.lon < (b[0] - a[0]) * (pt.lat - a[1]) / (b[1] - a[1]) + a[0]) cnt++;
        }
        return cnt % 2 === 1;
    };
    let measureBannerBox = null;
    function measureBanner(html) {
        if (!measureBannerBox) {
            measureBannerBox = document.createElement('div');
            measureBannerBox.id = 'kumap-measure-info';
            measureBannerBox.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);'
                + 'z-index:10;background:rgba(255,255,255,0.94);color:#263238;padding:7px 12px;'
                + 'border-radius:6px;font:12px/1.4 sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.35);'
                + 'max-width:70%;text-align:center';
            (window.KuMapComponent._container || document.body).appendChild(measureBannerBox);
        }
        measureBannerBox.style.display = html ? 'block' : 'none';
        measureBannerBox.innerHTML = html || '';
    }
    function syncToolButtons() {
        document.querySelectorAll('.kumap-tool-btn').forEach(function(b) {
            const t = b.getAttribute('data-tool');
            b.classList.toggle('kumap-tile-btn--active',
                (measureMode !== null && t === measureMode) || (t === 'scout' && scoutMode));
        });
    }
    function setMeasureMode(mode) {
        measureMode = mode;
        measurePts = [];
        try { measureLayer.clear(); } catch (e) {}
        syncToolButtons();
        if (mode === 'buffer') {
            measureBanner('Буферная зона: кликните по точке на карте — '
                + 'будет построена зона радиусом (по умолчанию 500 м) с подсветкой задетых полей');
        } else if (mode === 'line') {
            measureBanner('Линейка: кликайте точки маршрута · двойной клик — завершить');
        } else if (mode === 'area') {
            measureBanner('Площадь: кликайте вершины контура · двойной клик — завершить');
        } else {
            measureBanner(null);
        }
    }
    function finishMeasure() {
        measureMode = null;
        syncToolButtons();
    }
    function clearMeasure() {
        measurePts = [];
        try { measureLayer.clear(); } catch (e) {}
        measureBanner(null);
    }
    function redrawMeasure() {
        try { measureLayer.clear(); } catch (e) {}
        measurePts.forEach(function(p) {
            new maptalks.Marker([p.lon, p.lat], {
                symbol: { markerType: 'ellipse', markerFill: '#d32f2f', markerWidth: 8,
                          markerHeight: 8, markerLineColor: '#fff', markerLineWidth: 1 }
            }).addTo(measureLayer);
        });
        const coords = measurePts.map(function(p) { return [p.lon, p.lat]; });
        if (measureMode === 'line' && measurePts.length >= 2) {
            new maptalks.LineString(coords, {
                symbol: { lineColor: '#d32f2f', lineWidth: 2.5 }
            }).addTo(measureLayer);
            let total = 0;
            for (let i = 1; i < measurePts.length; i++) total += distM(measurePts[i - 1], measurePts[i]);
            measureBanner('Расстояние: <b>' + fmtLen(total) + '</b> · вершин: ' + measurePts.length
                + ' · двойной клик — завершить');
        } else if (measureMode === 'area' && measurePts.length >= 3) {
            new maptalks.Polygon([coords], {
                symbol: { polygonFill: '#d32f2f', polygonOpacity: 0.15, lineColor: '#d32f2f', lineWidth: 2 }
            }).addTo(measureLayer);
            measureBanner('Площадь: <b>' + fmtArea(areaM2(measurePts)) + '</b> · вершин: ' + measurePts.length
                + ' · двойной клик — завершить');
        }
    }
    // ФТ.GEO.2.1: буфер вокруг водного объекта + подсветка задетых полей
    function buildBuffer(center) {
        const r = parseFloat(window.prompt('Радиус буферной (водоохранной) зоны, метров', '500'));
        if (!r || r <= 0) return;
        try { measureLayer.clear(); } catch (e) {}
        measurePts = [];
        const latRad = center.lat * Math.PI / 180;
        const ring = [];
        for (let i = 0; i <= 48; i++) {
            const a = 2 * Math.PI * i / 48;
            ring.push([center.lon + (r * Math.cos(a)) / (M_PER_LON * Math.cos(latRad)),
                       center.lat + (r * Math.sin(a)) / M_PER_LAT]);
        }
        new maptalks.Polygon([ring], {
            symbol: { polygonFill: '#42a5f5', polygonOpacity: 0.15,
                      lineColor: '#1565c0', lineWidth: 2, lineDasharray: [8, 5] }
        }).addTo(measureLayer);
        const hit = [];
        fieldsCache.forEach(function(ft) {
            if (!ft.geometry || ft.geometry.type !== 'Polygon') return;
            const r0 = ft.geometry.coordinates[0];
            const inside = r0.some(function(p) {
                const dx = (p[0] - center.lon) * M_PER_LON * Math.cos(latRad);
                const dy = (p[1] - center.lat) * M_PER_LAT;
                return Math.sqrt(dx * dx + dy * dy) <= r;
            }) || pointInRing(center, r0);
            if (inside) hit.push(ft);
        });
        hit.forEach(function(ft) {
            const geo = fieldGeoms[ft.properties.code];
            if (geo) {
                new maptalks.Polygon(geo.getCoordinates(), {
                    symbol: { polygonFill: '#d32f2f', polygonOpacity: 0,
                              lineColor: '#d32f2f', lineWidth: 4 }
                }).addTo(measureLayer);
            }
        });
        measureBanner('<b>Выявлено полей в водоохранной зоне: ' + hit.length + '</b>'
            + (hit.length ? ' — ' + hit.map(function(f) { return esc(f.properties.name); }).join(', ') : '')
            + '<br><span style="color:#555">риск попадания средств защиты растений в водный объект '
            + '(буфер ' + esc(fmtLen(r)) + ')</span>');
        finishMeasure();
    }

    // тест-хуки (E2E/CDP): инструменты измерения и символы полей (проверка тем)
    window.KuMapComponent._measure = { setMode: setMeasureMode, buildBuffer: buildBuffer };
    window.KuMapComponent._fieldGeoms = function() { return fieldGeoms; };

    // Канонический API CUSTOM-компонента LSfusion (паттерн agro3d.js):
    // платформа ищет глобальную фабрику window[имяКомпонента] и зовёт
    // render(element) при размещении и update(element, controller, value)
    // при поступлении данных. Без этой фабрики — «Field kumap not found».
    // Мини-карта в карточке участка (UI-102, ФТ3.1): read-only контур на
    // maptalks. Фабрика живёт здесь — kumap.js гарантированно загружен клиентом
    // (отдельный файл реестром скриптов не подхватывается).
    window.kuminimap = function() {
        return {
            render: function(el) {
                // GWT-таблица сплющивает ячейку до высоты строки — важные инлайны
                // (тот же урок, что у растяжки kumap: инлайны без important проигрывают)
                el.style.setProperty('position', 'relative', 'important');
                el.style.setProperty('height', '230px', 'important');
                el.style.setProperty('min-height', '230px', 'important');
                el.style.setProperty('min-width', '340px', 'important');
                el.style.setProperty('overflow', 'hidden', 'important');
                el.style.setProperty('border', '1px solid #b0bec5', 'important');
                el.style.setProperty('border-radius', '6px', 'important');
                el.style.setProperty('background', '#e8ecef', 'important');
                if (!el.__kummGuard) {
                    el.__kummGuard = setInterval(function() {
                        if (!el.isConnected) { clearInterval(el.__kummGuard); el.__kummGuard = null; return; }
                        if (el.clientHeight < 100) {
                            el.style.setProperty('height', '230px', 'important');
                            el.style.setProperty('min-height', '230px', 'important');
                        }
                        if (el.__kumm) { try { el.__kumm.checkSize(); } catch (e) {} }
                    }, 1500);
                }
            },
            update: function(el, controller, value) {
                const s = (typeof value === 'string') ? value : '';
                if (!s) return;
                let m = el.__kumm;
                if (!m) {
                    try {
                        m = new maptalks.Map(el, {
                            center: [73.418, 55.065], zoom: 12, draggable: true, zoomable: true,
                            baseLayer: new maptalks.TileLayer('mm_base', {
                                urlTemplate: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
                            })
                        });
                    } catch (e) { console.warn('kuminimap: init', e); return; }
                    el.__kumm = m;
                    el.__kuml = new maptalks.VectorLayer('mm_layer').addTo(m);
                    [100, 400, 1200].forEach(function(ms) {
                        setTimeout(function() { try { m.checkSize(); } catch (e) {} }, ms);
                    });
                }
                const layer = el.__kuml;
                layer.clear();
                try {
                    const gj = JSON.parse(s);
                    const geo = maptalks.GeoJSON.toGeometry({ type: 'Feature', geometry: gj });
                    geo.setSymbol({
                        polygonFill: '#66bb6a', polygonOpacity: 0.35,
                        lineColor: '#2e7d32', lineWidth: 2.5
                    });
                    layer.addGeometry(geo);
                    const ext = geo.getExtent();
                    if (ext) m.fitExtent(ext, 0);
                } catch (e) { console.warn('kuminimap: geometry', e); }
            }
        };
    };

    window.kumap = function() {
        return {
            render: function(element) {
                element.style.cssText = 'position:relative;height:78vh;min-height:420px;overflow:hidden';
            },
            update: function(element, controller, value) {
                const s = (typeof value === 'string') ? value : '';
                // контроллер храним: клики по полям уходят на сервер (ON CHANGE)
                window.KuMapComponent._controller = controller;
                if (!s) return;
                window.KuMapComponent._lastData = s;
                window.KuMapComponent.render(element, s);
            }
        };
    };
})();
