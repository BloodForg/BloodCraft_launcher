#!/bin/bash
set -euo pipefail

APP="${BC_APP_PATH:-/Applications/BloodCraft.app}"
BACKUP="${BC_BACKUP_PATH:-/Applications/BloodCraft.app.backup}"
APP_DIR="$(dirname "$APP")"
TMP_ROOT="${BC_TMP_ROOT:-/tmp/bloodcraft_update}"
STAGING_DIR="$TMP_ROOT/staging"
WORK_DIR="$TMP_ROOT/work-$$"
UPDATER_LOG="${BC_UPDATER_LOG:-$HOME/Library/Logs/bloodcraft-launcher/updater.log}"
EXPECTED_VERSION_PATH="${BC_EXPECTED_VERSION_PATH:-$HOME/Library/Application Support/BloodCraft/updates/expected-version.txt}"
ZIP_PATH="${1:-}"
EXPECTED_VERSION="${2:-}"
EXPECTED_SHA256="${3:-}"
EXPECTED_SIZE="${4:-0}"
ROLLED_BACK=0
HAVE_BACKUP=0
POST_BACKUP_STAGE=0

mkdir -p "$(dirname "$UPDATER_LOG")"
touch "$UPDATER_LOG"
exec >> "$UPDATER_LOG" 2>&1

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

rollback() {
  if [ "$HAVE_BACKUP" -eq 1 ] && [ -d "$BACKUP" ]; then
    rm -rf "$APP" || true
    if mv "$BACKUP" "$APP"; then
      log "ROLLBACK_RESTORED app=$APP"
      ROLLED_BACK=1
    else
      log "ROLLBACK_FAILED backup=$BACKUP app=$APP"
    fi
  fi
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo ""
  fi
}

on_error() {
  local ec="$?"
  log "error: updater failed at line=$1 exit=$ec"
  if [ "$POST_BACKUP_STAGE" -eq 1 ]; then
    rollback
  fi
  exit "$ec"
}
trap 'on_error $LINENO' ERR

log "step=start zip=$ZIP_PATH expectedVersion=$EXPECTED_VERSION"

if [ -z "$ZIP_PATH" ]; then
  log "error: missing zip argument"
  exit 1
fi

if [ ! -f "$ZIP_PATH" ]; then
  log "error: zip not found: $ZIP_PATH"
  exit 1
fi

if [ -z "$EXPECTED_VERSION" ]; then
  log "error: missing expectedVersion argument"
  exit 1
fi

if [ -z "$EXPECTED_SHA256" ]; then
  log "error: missing expectedSha256 argument"
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  log "error: app directory does not exist: $APP_DIR"
  exit 1
fi

if [ ! -w "$APP_DIR" ]; then
  log "error: no write permission to app directory: $APP_DIR"
  log "ROLLBACK_RESTORED app=$APP reason=permission_denied_no_change"
  exit 1
fi

mkdir -p "$(dirname "$EXPECTED_VERSION_PATH")"
printf '%s' "$EXPECTED_VERSION" > "$EXPECTED_VERSION_PATH"
log "step=expectedVersion_saved path=$EXPECTED_VERSION_PATH"

ACTUAL_SIZE="$(stat -c%s "$ZIP_PATH" 2>/dev/null || wc -c < "$ZIP_PATH")"
if [ "${EXPECTED_SIZE:-0}" -gt 0 ] && [ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]; then
  log "error: corrupted update archive"
  log "error: size mismatch expected=$EXPECTED_SIZE actual=$ACTUAL_SIZE"
  exit 1
fi

ACTUAL_SHA256="$(sha256_file "$ZIP_PATH" || true)"
if [ -z "$ACTUAL_SHA256" ] || [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  log "error: corrupted update archive"
  log "error: sha256 mismatch expected=$EXPECTED_SHA256 actual=$ACTUAL_SHA256"
  exit 1
fi
log "step=archive_verified size=$ACTUAL_SIZE sha256=$ACTUAL_SHA256"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
log "step=extract_start staging=$STAGING_DIR"
if ! unzip -o "$ZIP_PATH" -d "$WORK_DIR"; then
  log "error: corrupted update archive"
  log "error: unzip failed"
  exit 1
fi
log "step=extract_done"

NEW_APP="$(find "$WORK_DIR" -type d -name 'BloodCraft.app' | head -n 1 || true)"
if [ -z "$NEW_APP" ]; then
  log "error: corrupted update archive"
  log "error: BloodCraft.app not found in extracted archive"
  exit 1
fi
cp -a "$NEW_APP" "$STAGING_DIR/BloodCraft.app"
if [ ! -d "$STAGING_DIR/BloodCraft.app/Contents" ]; then
  log "error: corrupted update archive"
  log "error: staging app structure invalid"
  exit 1
fi
log "step=app_found path=$NEW_APP"
log "step=staging_ready path=$STAGING_DIR/BloodCraft.app"

pkill BloodCraft || true
sleep 1
log "step=old_process_stop_requested"

if [ -d "$APP" ]; then
  rm -rf "$BACKUP" || true
  mv "$APP" "$BACKUP"
  HAVE_BACKUP=1
  POST_BACKUP_STAGE=1
  log "step=backup_created path=$BACKUP"
else
  POST_BACKUP_STAGE=1
  log "step=no_existing_app"
fi

if ! mv "$STAGING_DIR/BloodCraft.app" "$APP"; then
  log "error: failed to move new app into /Applications"
  rollback
  exit 1
fi
log "step=new_app_installed path=$APP"

if ! open "$APP"; then
  log "error: failed to launch new app with open"
  rollback
  exit 1
fi
log "step=new_app_launch_requested"

MARKER="launcher_started version=$EXPECTED_VERSION"
MARKER_FOUND=0
for i in $(seq 1 15); do
  if grep -Fq "$MARKER" "$UPDATER_LOG"; then
    MARKER_FOUND=1
    log "step=marker_found attempt=$i marker=$MARKER"
    break
  fi
  sleep 1
done

if [ "$MARKER_FOUND" -ne 1 ]; then
  log "error: launch marker not found within 15 seconds marker=$MARKER"
  rollback
  exit 1
fi

if [ "$ROLLED_BACK" -eq 1 ]; then
  log "error: rollback happened, update is not successful"
  exit 1
fi

log "step=update_success expectedVersion=$EXPECTED_VERSION"
exit 0
