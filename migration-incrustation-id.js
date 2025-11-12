/**
 * migration-incrustation-id.js
 * 
 * Script de migration pour ajouter la colonne incrustation_id 
 * aux bases de données existantes
 * 
 * Usage: node migration-incrustation-id.js
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
console.log('🔄 Migration: Ajout de la colonne incrustation_id');
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
 * Vérifier si la colonne existe
 */
function checkColumn() {
  return new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(photos)', (err, columns) => {
      if (err) {
        reject(err);
        return;
      }

      const hasIncrustationId = columns.some(col => col.name === 'incrustation_id');
      resolve({ columns, hasIncrustationId });
    });
  });
}

/**
 * Ajouter la colonne
 */
function addColumn() {
  return new Promise((resolve, reject) => {
    db.run('ALTER TABLE photos ADD COLUMN incrustation_id TEXT', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Exécuter la migration
 */
async function runMigration() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 1: Vérification de la structure');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { columns, hasIncrustationId } = await checkColumn();

    console.log(`✅ Table photos trouvée avec ${columns.length} colonnes`);

    if (hasIncrustationId) {
      console.log('✅ La colonne incrustation_id existe déjà\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Migration déjà effectuée - Rien à faire');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      db.close();
      return;
    }

    console.log('⚠️  La colonne incrustation_id n\'existe pas\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 2: Ajout de la colonne');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔄 Exécution: ALTER TABLE photos ADD COLUMN incrustation_id TEXT\n');

    await addColumn();

    console.log('✅ Colonne incrustation_id ajoutée avec succès\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 3: Vérification finale');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { columns: newColumns } = await checkColumn();
    const incrustationColumn = newColumns.find(col => col.name === 'incrustation_id');

    if (incrustationColumn) {
      console.log('✅ Colonne incrustation_id confirmée:');
      console.log(`   - Type: ${incrustationColumn.type}`);
      console.log(`   - Nullable: Oui`);
      console.log(`   - Défaut: NULL\n`);
    } else {
      console.log('❌ Erreur: La colonne n\'a pas été ajoutée\n');
      db.close();
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration terminée avec succès');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📝 Notes:');
    console.log('   - Les photos existantes auront incrustation_id = NULL');
    console.log('   - Les nouvelles photos synchronisées depuis l\'API');
    console.log('     auront incrustation_id rempli automatiquement');
    console.log('   - Vous pouvez relancer l\'application maintenant\n');

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
