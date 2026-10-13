#!/usr/bin/env python3
"""CDP-проверка веб-клиента LSfusion: логин, скриншот, консоль, JS-оценка.

Использование: ku_browser_probe.py <url-страницы> <селектор-ожидания> [js-выражение]
Скриншот: /tmp/ku_shot.png, консоль — в вывод.
"""
import base64
import json
import sys
import time

import websocket

WS = None
MSG_ID = 0
CONSOLE = []


def call(method, params=None, timeout=30):
    global MSG_ID
    MSG_ID += 1
    mid = MSG_ID
    ws_send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = json.loads(WS.recv())
        if msg.get("id") == mid:
            if "error" in msg:
                raise RuntimeError(f"{method}: {msg['error']}")
            return msg.get("result", {})
        if msg.get("method") == "Runtime.consoleAPICalled":
            args = " ".join(
                a.get("value", a.get("description", "")) if isinstance(a, dict) else str(a)
                for a in msg["params"].get("args", [])
            )
            CONSOLE.append(f"[{msg['params'].get('type')}] {args}")
        elif msg.get("method") == "Runtime.exceptionThrown":
            d = msg["params"]["exceptionDetails"]
            CONSOLE.append("[exception] " + d.get("text", "") + " " + str(d.get("exception", {}).get("description", ""))[:300])
        elif msg.get("method") == "Log.entryAdded":
            e = msg["params"]["entry"]
            CONSOLE.append(f"[{e.get('level')}] {e.get('text')} {e.get('url', '')}"[:300])


def ws_send(data):
    WS.send(data)


def main():
    global WS
    url = sys.argv[1]
    wait_text = sys.argv[2] if len(sys.argv) > 2 else None
    js_expr = sys.argv[3] if len(sys.argv) > 3 else None

    targets = json.loads(__import__("urllib.request", fromlist=["urlopen"]).urlopen("http://127.0.0.1:9222/json/list").read())
    page = next(t for t in targets if t["type"] == "page")
    WS = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=35)

    call("Runtime.enable")
    call("Page.enable")
    call("Log.enable")
    call("Page.navigate", {"url": url})
    time.sleep(6)

    # логин-форма: заполнить и отправить (если есть)
    try:
        res = call("Runtime.evaluate", {"expression": "!!document.querySelector('input[name=username]')"})
        if res.get("result", {}).get("value"):
            call("Runtime.evaluate", {"expression": """
                (function(){
                    var u = document.querySelector('input[name=username]');
                    var p = document.querySelector('input[name=password]');
                    u.value = 'admin'; p.value = 'fusion';
                    u.dispatchEvent(new Event('input', {bubbles:true}));
                    p.dispatchEvent(new Event('input', {bubbles:true}));
                    var b = document.querySelector('form[name=loginForm] button, form[name=loginForm] input[type=submit], button[type=submit]');
                    if (b) b.click(); else document.querySelector('form').submit();
                    return 'submitted';
                })()
            """})
            time.sleep(8)
    except Exception as e:
        print("login step:", e)

    if wait_text:
        for _ in range(20):
            try:
                res = call("Runtime.evaluate", {"expression": f"document.body.innerText.includes({json.dumps(wait_text)})"})
                if res.get("result", {}).get("value"):
                    break
            except Exception:
                pass
            time.sleep(1)
        time.sleep(3)

    if js_expr:
        try:
            res = call("Runtime.evaluate", {"expression": js_expr, "returnByValue": True})
            print("JS>", json.dumps(res.get("result", {}).get("value"), ensure_ascii=False)[:1500])
        except Exception as e:
            print("JS error:", e)

    shot = call("Page.captureScreenshot", {"format": "png"})
    with open("/tmp/ku_shot.png", "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print(f"скриншот: /tmp/ku_shot.png ({len(shot['data']) // 1024} КБ b64)")
    print("=== консоль (последние 25) ===")
    for line in CONSOLE[-25:]:
        print(line[:400])


if __name__ == "__main__":
    main()
