/**
 * photoSyncService.js - ROBUSTE
 * 
 * ⭐ Gère:
 * - Coupure en plein cours (flag isSyncing)
 * - Checksum change (compare avec DB)
 * - Récupération photos pending au démarrage
 * - DB corrompue (backup + recréer)
 * - Timeout API
 */

import * as db from './db.js';
import * as downloadService from './photoDownloadService.js';
import path from 'path';
import os from 'os';
import * as fs from 'fs/promises';

const CONFIG = {
  SYNC_INTERVAL_MS: 30000,
  SYNC_TIMEOUT_MS: 10000,
};

let API_BASE_URL = process.env.PHOTO_API_URL;
if (!API_BASE_URL) {
  console.warn('[PhotoSync] ⚠️  PHOTO_API_URL non définie');
  API_BASE_URL = 'http://localhost:8888/printStationServer/api/checkPhotos.php';
}
console.log('[PhotoSync] API URL:', API_BASE_URL);

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
console.log('[PhotoSync] Plateforme:', process.platform);
console.log('[PhotoSync] Dossier médias:', MEDIAS_DIR);

let syncInterval = null;
let lastGlobalSync = null;
let isSyncing = false;
let syncStats = {
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
  photosDiscovered: 0,
  photosUpdated: 0,
};

/**
 * Démarrer le service
 */
export async function startSyncService() {
  console.log('[PhotoSync] Service démarrage...');
  
  try {
    // ⭐ Vérifier/réparer la DB au démarrage
    await verifyDatabase();
  } catch (error) {
    console.error('[PhotoSync] Erreur vérification DB:', error.message);
  }
  
  try {
    await resumePendingDownloads();
  } catch (error) {
    console.error('[PhotoSync] Erreur resume pending:', error.message);
  }
  
  await performSync();
  
  syncInterval = setInterval(performSync, CONFIG.SYNC_INTERVAL_MS);
  console.log(`[PhotoSync] Service actif (interval: ${CONFIG.SYNC_INTERVAL_MS}ms)`);
}

/**
 * ⭐ Vérifier l'intégrité de la DB
 */
async function verifyDatabase() {
  try {
    console.log('[PhotoSync] 🔍 Vérification DB...');
    
    // Essayer une requête simple
    const result = await db.getPhotosByStatus('complete', 1);
    console.log('[PhotoSync] ✅ DB intègre');
    
  } catch (error) {
    console.error('[PhotoSync] ⚠️  DB CORROMPUE:', error.message);
    
    // ⭐ Backup et recréer
    try {
      const dbPath = path.join(MEDIAS_DIR, 'data.db');
      const backupPath = path.join(MEDIAS_DIR, `data.db.backup.${Date.now()}`);
      
      await fs.rename(dbPath, backupPath);
      console.log(`[PhotoSync] ✅ Backup sauvegardé: ${backupPath}`);
      
      // Recréer la DB
      await db.initDB();
      console.log('[PhotoSync] ✅ DB recréée');
      
    } catch (backupError) {
      console.error('[PhotoSync] ❌ Impossible de recréer la DB:', backupError.message);
      throw backupError;
    }
  }
}

/**
 * Reprendre les téléchargements pending
 */
async function resumePendingDownloads() {
  try {
    console.log('[PhotoSync] 🔄 Recherche photos pending...');
    
    const pendingPhotos = await db.getPhotosByStatus('pending', 10000);
    
    console.log(`[PhotoSync] 🔄 ${pendingPhotos.length} photos pending trouvées`);
    
    for (const photo of pendingPhotos) {
      console.log(`[PhotoSync] 📥 Relance: ${photo.id}`);
      try {
        await downloadService.enqueueDownload(photo.id);
      } catch (error) {
        console.error(`[PhotoSync] ⚠️  Erreur enqueue ${photo.id}:`, error.message);
      }
    }
    
    if (pendingPhotos.length > 0) {
      console.log(`[PhotoSync] ✅ ${pendingPhotos.length} téléchargements relancés`);
    }
    
  } catch (error) {
    console.error('[PhotoSync] ❌ Erreur resumePendingDownloads:', error.message);
  }
}

export function stopSyncService() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  console.log('[PhotoSync] Service arrêté');
}

/**
 * Cycle de sync avec timeout
 */
async function performSync() {
  if (isSyncing) {
    console.log('[PhotoSync] ⏭️  Sync déjà en cours');
    return;
  }

  isSyncing = true;
  syncStats.totalRuns++;
  
  console.log(`[PhotoSync] 🔄 Cycle ${syncStats.totalRuns}`);

  try {
    // ⭐ Wrap dans un timeout global
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sync timeout')), 30000)
    );
    
    const syncPromise = performSyncInternal();
    
    await Promise.race([syncPromise, timeoutPromise]);
    
  } catch (error) {
    console.error('[PhotoSync] ❌ Erreur sync:', error.message);
    syncStats.failedRuns++;
  } finally {
    isSyncing = false;
  }
}

