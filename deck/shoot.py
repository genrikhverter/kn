#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Съёмка скриншотов стенда КУ для деки: CDP + demo-логин."""
import base64, json, sys, time, urllib.request
import websocket

WS = None
MSG_ID = 0


def call(method, params=None, timeout=40):
    global MSG_ID
    MSG_ID += 1
    mid = MSG_ID
    WS.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = json.loads(WS.recv())
        if msg.get("id") == mid:
            if "error" in msg:
                raise RuntimeError(f"{method}: {msg['error']}")
            return msg.get("result", {})


def evaluate(expr):
    r = call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"):
        raise RuntimeError(r["exceptionDetails"].get("text"))
    return r.get("result", {}).get("value")


def wait_text(txt, tries=40, pause=1.0):
    for _ in range(tries):
        try:
            if evaluate(f"document.body.innerText.includes({json.dumps(txt)})"):
                return True
        except Exception:
            pass
        time.sleep(pause)
    return False


def wait_gone(txt, tries=30, pause=1.0):
    for _ in range(tries):
        try:
            if not evaluate(f"document.body.innerText.includes({json.dumps(txt)})"):
                return True
        except Exception:
            pass
        time.sleep(pause)
    return False


def click_text(txt, exact=False):
    op = "===" if exact else ".includes(...)"
    js = f"""
    (function(){{
      var want={json.dumps(txt)};
      var els=document.querySelectorAll('div,span,td,a');
      var el=null;
      for (var i=0;i<els.length;i++){{
        var t=(els[i].innerText||'').trim();
        if (!t || t.length>60) continue;
        if ({'t' + ('===want' if exact else '.includes(want)')} ) {{ el=els[i]; break; }}
      }}
      if(!el) return 'NOTFOUND';
      el.dispatchEvent(new MouseEvent('mousedown',{{bubbles:true}}));
      el.dispatchEvent(new MouseEvent('mouseup',{{bubbles:true}}));
      el.dispatchEvent(new MouseEvent('click',{{bubbles:true,button:0,detail:1}}));
      return 'CLICKED:'+el.innerText.trim().slice(0,40);
    }})()
    """
    return evaluate(js)


def dblclick_text(txt):
    js = f"""
    (function(){{
      var want={json.dumps(txt)};
      var els=document.querySelectorAll('div,span,td,a');
      var el=null;
      for (var i=0;i<els.length;i++){{
        var t=(els[i].innerText||'').trim();
        if (!t || t.length>60) continue;
        if (t.includes(want)) {{ el=els[i]; break; }}
      }}
      if(!el) return 'NOTFOUND';
      ['mousedown','mouseup','click'].forEach(function(ev){{
        el.dispatchEvent(new MouseEvent(ev,{{bubbles:true,button:0,detail:ev==='click'?1:0}}));}});
      el.dispatchEvent(new MouseEvent('mousedown',{{bubbles:true,button:0,detail:2}}));
      el.dispatchEvent(new MouseEvent('mouseup',{{bubbles:true,button:0,detail:2}}));
      el.dispatchEvent(new MouseEvent('dblclick',{{bubbles:true,button:0,detail:2}}));
      return 'DBLCLICKED:'+el.innerText.trim().slice(0,40);
    }})()
    """
    return evaluate(js)


def shoot(path):
    shot = call("Page.captureScreenshot", {"format": "png"})
    with open(path, "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print("saved", path)


def main():
    global WS
    user, pwd = sys.argv[1], sys.argv[2]
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json/list").read())
    page = next(t for t in targets if t["type"] == "page")
    WS = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=45)
    call("Runtime.enable"); call("Page.enable")
    call("Emulation.setDeviceMetricsOverride",
         {"width": 1680, "height": 811, "deviceScaleFactor": 1, "mobile": False})
    call("Page.navigate", {"url": "http://127.0.0.1:8080/main"})
    time.sleep(8)
    if evaluate("!!document.querySelector('input[name=username]')"):
        evaluate(f"""
        (function(){{
            var u=document.querySelector('input[name=username]');
            var p=document.querySelector('input[name=password]');
            u.value={json.dumps(user)}; p.value={json.dumps(pwd)};
            u.dispatchEvent(new Event('input',{{bubbles:true}}));
            p.dispatchEvent(new Event('input',{{bubbles:true}}));
            var b=document.querySelector('form button, form input[type=submit], button[type=submit]');
            if(b) b.click(); else document.querySelector('form').submit();
        }})()""")
        time.sleep(10)
    print("login ok:", wait_text("Код Урожая", 30))
    time.sleep(5)  # прогрев дашборда
    shoot("/home/vmalt/knp-dev/mite_dev/docs-screenshots/deck-kuhome.png")

    # реестр полей -> карточка KH-001
    print("nav поля:", click_text("Поля", exact=True))
    time.sleep(4)
    if not wait_text("KH-001", 20):
        print("nav участки:", click_text("Земельные участки"))
        time.sleep(4)
        wait_text("KH-001", 20)
    print("строка KH-001 найдена:", wait_text("KH-001", 10))
    print("открытие карточки:", dblclick_text("KH-001"))
    time.sleep(6)
    wait_text("Северное-1", 20)
    time.sleep(3)
    shoot("/home/vmalt/knp-dev/mite_dev/docs-screenshots/deck-fieldcard.png")
    print("готово")


if __name__ == "__main__":
    main()
