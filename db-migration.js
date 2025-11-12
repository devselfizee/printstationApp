/**
 * db-MIGRATION.js - Migration pour sqlite3
 * 
 * Ajoute les colonnes manquantes à la DB existante sans perdre les données
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

function getDataDir() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return path.join('C:', 'PrintStationApp', 'Medias');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Documents', 'PrintStationApp', 'Medias');
  } else {
    return path.join(os.homedir(), '.PrintStationApp', 'Medias');
  }
}

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'data.db');

console.log('[Migration] Base de données:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Migration] ❌ Erreur ouverture DB:', err.message);
    process.exit(1);
  }
  
  console.log('[Migration] ✅ DB ouverte');
  performMigration();
});

function performMigration() {
  console.log('[Migration] Ajout des colonnes manquantes...');

  // ⭐ Ajouter les colonnes une par une
  const columns = [
    {
      name: 'corruption_count',
      sql: 'ALTER TABLE photos ADD COLUMN corruption_count INTEGER DEFAULT 0',
    },
    {
      name: 'retry_count',
      sql: 'ALTER TABLE photos ADD COLUMN retry_count INTEGER DEFAULT 0',
    },
    {
      name: 'last_error',
      sql: 'ALTER TABLE photos ADD COLUMN last_error TEXT',
    },
  ];

  let completed = 0;

  columns.forEach((col) => {
    db.run(col.sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column')) {
          console.log(`[Migration] ⏭️  Colonne ${col.name} existe déjà`);
        } else {
          console.error(`[Migration] ❌ Erreur ${col.name}:`, err.message);
        }
      } else {
        console.log(`[Migration] ✅ Colonne ${col.name} ajoutée`);
      }

      completed++;

      // Après toutes les colonnes, ajouter les indices
      if (completed === columns.length) {
        addIndices();
      }
    });
  });
}

function addIndices() {
  console.log('[Migration] Ajout des indices...');

  const indices = [
    'CREATE INDEX IF NOT EXISTS idx_photos_corruption ON photos(corruption_count)',
    'CREATE INDEX IF NOT EXISTS idx_photos_retry ON photos(retry_count)',
  ];

  let completed = 0;

  indices.forEach((indexSql) => {
    db.run(indexSql, (err) => {
      if (err) {
        console.error('[Migration] ⚠️  Erreur création index:', err.message);
      } else {
        console.log('[Migration] ✅ Index créé');
      }

      completed++;

      if (completed === indices.length) {
        finalizeMigration();
      }
    });
  });
}

function finalizeMigration() {
  console.log('[Migration] ✅ Migration complète!');
  
  // Vérifier les changements
  db.all(
    "PRAGMA table_info(photos)",
    (err, rows) => {
      if (err) {
        console.error('[Migration] Erreur vérification:', err.message);
      } else {
        console.log('[Migration] Colonnes photos:', rows.map(r => r.name).join(', '));
      }

      db.close(() => {
        console.log('[Migration] DB fermée');
        process.exit(0);
      });
    }
  );
}