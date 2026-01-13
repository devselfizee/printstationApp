/**
 * photoDownloadService.js - STRATÉGIE DE RETRY EN 4 PHASES
 *
 * ⭐ Principes:
 * - Jamais d'abandon silencieux
 * - Retry persistant avec next_retry_at
 * - 4 phases de retry avec timing croissant
 * - Forçage manuel possible
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

/**
 * ============================================
 * CONFIGURATION RETRY EN 4 PHASES
 * ============================================
 *
 * Phase 1: 3 tentatives, toutes les 15 secondes
 * Phase 2: 3 tentatives, toutes les 2 minutes
 * Phase 3: 10 tentatives, toutes les 5 minutes
 * Phase 4: Illimité, toutes les 30 minutes (JAMAIS D'ABANDON)
 */
const RETRY_PHASES = {
  1: { maxAttempts: 3, delaySeconds: 15, name: 'Retry immédiat' },
  2: { maxAttempts: 3, delaySeconds: 120, name: 'Retry intermédiaire' },
  3: { maxAttempts: 10, delaySeconds: 300, name: 'Retry long' },
  4: { maxAttempts: Infinity, delaySeconds: 1800, name: 'Veille longue' },
};

const CONFIG = {
  MAX_CONCURRENT_DOWNLOADS: 2, // Réduit pour éviter saturation serveur
  DOWNLOAD_TIMEOUT_MS: 60000,
  MAX_CORRUPTION_COUNT: 3,
  MAX_QUEUE_SIZE: 500,
  RETRY_CHECK_INTERVAL_MS: 10000, // Vérifier les retry toutes les 10s
  QUEUE_PROCESS_INTERVAL_MS: 5000,
  RANDOM_DELAY_MAX_MS: 3000, // Délai aléatoire pour éviter les pics
};

console.log('[PhotoDownload] Plateforme:', process.platform);
console.log('[PhotoDownload] Dossier médias:', MEDIAS_DIR);

let downloadQueue = [];
let isProcessing = false;
let activeDownloads = 0;
let queueInterval = null;
let retryInterval = null;
let downloadStats = {
  totalAttempts: 0,
  successfulDownloads: 0,
  failedDownloads: 0,
  corruptedDownloads: 0,
  bytesDownloaded: 0,
  lastUpdate: new Date(),
};

/**
 * ============================================
 * DÉMARRAGE / ARRÊT DU SERVICE
 * ============================================
 */
export async function startDownloadService() {
  console.log('[PhotoDownload] 🚀 Service démarrage...');

  await ensureDirectories();
  await recoverPartialDownloads();
  await resumeDownloads();

  // Intervalle pour traiter la queue
  queueInterval = setInterval(processQueue, CONFIG.QUEUE_PROCESS_INTERVAL_MS);

  // Intervalle pour vérifier les photos prêtes à retry
  retryInterval = setInterval(checkRetrySchedule, CONFIG.RETRY_CHECK_INTERVAL_MS);

  console.log('[PhotoDownload] ✅ Service actif avec stratégie 4 phases');
  logger.info('PHOTO_DL', 'Service démarré', {
    phases: Object.keys(RETRY_PHASES).map(p => RETRY_PHASES[p].name)
  });
}

export function stopDownloadService() {
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
  console.log('[PhotoDownload] 🛑 Service arrêté');
}

/**
 * ============================================
 * GESTION DES RETRY PLANIFIÉS
 * ============================================
 */
