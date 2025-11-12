/**
 * adminService.js - Interface admin pour gestion des photos
 * Permet de voir, filtrer, et gérer toutes les photos en cache
 */

import * as db from './db.js';
import * as fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getDownloadStats } from './photoDownloadService.js';
import { getServiceStats as getSyncStats } from './photoSyncService.js';

const DATA_DIR = path.join(os.homedir(), '.printstation');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos', 'by_participant');

/**
 * ===== DASHBOARD STATS =====
 */
/**
 * A CORRIGER CAR LE RETOUR getAllUniverses c'est encore une promesse mais pas un array donc c'est ça qui plane tout
 *
export function getDashboardStats() {
  const universes = db.getAllUniverses();
  const participants = universes.flatMap(u => db.getParticipantsByUniverse(u.id));

  let totalPhotos = 0;
  let downloadedPhotos = 0;
  let errorPhotos = 0;
  let totalDiskUsage = 0;

  for (const participant of participants) {
    const stats = db.getPhotoStats(participant.id);
    totalPhotos += stats.total || 0;
    downloadedPhotos += stats.downloaded || 0;
    errorPhotos += stats.errors || 0;
  }

  return {
    timestamp: new Date().toISOString(),
    universes: {
      total: universes.length,
      list: universes.map(u => ({
        id: u.id,
        name: u.name,
        status: u.status,
        lastUpdated: u.last_updated,
      })),
    },
    participants: {
      total: participants.length,
      statuses: {
        pending: participants.filter(p => p.status === 'pending').length,
        syncing: participants.filter(p => p.status === 'syncing').length,
        ready: participants.filter(p => p.status === 'ready').length,
      },
    },
    photos: {
      total: totalPhotos,
      downloaded: downloadedPhotos,
      pending: totalPhotos - downloadedPhotos - errorPhotos,
      errors: errorPhotos,
      completionRate: totalPhotos > 0 
        ? Math.round((downloadedPhotos / totalPhotos) * 100)
        : 0,
    },
    services: {
      sync: getSyncStats(),
      download: getDownloadStats(),
    },
  };
}
  */

