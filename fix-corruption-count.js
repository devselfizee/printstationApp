/**
 * Script de migration pour ajouter la colonne corruption_count manquante
 * 
 * Exécuter ce script pour corriger l'erreur:
 * SQLITE_ERROR: no such column: corruption_count
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Déterminer le répertoire de données selon l'OS
 */
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

console.log(`[Migration] Plateforme: ${process.platform}`);
console.log(`[Migration] Base de données: ${DB_PATH}`);

// Vérifier que le fichier existe
if (!fs.existsSync(DB_PATH)) {
  console.error(`[Migration] ❌ Fichier de base de données introuvable: ${DB_PATH}`);
  console.log('[Migration] La base sera créée avec le bon schéma au prochain démarrage.');
  process.exit(0);
}

// Ouvrir la base de données
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Migration] ❌ Erreur ouverture DB:', err.message);
    process.exit(1);
  }
  console.log('[Migration] ✓ Base de données ouverte');
});

/**
 * Vérifier si une colonne existe dans une table
 */
function checkColumnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const exists = rows.some(row => row.name === columnName);
        resolve(exists);
      }
    });
  });
}

/**
 * Ajouter une colonne à une table
 */
function addColumn(tableName, columnName, columnType, defaultValue = null) {
  return new Promise((resolve, reject) => {
    const defaultClause = defaultValue !== null ? `DEFAULT ${defaultValue}` : '';
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} ${defaultClause}`;
    
    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Exécuter la migration
 */
async function migrate() {
  try {
    console.log('[Migration] 🔍 Vérification de la colonne corruption_count...');
    
    const exists = await checkColumnExists('photos', 'corruption_count');
    
    if (exists) {
      console.log('[Migration] ✓ La colonne corruption_count existe déjà');
      console.log('[Migration] Aucune action nécessaire');
    } else {
      console.log('[Migration] ➕ Ajout de la colonne corruption_count...');
      
      await addColumn('photos', 'corruption_count', 'INTEGER', '0');
      
      console.log('[Migration] ✅ Colonne corruption_count ajoutée avec succès!');
      console.log('[Migration] Toutes les photos existantes ont corruption_count = 0');
    }
    
    // Vérifier le résultat
    const rows = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(photos)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n[Migration] 📋 Structure actuelle de la table photos:');
    rows.forEach(row => {
      console.log(`  - ${row.name} (${row.type})`);
    });
    
    // Fermer la base
    db.close((err) => {
      if (err) {
        console.error('[Migration] ⚠️  Erreur fermeture DB:', err.message);
      } else {
        console.log('\n[Migration] ✅ Migration terminée avec succès!');
        console.log('[Migration] Vous pouvez maintenant relancer votre application.');
      }
    });
    
  } catch (error) {
    console.error('[Migration] ❌ Erreur lors de la migration:', error.message);
    db.close();
    process.exit(1);
  }
}

// Lancer la migration
migrate();
