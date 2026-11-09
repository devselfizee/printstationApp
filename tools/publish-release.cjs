#!/usr/bin/env node
// Publie une version de « printstation » sur le Release Manager, avec ses notes écrites
// automatiquement à partir des commits depuis la dernière version publiée.
// Téléchargé depuis le Release Manager (onglet « Publication » de l'application).
//
//   1. montez la version (package.json) et construisez le setup
//   2. node tools/publish-release.cjs            (affiche les notes, demande confirmation)
//
// Options :
//   --dry-run                   montre tout, n'envoie rien
//   --yes                       pas de confirmation
//   --file <setup>              fichier à envoyer (sinon cherché dans dist_electron, dist, release, out, build)
//   --version <x.y.z>           version (sinon celle de package.json)
//   --platform <plateforme>     windows-x64 (par défaut pour un .exe), linux-arm64, linux-x64
//   --since <commit|tag>        point de départ des notes, au lieu de la dernière version publiée
//   --notes-file <fichier.md>   notes écrites à la main, à la place des commits
//   --public regie,evenementiel public de la version (applis de bornes ; par défaut les deux)
//   --no-activate               ne pas en faire la version « active » (applis de bornes : canal pilote)
//
// Jeton de publication (Release Manager > application > Réglages), jamais dans le dépôt :
//   variable RELEASES_TOKEN, ou fichier %USERPROFILE%\.releases-printstation-token
//
// Node 20 ou plus.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync } = require('child_process');

const APP = process.env.RELEASES_APP || 'printstation';
const API = (process.env.RELEASES_API_URL || 'https://releases-api.orkessi.com').replace(/\/+$/, '');
const TOKEN_FILE = path.join(os.homedir(), `.releases-${APP}-token`);
const PLATFORMS = ['windows-x64', 'linux-arm64', 'linux-x64'];
const SEARCH_DIRS = ['dist_electron', 'dist', 'release', 'out', 'build'];
const MAX_NOTES = 40;
// Morceaux de 5 Mo : chacun doit arriver en moins de 60 s, sinon le proxy devant l'API coupe (502)
const CHUNK_BYTES = 5 * 1024 * 1024;

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function parseArgs() {
  const a = process.argv.slice(2);
  const value = (name) => {
    const i = a.indexOf(name);
    if (i === -1) return null;
    if (!a[i + 1] || a[i + 1].startsWith('--')) fail(`${name} attend une valeur`);
    return a[i + 1];
  };
  return {
    dryRun: a.includes('--dry-run'),
    yes: a.includes('--yes'),
    activate: !a.includes('--no-activate'),
    file: value('--file'),
    version: value('--version'),
    platform: value('--platform'),
    since: value('--since'),
    notesFile: value('--notes-file'),
    public: value('--public'),
  };
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOk(...args) {
  try { git(...args); return true; } catch { return false; }
}

const ROOT = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    fail('Lancez ce script depuis le dépôt git du projet.');
  }
})();

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function readToken() {
  if (process.env.RELEASES_TOKEN) return process.env.RELEASES_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  fail(
    'Jeton de publication introuvable.\n' +
    `  Créez-le dans le Release Manager (${APP} > Réglages > Jetons, type « Publication »),\n` +
    `  puis enregistrez-le dans ${TOKEN_FILE} (ou la variable RELEASES_TOKEN).`,
  );
}

function readVersion(opt) {
  if (opt) return opt;
  const pkg = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkg)) fail('Pas de package.json : indiquez la version avec --version x.y.z');
  return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
}

