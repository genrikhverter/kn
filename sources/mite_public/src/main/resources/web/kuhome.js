// Код Урожая: дашборд «сегодня» v2 — CUSTOM-компонент kuhome (UI-002).
// Заменяет HTML-вставку: полный экран, кликабельные карточки (controller.change
// → ON CHANGE kuHomeNav → SHOW формы) и аналитические графики Apache ECharts
// по данным из БД (снапшот kuHomeData собирает refreshKuHome).
// Транспорт — плоская строка kumap-стиля: секции ||, строки ~, поля ^.

(function () {
    'use strict';

    const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
                    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    let charts = [];

    function parseSnapshot(value) {
        const sections = {};
        String(value || '').split('||').forEach(function (sec) {
            const idx = sec.indexOf('~');
            if (idx < 0) return;
            const name = sec.slice(0, idx);
            const rows = [];
            sec.slice(idx).split('~').forEach(function (r) {
                if (r) rows.push(r.split('^'));
            });
            sections[name] = rows;
        });
        return sections;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function nav(controller, target) {
        if (controller && target) {
            controller.change({ action: 'nav', objName: target });
        }
    }

    function renderCards(el, rows, controller) {
        const wrap = el.querySelector('.kuhome-cards');
        wrap.innerHTML = rows.map(function (f) {
            const icon = f[0], label = f[1], value = f[2], color = f[3] || '#222a35',
                  target = f[4] || '';
            const clickable = target ? ' kuhome-card--click' : '';
            return '<div class="kuhome-card' + clickable + '" data-nav="' + esc(target) + '">'
                + '<span class="kuhome-card__icon">' + esc(icon) + '</span>'
                + '<div class="kuhome-card__body">'
                + '<div class="kuhome-card__label">' + esc(label) + '</div>'
                + '<div class="kuhome-card__value" style="color:' + esc(color) + '">' + esc(value) + '</div>'
                + (target ? '<div class="kuhome-card__go">открыть →</div>' : '')
                + '</div></div>';
        }).join('');
        wrap.querySelectorAll('.kuhome-card--click').forEach(function (card) {
            card.onclick = function () { nav(controller, card.getAttribute('data-nav')); };
        });
    }

    function renderCycle(el, rows, controller) {
        const wrap = el.querySelector('.kuhome-cycle');
        wrap.innerHTML = rows.map(function (f) {
            const label = f[0], done = f[1] === '1', target = f[2] || '';
            // групповой разделитель (п.2 UI-обзора): '#Подготовка' — заголовок фазы
            if (label.charAt(0) === '#' && !f[1] && !target)
                return '<span style="display:inline-block;margin:0 10px 0 4px;padding:3px 0;'
                    + 'font-size:10px;font-weight:700;color:#8a93a0;letter-spacing:.4px;'
                    + 'text-transform:uppercase">' + esc(label.slice(1)) + '</span>';
            return '<span class="kuhome-chip' + (done ? ' kuhome-chip--done' : '')
                + (target ? ' kuhome-chip--click' : '') + '" data-nav="' + esc(target) + '">'
                + (done ? '✓ ' : '○ ') + esc(label) + '</span>';
        }).join('');
        wrap.querySelectorAll('.kuhome-chip--click').forEach(function (chip) {
            chip.onclick = function () { nav(controller, chip.getAttribute('data-nav')); };
        });
    }

    function fmtMillions(v) {
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + ' млн ₽';
        if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + ' тыс ₽';
        return Math.round(v) + ' ₽';
    }

    // ECharts может подгружаться после kuhome.js — если глобали нет, тянем
    // echarts.min.js из той же папки статических ресурсов, что и kumap.js.
    function ensureEcharts(cb) {
        if (window.echarts) { cb(true); return; }
        const probe = document.querySelector('script[src*="kumap.js"], script[src*="kuhome.js"]');
        if (!probe) { cb(false); return; }
        const base = probe.src.replace(/[^/]*$/, '');
        const sc = document.createElement('script');
        sc.src = base + 'echarts.min.js';
        sc.onload = function () { cb(true); };
        sc.onerror = function () { cb(false); };
        document.head.appendChild(sc);
    }

    function baseText() {
        return { fontFamily: 'Segoe UI, Roboto, sans-serif', fontSize: 11, color: '#5a6b7b' };
    }

    function chartBdr(rows) {
        const income = [], expense = [], cash = [];
        let cum = 0;
        for (let m = 1; m <= 12; m++) {
            const row = rows.filter(function (r) { return +r[0] === m; })[0] || ['0', 0, 0];
            const inc = +row[1], exp = +row[2];
            income.push(inc);
            expense.push(exp);
            cum += inc - exp;
            cash.push(Math.round(cum));
        }
        return {
            title: { text: 'БДР по месяцам (утв. план) и кассовый поток', left: 8, top: 4, textStyle: baseText() },
            tooltip: { trigger: 'axis', valueFormatter: fmtMillions },
            legend: { top: 26, textStyle: baseText() },
            grid: { left: 8, right: 14, top: 52, bottom: 8, containLabel: true },
            xAxis: { type: 'category', data: MONTHS },
            yAxis: [{ type: 'value', max: function (v) { return Math.ceil(v.max * 1.12); } },
                    { type: 'value' }],
            series: [
                { name: 'Доходы', type: 'bar', barMaxWidth: 26, data: income, itemStyle: { color: '#1f9d6b', borderRadius: 3 } },
                { name: 'Расходы', type: 'bar', barMaxWidth: 26, data: expense, itemStyle: { color: '#d9694f', borderRadius: 3 } },
                { name: 'Кассовый поток (нараст.)', type: 'line', yAxisIndex: 1, data: cash,
                  lineStyle: { color: '#11305e', width: 2 }, itemStyle: { color: '#11305e' },
                  areaStyle: { color: 'rgba(43,108,176,.12)' } }
            ]
        };
    }

    function chartPnl(rows) {
        const crops = rows.map(function (r) { return r[0]; });
        return {
            title: { text: 'P&L по культурам (витрина DWH)', left: 8, top: 4, textStyle: baseText() },
            tooltip: {
                trigger: 'item',
                formatter: function (p) {
                    const r = rows[p.dataIndex];
                    return '<b>' + esc(r[0]) + '</b><br/>доход: ' + fmtMillions(+r[1])
                        + '<br/>расход: ' + fmtMillions(+r[2])
                        + '<br/>маржа: ' + fmtMillions(+r[3]) + ' (рент. ' + r[4] + '%)';
                }
            },
            grid: { left: 8, right: 64, top: 28, bottom: 8, containLabel: true },
            xAxis: { type: 'value', axisLabel: { formatter: function (v) {
                return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + 'М'
                     : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'т' : v;
            } } },
            yAxis: { type: 'category', data: crops },
            series: [{
                type: 'bar',
                data: rows.map(function (r) { return +r[3]; }),
                label: { show: true, position: 'right', formatter: function (p) { return fmtMillions(p.value); }, textStyle: baseText() },
                itemStyle: { color: function (p) { return p.value >= 0 ? '#1f9d6b' : '#b3261e'; }, borderRadius: 3 }
            }]
        };
    }

    function chartArea(rows) {
        return {
            title: { text: 'Структура расходов БДР по статьям', left: 8, top: 4, textStyle: baseText() },
            tooltip: { trigger: 'item', formatter: function (p) { return esc(p.name) + ': ' + fmtMillions(p.value) + ' (' + p.percent + '%)'; } },
            legend: { orient: 'vertical', right: 4, top: 30, itemWidth: 10, itemHeight: 10, textStyle: baseText() },
            series: [{
                type: 'pie', radius: ['34%', '62%'], center: ['32%', '58%'],
                itemStyle: { borderColor: '#fff', borderWidth: 2 },
                label: { show: false },
                data: rows.map(function (r) { return { name: r[0], value: +r[1] }; })
            }]
        };
    }

    function chartNdvi(rows) {
        const dates = rows.map(function (r) { return r[0].slice(5); });
        return {
            title: { text: 'NDVI поля-героя KH-001: эталон vs факт', left: 8, top: 4, textStyle: baseText() },
            tooltip: { trigger: 'axis' },
            legend: { top: 26, textStyle: baseText() },
            grid: { left: 8, right: 14, top: 52, bottom: 8, containLabel: true },
            xAxis: { type: 'category', data: dates },
            yAxis: { type: 'value', min: 0, max: 0.9 },
            series: [
                { name: 'Эталон (модель)', type: 'line', data: rows.map(function (r) { return +r[1]; }),
                  lineStyle: { color: '#11305e', width: 2 }, itemStyle: { color: '#11305e' }, showSymbol: false },
                { name: 'Факт (спутник)', type: 'scatter', symbolSize: 10, symbol: 'circle',
                  data: rows.map(function (r) { return r[2] === '' ? null : +r[2]; }),
                  itemStyle: { color: '#b3261e', borderColor: '#7a1410', borderWidth: 1 } }
            ]
        };
    }

    // GWT раскладывает вкладку после монтирования: echarts.init в нулевом
    // контейнере рисует пустой canvas. Ждём ненулевой ширины (паттерн kumap),
    // затем ResizeObserver держит размер актуальным.
    let chartsRO = null;
    let chartsWinResizeBound = false;   // слушатель window.resize — один на все рендеры

    function renderCharts(el, sections) {
        charts.forEach(function (c) { try { c.dispose(); } catch (e) {} });
        charts = [];
        if (chartsRO) { try { chartsRO.disconnect(); } catch (e) {} }
        const boxes = [
            ['kuhome-chart-bdr', chartBdr, sections.BDR],
            ['kuhome-chart-pnl', chartPnl, sections.PNL],
            ['kuhome-chart-area', chartArea, sections.COSTS],
            ['kuhome-chart-ndvi', chartNdvi, sections.NDVI]
        ];
        const pending = [];
        boxes.forEach(function (b) {
            const div = el.querySelector('.' + b[0]);
            if (!div) return;
            div.innerHTML = '';
            if (!b[2] || !b[2].length) {
                div.innerHTML = '<div class="kuhome-empty">нет данных — обновите сводку/витрины</div>';
                return;
            }
            pending.push({ div: div, make: b[1], rows: b[2] });
        });
        let tries = 0;
        (function initWhenLaidOut() {
            const ready = pending.filter(function (p) { return !p.div.clientWidth; });
            if (ready.length && tries++ < 40) { setTimeout(initWhenLaidOut, 150); return; }
            pending.forEach(function (p) {
                if (!p.div.clientWidth) return; // так и не разложилась — не муслорим canvas
                const inst = window.echarts.init(p.div);
                inst.setOption(p.make(p.rows));
                charts.push(inst);
            });
            if (chartsRO) { try { chartsRO.disconnect(); } catch (e) {} }
            chartsRO = new ResizeObserver(function () {
                charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
            });
            charts.forEach(function (c) { try { chartsRO.observe(c.getDom()); } catch (e) {} });
        })();
        if (!chartsWinResizeBound) {
            chartsWinResizeBound = true;
            window.addEventListener('resize', function () {
                charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
            });
        }
    }

    function styleOnce() {
        if (document.getElementById('kuhome-style')) return;
        const st = document.createElement('style');
        st.id = 'kuhome-style';
        st.textContent = [
            '.kuhome{font-family:Segoe UI,Roboto,sans-serif;color:#222a35;padding:14px 16px;background:#f0f2f5;box-sizing:border-box}',
            '.kuhome *{box-sizing:border-box}',
            '.kuhome-head{display:flex;align-items:baseline;gap:12px;margin-bottom:10px}',
            '.kuhome-head__title{font-size:18px;font-weight:800;color:#0b2142}',
            '.kuhome-head__sub{font-size:12px;color:#8a93a0}',
            '.kuhome-cycle{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}',
            '.kuhome-chip{display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;background:#e8e8e8;color:#555;cursor:default}',
            '.kuhome-chip--done{background:#BED6A5;color:#0b2142;font-weight:600}',
            '.kuhome-chip--click{cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.15)}',
            '.kuhome-chip--click:hover{filter:brightness(1.08)}',
            '.kuhome-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:10px;margin-bottom:16px}',
            '.kuhome-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;gap:10px;align-items:center;box-shadow:0 1px 2px rgba(16,24,40,.05)}',
            '.kuhome-card--click{cursor:pointer;transition:box-shadow .15s,transform .15s}',
            '.kuhome-card--click:hover{box-shadow:0 4px 12px rgba(16,24,40,.14);transform:translateY(-1px)}',
            '.kuhome-card__icon{font-size:22px}',
            '.kuhome-card__label{font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:#8a93a0}',
            '.kuhome-card__value{font-size:21px;font-weight:800;line-height:1.25}',
            '.kuhome-card__go{font-size:10px;color:#11305e;opacity:0;transition:opacity .15s}',
            '.kuhome-card--click:hover .kuhome-card__go{opacity:1}',
            '.kuhome-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px}',
            '.kuhome-chartbox{background:#fff;border:1px solid #e2e8f0;border-radius:10px;height:340px}',
            '.kuhome-empty{display:flex;align-items:center;justify-content:center;height:100%;color:#8a93a0;font-size:12px}'
        ].join('\n');
        document.head.appendChild(st);
    }

    // GWT не растягивает ячейку свойства под CUSTOM-компонент (паттерн kumap):
    // поднимаемся по flex-родителям и разворачиваем на всю вкладку
    function stretchCell(el) {
        try {
            el.style.width = '100%';
            var p = el.parentElement;
            for (var i = 0; i < 7 && p; i++) {
                var cls = (p.className && p.className.toString) ? p.className.toString() : '';
                if (/prop-value|flex/.test(cls)) { p.style.width = '100%'; p.style.flexGrow = '1'; }
                p = p.parentElement;
            }
        } catch (e) {}
    }

    window.KuHomeComponent = {
        render: function (el, value, controller) {
            styleOnce();
            stretchCell(el);
            el.innerHTML =
                '<div class="kuhome">'
                + '<div class="kuhome-head"><span class="kuhome-head__title">Код Урожая</span></div>'
                + '<div class="kuhome-cycle"></div>'
                + '<div class="kuhome-cards"></div>'
                + '<div class="kuhome-charts">'
                + '<div class="kuhome-chartbox kuhome-chart-bdr"></div>'
                + '<div class="kuhome-chartbox kuhome-chart-pnl"></div>'
                + '<div class="kuhome-chartbox kuhome-chart-area"></div>'
                + '<div class="kuhome-chartbox kuhome-chart-ndvi"></div>'
                + '</div></div>';
            if (!value) return;
            const sections = parseSnapshot(value);
            if (sections.CARDS) renderCards(el, sections.CARDS, controller);
            if (sections.CYCLE) renderCycle(el, sections.CYCLE, controller);
            ensureEcharts(function (ok) {
                if (ok) renderCharts(el, sections);
                else el.querySelector('.kuhome-charts').innerHTML =
                    '<div class="kuhome-empty">echarts.min.js не загрузился — графики недоступны</div>';
            });
        }
    };

    // Канонический API CUSTOM-компонента LSfusion (паттерн agro3d.js/kumap.js)
    window.kuhome = function () {
        return {
            render: function (element) {
                element.style.cssText = 'height:86vh;min-height:480px;overflow:auto';
            },
            update: function (element, controller, value) {
                window.KuHomeComponent._controller = controller;
                window.KuHomeComponent.render(element, (typeof value === 'string') ? value : '', controller);
            }
        };
    };
})();
