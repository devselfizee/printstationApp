/**
 * db.js - Service de base de données SQLite (Version Electron compatible)
 * Gère les tables pour univers, participants, photos, et logs
 * Utilise sqlite3 au lieu de better-sqlite3
 * 
 * Support multi-OS:
 * - Windows: C:/PrintStationApp/Medias/
 * - Mac: ~/Documents/PrintStationApp/Medias/
 * - Linux: ~/.PrintStationApp/Medias/
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import * as fs from 'fs';

/**
 * Déterminer le répertoire de données selon l'OS
 */
function getDataDir() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows: C:/PrintStationApp/Medias/
    return path.join('C:', 'PrintStationApp', 'Medias');
  } else if (platform === 'darwin') {
    // Mac: ~/Documents/PrintStationApp/Medias/
    return path.join(os.homedir(), 'Documents', 'PrintStationApp', 'Medias');
  } else {
    // Linux: ~/.PrintStationApp/Medias/
    return path.join(os.homedir(), '.PrintStationApp', 'Medias');
  }
}

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'data.db');

console.log(`[DB] Plateforme: ${process.platform}`);
console.log(`[DB] Répertoire données: ${DATA_DIR}`);

let db = null;

/**
 * Helper pour promisifier les opérations sqlite3
 */
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function execAsync(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Initialiser la base de données
 */
export async function initDB() {
  try {
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`[DB] Dossier créé: ${DATA_DIR}`);
    }

    // Ouvrir la DB
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) throw err;
    });

    await execAsync('PRAGMA journal_mode = WAL');
    
    await createTables();
    await seedDefaultData(); // ⭐ Créer données par défaut si nécessaire
    
    console.log(`[DB] ✓ Initialisée: ${DB_PATH}`);
    return { success: true, path: DB_PATH };
  } catch (error) {
    console.error('[DB] Erreur initialisation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Créer des données par défaut si la base est vide
 */
async function seedDefaultData() {
  try {
    const universes = await getAllUniverses();
    
    if (universes.length === 0) {
      console.log('[DB] 📦 Création univers par défaut...');
      
      // Créer les 2 univers
      await addUniverse('A', "L'horizon de kheops", '/assets/banniere-kheops.jpg');
      await addUniverse('B', 'Monde Disparus', '/assets/banniere-monde-perdu.jpg');
      
      console.log('[DB] ✅ 2 univers créés (A: L'horizon de kheops, B: Mondes Disparus)');
    } else {
      console.log(`[DB] ✓ ${universes.length} univers déjà présents`);
    }
  } catch (error) {
    console.error('[DB] ⚠️  Erreur seed data:', error.message);
    // Ne pas bloquer le démarrage si le seed échoue
  }
}

/**
 * Créer les participants manquants à partir des photos existantes
 * Utile pour réparer les bases qui ont des photos sans participants
 */
export async function reconcileParticipants() {
  console.log('[DB] 🔄 Réconciliation des participants...');
  
  try {
    // Récupérer tous les participant_id distincts des photos qui n'ont pas de participant
    const distinctParticipants = await allAsync(`
      SELECT DISTINCT 
        p.participant_id,
        COALESCE(
          (SELECT id FROM universes LIMIT 1),
          'unknown'
        ) as universe_id
      FROM photos p
      WHERE p.participant_id NOT IN (SELECT id FROM participants)
    `);

    if (distinctParticipants.length === 0) {
      console.log('[DB] ✓ Tous les participants existent déjà');
      return { success: true, created: 0 };
    }

    let created = 0;
    for (const p of distinctParticipants) {
      try {
        await runAsync(
          `INSERT OR IGNORE INTO participants (id, universe_id, status, created_at) 
           VALUES (?, ?, 'synced', CURRENT_TIMESTAMP)`,
          [p.participant_id, p.universe_id]
        );
        console.log(`[DB] ✅ Participant créé: ${p.participant_id}`);
        created++;
      } catch (error) {
        console.error(`[DB] Erreur création participant ${p.participant_id}:`, error);
      }
    }

    console.log(`[DB] ✅ ${created} participant(s) créé(s) par réconciliation`);
    return { success: true, created };
    
  } catch (error) {
    console.error('[DB] Erreur réconciliation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Créer les tables
 */
async function createTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS universes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config_url TEXT NOT NULL,
      last_updated DATETIME,
      next_check DATETIME,
      status TEXT DEFAULT 'active'
    );`,

    `CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      universe_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_synced DATETIME,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY(universe_id) REFERENCES universes(id)
    );`,

    `CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      remote_url TEXT,
      local_path TEXT,
      checksum TEXT,
      size_bytes INTEGER,
      incrustation_id TEXT,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      corruption_count INTEGER DEFAULT 0,
      last_error TEXT,
      download_started_at DATETIME,
      downloaded_at DATETIME,
      purchased BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(participant_id) REFERENCES participants(id)
    );`,

    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      universe_id TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      email TEXT,
      optin BOOLEAN DEFAULT 0,
      payment_method TEXT,
      notes TEXT,
      synced_to_remote BOOLEAN DEFAULT 0,
      sync_attempts INTEGER DEFAULT 0,
      last_sync_attempt DATETIME,
      synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY(participant_id) REFERENCES participants(id),
      FOREIGN KEY(universe_id) REFERENCES universes(id)
    );`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      photo_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      incrustation_id TEXT,
      status TEXT DEFAULT 'en_cours',
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cancelled_at DATETIME,
      validated_at DATETIME,
      FOREIGN KEY(photo_id) REFERENCES photos(id)
    );`,

    `CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );`,

    `CREATE INDEX IF NOT EXISTS idx_photos_participant ON photos(participant_id);`,
    `CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);`,
    `CREATE INDEX IF NOT EXISTS idx_photos_participant_status ON photos(participant_id, status);`,
    `CREATE INDEX IF NOT EXISTS idx_participants_universe ON participants(universe_id);`,
    
    `CREATE INDEX IF NOT EXISTS idx_orders_participant ON orders(participant_id);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_photo ON order_items(photo_id);`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);`,
    `CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);`,

    `CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      universe_id TEXT,
      participant_id TEXT,
      photos_checked INTEGER,
      photos_added INTEGER,
      photos_failed INTEGER,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT,
      FOREIGN KEY(universe_id) REFERENCES universes(id),
      FOREIGN KEY(participant_id) REFERENCES participants(id)
    );`,

    `CREATE INDEX IF NOT EXISTS idx_sync_log_participant ON sync_log(participant_id);`,

    `CREATE TABLE IF NOT EXISTS machine_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      kiosk_id TEXT NOT NULL,
      sales_point_id TEXT NOT NULL,
      machine_name TEXT,
      setup_completed BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
  ];

  for (const stmt of statements) {
    try {
      await execAsync(stmt);
    } catch (error) {
      console.error('[DB] Erreur création table:', error);
    }
  }

  // Migration: Ajouter les colonnes de synchronisation si elles n'existent pas
  await migrateSyncColumns();
}

/**
 * Migrer les colonnes de synchronisation pour les bases existantes
 */
async function migrateSyncColumns() {
  try {
    // Vérifier si les colonnes existent déjà
    const tableInfo = await allAsync('PRAGMA table_info(orders)');
    const columnNames = tableInfo.map(col => col.name);

    // Ajouter synced_to_remote si manquant
    if (!columnNames.includes('synced_to_remote')) {
      await execAsync('ALTER TABLE orders ADD COLUMN synced_to_remote BOOLEAN DEFAULT 0');
      console.log('[DB] ✅ Colonne synced_to_remote ajoutée');
    }

    // Ajouter sync_attempts si manquant
    if (!columnNames.includes('sync_attempts')) {
      await execAsync('ALTER TABLE orders ADD COLUMN sync_attempts INTEGER DEFAULT 0');
      console.log('[DB] ✅ Colonne sync_attempts ajoutée');
    }

    // Ajouter last_sync_attempt si manquant
    if (!columnNames.includes('last_sync_attempt')) {
      await execAsync('ALTER TABLE orders ADD COLUMN last_sync_attempt DATETIME');
      console.log('[DB] ✅ Colonne last_sync_attempt ajoutée');
    }

    // Ajouter synced_at si manquant
    if (!columnNames.includes('synced_at')) {
      await execAsync('ALTER TABLE orders ADD COLUMN synced_at DATETIME');
      console.log('[DB] ✅ Colonne synced_at ajoutée');
    }

  } catch (error) {
    console.error('[DB] Erreur migration colonnes sync:', error);
  }
}

/**
 * ===== UNIVERS =====
 */

export async function addUniverse(universeId, name, configUrl) {
  return runAsync(
    `INSERT OR REPLACE INTO universes (id, name, config_url, last_updated, next_check)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [universeId, name, configUrl]
  );
}

