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

    await execAsync('PRAGMA journal_mode = DELETE');
    
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
      await addUniverse('C', 'Remparts', '/assets/banniere-remparts.jpg');
      await addUniverse('D', 'Impressionnistes', '/assets/banniere-impressionnistes.jpg');
      await addUniverse('E', 'Batisseurs', '/assets/banniere-batisseurs.jpg');
      
      console.log("[DB] ✅ 2 univers créés (A: L'horizon de kheops, B: Mondes Disparus)");
    } else {
      // await addUniverse('E', 'Batisseurs', '/assets/banniere-batisseurs.jpg');
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
      date_photo DATETIME,
      borne_info TEXT,
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
      subtotal_ht REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      lang TEXT DEFAULT 'fr',
      email TEXT,
      optin BOOLEAN DEFAULT 0,
      payment_method TEXT,
      notes TEXT,
      last_step TEXT,
      synced_to_remote BOOLEAN DEFAULT 0,
      sync_attempts INTEGER DEFAULT 0,
      last_sync_attempt DATETIME,
      synced_at DATETIME,
      supabase_order_id TEXT,
      sync_status TEXT DEFAULT 'pending',
      sync_error TEXT,
      sync_action TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
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
      supabase_item_id TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
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
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );`,

    `CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      supabase_order_id TEXT,
      participant_id TEXT,
      universe_id TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT DEFAULT 'card',
      hexapay_transaction_id TEXT,
      error_code TEXT,
      error_message TEXT,
      started_at DATETIME DEFAULT (datetime('now', 'localtime')),
      completed_at DATETIME,
      duration_ms INTEGER,
      kiosk_id TEXT,
      sales_point_id TEXT,
      synced_to_remote BOOLEAN DEFAULT 0,
      sync_attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );`,

    `CREATE INDEX IF NOT EXISTS idx_payment_logs_order ON payment_logs(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON payment_logs(status);`,
    `CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_logs(created_at);`,

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
      tva REAL DEFAULT 20,
      setup_completed BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS scan_stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL,
      universe_id TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(participant_id) REFERENCES participants(id),
      FOREIGN KEY(universe_id) REFERENCES universes(id)
    );`,

    `CREATE INDEX IF NOT EXISTS idx_scan_stories_participant ON scan_stories(participant_id);`,
    `CREATE INDEX IF NOT EXISTS idx_scan_stories_universe ON scan_stories(universe_id);`,
    `CREATE INDEX IF NOT EXISTS idx_scan_stories_created_at ON scan_stories(created_at);`,

    `CREATE TABLE IF NOT EXISTS thanks_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
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

    // Ajouter supabase_order_id si manquant
    if (!columnNames.includes('supabase_order_id')) {
      await execAsync('ALTER TABLE orders ADD COLUMN supabase_order_id TEXT');
      console.log('[DB] ✅ Colonne supabase_order_id ajoutée');
    }

    // Ajouter sync_status si manquant
    if (!columnNames.includes('sync_status')) {
      await execAsync("ALTER TABLE orders ADD COLUMN sync_status TEXT DEFAULT 'pending'");
      console.log('[DB] ✅ Colonne sync_status ajoutée');
    }

    // Ajouter sync_error si manquant
    if (!columnNames.includes('sync_error')) {
      await execAsync('ALTER TABLE orders ADD COLUMN sync_error TEXT');
      console.log('[DB] ✅ Colonne sync_error ajoutée');
    }

    // Ajouter sync_action si manquant
    if (!columnNames.includes('sync_action')) {
      await execAsync('ALTER TABLE orders ADD COLUMN sync_action TEXT');
      console.log('[DB] ✅ Colonne sync_action ajoutée');
    }

  } catch (error) {
    console.error('[DB] Erreur migration colonnes sync:', error);
  }

  // Migration: Ajouter date_photo à la table photos
  try {
    const photosTableInfo = await allAsync('PRAGMA table_info(photos)');
    const photosColumnNames = photosTableInfo.map(col => col.name);

    if (!photosColumnNames.includes('date_photo')) {
      await execAsync('ALTER TABLE photos ADD COLUMN date_photo DATETIME');
      console.log('[DB] ✅ Colonne date_photo ajoutée à photos');
    }

    // Ajouter borne_info si manquant
    if (!photosColumnNames.includes('borne_info')) {
      await execAsync('ALTER TABLE photos ADD COLUMN borne_info TEXT');
      console.log('[DB] ✅ Colonne borne_info ajoutée à photos');
    }

    // Ajouter colonnes pour la stratégie de retry en 4 phases
    if (!photosColumnNames.includes('next_retry_at')) {
      await execAsync('ALTER TABLE photos ADD COLUMN next_retry_at INTEGER');
      console.log('[DB] ✅ Colonne next_retry_at ajoutée à photos');
    }

    if (!photosColumnNames.includes('last_error_code')) {
      await execAsync('ALTER TABLE photos ADD COLUMN last_error_code TEXT');
      console.log('[DB] ✅ Colonne last_error_code ajoutée à photos');
    }

    if (!photosColumnNames.includes('retry_phase')) {
      await execAsync('ALTER TABLE photos ADD COLUMN retry_phase INTEGER DEFAULT 1');
      console.log('[DB] ✅ Colonne retry_phase ajoutée à photos');
    }
  } catch (error) {
    console.error('[DB] Erreur migration photos:', error);
  }

  // Migration: Ajouter tva à la table machine_config
  try {
    const machineConfigInfo = await allAsync('PRAGMA table_info(machine_config)');
    const machineConfigColumns = machineConfigInfo.map(col => col.name);

    if (!machineConfigColumns.includes('tva')) {
      await execAsync('ALTER TABLE machine_config ADD COLUMN tva REAL DEFAULT 20');
      console.log('[DB] ✅ Colonne tva ajoutée à machine_config');
    }

    // Migration: Ajouter default_lang à la table machine_config
    if (!machineConfigColumns.includes('default_lang')) {
      await execAsync("ALTER TABLE machine_config ADD COLUMN default_lang TEXT DEFAULT 'fr'");
      console.log('[DB] ✅ Colonne default_lang ajoutée à machine_config');
    }
  } catch (error) {
    console.error('[DB] Erreur migration machine_config:', error);
  }

  // Migration: Ajouter subtotal_ht et vat_amount à la table orders
  try {
    const ordersTableInfo = await allAsync('PRAGMA table_info(orders)');
    const ordersColumnNames = ordersTableInfo.map(col => col.name);

    if (!ordersColumnNames.includes('subtotal_ht')) {
      await execAsync('ALTER TABLE orders ADD COLUMN subtotal_ht REAL DEFAULT 0');
      console.log('[DB] ✅ Colonne subtotal_ht ajoutée à orders');
    }

    if (!ordersColumnNames.includes('vat_amount')) {
      await execAsync('ALTER TABLE orders ADD COLUMN vat_amount REAL DEFAULT 0');
      console.log('[DB] ✅ Colonne vat_amount ajoutée à orders');
    }

    // Ajouter lang si manquant
    if (!ordersColumnNames.includes('lang')) {
      await execAsync("ALTER TABLE orders ADD COLUMN lang TEXT DEFAULT 'fr'");
      console.log('[DB] ✅ Colonne lang ajoutée à orders');
    }

    // Ajouter last_step si manquant
    if (!ordersColumnNames.includes('last_step')) {
      await execAsync('ALTER TABLE orders ADD COLUMN last_step TEXT');
      console.log('[DB] ✅ Colonne last_step ajoutée à orders');
    }
  } catch (error) {
    console.error('[DB] Erreur migration subtotal_ht/vat_amount/lang/last_step:', error);
  }

  // Migration: Ajouter supabase_item_id à la table order_items
  try {
    const orderItemsInfo = await allAsync('PRAGMA table_info(order_items)');
    const orderItemsColumns = orderItemsInfo.map(col => col.name);

    if (!orderItemsColumns.includes('supabase_item_id')) {
      await execAsync('ALTER TABLE order_items ADD COLUMN supabase_item_id TEXT');
      console.log('[DB] ✅ Colonne supabase_item_id ajoutée à order_items');
    }
  } catch (error) {
    console.error('[DB] Erreur migration supabase_item_id:', error);
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
 * ===== SCAN STORIES =====
 */

/**
 * Ajouter une entrée dans scan_stories lors d'un scan valide
 * Retourne l'ID et la date de création pour la synchronisation
 */
export async function addScanStory(participantId, universeId) {
  // Générer la date en heure locale au format SQLite
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const createdAt = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const result = await runAsync(
    `INSERT INTO scan_stories (participant_id, universe_id, created_at)
     VALUES (?, ?, ?)`,
    [participantId, universeId, createdAt]
  );

  return {
    id: result.lastID,
    participantId,
    universeId,
    createdAt
  };
}

/**
 * Récupérer l'historique des scans d'un participant
 */
export async function getScanStories(participantId, limit = 50) {
  return allAsync(
    `SELECT * FROM scan_stories WHERE participant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [participantId, limit]
  );
}

