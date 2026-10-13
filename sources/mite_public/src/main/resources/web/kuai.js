// kuai.js — чат ИИ-ассистента платформы KNP (раздел «Платформа КНП»).
// Каноническая фабрика CUSTOM-компонента (паттерн kuhome/kumap):
// render(element) / update(element, controller, value).
// История — в JS-состоянии; запросы идут ИЗ БРАУЗЕРА в api-gateway KNP
// (порт 8088 стенда), ассистент отвечает цифрами LSfusion (grounded).
(function () {
    'use strict';

    var state = { messages: [] }; // {role:'user'|'ai', text, grounded, sources}

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function gatewayBase() {
        // шлюз KNP поднят на стенде на отдельном порту
        return 'http://' + location.hostname + ':8088/api/v1';
    }

    function renderMessages(box) {
        var html = '';
        state.messages.forEach(function (m) {
            if (m.role === 'user') {
                html += '<div class="kuai-msg kuai-msg--user">' + esc(m.text) + '</div>';
            } else {
                html += '<div class="kuai-msg kuai-msg--ai">'
                    + (m.pending ? '<span class="kuai-dots">думает…</span>' : esc(m.text))
                    + (m.grounded === 'True' || m.grounded === true
                        ? '<div class="kuai-badge kuai-badge--ok">подтверждено данными «Кода Урожая»</div>'
                        : (m.grounded !== undefined && m.text ? '<div class="kuai-badge">без опоры на данные</div>' : ''))
                    + (m.sources && m.sources.length
                        ? '<div class="kuai-sources">источники: '
                          + m.sources.map(function (s) { return esc(s.label || s.id); }).join(' · ')
                          + '</div>'
                        : '')
                    + '</div>';
            }
        });
        if (!state.messages.length) {
            html = '<div class="kuai-hello">Спросите ассистента о данных платформы — он отвечает цифрами '
                 + 'из «Кода Урожая»: маржа и бюджеты (БДР/БДДС), рентабельность культур, баланс NPK, поля.</div>';
        }
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
    }

    function ask(el, question) {
        var box = el.querySelector('.kuai-log');
        var input = el.querySelector('.kuai-input');
        var q = (question || input.value || '').trim();
        if (!q) return;
        input.value = '';
        state.messages.push({ role: 'user', text: q });
        var pending = { role: 'ai', text: '', pending: true };
        state.messages.push(pending);
        renderMessages(box);
        fetch(gatewayBase() + '/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: q })
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) {
              pending.pending = false;
              pending.text = d.answer || '(пустой ответ)';
              pending.grounded = d.grounded;
              try {
                  pending.sources = (typeof d.sources === 'string') ? JSON.parse(d.sources.replace(/'/g, '"')) : (d.sources || []);
              } catch (e) { pending.sources = []; }
              renderMessages(box);
          })
          .catch(function (err) {
              pending.pending = false;
              pending.text = 'Сервис ассистента недоступен (' + err.message + '). Проверьте контур KNP (шлюз :8088, ai-agent, ollama).';
              renderMessages(box);
          });
    }

    function styleOnce() {
        if (document.getElementById('kuai-style')) return;
        var st = document.createElement('style');
        st.id = 'kuai-style';
        st.textContent = [
            '.kuai{display:flex;flex-direction:column;height:96%;min-height:420px;background:#f0f2f5;border-radius:10px;padding:14px;font-family:Segoe UI,Roboto,sans-serif;box-sizing:border-box}',
            '.kuai-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
            '.kuai-head__title{font-size:16px;font-weight:700;color:#0b2142}',
            '.kuai-head__sub{font-size:11px;color:#64748b}',
            '.kuai-log{flex:1;overflow-y:auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}',
            '.kuai-hello{color:#64748b;font-size:13px;padding:8px 4px}',
            '.kuai-msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:13px;white-space:pre-wrap}',
            '.kuai-msg--user{align-self:flex-end;background:#11305e;color:#fff;border-bottom-right-radius:4px}',
            '.kuai-msg--ai{align-self:flex-start;background:#eef2ee;border:1px solid #e2e8f0;color:#1e3f20;border-bottom-left-radius:4px}',
            '.kuai-dots{color:#64748b;font-style:italic}',
            '.kuai-badge{margin-top:6px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#4C7A3D;font-weight:600}',
            '.kuai-sources{margin-top:4px;font-size:11px;color:#64748b}',
            '.kuai-examples{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}',
            '.kuai-example{font-size:11px;border:1px solid #c9d6c9;background:#fff;color:#1e3f20;border-radius:14px;padding:4px 10px;cursor:pointer}',
            '.kuai-example:hover{background:#BED6A5}',
            '.kuai-inputbar{display:flex;gap:8px;margin-top:8px}',
            '.kuai-input{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:13px;outline:none}',
            '.kuai-input:focus{border-color:#BED6A5;box-shadow:0 0 0 3px rgba(190,214,165,.35)}',
            '.kuai-send{border:none;border-radius:8px;background:#11305e;color:#fff;padding:10px 18px;font-size:13px;cursor:pointer}',
            '.kuai-send:hover{background:#0b2142}'
        ].join('\n');
        document.head.appendChild(st);
    }

    function stretch(el) {
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

    // канонический API CUSTOM-компонента: фабрика window.<имя> (паттерн kuhome/kumap)
    window.kuai = function () {
        return {
            render: function (el) {
                styleOnce();
                // GWT не задаёт высоту ячейки PANEL-свойства — как kudash/kumap
                el.style.cssText = 'height:86vh;min-height:480px;overflow:auto';
                stretch(el);
                el.innerHTML =
                    '<div class="kuai">'
                    + '<div class="kuai-head"><span class="kuai-head__title">ИИ-ассистент платформы KNP</span>'
                    + '<span class="kuai-head__sub">api-gateway :8088 · данные «Кода Урожая» · портал :8092</span></div>'
                    + '<div class="kuai-log"></div>'
                    + '<div class="kuai-examples">'
                    + '<button class="kuai-example">Какая маржа по базовому БД 2027?</button>'
                    + '<button class="kuai-example">Рентабельность культур?</button>'
                    + '<button class="kuai-example">Баланс NPK на KH-001</button>'
                    + '</div>'
                    + '<div class="kuai-inputbar">'
                    + '<input class="kuai-input" type="text" placeholder="Вопрос о полях, бюджетах, урожае…">'
                    + '<button class="kuai-send">Спросить</button>'
                    + '</div></div>';
                var box = el.querySelector('.kuai-log');
                var input = el.querySelector('.kuai-input');
                el.querySelector('.kuai-send').addEventListener('click', function () { ask(el); });
                input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(el); });
                el.querySelectorAll('.kuai-example').forEach(function (b) {
                    b.addEventListener('click', function () { ask(el, b.textContent); });
                });
                renderMessages(box);
            },
            update: function () {} // состояние локально, снапшот с сервера не используется
        };
    };
})();
