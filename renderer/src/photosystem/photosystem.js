/**
 * photosystem.js - Point d'entrée principal
 * Initialise et gère le cycle de vie du système de gestion des photos
 * 
 * À intégrer dans main.js (Electron) ou app.js (Express)
 */

import * as db from './db.js';
import * as syncService from './photoSyncService.js';
import * as downloadService from './photoDownloadService.js';
import * as universeService from './universeService.js';
import * as displayService from './photoDisplayService.js';
import * as adminService from './adminService.js';

let isInitialized = false;

// Callback pour synchroniser un participant vers Supabase (injecté par main.js)
let onParticipantSyncCallback = null;

/**
 * Définir le callback de sync participant (appelé par main.js)
 */
export function setParticipantSyncCallback(callback) {
  onParticipantSyncCallback = callback;
  console.log('[PhotoSystem] Callback de sync participant configuré');
}

/**
 * Appeler le callback de sync participant (utilisé par les services internes)
 */
export function triggerParticipantSync(participantId, universeId) {
  if (onParticipantSyncCallback) {
    onParticipantSyncCallback(participantId, universeId);
  } else {
    console.warn('[PhotoSystem] Callback de sync participant non configuré');
  }
}

/**
 * ===== INITIALISATION =====
 */

/**
 * Initialiser le système de gestion des photos
 * À appeler au démarrage de l'application
 * Note: Les services de sync ne démarrent PAS automatiquement
 * Appeler startSyncServices() après vérification de la configuration
 */
