// Код Урожая: аналитические графики Apache ECharts (Волна 5, КП08).
// CUSTOM-компонент kudash: три графика по снапшоту kuDashData (KuAnalytics):
// PNL (доход/расход + рентабельность), HARVEST (план га / факт т по полям),
// COSTS (структура себестоимости, pie). Транспорт плоская строка kumap-стиля:
// секции ||, строки ~, поля ^. ECharts подключён в KuApp (echarts.min.js).

(function () {
    'use strict';

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

    // ECharts может подгружаться позже — тянем из той же папки статики (kuhome)
    function ensureEcharts(cb) {
        if (window.echarts) { cb(true); return; }
        const probe = document.querySelector('script[src*="kumap.js"], script[src*="kuhome.js"], script[src*="kudash.js"]');
        if (!probe) { cb(false); return; }
        const base = probe.src.replace(/[^/]*$/, '');
        const sc = document.createElement('script');
        sc.src = base + 'echarts.min.js';
        sc.onload = function () { cb(true); };
        sc.onerror = function () { cb(false); };
        document.head.appendChild(sc);
    }

    const C = {
        grid: '#e9edf2', axis: '#8a93a0', ink: '#0b2142',
        income: '#11305e', expense: '#c0392b', rent: '#1f9d6b',
        plan: '#7f8fa0', fact: '#11305e'
    };

    function base(div, title) {
        div.innerHTML = '';
        const head = document.createElement('div');
        head.style.cssText = 'font-size:13px;font-weight:700;color:' + C.ink +
            ';margin:14px 0 6px;padding-left:2px';
        head.textContent = title;
        const body = document.createElement('div');
        body.style.cssText = 'width:100%;height:300px';
        div.appendChild(head);
        div.appendChild(body);
        return body;
    }

    function fmt(v) {
        const n = Number(v);
        if (!isFinite(n)) return v;
        if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' млн';
        if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + ' тыс';
        return String(Math.round(n * 10) / 10);
    }

    function chartPnl(el, rows) {
        const body = base(el, 'Прибыли и убытки по культурам (КП08)');
        const names = rows.map(function (r) { return r[0]; });
        const inc = rows.map(function (r) { return Number(r[1]) || 0; });
        const exp = rows.map(function (r) { return Number(r[2]) || 0; });
        const rent = rows.map(function (r) { return Number(r[4]); });
        const planRent = rows.map(function (r) { return Number(r[6]); });   // КФ-РП2: план (ГП×сценарий)
        const inst = window.echarts.init(body);
        inst.setOption({
            tooltip: { trigger: 'axis' },
            legend: { data: ['Доход', 'Расход', 'Рентабельность, %', 'План: рентабельность, %'], top: 0 },
            grid: { left: 8, right: 14, top: 34, bottom: 8, containLabel: true },
            xAxis: { type: 'category', data: names, axisLabel: { color: C.axis, interval: 0, rotate: names.length > 6 ? 30 : 0 } },
            yAxis: [
                { type: 'value', axisLabel: { color: C.axis, formatter: fmt }, splitLine: { lineStyle: { color: C.grid } } },
                { type: 'value', axisLabel: { color: C.axis, formatter: '{value}%' }, splitLine: { show: false } }
            ],
            series: [
                { name: 'Доход', type: 'bar', data: inc, itemStyle: { color: C.income } },
                { name: 'Расход', type: 'bar', data: exp, itemStyle: { color: C.expense } },
                { name: 'Рентабельность, %', type: 'line', yAxisIndex: 1, data: rent, itemStyle: { color: C.rent }, lineStyle: { width: 2 } },
                { name: 'План: рентабельность, %', type: 'line', yAxisIndex: 1, data: planRent, itemStyle: { color: C.plan }, lineStyle: { width: 2, type: 'dashed' } }
            ]
        });
        return inst;
    }

    function chartHarvest(el, rows) {
        const body = base(el, 'Уборка: план (га) и факт (т) по полям');
        const names = rows.map(function (r) { return r[0]; });
        const plan = rows.map(function (r) { return Number(r[1]) || 0; });
        const fact = rows.map(function (r) { return Number(r[2]) || 0; });
        const inst = window.echarts.init(body);
        inst.setOption({
            tooltip: { trigger: 'axis' },
            legend: { data: ['План, га', 'Факт, т'], top: 0 },
            grid: { left: 8, right: 20, top: 34, bottom: 8, containLabel: true },
            yAxis: { type: 'category', data: names, axisLabel: { color: C.axis } },
            xAxis: { type: 'value', axisLabel: { color: C.axis }, splitLine: { lineStyle: { color: C.grid } } },
            series: [
                { name: 'План, га', type: 'bar', data: plan, itemStyle: { color: C.plan } },
                { name: 'Факт, т', type: 'bar', data: fact, itemStyle: { color: C.fact } }
            ]
        });
        return inst;
    }

    function chartCosts(el, rows) {
        const body = base(el, 'Структура себестоимости по статьям');
        const data = rows.map(function (r) {
            return { name: r[0], value: Number(r[1]) || 0 };
        }).filter(function (d) { return d.value > 0; });
        const inst = window.echarts.init(body);
        inst.setOption({
            tooltip: { trigger: 'item', formatter: '{b}: {c} ₽ ({d}%)' },
            legend: { orient: 'vertical', right: 4, top: 'middle', textStyle: { color: C.ink, fontSize: 11 } },
            series: [{
                type: 'pie', radius: ['38%', '68%'], center: ['38%', '55%'],
                label: { formatter: '{d}%', color: C.ink },
                data: data
            }]
        });
        return inst;
    }

    function draw(el, value) {
        const sections = parseSnapshot(value);
        el.innerHTML = '';
        if (!sections.PNL && !sections.HARVEST && !sections.COSTS) {
            el.innerHTML = '<div style="padding:24px;color:#8a93a0">Нет данных — нажмите «Обновить графики»</div>';
            return;
        }
        ensureEcharts(function (ok) {
            if (!ok) {
                el.innerHTML = '<div style="padding:24px;color:#c0392b">echarts.min.js не загрузился — графики недоступны</div>';
                return;
            }
            const charts = [];
            try {
                if (sections.PNL && sections.PNL.length) charts.push(chartPnl(el, sections.PNL));
                if (sections.HARVEST && sections.HARVEST.length) charts.push(chartHarvest(el, sections.HARVEST));
                if (sections.COSTS && sections.COSTS.length) charts.push(chartCosts(el, sections.COSTS));
            } catch (e) {
                el.innerHTML = '<div style="padding:24px;color:#c0392b">Ошибка отрисовки: ' + String(e).slice(0, 120) + '</div>';
            }
            // GWT раскладывает вкладку после монтирования — пересчёт размеров
            setTimeout(function () {
                charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
            }, 250);
        });
    }

    // канонический API CUSTOM-компонента: фабрика (паттерн kuhome/kumap)
    window.kudash = function () {
        return {
            render: function (element) {
                element.style.cssText = 'height:86vh;min-height:480px;overflow:auto';
            },
            update: function (element, controller, value) {
                draw(element, (typeof value === 'string') ? value : '');
            }
        };
    };
})();