export async function getUniverse(universeId) {
  return getAsync('SELECT * FROM universes WHERE id = ?', [universeId]);
}

export async function getAllUniverses() {
  return allAsync('SELECT * FROM universes WHERE status = "active"');
}

export async function updateUniverseLastCheck(universeId) {
  return runAsync('UPDATE universes SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [universeId]);
}

/**
 * ===== PARTICIPANTS =====
 */

export async function addOrUpdateParticipant(participantId, universeId, status = 'pending') {
  await runAsync(
    `INSERT OR IGNORE INTO participants (id, universe_id, status) VALUES (?, ?, ?)`,
    [participantId, universeId, status]
  );
  return getAsync('SELECT * FROM participants WHERE id = ?', [participantId]);
}

export async function getParticipant(participantId) {
  return getAsync('SELECT * FROM participants WHERE id = ?', [participantId]);
}

export async function getParticipantsByStatus(status) {
  return allAsync('SELECT * FROM participants WHERE status = ? ORDER BY last_synced ASC', [status]);
}

export async function updateParticipantStatus(participantId, status) {
  return runAsync(
    `UPDATE participants SET status = ?, last_synced = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, participantId]
  );
}

export async function getParticipantsByUniverse(universeId) {
  return allAsync(
    `SELECT * FROM participants WHERE universe_id = ? ORDER BY created_at DESC`,
    [universeId]
  );
}

/**
 * ===== PHOTOS =====
 */










export async function markPhotoPurchased(photoId) {
  return runAsync('UPDATE photos SET purchased = 1 WHERE id = ?', [photoId]);
}


/**
 * ===== SYNC LOG =====
 */

export async function logSync(universeId, participantId, stats) {
  return runAsync(
    `INSERT INTO sync_log (universe_id, participant_id, photos_checked, photos_added, photos_failed, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [universeId, participantId, stats.checked || 0, stats.added || 0, stats.failed || 0, stats.error || null]
  );
}

export async function getSyncLogs(participantId, limit = 10) {
  return allAsync(
    `SELECT * FROM sync_log WHERE participant_id = ? ORDER BY synced_at DESC LIMIT ?`,
    [participantId, limit]
  );
}

/**
 * ===== UTILITAIRES =====
 */


export function getDB() {
  return db;
}

export async function cleanup() {
  await closeDB();
}

/**
 * db-UPDATES.js - Ajouter ces fonctions à db.js
 * 
 * Copy-paste ces functions dans ton db.js existant
 * (après les autres exports)
 */

// ============================================
// ⭐ NOUVELLES FONCTIONS ROBUSTESSE
// ============================================

/**
 * Récupérer une photo par ID
 */
export async function getPhoto(photoId) {
  return getAsync('SELECT * FROM photos WHERE id = ?', [photoId]);
}

/**
 * Récupérer les photos par status
 */
export async function getPhotosByStatus(status, limit = 1000) {
  return allAsync(
    'SELECT * FROM photos WHERE status = ? LIMIT ?',
    [status, limit]
  );
}

/**
 * Récupérer les photos d'un participant
 */
export async function getPhotosForParticipant(participantId) {
  return allAsync(
    'SELECT * FROM photos WHERE participant_id = ? ORDER BY created_at DESC',
    [participantId]
  );
}

/**
 * Ajouter une photo
 */
export async function addPhoto(photo) {
  const {
    id,
    participantId,
    universe,
    fileName,
    url,
    checksum,
    size,
    incrustationId,
  } = photo;

  return runAsync(
    `INSERT OR REPLACE INTO photos (
      id, participant_id, file_name, remote_url, checksum, 
      size_bytes, incrustation_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
    [id, participantId, fileName, url, checksum, size, incrustationId || null]
  );
}

/**
 * Mettre à jour le statut d'une photo
 */
export async function updatePhotoStatus(photoId, status) {
  return runAsync(
    'UPDATE photos SET status = ? WHERE id = ?',
    [status, photoId]
  );
}

/**
 * Mettre à jour le checksum d'une photo
 */
export async function updatePhotoChecksum(photoId, checksum) {
  return runAsync(
    'UPDATE photos SET checksum = ? WHERE id = ?',
    [checksum, photoId]
  );
}

/**
 * Incrémenter le counter de corruption
 */
export async function incrementPhotoCorruption(photoId, errorMsg) {
  return runAsync(
    `UPDATE photos 
     SET corruption_count = COALESCE(corruption_count, 0) + 1,
         last_error = ?
     WHERE id = ?`,
    [errorMsg, photoId]
  );
}

/**
 * Incrémenter le counter de retry
 */
export async function incrementPhotoRetry(photoId, errorMsg) {
  return runAsync(
    `UPDATE photos 
     SET retry_count = COALESCE(retry_count, 0) + 1,
         last_error = ?,
         status = 'pending'
     WHERE id = ?`,
    [errorMsg, photoId]
  );
}

/**
 * Marquer une photo en erreur définitive
 */
export async function markPhotoError(photoId, errorMsg) {
  return runAsync(
    `UPDATE photos 
     SET status = 'error', last_error = ?
     WHERE id = ?`,
    [errorMsg, photoId]
  );
}

/**
 * Mettre à jour la progression du téléchargement
 */
export async function updatePhotoDownloadProgress(photoId, localPath, checksum) {
  return runAsync(
    `UPDATE photos 
     SET status = 'complete',
         local_path = ?,
         checksum = ?,
         downloaded_at = CURRENT_TIMESTAMP,
         retry_count = 0,
         corruption_count = 0,
         last_error = NULL
     WHERE id = ?`,
    [localPath, checksum, photoId]
  );
}

/**
 * Obtenir les stats d'un participant
 */
export async function getPhotoStats(participantId) {
  const stats = await getAsync(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as downloaded,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
     FROM photos
     WHERE participant_id = ?`,
    [participantId]
  );

  return stats || { total: 0, downloaded: 0, pending: 0, errors: 0 };
}

/**
 * ============================================
 * GESTION DES COMMANDES
 * ============================================
 */

/**
 * Créer une nouvelle commande
 */
export async function createOrder(orderData) {
  const {
    orderId,
    participantId,
    universeId,
    totalAmount,
    discountAmount = 0,
    finalAmount,
    email = null,
    optin = false,
    paymentMethod = null,
    notes = null
  } = orderData;

  return runAsync(
    `INSERT INTO orders (
      id, participant_id, universe_id, total_amount, discount_amount, 
      final_amount, email, optin, payment_method, notes, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [orderId, participantId, universeId, totalAmount, discountAmount, finalAmount, email, optin ? 1 : 0, paymentMethod, notes]
  );
}

/**
 * Ajouter un produit à une commande
 */
export async function addOrderItem(itemData) {
  const {
    orderId = null,
    photoId,
    productId,
    productName,
    quantity,
    unitPrice,
    totalPrice,
    incrustationId = null,
    sessionId = null,
    status = 'en_cours'
  } = itemData;

  return runAsync(
    `INSERT INTO order_items (
      order_id, photo_id, product_id, product_name, quantity, 
      unit_price, total_price, incrustation_id, session_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [orderId, photoId, productId, productName, quantity, unitPrice, totalPrice, incrustationId, sessionId, status]
  );
}

/**
 * Ajouter un produit immédiatement lors du clic "Ajouter" (statut: en_cours)
 */
export async function addCartItemImmediate(itemData) {
  const {
    photoId,
    productId,
    productName,
    quantity,
    unitPrice,
    totalPrice,
    incrustationId = null,
    sessionId
  } = itemData;

  const result = await runAsync(
    `INSERT INTO order_items (
      photo_id, product_id, product_name, quantity, 
      unit_price, total_price, incrustation_id, session_id, 
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'en_cours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [photoId, productId, productName, quantity, unitPrice, totalPrice, incrustationId, sessionId]
  );

  return { itemId: result.lastID, status: 'success' };
}

/**
 * Annuler un produit du panier (change statut à "annulé")
 */
export async function cancelCartItem(itemId) {
  return runAsync(
    `UPDATE order_items 
     SET status = 'annulé', 
         cancelled_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [itemId]
  );
}

/**
 * Remettre un produit en attente (après annulation)
 */
export async function reactivateCartItem(photoId, productId, sessionId) {
  const result = await runAsync(
    `INSERT INTO order_items (
      photo_id, product_id, product_name, quantity, 
      unit_price, total_price, incrustation_id, session_id,
      status, created_at, updated_at
    )
    SELECT 
      photo_id, product_id, product_name, quantity,
      unit_price, total_price, incrustation_id, ?,
      'en_attente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM order_items
    WHERE photo_id = ? AND product_id = ? AND status = 'annulé'
    ORDER BY created_at DESC
    LIMIT 1`,
    [sessionId, photoId, productId]
  );

  return { itemId: result.lastID, status: 'success' };
}

/**
 * Récupérer les produits en cours d'une session
 */
export async function getSessionCartItems(sessionId) {
  return allAsync(
    `SELECT * FROM order_items 
     WHERE session_id = ? AND status = 'en_cours'
     ORDER BY created_at DESC`,
    [sessionId]
  );
}

/**
 * Valider tous les produits en_attente d'une session (lors du paiement)
 */
export async function validateSessionItems(sessionId, orderId) {
  return runAsync(
    `UPDATE order_items
     SET status = 'validé',
         order_id = ?,
         validated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ? AND status IN ('en_cours', 'en_attente')`,
    [orderId, sessionId]
  );
}

/**
 * Annuler tous les produits d'une session et les lier à une commande annulée
 */
export async function cancelSessionItems(sessionId, orderId) {
  return runAsync(
    `UPDATE order_items
     SET status = 'annulé',
         order_id = ?,
         cancelled_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ? AND status IN ('en_cours', 'en_attente')`,
    [orderId, sessionId]
  );
}

/**
 * Mettre à jour le statut d'une commande
 */
export async function updateOrderStatus(orderId, newStatus, notes = null) {
  // Récupérer l'ancien statut
  const order = await getAsync('SELECT status FROM orders WHERE id = ?', [orderId]);
  const oldStatus = order?.status;

  // Mettre à jour la commande
  const updateQuery = newStatus === 'completed'
    ? `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
    : `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  
  await runAsync(updateQuery, [newStatus, orderId]);

  // Enregistrer dans l'historique
  await runAsync(
    `INSERT INTO order_status_history (order_id, old_status, new_status, notes, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [orderId, oldStatus, newStatus, notes]
  );

  return { success: true, oldStatus, newStatus };
}

/**
 * Mettre à jour le statut d'un item de commande
 */
export async function updateOrderItemStatus(itemId, newStatus) {
  return runAsync(
    `UPDATE order_items 
     SET status = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [newStatus, itemId]
  );
}

/**
 * Récupérer une commande avec ses items
 */
export async function getOrderWithItems(orderId) {
  const order = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
  
  if (!order) {
    return null;
  }

  const items = await allAsync('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  
  return {
    ...order,
    items: items || []
  };
}

/**
 * Récupérer toutes les commandes d'un participant
 */
export async function getOrdersByParticipant(participantId) {
  return allAsync(
    `SELECT * FROM orders 
     WHERE participant_id = ? 
     ORDER BY created_at DESC`,
    [participantId]
  );
}

/**
 * Récupérer les commandes par statut
 */
export async function getOrdersByStatus(status) {
  return allAsync(
    `SELECT o.*, p.universe_id 
     FROM orders o
     LEFT JOIN participants p ON o.participant_id = p.id
     WHERE o.status = ? 
     ORDER BY o.created_at DESC`,
    [status]
  );
}

/**
 * Récupérer l'historique des statuts d'une commande
 */
export async function getOrderStatusHistory(orderId) {
  return allAsync(
    `SELECT * FROM order_status_history 
     WHERE order_id = ? 
     ORDER BY created_at DESC`,
    [orderId]
  );
}

/**
 * Récupérer les statistiques des commandes
 */
export async function getOrderStats(startDate = null, endDate = null) {
  let query = `
    SELECT
      COUNT(*) as total_orders,
      COUNT(DISTINCT participant_id) as unique_customers,
      SUM(final_amount) as total_revenue,
      AVG(final_amount) as average_order_value,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'printing' THEN 1 ELSE 0 END) as printing,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM orders
  `;

  const params = [];

  if (startDate && endDate) {
    query += ` WHERE created_at BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  } else if (startDate) {
    query += ` WHERE created_at >= ?`;
    params.push(startDate);
  } else if (endDate) {
    query += ` WHERE created_at <= ?`;
    params.push(endDate);
  }

  const stats = await getAsync(query, params);
  return stats || {
    total_orders: 0,
    unique_customers: 0,
    total_revenue: 0,
    average_order_value: 0,
    pending: 0,
    processing: 0,
    printing: 0,
    completed: 0,
    cancelled: 0
  };
}

/**
 * Récupérer les produits les plus vendus
 */
export async function getTopProducts(limit = 10) {
  return allAsync(
    `SELECT 
       product_id,
       product_name,
       SUM(quantity) as total_quantity,
       COUNT(DISTINCT order_id) as order_count,
       SUM(total_price) as total_revenue
     FROM order_items
     GROUP BY product_id, product_name
     ORDER BY total_quantity DESC
     LIMIT ?`,
    [limit]
  );
}

/**
 * Annuler une commande
 */
export async function cancelOrder(orderId, reason = null) {
  return updateOrderStatus(orderId, 'cancelled', reason);
}

/**
 * Rechercher des commandes
 */
export async function searchOrders(searchTerm) {
  return allAsync(
    `SELECT o.*, p.universe_id 
     FROM orders o
     LEFT JOIN participants p ON o.participant_id = p.id
     WHERE o.id LIKE ? 
        OR o.participant_id LIKE ? 
        OR o.email LIKE ?
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
  );
}

/**
 * Supprimer une commande (et ses items)
 */
export async function deleteOrder(orderId) {
  // Supprimer l'historique
  await runAsync('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
  
  // Supprimer les items
  await runAsync('DELETE FROM order_items WHERE order_id = ?', [orderId]);
  
  // Supprimer la commande
  await runAsync('DELETE FROM orders WHERE id = ?', [orderId]);
  
  return { success: true };
}

/**
 * Récupérer TOUS les produits d'une session (y compris annulés)
 */
export async function getAllSessionItems(sessionId) {
  return allAsync(
    `SELECT * FROM order_items 
     WHERE session_id = ? 
     ORDER BY created_at DESC`,
    [sessionId]
  );
}

/**
 * Récupérer uniquement les produits actifs d'une session (en_cours + en_attente)
 */
export async function getActiveSessionItems(sessionId) {
  return allAsync(
    `SELECT * FROM order_items 
     WHERE session_id = ? 
       AND status IN ('en_cours', 'en_attente')
     ORDER BY created_at DESC`,
    [sessionId]
  );
}

/**
 * Stats d'une session
 */
export async function getSessionStats(sessionId) {
  const stats = await getAsync(
    `SELECT
      COUNT(*) as total_items,
      SUM(CASE WHEN status = 'en_cours' THEN 1 ELSE 0 END) as en_cours,
      SUM(CASE WHEN status = 'en_attente' THEN 1 ELSE 0 END) as en_attente,
      SUM(CASE WHEN status = 'annulé' THEN 1 ELSE 0 END) as annulé,
      SUM(CASE WHEN status = 'validé' THEN 1 ELSE 0 END) as validé,
      SUM(CASE WHEN status IN ('en_cours', 'en_attente') THEN total_price ELSE 0 END) as total_amount
     FROM order_items
     WHERE session_id = ?`,
    [sessionId]
  );

  return stats || {
    total_items: 0,
    en_cours: 0,
    en_attente: 0,
    annulé: 0,
    validé: 0,
    total_amount: 0
  };
}

/**
 * Mettre à jour la quantité d'un item
 */
export async function updateCartItemQuantity(itemId, newQuantity, newTotalPrice) {
  return runAsync(
    `UPDATE order_items 
     SET quantity = ?,
         total_price = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newQuantity, newTotalPrice, itemId]
  );
}

/**
 * ===== CONFIGURATION MACHINE =====
 */

/**
 * Récupérer la configuration de la machine
 */
export async function getMachineConfig() {
  return getAsync('SELECT * FROM machine_config WHERE id = 1');
}

/**
 * Vérifier si la configuration initiale est complète
 */
export async function isSetupCompleted() {
  const config = await getMachineConfig();
  return config !== undefined && config !== null;
}

/**
 * Sauvegarder la configuration de la machine
 */
export async function saveMachineConfig(kioskId, salesPointId, machineName = null) {
  return runAsync(
    `INSERT OR REPLACE INTO machine_config (id, kiosk_id, sales_point_id, machine_name, setup_completed, updated_at)
     VALUES (1, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
    [kioskId, salesPointId, machineName]
  );
}

/**
 * Mettre à jour la configuration de la machine
 */
export async function updateMachineConfig(kioskId, salesPointId, machineName = null) {
  return runAsync(
    `UPDATE machine_config
     SET kiosk_id = ?,
         sales_point_id = ?,
         machine_name = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [kioskId, salesPointId, machineName]
  );
}

/**
 * ===== SYNCHRONISATION REMOTE API =====
 */

/**
 * Récupérer les commandes non synchronisées avec l'API distante
 */
export async function getUnsyncedOrders(maxAttempts = 5) {
  return allAsync(
    `SELECT * FROM orders
     WHERE synced_to_remote = 0
       AND sync_attempts < ?
       AND status IN ('processing', 'cancelled')
     ORDER BY created_at ASC`,
    [maxAttempts]
  );
}

/**
 * Marquer une commande comme synchronisée
 */
export async function markOrderAsSynced(orderId) {
  return runAsync(
    `UPDATE orders
     SET synced_to_remote = 1,
         synced_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [orderId]
  );
}

/**
 * Incrémenter le compteur de tentatives de synchronisation
 */
export async function incrementSyncAttempts(orderId) {
  return runAsync(
    `UPDATE orders
     SET sync_attempts = sync_attempts + 1,
         last_sync_attempt = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [orderId]
  );
}

/**
 * Fermer la DB
 */
export function closeDB() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('[DB] Erreur fermeture:', err.message);
      } else {
        console.log('[DB] DB fermée');
      }
    });
    db = null;
  }
}