/**
 * Récupérer tous les scans (pour admin)
 */
export async function getAllScanStories(limit = 100) {
  return allAsync(
    `SELECT s.*, p.status as participant_status, u.name as universe_name
     FROM scan_stories s
     LEFT JOIN participants p ON s.participant_id = p.id
     LEFT JOIN universes u ON s.universe_id = u.id
     ORDER BY s.created_at DESC
     LIMIT ?`,
    [limit]
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
    'SELECT * FROM photos WHERE participant_id = ? ORDER BY date_photo DESC',
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
    datePhoto,
    borneInfo,
  } = photo;

  return runAsync(
    `INSERT OR REPLACE INTO photos (
      id, participant_id, file_name, remote_url, checksum,
      size_bytes, incrustation_id, date_photo, borne_info, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
    [id, participantId, fileName, url, checksum, size, incrustationId || null, datePhoto || null, borneInfo || null]
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
 * STRATÉGIE DE RETRY EN 4 PHASES
 * ============================================
 */

/**
 * Mettre à jour les infos de retry après un échec
 */
export async function updatePhotoRetryInfo(photoId, {
  retryCount,
  retryPhase,
  nextRetryAt,
  lastErrorCode,
  lastErrorMessage,
  status
}) {
  return runAsync(
    `UPDATE photos
     SET retry_count = ?,
         retry_phase = ?,
         next_retry_at = ?,
         last_error_code = ?,
         last_error = ?,
         status = ?
     WHERE id = ?`,
    [retryCount, retryPhase, nextRetryAt, lastErrorCode, lastErrorMessage, status, photoId]
  );
}

/**
 * Obtenir les photos prêtes pour retry (next_retry_at <= maintenant)
 */
export async function getPhotosReadyForRetry(limit = 100) {
  const now = Math.floor(Date.now() / 1000);
  return allAsync(
    `SELECT * FROM photos
     WHERE status IN ('failed_temp', 'failed_long_retry')
       AND next_retry_at IS NOT NULL
       AND next_retry_at <= ?
     ORDER BY next_retry_at ASC
     LIMIT ?`,
    [now, limit]
  );
}

/**
 * Forcer le retry d'une photo (reset complet)
 */
export async function forcePhotoRetry(photoId) {
  const now = Math.floor(Date.now() / 1000);
  return runAsync(
    `UPDATE photos
     SET retry_count = 0,
         retry_phase = 1,
         next_retry_at = ?,
         status = 'pending',
         last_error = NULL,
         last_error_code = NULL
     WHERE id = ?`,
    [now, photoId]
  );
}

/**
 * Obtenir toutes les photos en échec (pour l'affichage support)
 */
export async function getFailedPhotos(limit = 500) {
  return allAsync(
    `SELECT id, participant_id, file_name, status, retry_count, retry_phase,
            next_retry_at, last_error_code, last_error, created_at
     FROM photos
     WHERE status IN ('failed_temp', 'failed_long_retry', 'error')
     ORDER BY next_retry_at ASC
     LIMIT ?`,
    [limit]
  );
}

/**
 * Marquer une photo comme téléchargement en cours
 */
export async function markPhotoDownloading(photoId) {
  return runAsync(
    `UPDATE photos
     SET status = 'downloading',
         download_started_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [photoId]
  );
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
    subtotalHt = 0,
    vatAmount = 0,
    totalAmount,
    discountAmount = 0,
    finalAmount,
    lang = 'fr',
    email = null,
    optin = false,
    paymentMethod = null,
    notes = null,
    lastStep = null
  } = orderData;

  return runAsync(
    `INSERT INTO orders (
      id, participant_id, universe_id, subtotal_ht, vat_amount, total_amount, discount_amount,
      final_amount, lang, email, optin, payment_method, notes, last_step, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'localtime'), datetime('now', 'localtime'))`,
    [orderId, participantId, universeId, subtotalHt, vatAmount, totalAmount, discountAmount, finalAmount, lang, email, optin ? 1 : 0, paymentMethod, notes, lastStep]
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
    status = 'pending'
  } = itemData;

  return runAsync(
    `INSERT INTO order_items (
      order_id, photo_id, product_id, product_name, quantity,
      unit_price, total_price, incrustation_id, session_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
    [orderId, photoId, productId, productName, quantity, unitPrice, totalPrice, incrustationId, sessionId, status]
  );
}

/**
 * Ajouter un produit immédiatement lors du clic "Ajouter" (statut: pending)
 * Si un item identique existe déjà (même photo, produit, session, status), on incrémente la quantité
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

  // Vérifier si un item identique existe déjà (même photo, produit, session et status pending)
  const existingItem = await getAsync(
    `SELECT * FROM order_items
     WHERE photo_id = ? AND product_id = ? AND session_id = ? AND status = 'pending'`,
    [photoId, productId, sessionId]
  );

  if (existingItem) {
    // Incrémenter la quantité de l'item existant
    const newQuantity = existingItem.quantity + quantity;
    const newTotalPrice = existingItem.total_price + totalPrice;

    // Mettre à jour unit_price avec le prix dégressif (pour les annulations futures)
    // Après le 1er item, unit_price = prix dégressif (next price)
    await runAsync(
      `UPDATE order_items
       SET quantity = ?,
           total_price = ?,
           unit_price = ?,
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [newQuantity, newTotalPrice, unitPrice, existingItem.id]
    );

    console.log(`[DB] Item existant mis à jour: ${existingItem.id} (qty: ${newQuantity}, unit_price: ${unitPrice})`);
    return { itemId: existingItem.id, status: 'success', merged: true, newQuantity };
  }

  // Créer un nouvel item
  const result = await runAsync(
    `INSERT INTO order_items (
      photo_id, product_id, product_name, quantity,
      unit_price, total_price, incrustation_id, session_id,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'localtime'), datetime('now', 'localtime'))`,
    [photoId, productId, productName, quantity, unitPrice, totalPrice, incrustationId, sessionId]
  );

  return { itemId: result.lastID, status: 'success', merged: false };
}

