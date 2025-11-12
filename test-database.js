/**
 * test-database.js - Script de test pour vérifier la base de données
 * 
 * Usage: node test-database.js
 * 
 * Ce script teste:
 * 1. Connexion à la base de données
 * 2. Création/vérification des tables
 * 3. Vérification des données (univers, participants, photos)
 * 4. Test de la fonction getDashboardStats
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
console.log('🧪 Test de la Base de Données PrintStation');
console.log('═══════════════════════════════════════════════════\n');

console.log(`📍 Plateforme: ${process.platform}`);
console.log(`📂 Répertoire: ${DATA_DIR}`);
console.log(`💾 Base de données: ${DB_PATH}\n`);

// Ouvrir la base de données
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erreur ouverture DB:', err.message);
    console.log('\n💡 La base de données n\'existe pas encore.');
    console.log('   Lancez l\'application pour la créer automatiquement.\n');
    process.exit(1);
  }
  console.log('✅ Base de données ouverte avec succès\n');
});

/**
 * Exécuter une requête et retourner les résultats
 */
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Exécuter le test complet
 */
async function runTests() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Test 1: Vérification des Tables');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const tables = await query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );

    if (tables.length === 0) {
      console.log('⚠️  Aucune table trouvée! La base doit être initialisée.\n');
    } else {
      console.log(`✅ ${tables.length} tables trouvées:\n`);
      tables.forEach(t => console.log(`   - ${t.name}`));
      console.log('');
    }

    // Vérifier les tables attendues
    const expectedTables = ['universes', 'participants', 'photos', 'sync_log'];
    const foundTables = tables.map(t => t.name);
    
    const missingTables = expectedTables.filter(t => !foundTables.includes(t));
    if (missingTables.length > 0) {
      console.log(`⚠️  Tables manquantes: ${missingTables.join(', ')}\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌍 Test 2: Univers');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const universes = await query('SELECT * FROM universes');
    
    if (universes.length === 0) {
      console.log('⚠️  Aucun univers trouvé.');
      console.log('   Les univers seront créés au premier démarrage.\n');
    } else {
      console.log(`✅ ${universes.length} univers trouvés:\n`);
      universes.forEach(u => {
        console.log(`   🎮 ${u.name} (${u.id})`);
        console.log(`      Status: ${u.status}`);
        console.log(`      URL: ${u.config_url}`);
        console.log('');
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👥 Test 3: Participants');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const participants = await query('SELECT * FROM participants');
    
    if (participants.length === 0) {
      console.log('⚠️  Aucun participant trouvé.');
      console.log('   Les participants sont créés via l\'API de synchronisation.\n');
    } else {
      console.log(`✅ ${participants.length} participants trouvés:\n`);
      
      // Grouper par univers
      const byUniverse = {};
      participants.forEach(p => {
        if (!byUniverse[p.universe_id]) byUniverse[p.universe_id] = [];
        byUniverse[p.universe_id].push(p);
      });
      
      Object.entries(byUniverse).forEach(([universe, parts]) => {
        console.log(`   🎮 ${universe}: ${parts.length} participants`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📸 Test 4: Photos');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const photoStats = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as downloaded,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
      FROM photos
    `);

    const stats = photoStats[0];
    
    if (stats.total === 0) {
      console.log('⚠️  Aucune photo trouvée.');
      console.log('   Les photos sont synchronisées depuis l\'API configurée.\n');
    } else {
      console.log(`✅ ${stats.total} photos trouvées:\n`);
      console.log(`   📥 Téléchargées: ${stats.downloaded}`);
      console.log(`   ⏳ En attente: ${stats.pending}`);
      console.log(`   ❌ Erreurs: ${stats.errors}`);
      
      const completionRate = stats.total > 0 
        ? Math.round((stats.downloaded / stats.total) * 100)
        : 0;
      console.log(`   📊 Taux de complétion: ${completionRate}%\n`);
    }

    // Vérifier la colonne corruption_count
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Test 5: Structure de la Table Photos');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const columns = await query('PRAGMA table_info(photos)');
    const hasCorruptionCount = columns.some(c => c.name === 'corruption_count');
    
    if (hasCorruptionCount) {
      console.log('✅ Colonne corruption_count présente\n');
    } else {
      console.log('⚠️  Colonne corruption_count MANQUANTE!');
      console.log('   Exécutez: node fix-corruption-count.js\n');
    }

    console.log('Colonnes de la table photos:');
    columns.forEach(c => {
      console.log(`   - ${c.name} (${c.type})`);
    });
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Résumé');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Tables: ${tables.length}`);
    console.log(`Univers: ${universes.length}`);
    console.log(`Participants: ${participants.length}`);
    console.log(`Photos: ${stats.total}`);
    console.log(`Colonne corruption_count: ${hasCorruptionCount ? '✅ OK' : '❌ MANQUANTE'}\n`);

    if (universes.length === 0) {
      console.log('💡 Actions recommandées:');
      console.log('   1. Lancez l\'application (npm start)');
      console.log('   2. Les univers seront créés automatiquement');
      console.log('   3. Configurez l\'URL API dans .env');
      console.log('   4. Relancez ce test\n');
    } else if (stats.total === 0) {
      console.log('💡 Actions recommandées:');
      console.log('   1. Vérifiez la variable PHOTO_API_URL dans .env');
      console.log('   2. Vérifiez que l\'API est accessible');
      console.log('   3. Attendez 30 secondes (cycle de sync)');
      console.log('   4. Relancez ce test\n');
    } else {
      console.log('✅ Tout semble fonctionnel!\n');
    }

  } catch (error) {
    console.error('\n❌ Erreur pendant les tests:', error.message);
    console.error(error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Erreur fermeture DB:', err.message);
      } else {
        console.log('✅ Base de données fermée');
      }
      console.log('\n═══════════════════════════════════════════════════');
      console.log('Test terminé');
      console.log('═══════════════════════════════════════════════════\n');
    });
  }
}

// Exécuter les tests
runTests();