async function checkRetrySchedule() {
  try {
    const photosToRetry = await db.getPhotosReadyForRetry(50);

    if (photosToRetry.length === 0) return;

    console.log(`[PhotoDownload] ⏰ ${photosToRetry.length} photos prêtes pour retry`);

    // Log pour tracer dans les fichiers de logs
    logger.info('PHOTO_DL', `${photosToRetry.length} photos prêtes pour retry automatique`, {
      count: photosToRetry.length,
      photoIds: photosToRetry.map(p => p.id).slice(0, 10), // Max 10 IDs pour éviter des logs trop longs
      timestamp: new Date().toISOString()
    });

    for (const photo of photosToRetry) {
      // Délai aléatoire pour éviter les pics
      const randomDelay = Math.floor(Math.random() * CONFIG.RANDOM_DELAY_MAX_MS);

      setTimeout(async () => {
        const wasStuck = !photo.next_retry_at;

        // Si la photo n'avait pas de next_retry_at (photo bloquée), initialiser les infos de retry
        if (wasStuck) {
          console.log(`[PhotoDownload] 🔧 Initialisation retry pour photo bloquée: ${photo.id}`);
          logger.warn('PHOTO_DL', `Photo bloquée récupérée: ${photo.id}`, {
            photoId: photo.id,
            previousStatus: photo.status,
            previousError: photo.last_error_code
          });
          await db.updatePhotoRetryInfo(photo.id, {
            retryCount: photo.retry_count || 0,
            retryPhase: 1,
            nextRetryAt: Math.floor(Date.now() / 1000),
            lastErrorCode: photo.last_error_code || 'RECOVERED',
            lastErrorMessage: photo.last_error || 'Photo récupérée automatiquement',
            status: 'pending'
          });
        } else {
          await db.updatePhotoStatus(photo.id, 'pending');
        }

        await enqueueDownload(photo.id);

        logger.info('PHOTO_DL', `Retry automatique déclenché: ${photo.id}`, {
          photoId: photo.id,
          phase: photo.retry_phase || 1,
          attemptCount: photo.retry_count || 0,
          wasStuck,
          previousError: photo.last_error_code
        });
      }, randomDelay);
    }
  } catch (error) {
    console.error('[PhotoDownload] Erreur check retry schedule:', error.message);
    logger.error('PHOTO_DL', 'Erreur vérification retry schedule', { error: error.message });
  }
}

/**
 * Reprendre les téléchargements au démarrage
 */
async function resumeDownloads() {
  try {
    console.log('[PhotoDownload] 🔄 Recherche téléchargements à reprendre...');

    // Photos en pending (jamais commencées ou en attente)
    const pendingPhotos = await db.getPhotosByStatus('pending', 500);

    // Photos en failed_temp et failed_long_retry avec next_retry_at passé
    const failedPhotos = await db.getPhotosReadyForRetry(500);

    let resumedCount = 0;

    // Relancer les pending
    for (const p of pendingPhotos) {
      await enqueueDownload(p.id);
      resumedCount++;
    }

    // Relancer les failed prêts
    for (const p of failedPhotos) {
      await db.updatePhotoStatus(p.id, 'pending');
      await enqueueDownload(p.id);
      resumedCount++;
    }

    console.log(`[PhotoDownload] ✅ ${resumedCount} photos relancées`);
    logger.info('PHOTO_DL', 'Reprise téléchargements au démarrage', {
      pending: pendingPhotos.length,
      failedReady: failedPhotos.length,
      total: resumedCount
    });

  } catch (error) {
    console.error('[PhotoDownload] Erreur resume:', error.message);
    logger.error('PHOTO_DL', 'Erreur reprise téléchargements', { error: error.message });
  }
}

/**
 * ============================================
 * ENQUEUE ET PROCESS
 * ============================================
 */
