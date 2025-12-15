import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

/**
 * Initialiser la base de données SQLite
 * À appeler une seule fois au démarrage de l'app
 */
export class DatabaseInitializer {
  constructor() {
    // Dans Electron, utiliser app.getPath('userData') pour le dossier sécurisé
    this.dbPath = path.join(app.getPath('userData'), 'photos.db');
    this.db = null;
  }

  /**
   * Créer et initialiser la base de données
   */
  initialize() {
    try {
      console.log('[DB] Initializing database at:', this.dbPath);

      // Créer le dossier s'il n'existe pas
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('[DB] Created directory:', dbDir);
      }

      // Ouvrir la base (crée si elle n'existe pas)
      this.db = new Database(this.dbPath);

      // Utiliser DELETE mode pour avoir un seul fichier DB
      this.db.pragma('journal_mode = DELETE');
      console.log('[DB] DELETE journal mode enabled (single file)');

      // Créer les tables
      this.createTables();

      // Vérifier que les tables existent
      this.verifyTables();

      console.log('[DB] Database initialization complete');
      return this.db;

    } catch (err) {
      console.error('[DB] Error initializing database:', err);
      throw err;
    }
  }

  /**
   * Créer toutes les tables
   */
  createTables() {
    const sql = `
      -- Table des univers (thèmes)
      CREATE TABLE IF NOT EXISTS universes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des participants
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        universe_code TEXT NOT NULL,
        universe_value REAL,
        name TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Table des photos
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        md5_hash TEXT,
        size INTEGER,
        date_photo DATETIME,
        downloaded BOOLEAN DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        last_attempt DATETIME,
        downloaded_at DATETIME,
        local_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (participant_id) REFERENCES participants(id)
      );

      -- Table d'historique des téléchargements (audit)
      CREATE TABLE IF NOT EXISTS download_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id TEXT NOT NULL,
        status TEXT,
        error_message TEXT,
        duration_ms INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (photo_id) REFERENCES photos(id)
      );

      -- Table de synchronisation (état du sync)
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY,
        last_sync DATETIME,
        last_successful_sync DATETIME,
        total_photos INTEGER DEFAULT 0,
        downloaded_photos INTEGER DEFAULT 0,
        pending_photos INTEGER DEFAULT 0,
        failed_photos INTEGER DEFAULT 0,
        next_sync_time DATETIME
      );

      -- Index pour optimisation
      CREATE INDEX IF NOT EXISTS idx_photos_participant ON photos(participant_id);
      CREATE INDEX IF NOT EXISTS idx_photos_downloaded ON photos(downloaded);
      CREATE INDEX IF NOT EXISTS idx_participants_universe ON participants(universe_code);
      CREATE INDEX IF NOT EXISTS idx_download_history_photo ON download_history(photo_id);
    `;

    try {
      // Exécuter chaque statement séparément
      const statements = sql.split(';').filter(stmt => stmt.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          this.db.exec(stmt);
        }
      }
      console.log('[DB] Tables created successfully');
    } catch (err) {
      console.error('[DB] Error creating tables:', err);
      throw err;
    }
  }

  /**
   * Vérifier que les tables existent
   */
  verifyTables() {
    try {
      const tables = [
        'universes',
        'participants',
        'photos',
        'download_history',
        'sync_state'
      ];

      for (const table of tables) {
        const result = this.db.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        ).get(table);

        if (result) {
          console.log(`[DB] ✓ Table exists: ${table}`);
        } else {
          throw new Error(`Table ${table} not found`);
        }
      }

      // Initialiser sync_state s'il est vide
      const syncCount = this.db.prepare('SELECT COUNT(*) as count FROM sync_state').get();
      if (syncCount.count === 0) {
        this.db.prepare(`
          INSERT INTO sync_state (
            id, last_sync, last_successful_sync, total_photos, 
            downloaded_photos, pending_photos, failed_photos
          ) VALUES (1, NULL, NULL, 0, 0, 0, 0)
        `).run();
        console.log('[DB] sync_state initialized');
      }

    } catch (err) {
      console.error('[DB] Verification failed:', err);
      throw err;
    }
  }

  /**
   * Fermer la base de données
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('[DB] Database closed');
    }
  }

  /**
   * Obtenir l'instance de la base
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Reset complet de la base (DEBUG ONLY)
   */
  reset() {
    try {
      console.warn('[DB] RESETTING DATABASE - THIS IS FOR DEBUG ONLY');
      
      const tables = [
        'download_history',
        'photos',
        'participants',
        'universes',
        'sync_state'
      ];

      for (const table of tables) {
        this.db.prepare(`DELETE FROM ${table}`).run();
        console.log(`[DB] Cleared ${table}`);
      }

      // Réinitialiser sync_state
      this.db.prepare(`
        INSERT OR REPLACE INTO sync_state (
          id, last_sync, last_successful_sync, total_photos, 
          downloaded_photos, pending_photos, failed_photos
        ) VALUES (1, NULL, NULL, 0, 0, 0, 0)
      `).run();

      console.log('[DB] Database reset complete');
    } catch (err) {
      console.error('[DB] Error during reset:', err);
      throw err;
    }
  }
}

export default DatabaseInitializer;
