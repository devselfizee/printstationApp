/**
 * photoDownloadService.js - ROBUSTE
 * 
 * ⭐ Gère:
 * - Corruption avec counter
 * - Checksum change (re-télécharge)
 * - Priorité des photos (récentes d'abord)
 * - Limite de queue
 * - Retry intelligent
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import * as db from './db.js';
import logger from '../../../services/LoggerService.js';

function getMediasDir() {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join('C:', 'PrintStationApp', 'Medias');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Documents', 'PrintStationApp', 'Medias');
  } else {
    return path.join(os.homedir(), '.PrintStationApp', 'Medias');
  }
}

function getParticipantDir(participantId) {
  return path.join(getMediasDir(), participantId);
}

const MEDIAS_DIR = getMediasDir();
const PARTIAL_EXT = '.partial';

const CONFIG = {
  MAX_CONCURRENT_DOWNLOADS: 3,
  DOWNLOAD_TIMEOUT_MS: 60000,
  MAX_RETRIES_PER_PHOTO: 3,
  RETRY_DELAY_MS: 5000,
  MAX_CORRUPTION_COUNT: 3,
  MAX_QUEUE_SIZE: 500,
  CHECK_INTERVAL_MS: 10000,
};

console.log('[PhotoDownload] Plateforme:', process.platform);
console.log('[PhotoDownload] Dossier médias:', MEDIAS_DIR);

let downloadQueue = [];
let isProcessing = false;
let activeDownloads = 0;
let checkInterval = null;
let downloadStats = {
  totalAttempts: 0,
  successfulDownloads: 0,
  failedDownloads: 0,
  corruptedDownloads: 0,
  bytesDownloaded: 0,
  lastUpdate: new Date(),
};

export async function startDownloadService() {
  console.log('[PhotoDownload] Service démarrage...');
  
  await ensureDirectories();
  await recoverPartialDownloads();
  await resumeFailedDownloads();
  
  checkInterval = setInterval(processQueue, CONFIG.CHECK_INTERVAL_MS);
  console.log('[PhotoDownload] Service actif');
}

export function stopDownloadService() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  console.log('[PhotoDownload] Service arrêté');
}

/**
 * Enqueuer un téléchargement
 * ⭐ Avec détection de checksum change
 */
export async function enqueueDownload(photoId) {
  const photo = await db.getPhoto(photoId);
  
  if (!photo) {
    console.warn(`[PhotoDownload] Photo ${photoId} non trouvée en DB`);
    return;
  }

  // Télécharger depuis url_watermark (avec watermark) pour le fichier local
  const url = photo.url_watermark || photo.remote_url || photo.url;
  if (!url) {
    console.error(`[PhotoDownload] ❌ Photo ${photoId} n'a pas d'URL!`);
    return;
  }
  console.log(`[PhotoDownload] 📍 URL watermark: ${photo.url_watermark}`);
  console.log(`[PhotoDownload] 📍 URL remote: ${photo.remote_url}`);

  // ⭐ Vérifier si déjà téléchargée
  if (photo.status === 'complete' && photo.local_path) {
    try {
      const exists = await fs.stat(photo.local_path).then(() => true).catch(() => false);
      if (exists) {
        // ⭐ IMPORTANT: Vérifier si checksum a changé
        const fileChecksum = await calculateFileSHA256(photo.local_path);
        
        if (fileChecksum === photo.checksum) {
          // Fichier identique, rien à faire
          return;
        } else {
          // ⭐ Checksum a changé! Re-télécharger
          console.log(`[PhotoDownload] 🔄 Checksum changé pour ${photoId}, re-téléchargement`);
          await db.updatePhotoStatus(photoId, 'pending');
        }
      }
    } catch (error) {
      console.error(`[PhotoDownload] Erreur vérification checksum: ${error.message}`);
    }
  }

  // Vérifier si déjà en queue
  if (downloadQueue.some(item => item.id === photoId)) {
    return;
  }

  // ⭐ Vérifier la limite de queue
  if (downloadQueue.length >= CONFIG.MAX_QUEUE_SIZE) {
    console.warn(`[PhotoDownload] ⚠️  Queue pleine (${CONFIG.MAX_QUEUE_SIZE}), photo ${photoId} rejetée`);
    return;
  }

  // Ajouter à la queue avec priorité
  downloadQueue.push({
    id: photoId,
    participantId: photo.participant_id,
    url: url,
    checksum: photo.checksum,
    size: photo.size_bytes,
    createdAt: new Date(photo.created_at || new Date()),
    priority: calculatePriority(photo),
  });

  console.log(`[PhotoDownload] ⏳ ${photoId} ajouté à queue (total: ${downloadQueue.length})`);
  
  if (!isProcessing) {
    processQueue();
  }
}

