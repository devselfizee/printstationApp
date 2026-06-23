/**
 * photoDisplayService.js - ROBUSTE
 *
 * ⭐ Gère:
 * - Polling automatique (mise à jour live des photos)
 * - Photos en erreur ne s'affichent pas
 * - Affichage progressif (pending + complete)
 */

import * as db from './db.js';
import { loadUniverse } from './universeService.js';
import { triggerParticipantSync } from './photosystem.js';

// ⭐ Callbacks pour les mises à jour (IPC)
let onPhotosUpdated = null;

// ===== Codes d'univers valides (source de vérité unique : registre admin) =====
// Peuplé depuis la DB au démarrage via refreshUniverseCodes(). Le fallback couvre
// le cas où la DB n'a pas encore répondu.
const FALLBACK_UNIVERSE_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
let validUniverseCodes = [...FALLBACK_UNIVERSE_CODES];

/**
 * Recharger les codes d'univers valides depuis le registre (table home_screen_universes).
 * À appeler au démarrage du système (et après toute modification du registre).
 */
export async function refreshUniverseCodes() {
  try {
    const codes = await db.getUniverseKeys();
    if (Array.isArray(codes) && codes.length > 0) {
      validUniverseCodes = codes.map(c => String(c).toUpperCase());
      console.log('[PhotoDisplay] Codes univers chargés depuis le registre:', validUniverseCodes.join(', '));
    }
  } catch (error) {
    console.warn('[PhotoDisplay] Échec chargement codes univers, fallback utilisé:', error.message);
  }
  return validUniverseCodes;
}

/**
 * Vérifie qu'un code d'univers existe dans le registre.
 */
export function isValidUniverseCode(code) {
  return !!code && validUniverseCodes.includes(String(code).toUpperCase());
}

export function setPhotosUpdatedCallback(callback) {
  onPhotosUpdated = callback;
}

/**
 * Parser QR code
 * Supporte plusieurs formats:
 * - Simple: "B12345" → universe="B", participantId="12345"
 * - JSON: {"universe":"B","participantId":"12345"}
 * - URL params: universe=B&participantId=12345
 */
export function parseQRData(qrContent) {
  try {
    const content = qrContent.trim();

    // Format JSON
    if (content.startsWith('{')) {
      return JSON.parse(content);
    }

    // Format URL params
    if (content.includes('=')) {
      const params = new URLSearchParams(content);
      const result = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      return result;
    }

    // Format simple: première lettre = univers, reste = participantId
    if (content.length >= 2) {
      const firstChar = content.charAt(0).toUpperCase();

      // Vérifier que la première lettre est un univers valide (registre admin)
      if (isValidUniverseCode(firstChar)) {
        const participantId = content.substring(1);
        console.log('[PhotoDisplay] QR format simple détecté:', { universe: firstChar, participantId });
        return {
          universe: firstChar,
          participantId: participantId
        };
      }
    }

    // Si aucun format reconnu, essayer de parser comme JSON quand même
    return JSON.parse(content);

  } catch (error) {
    console.error('[PhotoDisplay] Erreur parsing QR:', error);
    throw new Error('Format QR invalide');
  }
}

/**
 * Valider les données du QR code
 */
export function validateQRData(data) {
  if (!data.universe || !data.participantId) {
    throw new Error('QR invalide: manque universe ou participantId');
  }

  if (typeof data.universe !== 'string' || typeof data.participantId !== 'string') {
    throw new Error('Types invalides dans QR');
  }

  // Accepter les IDs courts comme 'A' et 'B' ainsi que les anciens formats
  if (data.universe.length < 1 || data.universe.length > 32) {
    throw new Error('ID univers invalide');
  }

  // Accepter des IDs de participant plus courts (minimum 1 caractère)
  if (data.participantId.length < 1 || data.participantId.length > 64) {
    throw new Error('ID participant invalide');
  }

  return true;
}

// ⭐ Polling actif par participant
const activePolls = new Map();

/**
 * Traiter un scan QR code
 * ⭐ Lance le polling automatique
 */
