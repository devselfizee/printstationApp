// services/updater.js
// Système de mise à jour automatique avec popup UI et HTTP Range Requests.
//
// Avec la clé des bornes (RELEASES_KIOSK_KEY), la borne s'identifie auprès du Release Manager
// (/api/v1/apps/printstation/update) : elle apparaît dans l'onglet Bornes, compte dans « Bornes »
// de la liste des versions, et envoie un compte rendu de chaque mise à jour. Sans clé, ou si cette
// route échoue, elle se rabat sur l'ancienne route anonyme /versions/latest/printstation.
import { createWriteStream, createReadStream, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { app, shell, BrowserWindow, ipcMain } from 'electron';

const PLATFORM = 'windows-x64';

function getUpdateApiUrl() {
  return process.env.UPDATE_API_URL || 'https://releases-api.orkessi.com/versions/latest/printstation';
}

/** Origine et nom de l'application, tirés de l'ancienne adresse (…/versions/latest/printstation) */
function releaseManager() {
  const url = new URL(getUpdateApiUrl());
  return { origin: url.origin, slug: url.pathname.split('/').filter(Boolean).pop() };
}

function kioskKey() {
  return (process.env.RELEASES_KIOSK_KEY || '').trim() || null;
}

const pendingFile = () => join(app.getPath('userData'), 'update-pending.json');

/**
 * Identifiant de la borne pour le Release Manager : son kiosk_id s'il est configuré, sinon un
 * identifiant tiré au hasard une fois et gardé dans le dossier de l'application.
 */
function resolveBorneId(kioskId) {
  if (kioskId) return String(kioskId).slice(0, 100);
  const file = join(app.getPath('userData'), 'borne-id.txt');
  try {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  } catch { /* première fois */ }
  const id = `printstation-${randomUUID()}`;
  try { writeFileSync(file, id); } catch (err) { console.warn(`[Updater] borne-id non enregistré : ${err.message}`); }
  return id;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Compte rendu au Release Manager (downloaded, installing, installed, failed). Ne lève jamais. */
async function report(ctx, step, fromVersion, toVersion, message = '') {
  if (!ctx.key) return false;
  try {
    const res = await fetchWithTimeout(`${ctx.origin}/api/v1/apps/${ctx.slug}/update-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Kiosk-Key': ctx.key },
      body: JSON.stringify({
        borne_id: ctx.borneId, step, from_version: fromVersion, to_version: toVersion,
        message: String(message).slice(0, 500), at: new Date().toISOString(),
      }),
    }, 5000);
    if (!res.ok) console.warn(`[Updater] Compte rendu « ${step} » refusé : HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.warn(`[Updater] Compte rendu « ${step} » non envoyé : ${err.message}`);
    return false;
  }
}

/**
 * Au démarrage qui suit une installation : la version attendue est-elle bien là ?
 * Le fichier n'est effacé qu'une fois le compte rendu reçu (sinon nouvel essai au démarrage suivant).
 */
async function reportPendingOutcome(ctx, localVersion) {
  let pending;
  try { pending = JSON.parse(readFileSync(pendingFile(), 'utf8')); } catch { return; }
  const done = () => { try { unlinkSync(pendingFile()); } catch { /* déjà parti */ } };
  if (!ctx.key) return done();
  const sent = localVersion === pending.to
    ? await report(ctx, 'installed', pending.from, pending.to)
    : await report(ctx, 'failed', pending.from, pending.to, `Installation non aboutie : ${localVersion} toujours en place`);
  if (sent) done();
}

/**
 * Route des bornes. Renvoie la mise à jour à faire, null si la borne est à jour,
 * ou lève une erreur (l'appelant se rabat alors sur l'ancienne route).
 */
async function askReleaseManager(ctx, localVersion) {
  const query = new URLSearchParams({ borne_id: ctx.borneId, platform: PLATFORM, version: localVersion });
  const res = await fetchWithTimeout(`${ctx.origin}/api/v1/apps/${ctx.slug}/update?${query}`, {
    headers: { 'X-Kiosk-Key': ctx.key },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.update) return null;
  return {
    semver: body.version,
    fileSize: body.size,
    checksum: body.sha256,
    changelog: body.notes_markdown || '',
    downloadUrl: body.url,
    reason: body.reason,
  };
}

async function askLegacyRoute() {
  const res = await fetchWithTimeout(getUpdateApiUrl());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Compare deux versions semver. Retourne :
 *  1 si a > b, -1 si a < b, 0 si égales
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Point d'entrée principal — appeler depuis main.js au démarrage.
 * Vérifie si une mise à jour est disponible, affiche une popup si oui.
 * Ne bloque jamais le démarrage en cas d'erreur réseau.
 * @param {{ kioskId?: string|null }} options kiosk_id de la borne, s'il est configuré
 */
export async function checkForUpdates({ kioskId = null } = {}) {
  try {
    // 1. Lire la version locale
    const localVersion = app.getVersion();
    const ctx = { ...releaseManager(), key: kioskKey(), borneId: resolveBorneId(kioskId) };
    console.log(`[Updater] Version locale : ${localVersion}`);
    console.log(`[Updater] Release Manager : ${ctx.origin} (${ctx.slug}), borne ${ctx.borneId}${ctx.key ? '' : ', sans clé des bornes'}`);

    // Résultat de la mise à jour précédente, s'il y en a une
    await reportPendingOutcome(ctx, localVersion);

    // 2. Route des bornes (identifiée), sinon ancienne route anonyme
    let update;
    let viaKioskRoute = false;
    if (ctx.key) {
      try {
        update = await askReleaseManager(ctx, localVersion);
        viaKioskRoute = true;
      } catch (err) {
        console.warn(`[Updater] Route des bornes en échec (${err.message}), ancienne route`);
      }
    }
    if (!viaKioskRoute) {
      try {
        update = await askLegacyRoute();
      } catch (err) {
        console.warn(`[Updater] Serveur inaccessible : ${err.message}`);
        return false;
      }
    }

    // 3. La route des bornes a déjà décidé (une version imposée peut être plus ancienne) ;
    //    l'ancienne route donne la version active : mise à jour seulement si elle est plus récente
    if (!update || !update.semver) {
      console.log('[Updater] Application à jour.');
      return false;
    }
    console.log(`[Updater] Version distante : ${update.semver}${update.reason ? ` (${update.reason})` : ''}`);
    if (viaKioskRoute ? update.semver === localVersion : compareSemver(update.semver, localVersion) <= 0) {
      console.log('[Updater] Application à jour.');
      return false;
    }

    // 4. Une mise à jour est disponible → afficher la popup
    console.log(`[Updater] Mise à jour disponible : ${localVersion} → ${update.semver}`);
    const installing = await showUpdatePopup(update, localVersion, ctx);
    return installing;

  } catch (err) {
    console.error(`[Updater] Erreur : ${err.message}`);
    return false;
  }
}

/**
 * Affiche la fenêtre de mise à jour et gère le flow utilisateur
 */
function showUpdatePopup(apiResponse, localVersion, ctx) {
  return new Promise((resolve) => {
    const updateWindow = new BrowserWindow({
      width: 480,
      height: 320,
      frame: false,
      resizable: false,
      center: true,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(app.getAppPath(), 'services', 'updater-preload.cjs'),
      },
    });

    // Construire le HTML inline pour éviter un fichier séparé
    const changelog = apiResponse.changelog || '';
    const html = getUpdateHTML(localVersion, apiResponse.semver, changelog);
    updateWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const target = apiResponse.semver;
    const install = async (dest) => {
      // Marque l'installation en cours : le prochain démarrage dira si elle a abouti
      try {
        writeFileSync(pendingFile(), JSON.stringify({ from: localVersion, to: target, at: new Date().toISOString() }));
      } catch (err) {
        console.warn(`[Updater] Suivi d'installation non enregistré : ${err.message}`);
      }
      await report(ctx, 'installing', localVersion, target);
      await launchInstaller(dest, updateWindow, resolve);
    };

    // L'utilisateur clique "Plus tard" → fermer la popup, démarrer l'app normalement
    ipcMain.once('update:skip', () => {
      updateWindow.close();
      resolve(false);
    });

    // L'utilisateur clique "Mettre à jour" → lancer le téléchargement
    ipcMain.once('update:start', async () => {
      try {
        let downloadUrl = apiResponse.downloadUrl;
        if (downloadUrl.startsWith('/')) {
          downloadUrl = new URL(getUpdateApiUrl()).origin + downloadUrl;
        }

        const dest = join(tmpdir(), `printstation-${apiResponse.semver}.exe`);

        // Vérifier si déjà téléchargé et valide
        if (existsSync(dest) && statSync(dest).size === apiResponse.fileSize) {
          const valid = await verifyChecksum(dest, apiResponse.checksum);
          if (valid) {
            updateWindow.webContents.send('update:complete');
            await report(ctx, 'downloaded', localVersion, target);
            await install(dest);
            return;
          }
          unlinkSync(dest);
        }

        // Télécharger avec reprise
        await downloadWithResume(downloadUrl, dest, apiResponse.fileSize, (pct) => {
          if (!updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update:progress', pct);
          }
        });

        // Vérifier le checksum
        const isValid = await verifyChecksum(dest, apiResponse.checksum);
        if (!isValid) {
          unlinkSync(dest);
          void report(ctx, 'failed', localVersion, target, 'SHA-256 du fichier téléchargé différent');
          if (!updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update:error', 'Le fichier téléchargé est corrompu. Réessayez plus tard.');
          }
          return;
        }

        // Téléchargement OK
        if (!updateWindow.isDestroyed()) {
          updateWindow.webContents.send('update:complete');
        }
        await report(ctx, 'downloaded', localVersion, target);
        await install(dest);

      } catch (err) {
        console.error(`[Updater] Erreur téléchargement : ${err.message}`);
        void report(ctx, 'failed', localVersion, target, `Téléchargement : ${err.message}`);
        if (!updateWindow.isDestroyed()) {
          updateWindow.webContents.send('update:error', err.message);
        }
      }
    });

    // Si l'utilisateur ferme la fenêtre manuellement
    updateWindow.on('closed', () => {
      ipcMain.removeAllListeners('update:skip');
      ipcMain.removeAllListeners('update:start');
      resolve(false);
    });
  });
}

/**
 * Lance l'installateur et quitte l'app après 2s
 */
async function launchInstaller(dest, updateWindow, resolve) {
  console.log('[Updater] Minimisation et lancement de l\'installateur...');
  if (!updateWindow.isDestroyed()) updateWindow.minimize();
  await shell.openPath(dest);
  setTimeout(() => app.quit(), 2000);
  resolve(true);
}

/**
 * Téléchargement avec reprise via HTTP Range Requests
 */
async function downloadWithResume(url, dest, fileSize, onProgress) {
  const existing = existsSync(dest) ? statSync(dest).size : 0;

  if (existing >= fileSize) return;

  const headers = {};
  if (existing > 0) {
    headers['Range'] = `bytes=${existing}-`;
    console.log(`[Updater] Reprise du téléchargement à ${existing} octets`);
  }

  const response = await fetch(url, { headers });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Téléchargement échoué : HTTP ${response.status}`);
  }

  const writer = createWriteStream(dest, {
    flags: existing > 0 && response.status === 206 ? 'a' : 'w',
  });

  const reader = response.body.getReader();
  let downloaded = response.status === 206 ? existing : 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
      downloaded += value.length;
      onProgress(Math.round((downloaded / fileSize) * 100));
    }
  } finally {
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      writer.end();
    });
  }
}

/**
 * Vérification SHA-256
 */
async function verifyChecksum(filePath, expected) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex') === expected));
    stream.on('error', reject);
  });
}

/** Le changelog vient des titres de commits : affiché comme du texte, jamais comme du HTML */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * HTML de la popup de mise à jour
 */
function getUpdateHTML(currentVersion, newVersion, changelog) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #eee;
    height: 100vh;
    display: flex;
    flex-direction: column;
    user-select: none;
    -webkit-app-region: drag;
    overflow: hidden;
  }
  .container {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 28px 32px 20px;
  }
  .icon { font-size: 32px; margin-bottom: 12px; }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
  .versions {
    font-size: 13px;
    color: #aaa;
    margin-bottom: 14px;
  }
  .versions span { color: #4fc3f7; font-weight: 500; }
  .changelog {
    font-size: 12px;
    color: #999;
    line-height: 1.5;
    margin-bottom: 16px;
    max-height: 60px;
    overflow-y: auto;
    white-space: pre-line;
    -webkit-app-region: no-drag;
  }
  .buttons {
    display: flex;
    gap: 10px;
    margin-top: auto;
    -webkit-app-region: no-drag;
  }
  button {
    flex: 1;
    padding: 10px 0;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  button:hover { opacity: 0.85; }
  .btn-skip {
    background: #333;
    color: #ccc;
  }
  .btn-update {
    background: linear-gradient(135deg, #4fc3f7, #2196f3);
    color: #fff;
  }
  /* Progress bar */
  .progress-container {
    display: none;
    flex-direction: column;
    gap: 10px;
    margin-top: auto;
  }
  .progress-bar-bg {
    width: 100%;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #4fc3f7, #2196f3);
    border-radius: 4px;
    transition: width 0.3s;
  }
  .progress-text {
    font-size: 13px;
    color: #aaa;
    text-align: center;
  }
  /* Error */
  .error-msg {
    display: none;
    color: #ef5350;
    font-size: 13px;
    margin-top: 10px;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="icon">&#x1f504;</div>
    <h1>Mise à jour disponible</h1>
    <div class="versions">
      Version actuelle : <span>${currentVersion}</span> &rarr; Nouvelle version : <span>${newVersion}</span>
    </div>
    ${changelog.trim() ? `<div class="changelog">${escapeHtml(changelog.trim())}</div>` : ''}
    <div class="buttons" id="buttons">
      <button class="btn-skip" onclick="window.updater.skip()">Plus tard</button>
      <button class="btn-update" onclick="startUpdate()">Mettre à jour</button>
    </div>
    <div class="progress-container" id="progress">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="bar"></div>
      </div>
      <div class="progress-text" id="pctText">Téléchargement... 0%</div>
    </div>
    <div class="error-msg" id="error"></div>
  </div>
  <script>
    function startUpdate() {
      document.getElementById('buttons').style.display = 'none';
      document.getElementById('progress').style.display = 'flex';
      window.updater.start();
    }
    window.updater.onProgress((pct) => {
      document.getElementById('bar').style.width = pct + '%';
      document.getElementById('pctText').textContent = 'Téléchargement... ' + pct + '%';
    });
    window.updater.onComplete(() => {
      document.getElementById('pctText').textContent = 'Installation en cours...';
      document.getElementById('bar').style.width = '100%';
    });
    window.updater.onError((msg) => {
      document.getElementById('progress').style.display = 'none';
      document.getElementById('buttons').style.display = 'flex';
      const err = document.getElementById('error');
      err.style.display = 'block';
      err.textContent = msg;
    });
  </script>
</body>
</html>`;
}
