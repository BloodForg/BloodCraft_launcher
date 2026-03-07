#!/bin/bash
set -euo pipefail

APP="${BC_APP_PATH:-/Applications/BloodCraft.app}"
BACKUP="${BC_BACKUP_PATH:-/Applications/BloodCraft.app.backup}"
APP_DIR="$(dirname "$APP")"
TMP_ROOT="${BC_TMP_ROOT:-/tmp/bloodcraft_update}"
WORK_DIR="$TMP_ROOT/work-$$"
UPDATER_LOG="${BC_UPDATER_LOG:-$HOME/Library/Logs/bloodcraft-launcher/updater.log}"
EXPECTED_VERSION_PATH="${BC_EXPECTED_VERSION_PATH:-$HOME/Library/Application Support/BloodCraft/updates/expected-version.txt}"
ZIP_PATH="${1:-}"
EXPECTED_VERSION="${2:-}"
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

if [ ! -d "$APP_DIR" ]; then
  log "error: app directory does not exist: $APP_DIR"
  exit 1
fi

if [ ! -w "$APP_DIR" ]; then
  log "error: no write permission to app directory: $APP_DIR"
  exit 1
fi

mkdir -p "$(dirname "$EXPECTED_VERSION_PATH")"
printf '%s' "$EXPECTED_VERSION" > "$EXPECTED_VERSION_PATH"
log "step=expectedVersion_saved path=$EXPECTED_VERSION_PATH"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
log "step=extract_start workDir=$WORK_DIR"
unzip -o "$ZIP_PATH" -d "$WORK_DIR"
log "step=extract_done"

NEW_APP="$(find "$WORK_DIR" -type d -name 'BloodCraft.app' | head -n 1 || true)"
if [ -z "$NEW_APP" ]; then
  log "error: BloodCraft.app not found in extracted archive"
  exit 1
fi
log "step=app_found path=$NEW_APP"

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

if ! mv "$NEW_APP" "$APP"; then
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