export async function enqueueDownload(photoId) {
  const photo = await db.getPhoto(photoId);

  if (!photo) {
    console.warn(`[PhotoDownload] Photo ${photoId} non trouvée en DB`);
    return;
  }

  const url = photo.remote_url || photo.url;
  if (!url) {
    console.error(`[PhotoDownload] ❌ Photo ${photoId} n'a pas d'URL!`);
    return;
  }

  // Vérifier si déjà téléchargée
  if (photo.status === 'complete' && photo.local_path) {
    try {
      const exists = await fs.stat(photo.local_path).then(() => true).catch(() => false);
      if (exists) {
        const fileChecksum = await calculateFileSHA256(photo.local_path);
        if (fileChecksum === photo.checksum) {
          return; // Fichier OK
        }
        console.log(`[PhotoDownload] 🔄 Checksum changé pour ${photoId}, re-téléchargement`);
        await db.updatePhotoStatus(photoId, 'pending');
      }
    } catch (error) {
      console.error(`[PhotoDownload] Erreur vérification: ${error.message}`);
    }
  }

  // Vérifier si déjà en queue
  if (downloadQueue.some(item => item.id === photoId)) {
    return;
  }

  // Vérifier la limite de queue
  if (downloadQueue.length >= CONFIG.MAX_QUEUE_SIZE) {
    console.warn(`[PhotoDownload] ⚠️ Queue pleine (${CONFIG.MAX_QUEUE_SIZE})`);
    return;
  }

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

function calculatePriority(photo) {
  const ageMs = Date.now() - new Date(photo.created_at || new Date()).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 100 - Math.floor(ageDays));
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
 * ============================================
 * TÉLÉCHARGEMENT AVEC RETRY 4 PHASES
 * ============================================
 */
async function downloadPhoto(queueItem) {
  const { id: photoId, url, checksum, participantId } = queueItem;

  console.log(`[PhotoDownload] 📥 Téléchargement ${photoId}...`);

  // Marquer comme downloading
  await db.markPhotoDownloading(photoId);
  logger.logPhotoDownloadStart(photoId, url);

  try {
    const diskCheck = await checkDiskSpace();
    if (!diskCheck.hasSpace) {
      await handleDownloadError(photoId, url, participantId, new Error('DISK_FULL'), 'DISK_FULL');
      return;
    }

    const participantDir = getParticipantDir(participantId);
    const localPath = path.join(participantDir, `${photoId}.jpg`);
    const partialPath = localPath + PARTIAL_EXT;

    await fs.mkdir(participantDir, { recursive: true });

    // Télécharger le fichier
    await downloadFileWithRetry(url, partialPath, photoId);

    // Vérifier l'intégrité
    const downloadedChecksum = await calculateFileSHA256(partialPath);

    if (downloadedChecksum !== checksum) {
      console.error(`[PhotoDownload] ❌ Checksum INVALIDE: ${photoId}`);

      try { await fs.unlink(partialPath); } catch (e) {}

      const photo = await db.getPhoto(photoId);
      const corruptCount = (photo?.corruption_count || 0) + 1;

      if (corruptCount >= CONFIG.MAX_CORRUPTION_COUNT) {
        downloadStats.corruptedDownloads++;
        await handleDownloadError(photoId, url, participantId,
          new Error(`Checksum fail x${corruptCount}`), 'CHECKSUM_FAIL');
      } else {
        // Retry rapide pour corruption
        await db.incrementPhotoRetry(photoId, `Checksum mismatch (${corruptCount})`);
        const nextRetryAt = Math.floor(Date.now() / 1000) + 15;
        await db.updatePhotoRetryInfo(photoId, {
          retryCount: photo.retry_count + 1,
          retryPhase: 1,
          nextRetryAt,
          lastErrorCode: 'CHECKSUM_MISMATCH',
          lastErrorMessage: `Corruption détectée (${corruptCount}/${CONFIG.MAX_CORRUPTION_COUNT})`,
          status: 'failed_temp'
        });
      }
      return;
    }

    // ✅ Succès!
    await fs.rename(partialPath, localPath);
    const stats = await fs.stat(localPath);
    await db.updatePhotoDownloadProgress(photoId, localPath, downloadedChecksum);

    downloadStats.successfulDownloads++;
    downloadStats.bytesDownloaded += stats.size;
    downloadStats.lastUpdate = new Date();

    console.log(`[PhotoDownload] ✅ ${photoId} téléchargé (${formatBytes(stats.size)})`);
    logger.logPhotoDownloadSuccess(photoId, localPath, stats.size);

  } catch (error) {
    await handleDownloadError(photoId, url, participantId, error, error.code || 'UNKNOWN');

    // Nettoyer le fichier partiel
    try {
      const participantDir = getParticipantDir(participantId);
      const partialPath = path.join(participantDir, `${photoId}.jpg${PARTIAL_EXT}`);
      await fs.unlink(partialPath);
    } catch (e) {}
  }
}

/**
 * ============================================
 * GESTION DES ERREURS - STRATÉGIE 4 PHASES
 * ============================================
 */
async function handleDownloadError(photoId, url, participantId, error, errorCode) {
  downloadStats.totalAttempts++;
  downloadStats.failedDownloads++;

  const photo = await db.getPhoto(photoId);
  const currentRetryCount = (photo?.retry_count || 0) + 1;
  const currentPhase = photo?.retry_phase || 1;

  // Calculer la nouvelle phase et le prochain retry
  const { newPhase, newStatus, nextRetryAt } = calculateNextRetry(currentRetryCount, currentPhase);
  const nextRetryInSeconds = nextRetryAt ? Math.round(nextRetryAt - Date.now() / 1000) : 0;

  // Log détaillé
  const errorDetails = {
    photoId,
    url,
    participantId,
    retryCount: currentRetryCount,
    phase: currentPhase,
    newPhase,
    newStatus,
    nextRetryIn: `${nextRetryInSeconds}s`,
    nextRetryAt: nextRetryAt ? new Date(nextRetryAt * 1000).toISOString() : 'N/A',
    errorCode,
    errorMessage: error.message,
    timestamp: new Date().toISOString()
  };

  console.error(`[PhotoDownload] ❌ ${photoId} erreur: ${error.message}`);
  console.error(`[PhotoDownload] 📋 Phase ${currentPhase}→${newPhase}, retry #${currentRetryCount}, prochain dans ${nextRetryInSeconds}s`);

  // Log ERROR pour l'erreur de téléchargement
  logger.error('PHOTO_DL', `Échec téléchargement photo ${photoId}`, errorDetails);

  // Log INFO pour la planification du retry (permet de tracer dans les logs)
  logger.info('PHOTO_DL', `Retry planifié pour photo ${photoId}`, {
    photoId,
    retryCount: currentRetryCount,
    phase: newPhase,
    nextRetryIn: `${nextRetryInSeconds}s`,
    nextRetryAt: nextRetryAt ? new Date(nextRetryAt * 1000).toISOString() : 'N/A',
    errorCode
  });

  // Mettre à jour la DB avec la nouvelle planification
  await db.updatePhotoRetryInfo(photoId, {
    retryCount: currentRetryCount,
    retryPhase: newPhase,
    nextRetryAt,
    lastErrorCode: errorCode,
    lastErrorMessage: error.message,
    status: newStatus
  });

  // Log spécial pour passage en phase 4 (veille longue)
  if (newPhase === 4 && currentPhase < 4) {
    console.warn(`[PhotoDownload] ⚠️ ${photoId} passe en VEILLE LONGUE (retry toutes les 30min)`);
    logger.warn('PHOTO_DL', `Photo ${photoId} passe en veille longue`, {
      photoId,
      totalAttempts: currentRetryCount,
      lastError: error.message
    });
  }
}

/**
 * Calculer la prochaine phase et le timing de retry
 */
function calculateNextRetry(retryCount, currentPhase) {
  let phase = currentPhase;
  let attemptsInPhase = retryCount;

  // Calculer les tentatives cumulées pour chaque phase
  let cumulativeAttempts = 0;
  for (let p = 1; p < phase; p++) {
    cumulativeAttempts += RETRY_PHASES[p].maxAttempts;
  }
  attemptsInPhase = retryCount - cumulativeAttempts;

  // Vérifier si on doit passer à la phase suivante
  while (phase < 4 && attemptsInPhase >= RETRY_PHASES[phase].maxAttempts) {
    attemptsInPhase -= RETRY_PHASES[phase].maxAttempts;
    phase++;
  }

  const phaseConfig = RETRY_PHASES[phase];
  const delaySeconds = phaseConfig.delaySeconds;
  const nextRetryAt = Math.floor(Date.now() / 1000) + delaySeconds;

  // Déterminer le status
  let status = 'failed_temp';
  if (phase === 4) {
    status = 'failed_long_retry';
  }

  return { newPhase: phase, newStatus: status, nextRetryAt };
}

/**
 * ============================================
 * FORCER UN RETRY (BOUTON SUPPORT)
 * ============================================
 */
export async function forceRetry(photoId) {
  console.log(`[PhotoDownload] 🔄 Force retry pour ${photoId}`);

  await db.forcePhotoRetry(photoId);
  await enqueueDownload(photoId);

  logger.info('PHOTO_DL', 'Retry forcé par utilisateur', { photoId });

  return { success: true, message: `Photo ${photoId} remise en queue` };
}

/**
 * Forcer le retry de toutes les photos en échec
 */
export async function forceRetryAll() {
  console.log('[PhotoDownload] 🔄 Force retry TOUTES les photos en échec...');

  const failedPhotos = await db.getFailedPhotos(1000);
  let count = 0;

  for (const photo of failedPhotos) {
    await db.forcePhotoRetry(photo.id);
    await enqueueDownload(photo.id);
    count++;
  }

  logger.info('PHOTO_DL', 'Retry forcé pour toutes les photos', { count });
  console.log(`[PhotoDownload] ✅ ${count} photos remises en queue`);

  return { success: true, count };
}

/**
 * ============================================
 * FONCTIONS UTILITAIRES
 * ============================================
 */
async function downloadFileWithRetry(url, destinationPath, photoId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PrintStation/1.0' },
    });

    console.log(`[PhotoDownload] 📊 HTTP ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorDetails = {
        photoId, url,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        contentType: response.headers.get('content-type'),
        timestamp: new Date().toISOString()
      };

      try {
        const errorBody = await response.text();
        errorDetails.responseBody = errorBody.substring(0, 500);
      } catch (e) {}

      logger.error('PHOTO_DL', `HTTP ${response.status} pour ${photoId}`, errorDetails);

      const err = new Error(`HTTP ${response.status} ${response.statusText}`);
      err.code = `HTTP_${response.status}`;
      throw err;
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

  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Timeout après ${CONFIG.DOWNLOAD_TIMEOUT_MS / 1000}s`);
      timeoutError.code = 'TIMEOUT';
      logger.error('PHOTO_DL', `Timeout photo ${photoId}`, { photoId, url });
      throw timeoutError;
    }
    throw error;
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
    console.log(`[PhotoDownload] 📁 Dossier: ${MEDIAS_DIR}`);
  } catch (error) {
    console.error('[PhotoDownload] Erreur création répertoires:', error);
  }
}