export async function handleQRCodeScan(qrContent) {
  console.log('[PhotoDisplay] Scan QR reçu');

  try {
    const qrData = parseQRData(qrContent);
    validateQRData(qrData);

    const { universe: universeId, participantId } = qrData;

    console.log('[PhotoDisplay] Chargement univers:', universeId);
    const universe = await loadUniverse(universeId);
    
    if (!universe) {
      throw new Error('Impossible de charger l\'univers');
    }

    console.log('[PhotoDisplay] Univers chargé:', universeId);

    // Ajouter/mettre à jour le participant localement
    await db.addOrUpdateParticipant(participantId, universeId, 'pending');
    console.log(`[PhotoDisplay] ✅ Participant ${participantId} ajouté/mis à jour localement`);

    // Sync participant vers Supabase via callback (non bloquant)
    triggerParticipantSync(participantId, universeId);

    // ⭐ Enregistrer le scan dans scan_stories
    await db.addScanStory(participantId, universeId);
    console.log('[PhotoDisplay] Scan enregistré dans scan_stories');

    // ⭐ Charger les photos initiales
    const photos = await loadParticipantPhotos(participantId);

    // ⭐ Lancer le polling automatique
    startPhotoPoll(participantId);

    return {
      status: 'success',
      participantId,
      universeId,
      universe,
      photos: photos.photos || [],
      stats: photos.stats || {},
      purgedCount: photos.purgedCount || 0,
    };

  } catch (error) {
    console.error('[PhotoDisplay] Erreur handling QR:', error);
    return {
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * ⭐ Lancer le polling automatique
 * Met à jour les photos toutes les 5 secondes
 */
function startPhotoPoll(participantId) {
  // Arrêter un polling existant
  if (activePolls.has(participantId)) {
    clearInterval(activePolls.get(participantId));
  }

  console.log(`[PhotoDisplay] 🔄 Polling lancé pour ${participantId}`);

  // ⭐ Polling toutes les 5 secondes
  const pollInterval = setInterval(async () => {
    try {
      const photos = await loadParticipantPhotos(participantId);
      
      // Compter les photos complètes
      const completeCount = photos.photos.filter(p => p.available).length;
      const totalCount = photos.photos.length;
      
      console.log(`[PhotoDisplay] 🔄 ${completeCount}/${totalCount} photos complètes`);
      
      // ⭐ Appeler le callback pour mettre à jour l'UI
      if (onPhotosUpdated) {
        onPhotosUpdated({
          participantId,
          photos,
        });
      }
    } catch (error) {
      console.error(`[PhotoDisplay] Erreur polling ${participantId}:`, error.message);
    }
  }, 5000);

  activePolls.set(participantId, pollInterval);
}

/**
 * ⭐ Arrêter le polling pour un participant
 */
export function stopPhotoPoll(participantId) {
  if (activePolls.has(participantId)) {
    clearInterval(activePolls.get(participantId));
    activePolls.delete(participantId);
    console.log(`[PhotoDisplay] ⏹️  Polling arrêté pour ${participantId}`);
  }
}

/**
 * ⭐ Arrêter TOUS les pollings actifs (appelé lors du reset/navigation)
 */
export function stopAllPolls() {
  if (activePolls.size === 0) {
    return;
  }

  console.log(`[PhotoDisplay] ⏹️  Arrêt de ${activePolls.size} polling(s) actif(s)`);

  for (const [participantId, intervalId] of activePolls) {
    clearInterval(intervalId);
    console.log(`[PhotoDisplay] ⏹️  Polling arrêté pour ${participantId}`);
  }

  activePolls.clear();
}

/**
 * Charger les photos d'un participant
 */
export async function loadParticipantPhotos(participantId) {
  console.log('[PhotoDisplay] Chargement photos pour:', participantId);

  try {
    const photoDataList = await db.getPhotosForParticipant(participantId);
    const stats = await db.getPhotoStats(participantId);

    console.log(`[PhotoDisplay] ${photoDataList.length} photos trouvées en DB`);

    if (!photoDataList || photoDataList.length === 0) {
      return {
        status: 'no_photos',
        stats,
        message: 'Aucune photo trouvée',
        photos: [],
      };
    }

    const photoList = [];
    let purgedCount = 0;

    for (const photoData of photoDataList) {
      try {
        // ⭐ Compter les photos purgées
        if (photoData.status === 'purged' || photoData.purged === 1) {
          purgedCount++;
          continue;
        }

        // ⭐ N'afficher que les photos complètement téléchargées
        if (photoData.status !== 'complete' || !photoData.local_path) {
          continue;
        }

        const source = `printstation://local${photoData.local_path}`;

        photoList.push({
          id: photoData.id,
          participantId: photoData.participant_id,
          fileName: photoData.file_name,
          status: photoData.status,
          source: source,
          available: true,
          downloadedAt: photoData.downloaded_at,
          size: photoData.size_bytes,
          url: photoData.remote_url,
          incrustationId: photoData.incrustation_id,
        });

      } catch (err) {
        console.warn(`[PhotoDisplay] Erreur traitement photo ${photoData.id}:`, err.message);
      }
    }

    console.log(`[PhotoDisplay] ⚠️ RÉSULTAT: ${photoList.length} complete, ${purgedCount} purgées, ${photoDataList.length} total → purgedCount=${purgedCount}`);

    return {
      status: 'success',
      photos: photoList,
      stats,
      purgedCount,
    };

  } catch (error) {
    console.error('[PhotoDisplay] Erreur chargement photos:', error);
    return {
      status: 'error',
      error: error.message,
      photos: [],
      purgedCount: 0,
    };
  }
}

/**
 * Obtenir la progression du sync d'un participant
 */
export async function getParticipantSyncProgress(participantId) {
  try {
    const stats = await db.getPhotoStats(participantId);
    
    if (!stats) {
      return { progress: 0, status: 'unknown' };
    }

    const total = stats.total || 0;
    const downloaded = stats.downloaded || 0;
    const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;

    return {
      progress,
      totalPhotos: total,
      downloadedPhotos: downloaded,
      pendingPhotos: (stats.pending || 0),
      errorPhotos: (stats.errors || 0),
      status: progress === 100 ? 'complete' : 'in_progress',
    };

  } catch (error) {
    console.error('[PhotoDisplay] Erreur progression:', error);
    return { progress: 0, status: 'error' };
  }
}

export default {
  parseQRData,
  validateQRData,
  handleQRCodeScan,
  loadParticipantPhotos,
  getParticipantSyncProgress,
  setPhotosUpdatedCallback,
  stopPhotoPoll,
};