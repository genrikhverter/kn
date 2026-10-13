#!/bin/bash
# Быстрая пересборка только логики MITE + перезапуск сервера.
# Платформа уже собрана (кэш .m2 и target/ платформы на хосте), поэтому
# это занимает минуты вместо полного цикла. Полный цикл (платформа +
# desktop/web-клиенты + патч war) — как в инструкции:
#   cd ~/mite_dev/docker && docker compose run --rm builder
# --war-only: пропустить maven-сборку, только патч war + рестарт web
# (для итераций темы оформления theme/*.css без пересборки логики).
set -e
cd "$(dirname "$0")/docker"
if [ "$1" != "--war-only" ]; then
docker compose run --rm builder bash -c '
cd /build/mite_public &&
mvn -o clean package -P assemble,embed-server -DskipTests &&
rm -rf /artifacts/lib && mvn -o dependency:copy-dependencies -DoutputDirectory=/artifacts/lib -DincludeScope=runtime &&
cp target/iot-1.0-SNAPSHOT.jar /artifacts/ &&
cp /build/platform/server/target/lsfusion-server-7.0-SNAPSHOT.jar /artifacts/ &&
cp /build/platform/web-client/target/lsfusion-client-7.0-SNAPSHOT.war /artifacts/ &&
echo "Логика пересобрана"
'
fi
# war из target платформы содержит localhost — веб-контейнер ходит на сервер
# по имени server (как в полном цикле docker-compose): патчим web.xml на месте.
# Заодно вшиваем meta locale=ru в main.jsp: пока web-client не пересобран из
# исходников (где meta уже добавлена), war из target приносит старый JSP.
# Плюс тема «ЦУП КНП» (theme/ku-theme.css + ku-login.css + logo/favicon):
# файлы кладутся в war, ссылки — в main.jsp (после themeCss) и login.jsp.
python3 - <<'PATCH'
import zipfile, os, time
war = '/home/vmalt/knp-dev/mite_dev/artifacts/lsfusion-client-7.0-SNAPSHOT.war'
theme_dir = '/home/vmalt/knp-dev/mite_dev/theme'
with zipfile.ZipFile(war, 'r') as z:
    wx = z.read('WEB-INF/web.xml').decode('utf-8')
    jsp = z.read('WEB-INF/view/main.jsp').decode('utf-8')
    ljp = z.read('WEB-INF/view/login.jsp').decode('utf-8')
wx = wx.replace('<param-value>localhost</param-value>', '<param-value>server</param-value>')
META = '<meta name="gwt:property" content="locale=ru">\n        <script>document.cookie = \'LSFUSION_LOCALE=ru;path=/\';</script>'
if 'LSFUSION_LOCALE=ru' not in jsp:
    anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    assert anchor in jsp, 'viewport meta не найдена в main.jsp'
    jsp = jsp.replace(anchor, anchor + '\n        ' + META, 1)
KU_VER = time.strftime('%m%d%H%M')  # версия статики: смена при каждом патче сбрасывает кэш браузера
KU_LINK = f'<link rel="stylesheet" type="text/css" href="static/css/theme/ku-theme.css?v={KU_VER}">'
if 'ku-theme.css' not in jsp:
    anchor = '<link id="themeCss" rel="stylesheet" type="text/css" href="${themeCSS}"/>'
    assert anchor in jsp, 'themeCss link не найдена в main.jsp'
    jsp = jsp.replace(anchor, anchor + '\n        ' + KU_LINK, 1)
else:  # уже вшита (war патчится повторно) — освежаем версию
    import re as _re
    jsp = _re.sub(r'static/css/theme/ku-theme\.css\?v=\w+', f'static/css/theme/ku-theme.css?v={KU_VER}', jsp)
KU_LOGIN_LINK = f'<link rel="stylesheet" href="static/noauth/css/ku-login.css?v={KU_VER}"/>'
if 'ku-login.css' not in ljp:
    anchor = '<link rel="stylesheet" media="only screen and (min-device-width: 601px)" href="static/noauth/css/login.css"/>'
    assert anchor in ljp, 'login.css link не найдена в login.jsp'
    ljp = ljp.replace(anchor, anchor + '\n        ' + KU_LOGIN_LINK, 1)
else:
    import re as _re
    ljp = _re.sub(r'static/noauth/css/ku-login\.css\?v=\w+', f'static/noauth/css/ku-login.css?v={KU_VER}', ljp)
# логотип на логине и фавиконки: статические фолбэки с версией против кэша
# (logicsLogo/logicsIcon в БД пустые, ${…} отдаёт как раз эти файлы;
#  версия каруселится тем же штампом)
ljp = ljp.replace('src="${logicsLogo}"', f'src="static/noauth/images/logo.png?v={KU_VER}"')
ljp = ljp.replace('href="${logicsIcon}"', f'href="static/noauth/images/favicon.ico?v={KU_VER}"')
jsp = jsp.replace('<link rel="shortcut icon" href="${logicsIcon}" />',
                  f'<link rel="shortcut icon" href="static/noauth/images/favicon.ico?v={KU_VER}" />')
ku_theme = open(os.path.join(theme_dir, 'ku-theme.css'), 'rb').read()
ku_login = open(os.path.join(theme_dir, 'ku-login.css'), 'rb').read()
ku_logo = open(os.path.join(theme_dir, 'logo.png'), 'rb').read()
ku_icon = open(os.path.join(theme_dir, 'favicon.ico'), 'rb').read()
ku_logo_sq = open(os.path.join(theme_dir, 'logo-square.png'), 'rb').read()
REPLACE = {
    'WEB-INF/web.xml': wx.encode('utf-8'),
    'WEB-INF/view/main.jsp': jsp.encode('utf-8'),
    'WEB-INF/view/login.jsp': ljp.encode('utf-8'),
    'static/noauth/images/logo.png': ku_logo,
    'static/noauth/images/favicon.ico': ku_icon,
    'static/noauth/images/logo-square.png': ku_logo_sq,  # угол навигатора (тема)
    'static/css/theme/ku-theme.css': ku_theme,           # при повторном прогоне заменяем, не дублируем
    'static/noauth/css/ku-login.css': ku_login,
}
FRESH_TIMESTAMP = {'WEB-INF/view/main.jsp', 'WEB-INF/view/login.jsp'}
tmp = war + '.tmp'
with zipfile.ZipFile(war, 'r') as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename in REPLACE:
            data = REPLACE.pop(item.filename)
            if item.filename in FRESH_TIMESTAMP:
                item.date_time = time.localtime()[:6]  # свежая метка: иначе Jasper отдаёт старый скомпилированный JSP
        zout.writestr(item, data)
    now = time.localtime()[:6]
    for name, blob in REPLACE.items():  # новые файлы, которых в war ещё нет
        zi = zipfile.ZipInfo(name, date_time=now)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(zi, blob)
os.replace(tmp, war)
print('war: web.xml, main.jsp (locale+тема КНП), login.jsp (тема), лого/favicon КНП')
PATCH
if [ "$1" != "--war-only" ]; then
docker compose restart server web
# ждём готовности сервера вместо бесконечного logs -f
timeout 420 docker logs -f mite_server 2>&1 | grep -m1 'Server has successfully started' || echo 'предупреждение: маркер старта не найден, проверьте docker logs mite_server'
else
docker compose restart web
fi