async function checkDiskSpace() {
  try {
    const stats = await fs.statfs(MEDIAS_DIR);
    const availableMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    return { availableMB, hasSpace: availableMB > 100 };
  } catch (error) {
    console.error('[PhotoDownload] Erreur check espace:', error);
    return { hasSpace: false };
  }
}

async function recoverPartialDownloads() {
  try {
    console.log('[PhotoDownload] 🔍 Nettoyage fichiers partiels...');

    const entries = await fs.readdir(MEDIAS_DIR, { withFileTypes: true });
    let recovered = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(MEDIAS_DIR, entry.name);
        const files = await fs.readdir(dirPath);

        for (const file of files) {
          if (file.endsWith(PARTIAL_EXT)) {
            await fs.unlink(path.join(dirPath, file));
            recovered++;
          }
        }
      }
    }

    if (recovered > 0) {
      console.log(`[PhotoDownload] 🗑️ ${recovered} fichiers partiels supprimés`);
    }
  } catch (error) {
    console.error('[PhotoDownload] Erreur récupération:', error);
  }
}

export function getDownloadStats() {
  return {
    ...downloadStats,
    queueLength: downloadQueue.length,
    activeDownloads,
  };
}

/**
 * Obtenir les infos de toutes les photos en échec (pour l'UI support)
 */
export async function getFailedPhotosInfo() {
  const photos = await db.getFailedPhotos(500);

  return photos.map(p => ({
    id: p.id,
    participantId: p.participant_id,
    fileName: p.file_name,
    status: p.status,
    retryCount: p.retry_count,
    retryPhase: p.retry_phase,
    phaseName: RETRY_PHASES[p.retry_phase]?.name || 'Inconnu',
    nextRetryAt: p.next_retry_at ? new Date(p.next_retry_at * 1000).toISOString() : null,
    nextRetryIn: p.next_retry_at ? Math.max(0, p.next_retry_at - Math.floor(Date.now() / 1000)) : null,
    lastErrorCode: p.last_error_code,
    lastErrorMessage: p.last_error,
    createdAt: p.created_at
  }));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