/**
 * Calculer la priorité d'une photo
 * ⭐ Récentes = haute priorité
 */
function calculatePriority(photo) {
  const ageMs = Date.now() - new Date(photo.created_at || new Date()).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  // Plus c'est récent, plus la priorité est haute
  return Math.max(0, 100 - Math.floor(ageDays));
}

/**
 * Reprendre les téléchargements échoués
 */
async function resumeFailedDownloads() {
  try {
    console.log('[PhotoDownload] 🔄 Recherche photos échouées...');
    
    const failedPhotos = await db.getPhotosByStatus('error', 1000);
    const resumedCount = failedPhotos.filter(p => {
      const retryCount = p.retry_count || 0;
      const corruptCount = p.corruption_count || 0;
      
      // ⭐ Ne pas retry si:
      // - Déjà 3+ retries
      // - Déjà 3+ corruptions
      if (retryCount >= CONFIG.MAX_RETRIES_PER_PHOTO) {
        console.log(`[PhotoDownload] ⏭️  ${p.id} max retries atteint`);
        return false;
      }
      
      if (corruptCount >= CONFIG.MAX_CORRUPTION_COUNT) {
        console.log(`[PhotoDownload] ⏭️  ${p.id} max corruptions atteint`);
        return false;
      }
      
      return true;
    }).length;
    
    console.log(`[PhotoDownload] ✅ ${resumedCount} photos à retry`);
    
  } catch (error) {
    console.error('[PhotoDownload] Erreur resume failed:', error.message);
  }
}

