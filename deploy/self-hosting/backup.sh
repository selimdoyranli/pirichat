#!/usr/bin/env bash
# pirichat gece yedeği: Coolify'daki Postgres'i pg_dump → R2 pirichat-backups/postgres/.
# Sunucuda yalnız son yedek kalır; R2'de 7 gün tutulur (bucket'taki "yedekler-7-gun" lifecycle kuralı siler).
# Yalnız veritabanı yedeklenir: seaweedfs'teki yüklenen dosyalar bu yedeğe girmez.
#
# Sunucuda kurulum (Coolify host'u, root):
#   /root/pirichat-backup/backup.sh        bu dosya
#   /root/pirichat-backup/r2.env           R2_BACKUP_ACCESS_KEY / _SECRET_KEY / _ENDPOINT / _BUCKET (chmod 600)
#   /etc/cron.d/pirichat-backup            45 0 * * * root /root/pirichat-backup/backup.sh >> /var/log/pirichat-backup.log 2>&1
# Geri yükleme: pg_restore --clean --if-exists -U fluxer -d fluxer < pirichat-<zaman>.dump
set -euo pipefail

ROOT=/root/pirichat-backup
DIR="$ROOT/dumps"
APP_UUID=khgxxoxct3t2vbshciq0wjig

log() { echo "$(date -u +%FT%TZ) $*"; }
die() { log "HATA: $*"; exit 1; }

set -a; . "$ROOT/r2.env"; set +a

container=$(docker ps --filter "name=^postgres-$APP_UUID" --format '{{.Names}}' | head -1)
[ -n "$container" ] || die "postgres container'ı bulunamadı"

mkdir -p "$DIR" && chmod 700 "$DIR"
name="pirichat-$(date -u +%Y%m%dT%H%M%SZ).dump"

log "pg_dump ($container)"
docker exec "$container" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DIR/$name.part"
[ -s "$DIR/$name.part" ] || die "döküm boş"
mv "$DIR/$name.part" "$DIR/$name"
chmod 600 "$DIR/$name"

log "R2'ye yükleniyor: $name ($(du -h "$DIR/$name" | cut -f1))"
# Secret'lar komut satırına yazılmaz, ortamdan geçer (ps çıktısında görünmesin).
AWS_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_KEY" \
docker run --rm -v "$DIR:/b:ro" \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  -e AWS_DEFAULT_REGION=auto \
  -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  amazon/aws-cli s3 cp "/b/$name" "s3://$R2_BACKUP_BUCKET/postgres/$name" \
    --endpoint-url "$R2_BACKUP_ENDPOINT" --only-show-errors

find "$DIR" -name 'pirichat-*' ! -name "$name" -delete
log "yedek tamam: $name"