export async function initializePhotoSystem() {
  console.log('[PhotoSystem] Initialisation...');

  try {
    // 1. Initialiser la base de données
    console.log('[PhotoSystem] → Initialisation BD');
    const dbResult = await db.initDB();
    if (!dbResult.success) {
      throw new Error(`Erreur BD: ${dbResult.error}`);
    }

    // 2. Réconcilier les participants manquants (réparer les photos orphelines)
    console.log('[PhotoSystem] → Réconciliation participants');
    await db.reconcileParticipants();

    // 3. Initialiser les répertoires
    console.log('[PhotoSystem] → Création répertoires');
    await universeService.initUniverseDirectories();

    // Note: Les services de sync ne démarrent PAS ici
    // Ils seront démarrés via startSyncServices() après vérification de la config

    isInitialized = true;
    console.log('[PhotoSystem] ✓ Système prêt (sync en attente de configuration)');

    return {
      status: 'success',
      message: 'Système de photos initialisé',
    };

  } catch (error) {
    console.error('[PhotoSystem] ✗ Erreur initialisation:', error);
    return {
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * Arrêter le système proprement
 * À appeler à la fermeture de l'application
 */
export function shutdownPhotoSystem() {
  console.log('[PhotoSystem] Arrêt...');

  syncService.stopSyncService();
  downloadService.stopDownloadService();
  db.closeDB();

  isInitialized = false;
  console.log('[PhotoSystem] ✓ Arrêt complet');
}

/**
 * Démarrer les services de synchronisation
 * À appeler UNIQUEMENT après que la configuration machine soit enregistrée
 */
export function startSyncServices() {
  if (!isInitialized) {
    console.warn('[PhotoSystem] Impossible de démarrer sync - système non initialisé');
    return false;
  }

  console.log('[PhotoSystem] → Démarrage services de synchronisation');
  syncService.startSyncService();
  downloadService.startDownloadService();
  console.log('[PhotoSystem] ✓ Services de sync démarrés');
  return true;
}

/**
 * ===== API PUBLIQUE =====
 */

/**
 * Traiter un scan QR code
 */
export async function onQRCodeScanned(qrContent) {
  if (!isInitialized) {
    return { status: 'error', error: 'Système non initialisé' };
  }

  return displayService.handleQRCodeScan(qrContent);
}

/**
 * Charger les photos d'un participant
 */
export async function getPhotos(participantId) {
  if (!isInitialized) {
    return { status: 'error', error: 'Système non initialisé' };
  }

  return displayService.loadParticipantPhotos(participantId);
}

/**
 * Obtenir la progression du sync
 */
export function getProgress(participantId) {
  return displayService.getParticipantSyncProgress(participantId);
}

/**
 * Sélectionner des photos et les marquer pour l'impression
 */
export function selectPhotosForPrinting(participantId, photoIds) {
  return displayService.selectPhotosForPrinting(participantId, photoIds);
}

/**
 * Confirmer l'achat des photos
 */
export function confirmPhotoPurchase(photoIds) {
  return displayService.markPhotosAsPurchased(photoIds);
}

/**
 * ===== ADMIN API =====
 */

export const admin = {
  // Dashboard
  getDashboardStats: adminService.getDashboardStats,

  // Recherche
  searchPhotos: adminService.searchPhotos,
  getParticipantPhotos: adminService.getParticipantPhotosDetailed,

  // Actions
  forceResync: adminService.forceResyncParticipant,
  deleteErrorPhotos: adminService.deleteErrorPhotos,
  clearCache: adminService.clearParticipantCache,
  deleteParticipant: adminService.deleteParticipantCompletely,

  // Retry (stratégie 4 phases)
  forceRetryPhoto: downloadService.forceRetry,
  forceRetryAll: downloadService.forceRetryAll,
  getFailedPhotos: downloadService.getFailedPhotosInfo,

  // Disque
  getDiskUsage: adminService.calculateDiskUsage,
  freeUpSpace: adminService.freeUpSpace,

  // Reports
  generateReport: adminService.generateFullReport,
  exportParticipant: adminService.exportParticipantData,
  getPurchaseReport: adminService.getPurchaseReport,

  // Purge photos
  countPhotosToPurge: adminService.countPhotosToPurge,
  purgePhotos: adminService.purgePhotos,

  // Purge automatique
  getAutoPurgeConfig: adminService.getAutoPurgeConfig,
  updateAutoPurgeConfig: adminService.updateAutoPurgeConfig,
  runAutoPurgeIfDue: adminService.runAutoPurgeIfDue,
};

/**
 * ===== UTILITAIRES =====
 */

/**
 * Obtenir le statut du système
 */
export function getSystemStatus() {
  return {
    initialized: isInitialized,
    sync: syncService.getServiceStats(),
    download: downloadService.getDownloadStats(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Obtenir l'historique des participants
 */
export function getHistory(limit = 20) {
  return displayService.getParticipantHistory(limit);
}

/**
 * Parser et valider un QR code (sans traitement)
 */
export function parseQRCode(qrContent) {
  try {
    const data = displayService.parseQRData(qrContent);
    displayService.validateQRData(data);
    return { status: 'valid', data };
  } catch (error) {
    return { status: 'invalid', error: error.message };
  }
}

/**
 * ===== EXEMPLE D'INTÉGRATION DANS ELECTRON =====
 */

/**
 * Dans main.js:
 * 
 * import { initializePhotoSystem, onQRCodeScanned } from './photosystem.js';
 * 
 * app.on('ready', async () => {
 *   await initializePhotoSystem();
 * });
 * 
 * app.on('before-quit', () => {
 *   shutdownPhotoSystem();
 * });
 * 
 * // IPC handlers
 * ipcMain.handle('scan-qr', async (event, qrContent) => {
 *   return onQRCodeScanned(qrContent);
 * });
 * 
 * ipcMain.handle('get-photos', async (event, participantId) => {
 *   return getPhotos(participantId);
 * });
 * 
 * ipcMain.handle('get-progress', (event, participantId) => {
 *   return getProgress(participantId);
 * });
 */

/**
 * ===== EXEMPLE D'INTÉGRATION AVEC EXPRESS =====
 */

/**
 * Dans app.js:
 * 
 * import { initializePhotoSystem, admin } from './photosystem.js';
 * 
 * await initializePhotoSystem();
 * 
 * // Routes admin
 * app.get('/admin/dashboard', (req, res) => {
 *   res.json(admin.getDashboardStats());
 * });
 * 
 * app.get('/admin/participants/:id/photos', (req, res) => {
 *   res.json(admin.getParticipantPhotos(req.params.id));
 * });
 * 
 * app.post('/admin/participants/:id/resync', (req, res) => {
 *   res.json(admin.forceResync(req.params.id));
 * });
 */

export default {
  initialize: initializePhotoSystem,
  shutdown: shutdownPhotoSystem,
  startSyncServices,
  onQRCodeScanned,
  getPhotos,
  getProgress,
  selectPhotosForPrinting,
  confirmPhotoPurchase,
  getSystemStatus,
  getHistory,
  parseQRCode,
  admin,
  setParticipantSyncCallback,
  triggerParticipantSync,
  db, // Exposer le module db pour les opérations de commande
};