async function processQueue() {
  if (isProcessing || activeDownloads >= CONFIG.MAX_CONCURRENT_DOWNLOADS) {
    return;
  }

  if (downloadQueue.length === 0) {
    return;
  }

  isProcessing = true;

  try {
    while (
      downloadQueue.length > 0 &&
      activeDownloads < CONFIG.MAX_CONCURRENT_DOWNLOADS
    ) {
      // ⭐ Trier par priorité (récentes d'abord)
      downloadQueue.sort((a, b) => b.priority - a.priority);
      
      const item = downloadQueue.shift();
      activeDownloads++;

      downloadPhoto(item)
        .catch(error => console.error(`[PhotoDownload] Erreur non gérée:`, error))
        .finally(() => {
          activeDownloads--;
        });
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Télécharger une photo avec gestion robuste des erreurs
 */
async function downloadPhoto(queueItem) {
  const { id: photoId, url, checksum, participantId } = queueItem;

  console.log(`[PhotoDownload] 📥 Téléchargement ${photoId}...`);
  logger.logPhotoDownloadStart(photoId, url);
  
  try {
    const diskCheck = await checkDiskSpace();
    if (!diskCheck.hasSpace) {
      await db.markPhotoError(photoId, 'DISK_FULL');
      console.error(`[PhotoDownload] ❌ Espace disque insuffisant`);
      return;
    }

    const participantDir = getParticipantDir(participantId);
    const localPath = path.join(participantDir, `${photoId}.jpg`);
    const partialPath = localPath + PARTIAL_EXT;

    await fs.mkdir(participantDir, { recursive: true });

    // Télécharger le fichier
    await downloadFileWithRetry(url, partialPath, photoId);

    // ⭐ Vérifier l'intégrité STRICTEMENT
    const downloadedChecksum = await calculateFileSHA256(partialPath);
    
    if (downloadedChecksum !== checksum) {
      console.error(
        `[PhotoDownload] ❌ Checksum INVALIDE: ${photoId}\n` +
        `  Expected: ${checksum}\n` +
        `  Got: ${downloadedChecksum}`
      );
      
      try {
        await fs.unlink(partialPath);
      } catch (e) {}
      
      // ⭐ Incrémenter corruption_count
      const photo = await db.getPhoto(photoId);
      const corruptCount = (photo?.corruption_count || 0) + 1;
      
      if (corruptCount >= CONFIG.MAX_CORRUPTION_COUNT) {
        // Trop de corruptions → erreur définitive
        await db.markPhotoError(photoId, `Checksum fail x${corruptCount}`);
        downloadStats.corruptedDownloads++;
        console.error(`[PhotoDownload] 🚫 ${photoId} CORROMPU après ${corruptCount} tentatives`);
      } else {
        // Retry
        await db.incrementPhotoRetry(photoId, `Checksum mismatch (${corruptCount})`);
        setTimeout(() => enqueueDownload(photoId), CONFIG.RETRY_DELAY_MS);
      }
      
      return;
    }

    // ✅ Checksum valide
    await fs.rename(partialPath, localPath);

    const stats = await fs.stat(localPath);
    await db.updatePhotoDownloadProgress(photoId, localPath, downloadedChecksum);

    downloadStats.successfulDownloads++;
    downloadStats.bytesDownloaded += stats.size;
    downloadStats.lastUpdate = new Date();

    console.log(`[PhotoDownload] ✅ ${photoId} téléchargé et validé (${formatBytes(stats.size)})`);
    logger.logPhotoDownloadSuccess(photoId, localPath, stats.size);

  } catch (error) {
    downloadStats.totalAttempts++;

    const photo = await db.getPhoto(photoId);
    const retryCount = (photo?.retry_count || 0) + 1;

    console.error(`[PhotoDownload] ❌ ${photoId} erreur: ${error.message} (retry ${retryCount})`);
    logger.logPhotoDownloadError(photoId, `${error.message} (retry ${retryCount})`);

    if (retryCount >= CONFIG.MAX_RETRIES_PER_PHOTO) {
      await db.markPhotoError(photoId, error.message);
      downloadStats.failedDownloads++;
      console.error(`[PhotoDownload] 🚫 ${photoId} échec définitif après ${retryCount} tentatives`);
    } else {
      await db.incrementPhotoRetry(photoId, error.message);
      
      setTimeout(() => {
        enqueueDownload(photoId);
      }, CONFIG.RETRY_DELAY_MS * retryCount);
    }

    try {
      const participantDir = getParticipantDir(queueItem.participantId);
      const partialPath = path.join(participantDir, `${photoId}.jpg${PARTIAL_EXT}`);
      await fs.unlink(partialPath);
    } catch (e) {}
  }
}

async function downloadFileWithRetry(url, destinationPath, photoId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.DOWNLOAD_TIMEOUT_MS);

  console.log(`[PhotoDownload] 📍 URL: ${url}`);
  console.log(`[PhotoDownload] 💾 Destination: ${destinationPath}`);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PrintStation/1.0',
      },
    });

    console.log(`[PhotoDownload] 📊 HTTP ${response.status} ${response.statusText}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const writeStream = fsSync.createWriteStream(destinationPath);

    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      writeStream.write(value);
      receivedBytes += value.length;
    }

    writeStream.end();

    console.log(`[PhotoDownload] 📦 Reçu: ${formatBytes(receivedBytes)}`);

  } finally {
    clearTimeout(timeout);
  }
}

async function calculateFileSHA256(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fsSync.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
    stream.on('error', reject);
  });
}

async function ensureDirectories() {
  try {
    await fs.mkdir(MEDIAS_DIR, { recursive: true });
    console.log(`[PhotoDownload] 📁 Dossier créé: ${MEDIAS_DIR}`);
  } catch (error) {
    console.error('[PhotoDownload] Erreur création répertoires:', error);
  }
}

async function checkDiskSpace() {
  try {
    const stats = await fs.statfs(MEDIAS_DIR);
    const availableMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    const usedMB = downloadStats.bytesDownloaded / (1024 * 1024);

    return {
      availableMB,
      usedMB,
      hasSpace: availableMB > 100 && usedMB < 5000,
    };
  } catch (error) {
    console.error('[PhotoDownload] Erreur check espace:', error);
    return { hasSpace: false };
  }
}

export function getDownloadStats() {
  return {
    ...downloadStats,
    queueLength: downloadQueue.length,
    activeDownloads,
  };
}

async function recoverPartialDownloads() {
  try {
    console.log('[PhotoDownload] 🔍 Recherche fichiers partiels...');
    
    const entries = await fs.readdir(MEDIAS_DIR, { withFileTypes: true });
    
    let recovered = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(MEDIAS_DIR, entry.name);
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          if (file.endsWith(PARTIAL_EXT)) {
            const fullPath = path.join(dirPath, file);
            await fs.unlink(fullPath);
            console.log(`[PhotoDownload] 🗑️  Suppression: ${file}`);
            recovered++;
          }
        }
      }
    }
    
    console.log(`[PhotoDownload] ✅ ${recovered} fichiers partiels supprimés`);
  } catch (error) {
    console.error('[PhotoDownload] Erreur récupération:', error);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}