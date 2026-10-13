#!/bin/sh
# Порт и адрес LSfusion задаются переменными окружения (см. app/lsfusion.py)
exec uvicorn app.main:app --host 0.0.0.0 --port "${BRIDGE_PORT:-8090}" --proxy-headers
