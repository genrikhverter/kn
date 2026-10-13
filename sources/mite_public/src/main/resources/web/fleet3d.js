// Агродиспетчер 3D — этап 3: задания КУ (операции, нормы МТР, зоны NPK).
// Поля раскрашены по операции (вспашка/сев/опрыскивание/уборка), панель МТР.
// Данные: FLD^code^lat^lon^area^crop^op^mat^doseN^status ~ MCH^... ~ MTR^name^minStock^price^unit
function fleet3d() {
    var C = {
        bg: 0x0b2142, grid: 0x1a3a5c, accent: 0xBED6A5,
        machineAlarm: 0xc0392b
    };
    // цвет поля по операции («что вносит/что жнёт»)
    var OP_COLORS = {
        'Вспашка': 0x6d4c2f, 'Культивация': 0x8a6b3d, 'Боронование': 0xa0784a,
        'Посев': 0x3d7a2e, 'Сев': 0x3d7a2e,
        'Опрыскивание': 0x88c057, 'Внесение удобрений': 0x4a9e3d,
        'Уборка': 0xf2c200, 'Уборка урожая': 0xf2c200,
        'Обработка': 0x5b8c5a
    };
    var TYPE_INFO = {
        tractor: { label: 'Трактор', color: 0x3a7bd5, w: 14, h: 7, d: 28 },
        combine: { label: 'Комбайн', color: 0xf2c200, w: 16, h: 9, d: 30 },
        sprayer: { label: 'Опрыскиватель', color: 0x88c057, w: 12, h: 6, d: 32 },
        spreader: { label: 'Разбрасыватель', color: 0xe8705a, w: 12, h: 6, d: 26 },
        drone: { label: 'Агродрон', color: 0x9b59b6, w: 6, h: 3, d: 6 },
        truck: { label: 'Зерновоз', color: 0x7f8c8d, w: 10, h: 6, d: 22 }
    };
    var R_EARTH = 6371000;

    function ensureThree(cb) {
        if (window.THREE) { cb(true); return; }
        var s = document.createElement('script');
        s.src = 'static/web/three.min.js';
        s.onload = function () { cb(true); };
        s.onerror = function () { cb(false); };
        document.head.appendChild(s);
    }

    function parseData(str) {
        var fields = [], machines = [], mtrs = [], prevented = 0;
        if (!str) return { fields: fields, machines: machines, mtrs: mtrs, prevented: prevented };
        var recs = str.split('~');
        for (var j = 0; j < recs.length; j++) {
            var r = recs[j]; if (!r) continue;
            if (r.startsWith('FLD^')) {
                var p = r.split('^');
                // C2: p[10] — GeoJSON-контур (boundaryGeoJson), парсим полигон
                var geo = null;
                if (p[10] && p[10].length > 10) {
                    try { geo = JSON.parse(p[10]); } catch(e) { geo = null; }
                }
                var ring = null;
                if (geo && geo.coordinates && geo.coordinates[0] && geo.coordinates[0].length >= 3) {
                    ring = geo.coordinates[0].slice(0, 60); // ≤60 точек — предохранитель
                }
                fields.push({ code: p[1], lat: +p[2] || 55, lon: +p[3] || 73,
                              area: +p[4] || 0, crop: p[5] || '-',
                              op: p[6] || '-', mat: p[7] || '-',
                              doseN: +p[8] || 0, status: p[9] || 'ok',
                              ring: ring });
            } else if (r.startsWith('MCH^')) {
                var m = r.split('^');
                machines.push({ code: m[1], lat: +m[2] || 55, lon: +m[3] || 73,
                                area: +m[4] || 0, crop: m[5] || '-', stress: m[6] === '1',
                                type: m[7] || 'tractor', speed: +m[8] || 0,
                                fuel: +m[9] || 0, alarm: m[10] === 'alarm' });
            } else if (r.startsWith('MTR^')) {
                var t = r.split('^');
                mtrs.push({ name: t[1], minStock: +t[2] || 0, price: +t[3] || 0, unit: t[4] || '-' });
            } else if (r.startsWith('KPI^')) {
                prevented = +r.split('^')[1] || 0;
            }
        }
        return { fields: fields, machines: machines, mtrs: mtrs, prevented: prevented };
    }

    function opColor(op) {
        for (var k in OP_COLORS) { if (op && op.indexOf(k) >= 0) return OP_COLORS[k]; }
        return 0x2d5a1e; // дефолт — зелёный
    }

    function project(lat, lon, orgLat, orgLon) {
        var x = (lon - orgLon) * R_EARTH * Math.cos(orgLat * Math.PI / 180) * Math.PI / 180;
        var z = -(lat - orgLat) * R_EARTH * Math.PI / 180;
        return { x: x, z: z };
    }

    var instances = new WeakMap();

    // п.22: сцена — на всю рабочую область (GWT кладёт CUSTOM-ячейку в узкий
    // контейнер; паттерн stretchKumap: инлайны с !important + переприменялка)
    var stretchTimer = null;
    function stretch3d(el) {
        try {
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('height', '72vh', 'important');
            el.style.setProperty('min-height', '420px', 'important');
        } catch (e) {}
    }

    function buildScene(el, data) {
        stretch3d(el);
        var W = el.clientWidth || 800, H = el.clientHeight || 500;
        var renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(W, H);
        renderer.setClearColor(C.bg, 1);
        el.innerHTML = '';
        el.appendChild(renderer.domElement);
        el.style.position = 'relative';
        el.style.overflow = 'hidden';

        var scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(C.bg, 0.00002);
        var camera = new THREE.PerspectiveCamera(50, W / H, 1, 50000);
        camera.position.set(0, 600, 500);
        scene.add(new THREE.AmbientLight(0x606060, 1.5));
        var dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(500, 1000, 300); scene.add(dir);
        var grid = new THREE.GridHelper(5000, 50, C.grid, C.grid);
        grid.material.opacity = 0.3; grid.material.transparent = true;
        scene.add(grid);

        var org = { lat: data.machines.length ? data.machines[0].lat : 55,
                    lon: data.machines.length ? data.machines[0].lon : 73 };

        // --- поля (C2: GeoJSON-полигоны или fallback-боксы) ---
        var fieldMeshes = {};
        for (var fi = 0; fi < data.fields.length; fi++) {
            var f = data.fields[fi];
            var pos = project(f.lat, f.lon, org.lat, org.lon);
            var sz = Math.max(50, Math.sqrt(f.area * 10000) * 0.05);
            var fc = f.status === 'stress' ? 0x8b4000 : opColor(f.op);
            var mat = new THREE.MeshLambertMaterial({ color: fc, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
            var mesh;
            if (f.ring && f.ring.length >= 3) {
                // C2: полигон из GeoJSON — проецируем в XZ и строим Shape
                var shape = new THREE.Shape();
                for (var ri = 0; ri < f.ring.length; ri++) {
                    var rp = project(f.ring[ri][1], f.ring[ri][0], org.lat, org.lon);
                    if (ri === 0) shape.moveTo(rp.x, rp.z);
                    else shape.lineTo(rp.x, rp.z);
                }
                shape.closePath();
                mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
                mesh.rotation.x = -Math.PI / 2; // XY → XZ
                mesh.position.y = 1;
                // контур
                var linePts = [];
                for (var li = 0; li < f.ring.length; li++) {
                    var lp = project(f.ring[li][1], f.ring[li][0], org.lat, org.lon);
                    linePts.push(new THREE.Vector3(lp.x, 2, lp.z));
                }
                linePts.push(linePts[0]);
                var line = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(linePts),
                    new THREE.LineBasicMaterial({ color: 0xBED6A5, linewidth: 1 })
                );
                scene.add(line);
            } else {
                // fallback: бокс по центру (поля без GeoJSON)
                mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, 2, sz * 0.7), mat);
                mesh.position.set(pos.x, 1, pos.z);
            }
            mesh.userData = f;
            scene.add(mesh);
            fieldMeshes[f.code] = mesh;
        }

        // --- машины ---
        // --- машины (C2: процедурные 3D-модели из примитивов) ---
        function buildMachine(type, color) {
            var g = new THREE.Group();
            var mat = new THREE.MeshLambertMaterial({ color: color });
            var dark = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
            var glass = new THREE.MeshLambertMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.7 });
            if (type === 'combine') {
                // комбайн: жатка (широкая) + кабина + бункер + корпус
                g.add(new THREE.Mesh(new THREE.BoxGeometry(24, 2, 4), mat)); // жатка
                g.children[0].position.set(0, 1, -16);
                var body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 18), mat); g.add(body);
                var cab = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 5), glass); cab.position.set(0, 5, -4); g.add(cab);
                var tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 8), mat); tank.position.set(0, 6, 3); g.add(tank);
                g.add(wheel(4, 4, 5, 0), wheel(4, 4, 5, 0.1), wheel(3, 2, -5, 0.2), wheel(3, 2, -5, 0.3));
            } else if (type === 'sprayer') {
                // опрыскиватель: узкий корпус + штанга (горизонтальная балка)
                var body2 = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 14), mat); g.add(body2);
                var tank2 = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 10, 8), mat); tank2.rotation.x = Math.PI / 2; tank2.position.set(0, 4, 0); g.add(tank2);
                var boom = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 1), mat); boom.position.set(0, 3, -7); g.add(boom);
                g.add(wheel(2.5, 3, 4, 0), wheel(2.5, 3, -4, 0.1));
            } else if (type === 'drone') {
                // агродрон: 4 луча + винты
                var hub = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), mat); g.add(hub);
                for (var di = 0; di < 4; di++) {
                    var ang = di * Math.PI / 2;
                    var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 4), mat);
                    arm.rotation.z = Math.PI / 2; arm.rotation.y = ang; arm.position.set(Math.cos(ang) * 3, 0, Math.sin(ang) * 3);
                    g.add(arm);
                    var rotor = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 8), dark);
                    rotor.position.set(Math.cos(ang) * 5, 0.5, Math.sin(ang) * 5); g.add(rotor);
                }
            } else if (type === 'truck') {
                // зерновоз: кабина + кузов
                var cab3 = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), mat); cab3.position.set(0, 3, -8); g.add(cab3);
                var bed = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 14), mat); bed.position.set(0, 3, 2); g.add(bed);
                g.add(wheel(2, 3, -7, 0), wheel(2, 3, -7, 0.1), wheel(2.5, 3, 4, 0.2), wheel(2.5, 3, 4, 0.3));
            } else {
                // трактор (default): капот + кабина + большие задние колёса
                var hood = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 8), mat); hood.position.set(0, 3, -5); g.add(hood);
                var cabT = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), glass); cabT.position.set(0, 5, 2); g.add(cabT);
                var bodyT = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 12), mat); g.add(bodyT);
                g.add(wheel(4, 3, 5, 0), wheel(4, 3, 5, 0.1), wheel(2.5, 2, -5, 0.2), wheel(2.5, 2, -5, 0.3));
            }
            return g;
        }
        function wheel(radius, width, zOffset, side) {
            var w = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 10),
                new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
            w.rotation.z = Math.PI / 2;
            w.position.set(side < 0.15 ? -3.5 : 3.5, radius, zOffset);
            return w;
        }

        var machines = [];
        for (var mi = 0; mi < data.machines.length; mi++) {
            var m = data.machines[mi];
            var ti = TYPE_INFO[m.type] || TYPE_INFO.tractor;
            var pos = project(m.lat, m.lon, org.lat, org.lon);
            var color = m.alarm ? C.machineAlarm : ti.color;
            var machine = buildMachine(m.type, color);
            machine.position.set(pos.x, 0, pos.z);
            machine.scale.set(0.5, 0.5, 0.5); // масштаб сцены
            machine.userData = Object.assign({}, m, { typeLabel: ti.label, t: mi * 37, speedAnim: 0.4 + mi * 0.15 });
            scene.add(machine);
            machines.push(machine);
        }

        // --- карточка (клик по полю или машине) ---
        var card = document.createElement('div');
        card.style.cssText = 'position:absolute;top:40px;right:8px;width:260px;background:rgba(17,48,94,.92);' +
            'border-radius:8px;padding:10px 12px;font:12px/1.5 sans-serif;color:#fff;z-index:10;display:none';
        el.appendChild(card);

        var raycaster = new THREE.Raycaster();
        var mouse = new THREE.Vector2();
        var allMeshes = machines.concat(Object.keys(fieldMeshes).map(function(k) { return fieldMeshes[k]; }));
        el.addEventListener('click', function (e) {
            var rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            var hits = raycaster.intersectObjects(allMeshes, true); // recursive — для THREE.Group-машин
            if (hits.length > 0) {
                // поднимаемся до объекта с userData (THREE.Group-машина)
                var hitObj = hits[0].object;
                while (hitObj && !hitObj.userData.typeLabel && !hitObj.userData.crop) hitObj = hitObj.parent;
                if (!hitObj) { card.style.display = 'none'; return; }
                var u = hitObj.userData;
                card.style.display = 'block';
                if (u.typeLabel) {
                    // машина (этап 4: + кнопка «Принять меры» при тревоге)
                    card.innerHTML =
                        '<div style="font-weight:700;font-size:14px;margin-bottom:6px">' + u.typeLabel + ' · ' + u.code + '</div>' +
                        row('Скорость', u.speed, ' км/ч', u.speed > 12) +
                        row('Топливо', u.fuel, ' %', u.fuel < 20) +
                        row('Поле', u.crop, '', false) +
                        (u.alarm
                            ? '<div style="color:#e74c3c;font-weight:700;margin-top:6px">⚠ ТРЕВОГА</div>' +
                              '<button id="fleet3d-incident" style="margin-top:6px;padding:6px 12px;border:none;border-radius:6px;background:#e74c3c;color:#fff;font-weight:700;cursor:pointer">Принять меры</button>'
                            : '<div style="color:#27ae60;margin-top:6px">✓ Норма</div>');
                    // этап 4: обработчик кнопки инцидента
                    var btn = card.querySelector('#fleet3d-incident');
                    if (btn) {
                        btn.addEventListener('click', function(ev) {
                            ev.stopPropagation();
                            if (controller && controller.change) {
                                controller.change(JSON.stringify({ action: 'incident', objCode: u.code }));
                            }
                            btn.textContent = '✓ Меры приняты';
                            btn.disabled = true;
                            btn.style.background = '#27ae60';
                        });
                    }
                } else {
                    // поле
                    card.innerHTML =
                        '<div style="font-weight:700;font-size:14px;margin-bottom:6px">' + u.code + ' · ' + u.crop + '</div>' +
                        row('Площадь', u.area, ' га', false) +
                        row('Операция', u.op, '', false) +
                        row('Материал', u.mat, '', false) +
                        row('Доза N', u.doseN, ' кг д.в./га', false) +
                        (u.status === 'stress' ? '<div style="color:#e67e22;margin-top:6px">⚠ Стресс поля</div>' : '');
                }
            } else {
                card.style.display = 'none';
            }
        });
        function row(label, val, unit, warn) {
            var color = warn ? '#e74c3c' : '#fff';
            return '<div style="display:flex;justify-content:space-between"><span style="color:#8a93a0">' + label +
                '</span><span style="color:' + color + ';font-weight:600">' + (val !== undefined ? val : '—') + unit + '</span></div>';
        }

        // --- панель МТР (этап 3) ---
        var mtrPanel = document.createElement('div');
        mtrPanel.style.cssText = 'position:absolute;bottom:8px;left:8px;width:280px;background:rgba(17,48,94,.88);' +
            'border-radius:8px;padding:8px 10px;font:11px/1.4 sans-serif;color:#fff;z-index:10';
        el.appendChild(mtrPanel);
        function refreshMtr() {
            if (!data.mtrs.length) { mtrPanel.style.display = 'none'; return; }
            var html = '<div style="font-weight:700;margin-bottom:4px;color:' + '#BED6A5' + '">Материалы (СЗР / удобрения)</div>';
            for (var i = 0; i < data.mtrs.length && i < 6; i++) {
                var m = data.mtrs[i];
                html += '<div style="display:flex;justify-content:space-between;padding:1px 0">' +
                    '<span>' + esc(m.name) + '</span>' +
                    '<span style="color:#8a93a0">мин ' + m.minStock + ' ' + esc(m.unit) + ' · ' + m.price + ' ₽</span></div>';
            }
            mtrPanel.innerHTML = html;
        }
        function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
        refreshMtr();

        // --- KPI ---
        var kpi = document.createElement('div');
        kpi.style.cssText = 'position:absolute;top:8px;left:8px;pointer-events:none;' +
            'font:12px/1.4 sans-serif;display:flex;gap:10px;flex-wrap:wrap;z-index:10';
        el.appendChild(kpi);
        function refreshKpi() {
            var alarms = data.machines.filter(function (m) { return m.alarm; }).length;
            var stressed = data.fields.filter(function (f) { return f.status === 'stress'; }).length;
            var ops = data.fields.filter(function (f) { return f.op !== '-'; }).length;
            var prevented = data.prevented || 0;
            kpi.innerHTML =
                chip(data.fields.length + ' полей') +
                chip(data.machines.length + ' машин') +
                chip(ops + ' с операцией') +
                chip(alarms + ' тревог', alarms > 0 ? '#e74c3c' : '#27ae60') +
                (stressed ? chip('⚠ ' + stressed + ' стресс', '#e67e22') : '') +
                (prevented > 0 ? chip('Предотвращено: ' + fmtR(prevented) + ' ₽', '#f2c200') : '');
        }
        function fmtR(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
        function chip(txt, color) {
            return '<div style="background:rgba(17,48,94,.85);border-radius:6px;padding:4px 10px;color:' + (color || '#BED6A5') + '">' + txt + '</div>';
        }
        refreshKpi();

        // --- анимация ---
        var camMode = 'overview', camTarget = null;
        el.addEventListener('dblclick', function () {
            camMode = camMode === 'overview' ? 'field' : 'overview';
            if (camMode === 'field' && machines.length) camTarget = machines[0];
            updateCam();
        });
        function updateCam() {
            if (camMode === 'overview') { camera.position.set(0, 600, 500); camera.lookAt(0, 0, 0); }
            else if (camTarget) {
                var p = camTarget.position;
                camera.position.set(p.x + 200, p.y + 150, p.z + 100);
                camera.lookAt(p);
            }
        }

        var clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            var dt = clock.getDelta();
            for (var i = 0; i < machines.length; i++) {
                var m = machines[i];
                m.userData.t += dt * m.userData.speedAnim;
                var t = m.userData.t;
                m.position.x += Math.sin(t * 0.5) * 0.3;
                m.position.z += Math.cos(t * 0.3) * 0.2;
                m.rotation.y = Math.sin(t * 0.5) * 0.4;
            }
            renderer.render(scene, camera);
        }
        animate();

        function onResize() {
            var w = el.clientWidth || 800, h = el.clientHeight || 500;
            renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
        }
        window.addEventListener('resize', onResize);

        return {
            destroy: function () { window.removeEventListener('resize', onResize); renderer.dispose(); },
            resize: onResize,
            update: function (newData) {
                data = newData; refreshKpi(); refreshMtr();
                for (var i = 0; i < machines.length && i < data.machines.length; i++) {
                    var m = data.machines[i], mesh = machines[i];
                    var ti = TYPE_INFO[m.type] || TYPE_INFO.tractor;
                    mesh.material.color.setHex(m.alarm ? C.machineAlarm : ti.color);
                }
                // обновить цвета полей
                for (var j = 0; j < data.fields.length; j++) {
                    var f = data.fields[j], fm = fieldMeshes[f.code];
                    if (fm) fm.material.color.setHex(f.status === 'stress' ? 0x8b4000 : opColor(f.op));
                }
            }
        };
    }

    function api(el) {
        var inst = instances.get(el);
        if (inst) return inst;
        inst = { ready: false, data: null };
        instances.set(el, inst);
        return inst;
    }
    api.render = function (el, controller, value) {
        var a = api(el);
        ensureThree(function (ok) {
            if (!ok) { el.innerHTML = '<div style="padding:24px;color:#c0392b">three.min.js не загрузился</div>'; return; }
            a.data = parseData(value);
            a.impl = buildScene(el, a.data);
            a.ready = true;
            // п.22: раскладка GWT доезжает после рендера — переприменяем и
            // подгоняем размер рендерера трижды
            if (stretchTimer) clearInterval(stretchTimer);
            var tries = 0;
            stretchTimer = setInterval(function () {
                stretch3d(el); tries++;
                if (a.impl && a.impl.resize) a.impl.resize();
                if (tries > 6) { clearInterval(stretchTimer); stretchTimer = null; }
            }, 700);
        });
    };
    api.update = function (el, controller, value) {
        var a = api(el);
        if (!a.ready || !a.impl) { a.data = parseData(value); return; }
        a.impl.update(parseData(value));
    };
    return api;
}
window.fleet3d = fleet3d;
