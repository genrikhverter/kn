#!/bin/bash
# ФТ8.4 (спецификация v2.0): резервное копирование БД «Код Урожая».
# Полный pg_dump раз в сутки, хранение копий — 14 дней.
# Запуск: вручную или по расписанию (см. блок cron ниже).
# Восстановление:
#   gunzip -c backups/iot-ГГГГММДД-ЧЧММ.gz | docker exec -i mite_db psql -U postgres -d iot
# (восстановлять в остановленный стек: docker compose stop server web grafana)
set -e
BK_DIR=/home/vmalt/knp-dev/mite_dev/backups
mkdir -p "$BK_DIR"
STAMP=$(date +%Y%m%d-%H%M)
OUT="$BK_DIR/iot-$STAMP.gz"
docker exec mite_db pg_dump -U postgres -d iot | gzip > "$OUT"
find "$BK_DIR" -name 'iot-*.gz' -mtime +14 -delete
echo "$(date '+%F %T') ok: $OUT ($(du -h "$OUT" | cut -f1))" >> "$BK_DIR/backup.log"