/**
 * Annuler un produit du panier
 * - Décrémente la quantité de l'item pending (garde avec qty=0 pour sync Supabase)
 * - Incrémente la quantité de l'item cancelled (ou le crée)
 * @param {number} itemId - ID de l'item pending à annuler
 * @param {number} quantityToCancel - Quantité à annuler (défaut: 1)
 */
export async function cancelCartItem(itemId, quantityToCancel = 1) {
  // 1. Récupérer les infos de l'item pending à annuler
  const item = await getAsync('SELECT * FROM order_items WHERE id = ?', [itemId]);

  if (!item) {
    throw new Error(`Item ${itemId} non trouvé`);
  }

  if (item.status !== 'pending') {
    throw new Error(`Item ${itemId} n'est pas en status pending (status: ${item.status})`);
  }

  // S'assurer qu'on n'annule pas plus que la quantité disponible
  const actualQtyToCancel = Math.min(quantityToCancel, item.quantity);
  const unitPrice = item.unit_price;
  const priceToCancel = actualQtyToCancel * unitPrice;

  // 2. Décrémenter la quantité de l'item pending
  const newPendingQty = item.quantity - actualQtyToCancel;
  const newTotalPrice = Math.max(0, item.total_price - priceToCancel);

  // Garder l'item avec qty=0 pour le sync vers Supabase
  // L'item sera supprimé après la sync (dans main.js)
  await runAsync(
    `UPDATE order_items
     SET quantity = ?,
         total_price = ?,
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
    [newPendingQty, newTotalPrice, itemId]
  );

  if (newPendingQty <= 0) {
    console.log(`[DB] Item pending ${itemId} mis à qty=0 (sera supprimé après sync Supabase)`);
  } else {
    console.log(`[DB] Item pending ${itemId} décrémenté (qty: ${item.quantity} → ${newPendingQty})`);
  }

  // 3. Vérifier s'il existe déjà un item cancelled avec le même photo_id, product_id et session_id
  const existingCancelled = await getAsync(
    `SELECT * FROM order_items
     WHERE photo_id = ? AND product_id = ? AND session_id = ? AND status = 'cancelled'`,
    [item.photo_id, item.product_id, item.session_id]
  );

  if (existingCancelled) {
    // 3a. Incrémenter la quantité de l'item cancelled existant
    const newCancelledQty = existingCancelled.quantity + actualQtyToCancel;
    const newCancelledPrice = existingCancelled.total_price + priceToCancel;

    await runAsync(
      `UPDATE order_items
       SET quantity = ?,
           total_price = ?,
           cancelled_at = datetime('now', 'localtime'),
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [newCancelledQty, newCancelledPrice, existingCancelled.id]
    );

    console.log(`[DB] Item cancelled ${existingCancelled.id} incrémenté (qty: ${existingCancelled.quantity} → ${newCancelledQty})`);
    return {
      pendingItemId: itemId,
      cancelledItemId: existingCancelled.id,
      cancelledQty: actualQtyToCancel,
      remainingPendingQty: newPendingQty
    };
  } else {
    // 3b. Créer un nouvel item cancelled
    const result = await runAsync(
      `INSERT INTO order_items (
        order_id, photo_id, product_id, product_name, quantity,
        unit_price, total_price, incrustation_id, session_id,
        status, cancelled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cancelled', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [item.order_id, item.photo_id, item.product_id, item.product_name, actualQtyToCancel,
       unitPrice, priceToCancel, item.incrustation_id, item.session_id]
    );

    console.log(`[DB] Nouvel item cancelled créé: ${result.lastID} (qty: ${actualQtyToCancel})`);
    return {
      pendingItemId: itemId,
      cancelledItemId: result.lastID,
      cancelledQty: actualQtyToCancel,
      remainingPendingQty: newPendingQty
    };
  }
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
      'pending', datetime('now', 'localtime'), datetime('now', 'localtime')
    FROM order_items
    WHERE photo_id = ? AND product_id = ? AND status = 'cancelled'
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
     WHERE session_id = ? AND status = 'pending'
     ORDER BY created_at DESC`,
    [sessionId]
  );
}