async function performSyncInternal() {
  console.log('[PhotoSync] 📡 Appel API...');
  const response = await fetchAllPhotosFromAPI(lastGlobalSync);
  
  if (!response || !response.photos) {
    console.warn('[PhotoSync] ⚠️  Réponse API invalide');
    syncStats.failedRuns++;
    return;
  }

  console.log(`[PhotoSync] 📥 Reçu: ${response.photos.length} photos`);

  if (response.lastSync) {
    lastGlobalSync = response.lastSync;
  }

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  
  for (const remotePhoto of response.photos) {
    const result = await processRemotePhoto(remotePhoto);
    if (result.added) totalAdded++;
    if (result.updated) totalUpdated++;
    if (result.skipped) totalSkipped++;
  }

  syncStats.photosDiscovered += totalAdded;
  syncStats.photosUpdated += totalUpdated;
  syncStats.successfulRuns++;
  
  if (totalAdded > 0 || totalUpdated > 0) {
    console.log(`[PhotoSync] ✅ ${totalAdded} ajoutées, ${totalUpdated} mises à jour, ${totalSkipped} skip`);
  } else {
    console.log(`[PhotoSync] ✅ Aucune nouvelle`);
  }
}

async function fetchAllPhotosFromAPI(lastSync) {
  let apiUrl = API_BASE_URL;
  if (!apiUrl.includes('.php')) {
    // apiUrl = `${apiUrl}/checkPhotos.php`;
    apiUrl = `${apiUrl}/checkPhotos`;
  }
  
  const url = new URL(apiUrl);
  if (lastSync) {
    url.searchParams.append('lastSync', lastSync);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.SYNC_TIMEOUT_MS);

  try {
    console.log(`[PhotoSync] 📡 ${url.toString()}`);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PrintStation/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('[PhotoSync] ✗ Erreur API:', error.message);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traiter une photo de l'API
 * ⭐ Détecte les changements de checksum
 */
async function processRemotePhoto(remotePhoto) {
  const result = { added: false, updated: false, skipped: false, error: false };

  try {
    let existing = null;
    try {
      existing = await db.getPhoto(remotePhoto.id);
    } catch (error) {
      console.warn(`[PhotoSync] ⚠️  Erreur check DB: ${error.message}`);
    }

    if (existing) {
      // La photo existe
      if (existing.status === 'complete') {
        // ⭐ IMPORTANT: Vérifier si le checksum a changé
        if (existing.checksum !== remotePhoto.checksum) {
          console.log(`[PhotoSync] 🔄 ${remotePhoto.id}: checksum changé, re-téléchargement`);
          
          // Forcer le re-téléchargement
          await db.updatePhotoStatus(remotePhoto.id, 'pending');
          await downloadService.enqueueDownload(remotePhoto.id);
          
          result.updated = true;
          return result;
        }
        
        // Checksum identique, skip
        return result;
      }
      
      // En attente ou erreur
      result.skipped = true;
      return result;
    }

    // ⭐ CORRECTION: Créer/mettre à jour le participant AVANT d'ajouter la photo
    const participantId = remotePhoto.participantId || 'unknown';
    const universeId = remotePhoto.universe || 'unknown';
    
    try {
      await db.addOrUpdateParticipant(participantId, universeId, 'syncing');
      console.log(`[PhotoSync] ✅ Participant créé/mis à jour: ${participantId}`);
    } catch (error) {
      console.error(`[PhotoSync] ⚠️  Erreur création participant: ${error.message}`);
      // Continuer quand même pour ajouter la photo
    }

    // Nouvelle photo
    const photo = {
      id: remotePhoto.id,
      participantId: participantId,
      universe: universeId,
      fileName: `${remotePhoto.id}.jpg`,
      url: remotePhoto.url,
      checksum: remotePhoto.checksum,
      size: remotePhoto.size,
      incrustationId: remotePhoto.incrustationId || remotePhoto.incrustation_id || null,
      datePhoto: remotePhoto.datePhoto || remotePhoto.date_photo || null,
    };

    console.log(`[PhotoSync] ➕ ${remotePhoto.id}`);
    
    try {
      await db.addPhoto(photo);
    } catch (error) {
      console.error(`[PhotoSync] ❌ Erreur DB: ${error.message}`);
      result.error = true;
      return result;
    }
    
    result.added = true;

    await ensureParticipantDirectory(remotePhoto.participantId);

    console.log(`[PhotoSync] 📥 Enqueue: ${remotePhoto.id}`);
    try {
      await downloadService.enqueueDownload(remotePhoto.id);
    } catch (error) {
      console.error(`[PhotoSync] ⚠️  Erreur enqueue: ${error.message}`);
    }

  } catch (error) {
    console.error(`[PhotoSync] ✗ Erreur ${remotePhoto.id}: ${error.message}`);
    result.error = true;
  }

  return result;
}

async function ensureParticipantDirectory(participantId) {
  try {
    const participantDir = getParticipantDir(participantId);
    await fs.mkdir(participantDir, { recursive: true });
  } catch (error) {
    console.error(`[PhotoSync] ⚠️  Erreur mkdir: ${error.message}`);
  }
}

export function getServiceStats() {
  return {
    ...syncStats,
    lastGlobalSync,
    uptime: process.uptime(),
  };
}

export function resetStats() {
  syncStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    photosDiscovered: 0,
    photosUpdated: 0,
  };
}