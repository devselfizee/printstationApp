/**
 * migration-realtime-tracking.js
 * 
 * Migration pour le système d'enregistrement en temps réel
 * Ajoute les colonnes nécessaires à order_items
 * 
 * Usage: node migration-realtime-tracking.js
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

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

console.log('═══════════════════════════════════════════════════');
console.log('🔄 Migration: Système d\'Enregistrement Temps Réel');
console.log('═══════════════════════════════════════════════════\n');

console.log(`📂 Base de données: ${DB_PATH}\n`);

// Ouvrir la base de données
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erreur ouverture DB:', err.message);
    console.log('\n💡 La base n\'existe pas encore.');
    console.log('   Lancez l\'application pour la créer.\n');
    process.exit(1);
  }
  console.log('✅ Base de données ouverte\n');
});

/**
 * Vérifier si une colonne existe
 */
function columnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      const exists = rows.some(row => row.name === columnName);
      resolve(exists);
    });
  });
}

/**
 * Exécuter la migration
 */
async function runMigration() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 1: Vérification de la table order_items');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Vérifier si order_items existe
    const tableExists = await new Promise((resolve, reject) => {
      db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='order_items'`,
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (!tableExists) {
      console.log('❌ Table order_items n\'existe pas');
      console.log('💡 Lancez d\'abord migration-orders.js\n');
      process.exit(1);
    }

    console.log('✅ Table order_items existe\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 2: Vérification des colonnes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const columnsToCheck = [
      'session_id',
      'cancelled_at',
      'validated_at'
    ];

    const missingColumns = [];

    for (const col of columnsToCheck) {
      const exists = await columnExists('order_items', col);
      if (exists) {
        console.log(`✅ Colonne ${col} existe`);
      } else {
        console.log(`⚠️  Colonne ${col} manquante`);
        missingColumns.push(col);
      }
    }

    if (missingColumns.length === 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Toutes les colonnes existent déjà');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 3: Ajout des colonnes manquantes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Ajouter les colonnes manquantes
    const queries = [];

    if (missingColumns.includes('session_id')) {
      queries.push('ALTER TABLE order_items ADD COLUMN session_id TEXT');
    }

    if (missingColumns.includes('cancelled_at')) {
      queries.push('ALTER TABLE order_items ADD COLUMN cancelled_at DATETIME');
    }

    if (missingColumns.includes('validated_at')) {
      queries.push('ALTER TABLE order_items ADD COLUMN validated_at DATETIME');
    }

    for (const query of queries) {
      await new Promise((resolve, reject) => {
        db.run(query, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }

    console.log(`✅ ${queries.length} colonne(s) ajoutée(s)\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 4: Modification de la contrainte order_id');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('⚠️  Note: order_id peut maintenant être NULL');
    console.log('   (NULL jusqu\'au paiement validé)\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 5: Vérification finale');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Vérifier que toutes les colonnes existent
    let allOk = true;
    for (const col of columnsToCheck) {
      const exists = await columnExists('order_items', col);
      if (exists) {
        console.log(`✅ ${col} confirmée`);
      } else {
        console.log(`❌ ${col} manquante`);
        allOk = false;
      }
    }

    if (!allOk) {
      console.log('\n❌ Certaines colonnes n\'ont pas été ajoutées\n');
      process.exit(1);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration terminée avec succès');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📝 Résumé:');
    console.log('   - 3 nouvelles colonnes ajoutées');
    console.log('   - order_id peut maintenant être NULL');
    console.log('   - Système d\'enregistrement temps réel opérationnel\n');

    console.log('📚 Documentation:');
    console.log('   - Voir ENREGISTREMENT-TEMPS-REEL.md pour l\'utilisation\n');

    console.log('🎯 Nouveaux statuts disponibles:');
    console.log('   - en_cours (ajouté au panier)');
    console.log('   - en_attente (re-ajouté après annulation)');
    console.log('   - annulé (retiré du panier)');
    console.log('   - validé (paiement accepté)\n');

  } catch (error) {
    console.error('\n❌ Erreur pendant la migration:', error.message);
    console.error(error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Erreur fermeture DB:', err.message);
      }
      console.log('═══════════════════════════════════════════════════');
      console.log('Migration terminée');
      console.log('═══════════════════════════════════════════════════\n');
    });
  }
}

// Exécuter la migration
runMigration();