/**
 * Valider tous les produits pending d'une session (lors du paiement)
 */
export async function validateSessionItems(sessionId, orderId) {
  return runAsync(
    `UPDATE order_items
     SET status = 'completed',
         order_id = ?,
         validated_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE session_id = ? AND status = 'pending'`,
    [orderId, sessionId]
  );
}

/**
 * Annuler tous les produits d'une session et les lier à une commande annulée
 */
export async function cancelSessionItems(sessionId, orderId) {
  return runAsync(
    `UPDATE order_items
     SET status = 'cancelled',
         order_id = ?,
         cancelled_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE session_id = ? AND status = 'pending'`,
    [orderId, sessionId]
  );
}

/**
 * Lier tous les items d'une session (pending ET cancelled) à un order_id
 * Sans changer leur status - utilisé lors de la création de la commande
 */
export async function linkSessionItemsToOrder(sessionId, orderId) {
  const result = await runAsync(
    `UPDATE order_items
     SET order_id = ?,
         updated_at = datetime('now', 'localtime')
     WHERE session_id = ? AND order_id IS NULL`,
    [orderId, sessionId]
  );
  console.log(`[DB] ${result.changes} items liés à l'order ${orderId} pour session ${sessionId}`);
  return result;
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
    ? `UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime'), completed_at = datetime('now', 'localtime') WHERE id = ?`
    : `UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`;

  await runAsync(updateQuery, [newStatus, orderId]);

  // Enregistrer dans l'historique
  await runAsync(
    `INSERT INTO order_status_history (order_id, old_status, new_status, notes, created_at)
     VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`,
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
     SET status = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
    [newStatus, itemId]
  );
}

