// kuportal.js — витрина «ЦУП КНП» внутри раздела «Платформа КНП»:
// iframe портала knp_frontend (:8092, главный экран — карта с живыми
// полями «Кода Урожая»). Фабрика window.kuportal (паттерн kuhome/kuai).
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function portalUrl() {
        return 'http://' + location.hostname + ':8092/';
    }

    function styleOnce() {
        if (document.getElementById('kuportal-style')) return;
        var st = document.createElement('style');
        st.id = 'kuportal-style';
        st.textContent = [
            '.kuportal{display:flex;flex-direction:column;height:96%;min-height:440px;background:#f0f2f5;border-radius:10px;padding:10px;font-family:Segoe UI,Roboto,sans-serif;box-sizing:border-box}',
            '.kuportal-head{display:flex;align-items:baseline;gap:10px;margin:2px 4px 8px}',
            '.kuportal-head__title{font-size:15px;font-weight:700;color:#0b2142}',
            '.kuportal-head__sub{font-size:11px;color:#64748b}',
            '.kuportal-head__link{font-size:11px;color:#11305e}',
            '.kuportal-frame{flex:1;border:1px solid #e2e8f0;border-radius:8px;background:#fff;width:100%}',
            '.kuportal-note{font-size:11px;color:#64748b;margin:6px 4px}'
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

    window.kuportal = function () {
        return {
            render: function (el) {
                styleOnce();
                el.style.cssText = 'height:88vh;min-height:480px;overflow:auto';
                stretch(el);
                var url = portalUrl();
                el.innerHTML =
                    '<div class="kuportal">'
                    + '<div class="kuportal-head"><span class="kuportal-head__title">Портал ЦУП КНП</span>'
                    + '<span class="kuportal-head__sub">карта полей и разделы платформы · вход demo / demo12345</span>'
                    + '<a class="kuportal-head__link" href="' + esc(url) + '" target="_blank">открыть в новой вкладке ↗</a></div>'
                    + '<iframe class="kuportal-frame" src="' + esc(url) + '"></iframe>'
                    + '<div class="kuportal-note">Портал показывает живые данные прототипа: контуры и культуры полей — из «Кода Урожая» через api-gateway. При первом открытии войдите на самом портале (demo / demo12345).</div>'
                    + '</div>';
            },
            update: function () {}
        };
    };
})();
