#!/bin/bash
set -euo pipefail

APP="${BC_APP_PATH:-/Applications/BloodCraft.app}"
BACKUP="${BC_BACKUP_PATH:-/Applications/BloodCraft.app.backup}"
APP_DIR="$(dirname "$APP")"
TMP_ROOT="${BC_TMP_ROOT:-/tmp/bloodcraft_update}"
STAGING_DIR="$TMP_ROOT/staging"
WORK_DIR="$TMP_ROOT/work-$$"
LOCK_FILE="${BC_UPDATER_LOCK_FILE:-/tmp/bloodcraft_updater.lock}"
UPDATER_LOG="${BC_UPDATER_LOG:-$HOME/Library/Logs/bloodcraft-launcher/updater.log}"
EXPECTED_VERSION_PATH="${BC_EXPECTED_VERSION_PATH:-$HOME/Library/Application Support/BloodCraft/updates/expected-version.txt}"
UPDATES_TMP_DIR="${BC_UPDATES_TMP_DIR:-$HOME/Library/Application Support/BloodCraft/updates/tmp}"
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

cleanup_lock() {
  rm -f "$LOCK_FILE" || true
}

if [ -f "$LOCK_FILE" ]; then
  log "error: updater already running"
  exit 1
fi
touch "$LOCK_FILE"
trap cleanup_lock EXIT

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

abort_corrupted_archive() {
  log "error: corrupted update archive"
  log "error: $1"
  exit 1
}

on_error() {
  local ec="$?"
  log "error: updater failed at line=$1 exit=$ec"
  if [ "$POST_BACKUP_STAGE" -eq 1 ]; then
    log "step=rollback_triggered reason=trap_error"
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
  log "step=rollback_triggered reason=permission_denied_no_change"
  log "ROLLBACK_RESTORED app=$APP reason=permission_denied_no_change"
  exit 1
fi

mkdir -p "$(dirname "$EXPECTED_VERSION_PATH")"
printf '%s' "$EXPECTED_VERSION" > "$EXPECTED_VERSION_PATH"
log "step=expected_version_saved path=$EXPECTED_VERSION_PATH"

ACTUAL_SIZE="$(stat -c%s "$ZIP_PATH" 2>/dev/null || wc -c < "$ZIP_PATH")"
if [ "${EXPECTED_SIZE:-0}" -gt 0 ] && [ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]; then
  abort_corrupted_archive "size mismatch expected=$EXPECTED_SIZE actual=$ACTUAL_SIZE"
fi

ACTUAL_SHA256="$(sha256_file "$ZIP_PATH" || true)"
if [ -z "$ACTUAL_SHA256" ] || [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  abort_corrupted_archive "sha256 mismatch expected=$EXPECTED_SHA256 actual=$ACTUAL_SHA256"
fi
log "step=archive_verified size=$ACTUAL_SIZE sha256=$ACTUAL_SHA256"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
log "step=extract_start staging=$STAGING_DIR"

# Path traversal protection: reject absolute paths and parent traversals before extraction.
while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  case "$entry" in
    /*)
      abort_corrupted_archive "path traversal detected: absolute path $entry"
      ;;
    *".."*|*"../"*|*"/.."*)
      abort_corrupted_archive "path traversal detected: $entry"
      ;;
  esac
done < <(unzip -Z -1 "$ZIP_PATH")

if ! unzip -o "$ZIP_PATH" -d "$WORK_DIR"; then
  abort_corrupted_archive "unzip failed"
fi
log "step=extract_done"

NEW_APP="$(find "$WORK_DIR" -type d -name 'BloodCraft.app' | head -n 1 || true)"
if [ -z "$NEW_APP" ]; then
  abort_corrupted_archive "BloodCraft.app not found in extracted archive"
fi

WORK_REAL="$(realpath "$WORK_DIR")"
NEW_REAL="$(realpath "$NEW_APP")"
case "$NEW_REAL" in
  "$WORK_REAL"/*) ;;
  *)
    abort_corrupted_archive "resolved app path escaped staging: $NEW_REAL"
    ;;
esac

cp -a "$NEW_APP" "$STAGING_DIR/BloodCraft.app"

if [ ! -d "$STAGING_DIR/BloodCraft.app/Contents" ] || [ ! -d "$STAGING_DIR/BloodCraft.app/Contents/MacOS" ]; then
  abort_corrupted_archive "invalid app structure (Contents/MacOS missing)"
fi

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
  log "step=rollback_triggered reason=install_move_failed"
  rollback
  exit 1
fi
log "step=install_started path=$APP"
log "step=new_app_installed path=$APP"

if ! open "$APP"; then
  log "error: failed to launch new app with open"
  log "step=rollback_triggered reason=open_failed"
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
  log "step=rollback_triggered reason=marker_timeout"
  rollback
  exit 1
fi

if [ "$ROLLED_BACK" -eq 1 ]; then
  log "error: rollback happened, update is not successful"
  exit 1
fi

rm -rf "$TMP_ROOT" || true
rm -rf "$UPDATES_TMP_DIR" || true
log "step=temp_cleanup_done tmpRoot=$TMP_ROOT updatesTmpDir=$UPDATES_TMP_DIR"

log "step=update_success expectedVersion=$EXPECTED_VERSION"
exit 0