// ✅ version corrigée, compatible Promises et types variés
export async function getDashboardStats() {
  try {
    // On attend le résultat de la promesse
    const universesRaw = await db.getAllUniverses();

    // On s'assure d'avoir un tableau
    const universes = Array.isArray(universesRaw)
      ? universesRaw
      : Object.values(universesRaw || {});

    // ⭐ CORRECTION: Attendre toutes les promesses de participants
    const participantsPromises = universes.map(u => db.getParticipantsByUniverse(u.id));
    const participantsArrays = await Promise.all(participantsPromises);
    const participants = participantsArrays.flat().filter(p => p); // Filtrer les undefined

    let totalPhotos = 0;
    let downloadedPhotos = 0;
    let errorPhotos = 0;

    // ⭐ CORRECTION: Attendre chaque promesse de stats
    for (const participant of participants) {
      const stats = await db.getPhotoStats(participant.id);
      if (stats) {
        totalPhotos += stats.total || 0;
        downloadedPhotos += stats.downloaded || 0;
        errorPhotos += stats.errors || 0;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      universes: {
        total: universes.length,
        list: universes.map(u => ({
          id: u.id,
          name: u.name,
          status: u.status,
          lastUpdated: u.last_updated,
        })),
      },
      participants: {
        total: participants.length,
        list: participants.map(p => ({
          id: p.id,
          universe_id: p.universe_id,
          status: p.status,
          created_at: p.created_at,
          last_synced: p.last_synced,
        })),
        statuses: {
          pending: participants.filter(p => p.status === 'pending').length,
          syncing: participants.filter(p => p.status === 'syncing').length,
          ready: participants.filter(p => p.status === 'ready').length,
        },
      },
      photos: {
        total: totalPhotos,
        downloaded: downloadedPhotos,
        pending: totalPhotos - downloadedPhotos - errorPhotos,
        errors: errorPhotos,
        completionRate:
          totalPhotos > 0 ? Math.round((downloadedPhotos / totalPhotos) * 100) : 0,
      },
      services: {
        sync: getSyncStats(),
        download: getDownloadStats(),
      },
    };
  } catch (error) {
    console.error('[AdminService] Erreur getDashboardStats:', error);
    return { 
      status: 'error', 
      error: error.message,
      photos: { total: 0, downloaded: 0, pending: 0, errors: 0 },
      participants: { total: 0, list: [], statuses: { pending: 0, syncing: 0, ready: 0 } },
      universes: { total: 0, list: [] }
    };
  }
}



/**
 * ===== RECHERCHE ET FILTRAGE =====
 */

export async function searchPhotos(filters = {}) {
  const {
    participantId = null,
    universeId = null,
    status = null,
    searchText = null,
    limit = 100,
    offset = 0,
  } = filters;

  let results = [];

  try {
    if (participantId) {
      // Chercher par participant spécifique
      results = await db.getPhotosForParticipant(participantId);
    } else if (universeId) {
      // Chercher par univers
      const participants = await db.getParticipantsByUniverse(universeId);
      const photosPromises = participants.map(p => db.getPhotosForParticipant(p.id));
      const photosArrays = await Promise.all(photosPromises);
      results = photosArrays.flat();
    } else {
      // Chercher par statut
      if (status) {
        results = await db.getPhotosByStatus(status, 10000);
      }
    }

    // Filtrer par statut supplémentaire
    if (status) {
      results = results.filter(p => p.status === status);
    }

    // Filtrer par texte de recherche
    if (searchText) {
      results = results.filter(p =>
        p.id.includes(searchText) ||
        p.participant_id.includes(searchText) ||
        p.file_name.includes(searchText)
      );
    }

    // Paginer
    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    return {
      total,
      limit,
      offset,
      count: paginated.length,
      results: paginated.map(p => ({
        ...p,
        available: p.local_path && p.status === 'complete',
      })),
    };
  } catch (error) {
    console.error('[AdminService] Erreur searchPhotos:', error);
    return {
      total: 0,
      limit,
      offset,
      count: 0,
      results: [],
    };
  }
}

/**
 * Obtenir les photos d'un participant avec détails
 */
export async function getParticipantPhotosDetailed(participantId) {
  try {
    const participant = await db.getParticipant(participantId);
    
    if (!participant) {
      return { status: 'error', error: 'Participant non trouvé' };
    }

    const photos = await db.getPhotosForParticipant(participantId);
    const stats = await db.getPhotoStats(participantId);
    const syncLogs = await db.getSyncLogs(participantId, 5);

    return {
      status: 'success',
      participant,
      stats,
      photos,
      syncHistory: syncLogs,
    };
  } catch (error) {
    console.error('[AdminService] Erreur getParticipantPhotosDetailed:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * ===== ACTIONS ADMIN =====
 */

/**
 * Force une re-synchronisation pour un participant
 */
export async function forceResyncParticipant(participantId) {
  try {
    const participant = await db.getParticipant(participantId);
    
    if (!participant) {
      return { status: 'error', error: 'Participant non trouvé' };
    }

    // Marquer en pending pour que le service le reprenne
    await db.updateParticipantStatus(participantId, 'pending');

    return {
      status: 'success',
      message: `Resync forcé pour ${participantId}`,
    };
  } catch (error) {
    console.error('[AdminService] Erreur forceResyncParticipant:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Supprimer les photos en erreur d'un participant
 */
export async function deleteErrorPhotos(participantId) {
  try {
    const allPhotos = await db.getPhotosForParticipant(participantId);
    const photos = allPhotos.filter(p => p.status === 'error');

    let deleted = 0;

    for (const photo of photos) {
      try {
        if (photo.local_path) {
          await fs.unlink(photo.local_path);
        }
        
        // Remettre en pending pour retry
        await db.updatePhotoStatus(photo.id, 'pending');
        deleted++;
      } catch (error) {
        console.error(`[Admin] Erreur suppression ${photo.id}:`, error);
      }
    }

    return {
      status: 'success',
      deleted,
    };
  } catch (error) {
    console.error('[AdminService] Erreur deleteErrorPhotos:', error);
    return { status: 'error', error: error.message, deleted: 0 };
  }
}

/**
 * Vider le cache d'un participant
 */
export async function clearParticipantCache(participantId) {
  try {
    const photos = await db.getPhotosForParticipant(participantId);
    
    const participantDir = path.join(PHOTOS_DIR, participantId);
    
    let cleared = 0;

    try {
      await fs.rm(participantDir, { recursive: true });
      
      // Réinitialiser les statuts en DB
      for (const photo of photos) {
        await db.updatePhotoStatus(photo.id, 'pending');
      }

      cleared = photos.length;
    } catch (error) {
      console.error(`[Admin] Erreur clear cache:`, error);
    }

    return {
      status: 'success',
      cleared,
    };
  } catch (error) {
    console.error('[AdminService] Erreur clearParticipantCache:', error);
    return { status: 'error', error: error.message, cleared: 0 };
  }
}

/**
 * Supprimer complètement un participant et ses photos
 */
export async function deleteParticipantCompletely(participantId) {
  try {
    const participant = await db.getParticipant(participantId);
    
    if (!participant) {
      return { status: 'error', error: 'Participant non trouvé' };
    }

    try {
      // Supprimer dossier photos
      const participantDir = path.join(PHOTOS_DIR, participantId);
      await fs.rm(participantDir, { recursive: true, force: true });

      // Supprimer photos en DB (optionnel, on peut garder l'historique)
      // const dbConnection = db.getDB();
      // dbConnection.prepare('DELETE FROM photos WHERE participant_id = ?').run(participantId);

      return {
        status: 'success',
        message: `Participant ${participantId} supprimé`,
      };
    } catch (error) {
      console.error(`[Admin] Erreur suppression participant:`, error);
      return {
        status: 'error',
        error: error.message,
      };
    }
  } catch (error) {
    console.error('[AdminService] Erreur deleteParticipantCompletely:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * ===== GESTION DISQUE =====
 */

/**
 * Calculer l'espace disque utilisé
 */
export async function calculateDiskUsage() {
  try {
    const walk = async (dir, totalSize = 0) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            totalSize += await walk(fullPath, 0);
          } else {
            const stat = await fs.stat(fullPath);
            totalSize += stat.size;
          }
        }
      } catch (e) {
        // Dossier peut ne pas exister
      }
      
      return totalSize;
    };

    const totalBytes = await walk(PHOTOS_DIR);

    return {
      bytes: totalBytes,
      mb: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
      gb: Math.round(totalBytes / (1024 * 1024 * 1024) * 100) / 100,
    };
  } catch (error) {
    console.error('[Admin] Erreur calcul disque:', error);
    return null;
  }
}

/**
 * Libérer de l'espace (supprimer les plus vieilles photos)
 */
export async function freeUpSpace(minSpaceGB = 1) {
  try {
    const usage = await calculateDiskUsage();
    
    if (!usage || usage.gb >= minSpaceGB) {
      return {
        status: 'ok',
        usage,
        freed: 0,
      };
    }

    // Récupérer tous les univers
    const universes = await db.getAllUniverses();
    
    // Récupérer tous les participants
    const participantsPromises = universes.map(u => db.getParticipantsByUniverse(u.id));
    const participantsArrays = await Promise.all(participantsPromises);
    const allParticipants = participantsArrays.flat();

    // Récupérer toutes les photos
    const photosPromises = allParticipants.map(p => db.getPhotosForParticipant(p.id));
    const photosArrays = await Promise.all(photosPromises);
    const allPhotos = photosArrays
      .flat()
      .filter(p => p.status === 'complete' && !p.purchased)
      .sort((a, b) => new Date(a.downloaded_at) - new Date(b.downloaded_at));

    let freedBytes = 0;

    for (const photo of allPhotos) {
      if (usage.gb >= minSpaceGB) break;

      try {
        const stat = await fs.stat(photo.local_path);
        await fs.unlink(photo.local_path);
        
        await db.updatePhotoStatus(photo.id, 'pending');
        
        freedBytes += stat.size;
        usage.bytes -= stat.size;
        usage.gb = Math.round(usage.bytes / (1024 * 1024 * 1024) * 100) / 100;
      } catch (error) {
        console.error(`[Admin] Erreur suppression ${photo.id}:`, error);
      }
    }

    return {
      status: 'success',
      freed: {
        bytes: freedBytes,
        mb: Math.round(freedBytes / (1024 * 1024) * 100) / 100,
      },
      usage,
    };
  } catch (error) {
    console.error('[AdminService] Erreur freeUpSpace:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * ===== REPORTS & EXPORT =====
 */

/**
 * Générer un rapport complet
 */
export async function generateFullReport() {
  try {
    const dashboard = await getDashboardStats();
    const diskUsage = await calculateDiskUsage();

    return {
      timestamp: new Date().toISOString(),
      summary: dashboard,
      diskUsage,
      reportUrl: `${DATA_DIR}/reports/report_${Date.now()}.json`,
    };
  } catch (error) {
    console.error('[AdminService] Erreur generateFullReport:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Exporter les données d'un participant en JSON
 */
export async function exportParticipantData(participantId) {
  try {
    const data = await getParticipantPhotosDetailed(participantId);

    if (data.status === 'error') {
      return data;
    }

    const photos = data.photos.map(p => ({
      ...p,
      available: !!p.local_path,
    }));

    return {
      status: 'success',
      export: {
        participant: data.participant,
        stats: data.stats,
        photos,
        exported_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[AdminService] Erreur exportParticipantData:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Liste des participants avec achats
 */
export async function getPurchaseReport() {
  try {
    const universes = await db.getAllUniverses();
    
    const participantsPromises = universes.map(u => db.getParticipantsByUniverse(u.id));
    const participantsArrays = await Promise.all(participantsPromises);
    const participants = participantsArrays.flat();

    const reportsPromises = participants.map(async (p) => {
      const stats = await db.getPhotoStats(p.id);
      return {
        participantId: p.id,
        universeId: p.universe_id,
        createdAt: p.created_at,
        totalPhotos: stats?.total || 0,
        downloadedPhotos: stats?.downloaded || 0,
        purchasedPhotos: stats?.purchased || 0,
        purchaseRate: (stats?.total || 0) > 0
          ? Math.round(((stats?.purchased || 0) / stats.total) * 100)
          : 0,
      };
    });

    const allReports = await Promise.all(reportsPromises);
    
    const report = allReports
      .filter(p => p.purchasedPhotos > 0)
      .sort((a, b) => b.purchasedPhotos - a.purchasedPhotos);

    return report;
  } catch (error) {
    console.error('[AdminService] Erreur getPurchaseReport:', error);
    return [];
  }
}
