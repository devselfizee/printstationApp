// services/updater.js
// Système de mise à jour automatique avec popup UI et HTTP Range Requests
import { createWriteStream, createReadStream, existsSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { app, shell, BrowserWindow, ipcMain } from 'electron';

function getUpdateApiUrl() {
  return process.env.UPDATE_API_URL || 'https://releases-api.orkessi.com/versions/latest/printstation';
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
 */
export async function checkForUpdates() {
  try {
    // 1. Lire la version locale
    const localVersion = app.getVersion();
    const updateApiUrl = getUpdateApiUrl();
    console.log(`[Updater] Version locale : ${localVersion}`);
    console.log(`[Updater] API : ${updateApiUrl}`);

    // 2. Appel API avec timeout 10s
    let apiResponse;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(updateApiUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      apiResponse = await res.json();
    } catch (err) {
      console.warn(`[Updater] Serveur inaccessible : ${err.message}`);
      return false;
    }

    // 3. Comparer versions — ne mettre à jour QUE si la version distante est plus récente
    const remoteVersion = apiResponse.semver;
    console.log(`[Updater] Version distante : ${remoteVersion}`);
    if (compareSemver(remoteVersion, localVersion) <= 0) {
      console.log('[Updater] Application à jour.');
      return false;
    }

    // 4. Une mise à jour est disponible → afficher la popup
    console.log(`[Updater] Mise à jour disponible : ${localVersion} → ${remoteVersion}`);
    const installing = await showUpdatePopup(apiResponse, localVersion);
    return installing;

  } catch (err) {
    console.error(`[Updater] Erreur : ${err.message}`);
    return false;
  }
}

/**
 * Affiche la fenêtre de mise à jour et gère le flow utilisateur
 */
function showUpdatePopup(apiResponse, localVersion) {
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
            await launchInstaller(dest, updateWindow, resolve);
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
          if (!updateWindow.isDestroyed()) {
            updateWindow.webContents.send('update:error', 'Le fichier téléchargé est corrompu. Réessayez plus tard.');
          }
          return;
        }

        // Téléchargement OK
        if (!updateWindow.isDestroyed()) {
          updateWindow.webContents.send('update:complete');
        }
        await launchInstaller(dest, updateWindow, resolve);

      } catch (err) {
        console.error(`[Updater] Erreur téléchargement : ${err.message}`);
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
    ${changelog ? `<div class="changelog">${changelog}</div>` : ''}
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