/**
 * Mettre à jour le supabase_item_id d'un item de commande
 */
export async function updateOrderItemSupabaseId(localItemId, supabaseItemId) {
  return runAsync(
    `UPDATE order_items
     SET supabase_item_id = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
    [supabaseItemId, localItemId]
  );
}

/**
 * Mettre à jour les supabase_item_id de plusieurs items à partir de la réponse Supabase
 * @param {string} orderId - L'ID local de la commande
 * @param {Array} supabaseItems - Les items retournés par Supabase avec leurs IDs
 */
export async function updateOrderItemsSupabaseIds(orderId, supabaseItems) {
  if (!supabaseItems || supabaseItems.length === 0) {
    console.log('[DB] Aucun item Supabase à lier');
    return { success: true, updated: 0 };
  }

  console.log('[DB] 🔗 Liaison des supabase_item_id...');
  console.log('[DB]   Order ID local:', orderId);
  console.log('[DB]   Nombre d\'items Supabase:', supabaseItems.length);

  // Récupérer les items locaux de cette commande (inclure status et supabase_item_id)
  const localItems = await allAsync(
    'SELECT id, photo_id, product_id, status, supabase_item_id FROM order_items WHERE order_id = ?',
    [orderId]
  );

  console.log('[DB]   Items locaux trouvés:', localItems.length);

  let updated = 0;
  for (const supaItem of supabaseItems) {
    // Dans la réponse Supabase:
    // - photo_id peut être un nombre ou une string
    // - product_id peut être dans supaItem.product_id OU supaItem.products.id
    const supaPhotoId = String(supaItem.photo_id || '');
    const supaProductId = String(supaItem.product_id || supaItem.products?.id || '');
    const supaStatus = supaItem.status || 'pending';

    console.log(`[DB]   🔍 Recherche match: photo_id="${supaPhotoId}", product_id="${supaProductId}", status="${supaStatus}"`);

    // Trouver l'item local correspondant:
    // 1. Même photo_id, product_id, status
    // 2. N'a pas encore de supabase_item_id OU a le même supabase_item_id
    const matchingLocal = localItems.find(
      local => String(local.photo_id) === supaPhotoId &&
               String(local.product_id) === supaProductId &&
               local.status === supaStatus &&
               (!local.supabase_item_id || local.supabase_item_id === supaItem.id)
    );

    if (matchingLocal && supaItem.id) {
      // Seulement mettre à jour si pas déjà défini
      if (!matchingLocal.supabase_item_id) {
        await updateOrderItemSupabaseId(matchingLocal.id, supaItem.id);
        console.log(`[DB]   ✅ Item local ${matchingLocal.id} → supabase_item_id: ${supaItem.id}`);
        // Marquer comme déjà traité pour éviter les doublons
        matchingLocal.supabase_item_id = supaItem.id;
        updated++;
      } else {
        console.log(`[DB]   ℹ️ Item local ${matchingLocal.id} déjà lié à ${matchingLocal.supabase_item_id}`);
      }
    } else {
      console.log(`[DB]   ⚠️ Pas de match local pour photo_id="${supaPhotoId}", product_id="${supaProductId}", status="${supaStatus}"`);
    }
  }

  console.log(`[DB] ✅ ${updated}/${supabaseItems.length} items liés avec succès`);
  return { success: true, updated };
}

/**
 * Supprimer les order_items avec quantity=0 après sync Supabase
 * Ces items ont été envoyés à Supabase pour suppression, on peut les supprimer localement
 * @param {string} orderId - L'ID local de la commande
 */
export async function deleteZeroQuantityItems(orderId) {
  const result = await runAsync(
    `DELETE FROM order_items WHERE order_id = ? AND quantity <= 0`,
    [orderId]
  );
  if (result.changes > 0) {
    console.log(`[DB] 🗑️ ${result.changes} items avec qty=0 supprimés après sync`);
  }
  return { success: true, deleted: result.changes };
}

/**
 * Mettre à jour les détails d'une commande (email, optin, montants, etc.)
 */
export async function updateOrderDetails(orderId, {
  email = null,
  optin = null,
  paymentMethod = null,
  lastStep = null,
  totalAmount = null,
  discountAmount = null,
  finalAmount = null
}) {
  const updates = [];
  const params = [];

  if (email !== null) {
    updates.push('email = ?');
    params.push(email);
  }

  if (optin !== null) {
    updates.push('optin = ?');
    params.push(optin ? 1 : 0);
  }

  if (paymentMethod !== null) {
    updates.push('payment_method = ?');
    params.push(paymentMethod);
  }

  if (lastStep !== null) {
    updates.push('last_step = ?');
    params.push(lastStep);
  }

  // Mise à jour des montants
  if (totalAmount !== null) {
    updates.push('total_amount = ?');
    params.push(totalAmount);
  }

  if (discountAmount !== null) {
    updates.push('discount_amount = ?');
    params.push(discountAmount);
  }

  if (finalAmount !== null) {
    updates.push('final_amount = ?');
    params.push(finalAmount);
  }

  if (updates.length === 0) {
    return { success: true, message: 'Aucun champ à mettre à jour' };
  }

  updates.push("updated_at = datetime('now', 'localtime')");
  params.push(orderId);

  const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;
  console.log('[DB] updateOrderDetails:', orderId, { totalAmount, discountAmount, finalAmount, lastStep });
  await runAsync(query, params);

  return { success: true };
}

/**
 * Récupérer une commande avec ses items
 * Inclut les items liés par order_id ET les items cancelled liés par session_id
 */
export async function getOrderWithItems(orderId) {
  const order = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);

  if (!order) {
    return null;
  }

  // Récupérer les items liés à l'order_id OU les items cancelled de la même session
  // (les items cancelled sont créés avant l'order et n'ont pas d'order_id)
  const items = await allAsync(
    `SELECT * FROM order_items
     WHERE order_id = ?
        OR (session_id = ? AND status = 'cancelled' AND order_id IS NULL)`,
    [orderId, order.participant_id]
  );

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
 * Récupérer les statistiques des commandes (uniquement les completed)
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
    WHERE status = 'completed'
  `;

  const params = [];

  if (startDate && endDate) {
    query += ` AND created_at BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  } else if (startDate) {
    query += ` AND created_at >= ?`;
    params.push(startDate);
  } else if (endDate) {
    query += ` AND created_at <= ?`;
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
 * Récupérer les produits les plus vendus (uniquement des commandes completed)
 */
export async function getTopProducts(limit = 10) {
  return allAsync(
    `SELECT
       oi.product_id,
       oi.product_name,
       SUM(oi.quantity) as total_quantity,
       COUNT(DISTINCT oi.order_id) as order_count,
       SUM(oi.total_price) as total_revenue
     FROM order_items oi
     INNER JOIN orders o ON oi.order_id = o.id
     WHERE o.status = 'completed'
     GROUP BY oi.product_id, oi.product_name
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
 * Récupérer uniquement les produits actifs d'une session (pending)
 */
export async function getActiveSessionItems(sessionId) {
  return allAsync(
    `SELECT * FROM order_items
     WHERE session_id = ?
       AND status = 'pending'
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
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'pending' THEN total_price ELSE 0 END) as total_amount
     FROM order_items
     WHERE session_id = ?`,
    [sessionId]
  );

  return stats || {
    total_items: 0,
    pending: 0,
    cancelled: 0,
    completed: 0,
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
         updated_at = datetime('now', 'localtime')
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
  try {
    const config = await getMachineConfig();
    console.log('[DB] isSetupCompleted - config récupérée:', config);

    // Vérifier si la config existe et a les champs requis
    const isCompleted = !!(config && config.kiosk_id && config.sales_point_id);
    console.log('[DB] isSetupCompleted - résultat:', isCompleted);

    return isCompleted;
  } catch (error) {
    console.error('[DB] Erreur isSetupCompleted:', error);
    return false;
  }
}

/**
 * Sauvegarder la configuration de la machine
 */
export async function saveMachineConfig(kioskId, salesPointId, machineName = null, tva = 20, defaultLang = 'fr') {
  return runAsync(
    `INSERT OR REPLACE INTO machine_config (id, kiosk_id, sales_point_id, machine_name, tva, default_lang, setup_completed, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))`,
    [kioskId, salesPointId, machineName, tva, defaultLang]
  );
}

/**
 * Mettre à jour la configuration de la machine
 */
export async function updateMachineConfig(kioskId, salesPointId, machineName = null, tva = 20, defaultLang = 'fr') {
  return runAsync(
    `UPDATE machine_config
     SET kiosk_id = ?,
         sales_point_id = ?,
         machine_name = ?,
         tva = ?,
         default_lang = ?,
         updated_at = datetime('now', 'localtime')
     WHERE id = 1`,
    [kioskId, salesPointId, machineName, tva, defaultLang]
  );
}

/**
 * Mettre à jour uniquement la langue par défaut
 */
export async function updateDefaultLang(lang) {
  return runAsync(
    `UPDATE machine_config
     SET default_lang = ?,
         updated_at = datetime('now', 'localtime')
     WHERE id = 1`,
    [lang]
  );
}

/**
 * ===== SYNCHRONISATION REMOTE API =====
 */

/**
 * Récupérer les commandes non synchronisées avec l'API distante
 * Exclut les commandes déjà synchronisées (sync_status='synced' ou supabase_order_id existe)
 */
export async function getUnsyncedOrders(maxAttempts = 5) {
  return allAsync(
    `SELECT * FROM orders
     WHERE synced_to_remote = 0
       AND (sync_status IS NULL OR sync_status = 'pending' OR sync_status = 'error')
       AND sync_status != 'synced'
       AND (supabase_order_id IS NULL OR supabase_order_id = '')
       AND sync_attempts < ?
       AND status IN ('processing', 'cancelled', 'completed')
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
         synced_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
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
         last_sync_attempt = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
    [orderId]
  );
}

/**
 * Mettre à jour le statut de synchronisation d'une commande
 * @param {string} orderId - ID de la commande locale
 * @param {string} syncStatus - Statut: 'pending', 'synced', 'error'
 * @param {string} syncAction - Action: 'create', 'update', 'cancel'
 * @param {string} supabaseOrderId - ID de la commande Supabase (optionnel)
 * @param {string} syncError - Message d'erreur (optionnel)
 */
export async function updateOrderSyncStatus(orderId, syncStatus, syncAction, supabaseOrderId = null, syncError = null) {
  const updates = [
    'sync_status = ?',
    'sync_action = ?',
    'last_sync_attempt = datetime(\'now\', \'localtime\')',
    'updated_at = datetime(\'now\', \'localtime\')'
  ];
  const params = [syncStatus, syncAction];

  if (supabaseOrderId) {
    updates.push('supabase_order_id = ?');
    params.push(supabaseOrderId);
  }

  if (syncError) {
    updates.push('sync_error = ?');
    params.push(syncError);
  } else if (syncStatus === 'synced') {
    updates.push('sync_error = NULL');
  }

  if (syncStatus === 'synced') {
    updates.push('synced_to_remote = 1');
    updates.push('synced_at = datetime(\'now\', \'localtime\')');
  }

  params.push(orderId);

  return runAsync(
    `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
}

/**
 * Marquer une commande comme ayant une erreur de synchronisation
 */
export async function markOrderSyncError(orderId, action, errorMessage) {
  return runAsync(
    `UPDATE orders
     SET sync_status = 'error',
         sync_action = ?,
         sync_error = ?,
         sync_attempts = sync_attempts + 1,
         last_sync_attempt = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
    [action, errorMessage, orderId]
  );
}

/**
 * Récupérer les commandes avec erreur de sync pour retry
 */
export async function getOrdersWithSyncErrors(maxAttempts = 5) {
  return allAsync(
    `SELECT * FROM orders
     WHERE sync_status = 'error'
       AND sync_attempts < ?
     ORDER BY last_sync_attempt ASC`,
    [maxAttempts]
  );
}

/**
 * Récupérer les commandes en attente de synchronisation
 */
export async function getPendingSyncOrders() {
  return allAsync(
    `SELECT * FROM orders
     WHERE (sync_status = 'pending' OR sync_status IS NULL)
       AND status IN ('processing', 'completed', 'cancelled')
     ORDER BY created_at ASC`
  );
}

/**
 * Récupérer une commande locale par son ID Supabase
 */
export async function getOrderBySupabaseId(supabaseOrderId) {
  return getAsync(
    `SELECT * FROM orders WHERE supabase_order_id = ?`,
    [supabaseOrderId]
  );
}

/**
 * ============================================
 * GESTION DES LOGS DE PAIEMENT
 * ============================================
 */

/**
 * Créer un nouveau log de paiement (au début du paiement)
 */
export async function createPaymentLog(logData) {
  const {
    orderId = null,
    supabaseOrderId = null,
    participantId = null,
    universeId = null,
    amount = 0,
    paymentMethod = 'card',
    kioskId = null,
    salesPointId = null
  } = logData;

  const result = await runAsync(
    `INSERT INTO payment_logs (
      order_id, supabase_order_id, participant_id, universe_id,
      amount, status, payment_method, kiosk_id, sales_point_id,
      started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))`,
    [orderId, supabaseOrderId, participantId, universeId, amount, paymentMethod, kioskId, salesPointId]
  );

  // Retourner l'ID du log créé
  const lastId = await getAsync('SELECT last_insert_rowid() as id');
  return { id: lastId?.id, ...logData };
}

/**
 * Mettre à jour un log de paiement (à la fin du paiement)
 */
export async function updatePaymentLog(logId, updateData) {
  const {
    status,
    hexapayTransactionId = null,
    errorCode = null,
    errorMessage = null,
    durationMs = null
  } = updateData;

  return runAsync(
    `UPDATE payment_logs SET
      status = ?,
      hexapay_transaction_id = ?,
      error_code = ?,
      error_message = ?,
      duration_ms = ?,
      completed_at = datetime('now', 'localtime'),
      updated_at = datetime('now', 'localtime')
    WHERE id = ?`,
    [status, hexapayTransactionId, errorCode, errorMessage, durationMs, logId]
  );
}

/**
 * Récupérer un log de paiement par son ID
 */
export async function getPaymentLog(logId) {
  return getAsync('SELECT * FROM payment_logs WHERE id = ?', [logId]);
}

/**
 * Récupérer les logs de paiement d'une commande
 */
export async function getPaymentLogsByOrder(orderId) {
  return allAsync(
    'SELECT * FROM payment_logs WHERE order_id = ? ORDER BY created_at DESC',
    [orderId]
  );
}

/**
 * Récupérer tous les logs de paiement (avec pagination)
 */
export async function getAllPaymentLogs(limit = 100, offset = 0) {
  return allAsync(
    `SELECT * FROM payment_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

/**
 * Récupérer les statistiques de paiement
 */
export async function getPaymentStats() {
  const stats = await getAsync(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
      SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      AVG(CASE WHEN status = 'success' THEN duration_ms ELSE NULL END) as avg_success_duration_ms,
      SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_success_amount
    FROM payment_logs
  `);
  return stats;
}

/**
 * Récupérer les logs de paiement non synchronisés
 */
export async function getUnsyncedPaymentLogs() {
  return allAsync(
    `SELECT * FROM payment_logs
     WHERE synced_to_remote = 0 AND status != 'pending'
     ORDER BY created_at ASC`
  );
}

/**
 * Marquer un log de paiement comme synchronisé
 */
export async function markPaymentLogSynced(logId) {
  return runAsync(
    `UPDATE payment_logs SET synced_to_remote = 1, updated_at = datetime('now', 'localtime') WHERE id = ?`,
    [logId]
  );
}

/**
 * ===== MESSAGES DE REMERCIEMENT =====
 */

/**
 * Récupérer tous les messages de remerciement
 */
export async function getThanksMessages() {
  return allAsync('SELECT * FROM thanks_messages ORDER BY lang');
}

/**
 * Récupérer un message de remerciement par langue
 */
export async function getThanksMessage(lang) {
  return getAsync('SELECT * FROM thanks_messages WHERE lang = ?', [lang]);
}

/**
 * Mettre à jour ou créer un message de remerciement
 */
export async function updateThanksMessage(lang, title, subtitle) {
  return runAsync(
    `INSERT INTO thanks_messages (lang, title, subtitle, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(lang) DO UPDATE SET
       title = excluded.title,
       subtitle = excluded.subtitle,
       updated_at = datetime('now', 'localtime')`,
    [lang, title, subtitle]
  );
}

/**
 * Supprimer un message de remerciement
 */
export async function deleteThanksMessage(lang) {
  return runAsync('DELETE FROM thanks_messages WHERE lang = ?', [lang]);
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