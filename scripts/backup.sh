#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Daily backup for BillingPro (Railway → local JSON)
#  Saves to ~/billing-backups/  — keeps last 30 files
# ─────────────────────────────────────────────────────────────

# ── CONFIG (edit these) ──────────────────────────────────────
API_URL="https://billing-kamal-production.up.railway.app"
ADMIN_USER="admin"
ADMIN_PASS="admin123"
BACKUP_DIR="$HOME/billing-backups"
KEEP_DAYS=30
# ─────────────────────────────────────────────────────────────

set -e

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..."

# 1. Login to get JWT token
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Login failed. Check username/password."
  exit 1
fi

# 2. Download backup
FILENAME="$BACKUP_DIR/billing-backup-$(date '+%Y-%m-%d_%H-%M').json"

HTTP_STATUS=$(curl -s -o "$FILENAME" -w "%{http_code}" \
  "$API_URL/api/backup" \
  -H "Authorization: Bearer $TOKEN")

if [ "$HTTP_STATUS" != "200" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Backup download failed (HTTP $HTTP_STATUS)."
  rm -f "$FILENAME"
  exit 1
fi

SIZE=$(du -sh "$FILENAME" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Saved: $FILENAME ($SIZE)"

# 3. Delete backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "billing-backup-*.json" -mtime +$KEEP_DAYS -delete
COUNT=$(ls "$BACKUP_DIR"/billing-backup-*.json 2>/dev/null | wc -l | tr -d ' ')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Backup complete. $COUNT backup(s) stored in $BACKUP_DIR"
