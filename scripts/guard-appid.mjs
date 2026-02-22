#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const REQUIRED_APP_ID = 'ru.thebloodcraft.launcher';
const ERROR_TEXT = 'DO NOT CHANGE appId/bundleIdentifier: it will break macOS auto-update.';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const pkg = JSON.parse(raw);
const appId = pkg?.build?.appId;
const bundleIdentifier = pkg?.build?.mac?.bundleIdentifier ?? pkg?.build?.mac?.extendInfo?.CFBundleIdentifier;

if (appId !== REQUIRED_APP_ID || bundleIdentifier !== REQUIRED_APP_ID) {
  fail(`${ERROR_TEXT}\nExpected appId/bundleIdentifier = "${REQUIRED_APP_ID}", got appId="${appId}" bundleIdentifier="${bundleIdentifier}"`);
}

console.log(`[guard:appid] OK: ${REQUIRED_APP_ID}`);