/** Le setup de cette version : seul .exe ou .tar.gz portant le numéro dans les dossiers de build. */
function findSetup(version) {
  const found = [];
  // Le numéro exact : 1.5.2 ne doit pas attraper les setups 1.5.20, 1.5.21…
  const exact = new RegExp(`(?<![\\d.])${version.replace(/\./g, '\\.')}(?![\\d]|\\.\\d)`);
  for (const dir of SEARCH_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (exact.test(name) && /\.(exe|tar\.gz)$/i.test(name)) found.push(path.join(abs, name));
    }
  }
  if (found.length === 1) return found[0];
  if (found.length === 0) {
    fail(`Aucun setup ${version} (.exe ou .tar.gz) dans ${SEARCH_DIRS.join(', ')}.\n  Construisez-le, ou indiquez --file.`);
  }
  fail(`Plusieurs setups possibles, choisissez avec --file :\n${found.map((f) => `    ${path.relative(ROOT, f)}`).join('\n')}`);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function api(method, route, token, body, extraHeaders = {}, timeoutMs = 0) {
  const headers = { Authorization: `Bearer ${token}`, ...extraHeaders };
  if (body !== undefined && !(body instanceof Uint8Array)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(`${API}/api/v1/apps/${APP}${route}`, {
    method, headers, body, signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
  return { status: res.status, json, text };
}

const apiError = (res) => (res.json ? `${res.json.error} : ${res.json.message}` : res.text.slice(0, 300));

/**
 * Envoi par morceaux : Cloudflare, devant l'API, refuse toute requête de plus de 100 Mo, et le
 * proxy coupe une requête dont le corps met plus de 60 s à arriver. D'où des morceaux de 5 Mo,
 * chacun renvoyé jusqu'à 5 fois en cas de coupure.
 */
async function uploadInChunks(token, file, size, metadata) {
  const init = await api('POST', '/releases/uploads', token, { file_name: path.basename(file), size });
  if (init.status !== 201) fail(`Ouverture de l'envoi refusée (HTTP ${init.status}) : ${apiError(init)}`);
  const id = init.json.upload_id;
  const chunkSize = Math.min(CHUNK_BYTES, init.json.chunk_size || CHUNK_BYTES);
  const chunks = Math.ceil(size / chunkSize);

  const fd = fs.openSync(file, 'r');
  try {
    for (let i = 0; i < chunks; i++) {
      const length = Math.min(chunkSize, size - i * chunkSize);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, i * chunkSize);
      for (let attempt = 1; ; attempt++) {
        const t0 = Date.now();
        try {
          const res = await api('PUT', `/releases/uploads/${id}/chunks/${i}`, token, buffer,
            { 'Content-Type': 'application/octet-stream' }, 2 * 60 * 1000);
          if (res.status === 200) break;
          if (res.status < 500 && res.status !== 408 && res.status !== 429) fail(`Morceau ${i + 1} refusé (HTTP ${res.status}) : ${apiError(res)}`);
          throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          const reason = `${err.name === 'TimeoutError' ? 'pas de réponse' : err.message} après ${Math.round((Date.now() - t0) / 1000)} s`;
          if (attempt >= 5) fail(`Morceau ${i + 1}/${chunks} : échec après 5 essais (${reason}).`);
          process.stdout.write(`\n  Coupure sur le morceau ${i + 1} (${reason}), nouvel essai dans ${attempt * 2} s…\n`);
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
      process.stdout.write(`\r  Envoi… ${Math.round(((i + 1) / chunks) * 100)} % (${i + 1}/${chunks})`);
    }
  } catch (err) {
    await api('DELETE', `/releases/uploads/${id}`, token).catch(() => {});
    throw err;
  } finally {
    fs.closeSync(fd);
  }
  process.stdout.write('\n  Vérification et enregistrement…\n');
  return api('POST', `/releases/uploads/${id}/complete`, token, { metadata }, {}, 10 * 60 * 1000);
}

function repoUrl() {
  try {
    const m = git('remote', 'get-url', 'origin').match(/github\.com[:/](.+?)(?:\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch { return null; }
}

/**
 * Commits à raconter : depuis le commit de la dernière version publiée ; à défaut (version
 * publiée à la main, sans commit) depuis sa date de publication ; ou depuis --since.
 */
function collectCommits(latest, since) {
  let range;
  let origin;
  if (since) {
    if (!gitOk('rev-parse', '--verify', `${since}^{commit}`)) fail(`--since ${since} : commit ou tag inconnu`);
    range = [`${since}..HEAD`];
    origin = `depuis ${since}`;
  } else if (latest && latest.commit && gitOk('merge-base', '--is-ancestor', latest.commit, 'HEAD')) {
    range = [`${latest.commit}..HEAD`];
    origin = `depuis ${latest.version} (${latest.commit.slice(0, 7)})`;
  } else if (latest && latest.published_at) {
    range = [`--since=${latest.published_at}`, 'HEAD'];
    origin = `depuis la publication de ${latest.version}, le ${new Date(latest.published_at).toLocaleString('fr-FR')}`;
  } else {
    range = ['-n', '20', 'HEAD'];
    origin = 'première publication : les 20 derniers commits';
  }
  const out = git('log', '--no-merges', '--format=%H%x1f%s', ...range);
  return {
    origin,
    commits: (out ? out.split('\n') : [])
      .map((line) => { const [sha, subject] = line.split('\x1f'); return { sha, subject: (subject || '').trim() }; })
      .filter((c) => c.subject && !/^(wip|merge|chore\(deps\))/i.test(c.subject)),
  };
}

async function main() {
  const opts = parseArgs();
  if (typeof fetch !== 'function' || typeof AbortSignal.timeout !== 'function') fail(`Node 20 ou plus requis (actuel : ${process.version}).`);
  if (APP.startsWith('__')) fail('Script mal configuré : télécharger-le depuis l\'onglet « Publication » du Release Manager.');

  const version = readVersion(opts.version);
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) fail(`Version invalide : ${version} (format x.y.z attendu)`);

  const file = opts.file ? path.resolve(opts.file) : findSetup(version);
  if (!fs.existsSync(file)) fail(`Fichier introuvable : ${file}`);
  const platform = opts.platform || (/\.exe$/i.test(file) ? 'windows-x64' : null);
  if (!PLATFORMS.includes(platform)) fail(`Indiquez la plateforme avec --platform (${PLATFORMS.join(', ')}).`);

  const audience = (opts.public || 'regie,evenementiel').split(',').map((s) => s.trim()).filter(Boolean);
  if (!audience.length || audience.some((t) => !['regie', 'evenementiel'].includes(t))) {
    fail('--public : regie et/ou evenementiel, séparés par une virgule.');
  }

  const commit = git('rev-parse', 'HEAD');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  const token = readToken();

  const latestRes = await api('GET', `/releases/latest?platform=${platform}`, token);
  let latest = null;
  if (latestRes.status === 200) latest = latestRes.json;
  else if (latestRes.status === 401) fail(`Jeton refusé : invalide, révoqué, ou pas un jeton de publication de « ${APP} ».`);
  else if (latestRes.status === 404 && latestRes.json && latestRes.json.error === 'unknown_app') fail(`L'application « ${APP} » n'existe pas sur ${API}.`);
  else if (latestRes.status === 404 && !(latestRes.json && latestRes.json.error === 'no_release')) {
    fail(`${API} ne connaît pas l'API de publication (/api/v1) : le Release Manager à jour n'y est pas encore déployé.`);
  } else if (!(latestRes.status === 404 && latestRes.json && latestRes.json.error === 'no_release')) {
    fail(`Lecture de la dernière version impossible : HTTP ${latestRes.status} ${latestRes.text.slice(0, 200)}`);
  }

  if (latest && compareVersions(version, latest.version) <= 0) {
    fail(`La version ${version} n'est pas plus haute que ${latest.version}, déjà publiée.\n  Montez la version, reconstruisez le setup, puis relancez.`);
  }

  let notes;
  let changes = [];
  let origin;
  if (opts.notesFile) {
    notes = fs.readFileSync(path.resolve(opts.notesFile), 'utf8').trim();
    origin = `notes écrites à la main (${opts.notesFile})`;
  } else {
    const collected = collectCommits(latest, opts.since);
    const repo = repoUrl();
    origin = collected.origin;
    notes = collected.commits.slice(0, MAX_NOTES).map((c) => `- ${c.subject}`).join('\n');
    if (collected.commits.length > MAX_NOTES) notes += `\n- … et ${collected.commits.length - MAX_NOTES} autres changements`;
    changes = collected.commits.map((c) => ({
      title: c.subject, url: repo ? `${repo}/commit/${c.sha}` : undefined, public: 'tous', items: [c.subject],
    }));
  }
  if (!notes) fail('Aucun changement depuis la dernière version. Utilisez --since <commit> ou --notes-file <fichier>.');

  const size = fs.statSync(file).size;
  console.log('');
  console.log(`  Application : ${APP} (${platform})`);
  console.log(`  Version     : ${latest ? `${latest.version} → ` : ''}${version}`);
  console.log(`  Fichier     : ${path.relative(ROOT, file)} (${(size / 1024 / 1024).toFixed(1)} Mo)`);
  console.log(`  Commit      : ${commit.slice(0, 7)} sur ${branch}`);
  console.log(`  Diffusion   : ${opts.activate ? 'version active, proposée tout de suite' : 'canal pilote (à promouvoir ensuite)'}`);
  console.log(`  Notes       : ${origin}`);
  console.log('');
  console.log(notes.split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('');
  if (dirty) {
    console.warn('  ⚠ Modifications non commitées : le setup ne correspond peut-être pas exactement au commit indiqué.');
    console.warn(dirty.split('\n').map((l) => `      ${l}`).join('\n'));
    console.log('');
  }

  if (opts.dryRun) { console.log('  --dry-run : rien n\'a été envoyé.'); return; }
  if (!opts.yes) {
    const answer = await ask(`  Publier ${version} ? (o/N) `);
    if (!/^(o|oui|y|yes)$/i.test(answer.trim())) { console.log('  Abandon, rien n\'a été envoyé.'); return; }
  }

  process.stdout.write('  Calcul du SHA-256… ');
  const checksum = await sha256(file);
  console.log(checksum.slice(0, 12));

  const metadata = {
    version,
    commit,
    previous_commit: latest && latest.commit ? latest.commit : null,
    platform,
    sha256: checksum,
    size,
    public: audience,
    notes_markdown: notes,
    changes,
    set_current: opts.activate,
  };

  console.log(`  Envoi de ${(size / 1024 / 1024).toFixed(1)} Mo…`);
  const started = Date.now();
  const res = await uploadInChunks(token, file, size, metadata);
  if (res.status !== 201) fail(`Publication refusée (HTTP ${res.status}) : ${apiError(res)}`);
  console.log(`✔ ${version} publiée en ${Math.round((Date.now() - started) / 1000)} s.`);
  console.log(`  ${res.json.url}`);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
