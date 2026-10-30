/* eslint-disable no-console */
// Noirgram release build with the update channel: `npm run tauri:release`.
//
// Builds the signed installer and writes `latest.json` next to it. Upload both to the place
// `NOIRGRAM_UPDATE_URL` points at (for GitHub Releases: attach them to a release, then
// `https://github.com/<user>/<repo>/releases/latest/download/latest.json` always serves the newest one).
// Installed apps check that URL every few hours and offer "Update Noirgram" in the chat list.
//
// Environment:
//   NOIRGRAM_UPDATE_URL     required, URL of `latest.json`
//   NOIRGRAM_DOWNLOAD_URL   optional, folder URL of the installer; defaults to the folder of `latest.json`
//   NOIRGRAM_RELEASE_NOTES  optional, shown in the update offer
//
// The updater signing key is created on the first run in `~/.tauri/noirgram-updater.key`. Keep it safe:
// installed apps only accept updates signed with it.

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATH = join(homedir(), '.tauri', 'noirgram-updater.key');
const BUNDLE_DIR = join(ROOT, 'tauri', 'target', 'release', 'bundle', 'nsis');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    // Through the shell everywhere, so quoted arguments mean the same on every platform
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed`);
  }
}

const updateUrl = process.env.NOIRGRAM_UPDATE_URL;
if (!updateUrl || !/^https:\/\//.test(updateUrl)) {
  fail('Set NOIRGRAM_UPDATE_URL to the https URL of latest.json, '
    + 'e.g. https://github.com/<user>/<repo>/releases/latest/download/latest.json');
}
const downloadUrl = (process.env.NOIRGRAM_DOWNLOAD_URL || new URL('.', updateUrl).href).replace(/\/?$/, '/');

if (!existsSync(KEY_PATH)) {
  console.log(`Creating the updater signing key in ${KEY_PATH}`);
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  // An empty password: the key file itself is the secret. `""` survives the Windows shell as an empty argument.
  run('npx', ['tauri', 'signer', 'generate', '--ci', '-p', '""', '-w', `"${KEY_PATH}"`]);
}

const privateKey = readFileSync(KEY_PATH, 'utf8').trim();
const publicKey = readFileSync(`${KEY_PATH}.pub`, 'utf8').trim();

const configOverride = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [updateUrl],
      windows: { installMode: 'passive' },
    },
  },
};
const configPath = join(ROOT, 'tauri', 'target', 'noirgram-release.conf.json');
mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, JSON.stringify(configOverride));

run('npx', ['tauri', 'build', '--config', `"${configPath}"`], {
  WITH_UPDATER: 'true',
  TAURI_SIGNING_PRIVATE_KEY: privateKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
});

// `tauri.conf.json` has no version of its own, the app takes the crate version
const version = readFileSync(join(ROOT, 'tauri', 'Cargo.toml'), 'utf8').match(/^version = "([^"]+)"/m)?.[1];
if (!version) {
  fail('No version in tauri/Cargo.toml');
}

const installer = readdirSync(BUNDLE_DIR).find((name) => name.endsWith(`_${version}_x64-setup.exe`));
if (!installer || !existsSync(join(BUNDLE_DIR, `${installer}.sig`))) {
  fail(`No signed installer for ${version} in ${BUNDLE_DIR}`);
}

const manifest = {
  version,
  notes: process.env.NOIRGRAM_RELEASE_NOTES || '',
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(join(BUNDLE_DIR, `${installer}.sig`), 'utf8').trim(),
      url: new URL(encodeURIComponent(installer), downloadUrl).href,
    },
  },
};
const manifestPath = join(BUNDLE_DIR, 'latest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);

console.log(`\n✔ Noirgram ${version} is ready. Upload to ${downloadUrl}:`);
console.log(`  ${join(BUNDLE_DIR, installer)}`);
console.log(`  ${manifestPath}\n`);
