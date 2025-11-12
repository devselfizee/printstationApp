/**
 * diagnostic-stats.js - Diagnostiquer pourquoi les stats affichent 0
 * 
 * Usage: node diagnostic-stats.js
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
console.log('🔍 Diagnostic: Pourquoi Photos = 0 ?');
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
 * Exécuter une requête
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
 * Diagnostique complet
 */
async function runDiagnostic() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 1: Vérifier la structure de la table photos');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const columns = await query('PRAGMA table_info(photos)');
    
    if (columns.length === 0) {
      console.log('❌ Table photos n\'existe pas!\n');
      return;
    }

    console.log('✅ Table photos existe avec les colonnes:');
    columns.forEach(c => {
      console.log(`   - ${c.name} (${c.type})`);
    });
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 2: Compter toutes les photos');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalCount = await query('SELECT COUNT(*) as count FROM photos');
    const total = totalCount[0].count;

    console.log(`📸 Total de photos dans la table: ${total}\n`);

    if (total === 0) {
      console.log('⚠️  Aucune photo dans la base!');
      console.log('');
      console.log('💡 Causes possibles:');
      console.log('   1. L\'API n\'est pas configurée (PHOTO_API_URL)');
      console.log('   2. La synchronisation n\'a pas encore eu lieu (attendre 30 sec)');
      console.log('   3. L\'API ne retourne aucune photo');
      console.log('');
      console.log('🔧 Solutions:');
      console.log('   1. Vérifier .env → PHOTO_API_URL');
      console.log('   2. Vérifier les logs de sync dans la console Electron');
      console.log('   3. Tester l\'API manuellement: curl $PHOTO_API_URL\n');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 3: Répartition par statut');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const statusStats = await query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM photos
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log('Répartition des photos par statut:');
    statusStats.forEach(s => {
      const percentage = ((s.count / total) * 100).toFixed(1);
      console.log(`   ${s.status.padEnd(12)} : ${s.count.toString().padStart(4)} (${percentage}%)`);
    });
    console.log('');

    // Compter les photos avec status = 'complete'
    const completeCount = statusStats.find(s => s.status === 'complete')?.count || 0;

    if (completeCount === 0) {
      console.log('⚠️  Aucune photo avec status = \'complete\'!');
      console.log('');
      console.log('💡 Explication:');
      console.log('   Les photos téléchargées doivent avoir status = \'complete\'');
      console.log('   pour être comptées dans les stats.\n');
      
      const pendingCount = statusStats.find(s => s.status === 'pending')?.count || 0;
      if (pendingCount > 0) {
        console.log(`   📥 ${pendingCount} photos en attente de téléchargement`);
        console.log('   → Le service de téléchargement est-il actif?\n');
      }
    } else {
      console.log(`✅ ${completeCount} photos téléchargées (status = 'complete')\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 4: Vérifier les univers');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const universes = await query('SELECT * FROM universes');
    
    if (universes.length === 0) {
      console.log('⚠️  Aucun univers trouvé!');
      console.log('   Les stats globales nécessitent au moins un univers.\n');
    } else {
      console.log(`✅ ${universes.length} univers trouvés:`);
      universes.forEach(u => {
        console.log(`   - ${u.name} (${u.id})`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 5: Vérifier les participants');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const participants = await query('SELECT * FROM participants');
    
    if (participants.length === 0) {
      console.log('⚠️  Aucun participant trouvé!');
      console.log('');
      console.log('💡 Explication:');
      console.log('   getDashboardStats() calcule les stats en parcourant');
      console.log('   tous les participants et en additionnant leurs photos.');
      console.log('   Sans participants, les stats seront à 0 même si des photos existent.\n');
      console.log('🔧 Solution:');
      console.log('   Les participants sont créés automatiquement par l\'API');
      console.log('   lors de la synchronisation.\n');
    } else {
      console.log(`✅ ${participants.length} participants trouvés\n`);
      
      // Stats par participant
      console.log('Stats par participant:');
      for (const p of participants) {
        const pStats = await query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as downloaded,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
          FROM photos
          WHERE participant_id = ?
        `, [p.id]);
        
        const s = pStats[0];
        console.log(`   ${p.id}:`);
        console.log(`      Total: ${s.total}, Téléchargées: ${s.downloaded}, En attente: ${s.pending}, Erreurs: ${s.errors}`);
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 6: Simulation getDashboardStats()');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Calcul des stats globales comme le fait getDashboardStats():\n');

    let totalPhotos = 0;
    let downloadedPhotos = 0;
    let errorPhotos = 0;

    for (const participant of participants) {
      const stats = await query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as downloaded,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
        FROM photos
        WHERE participant_id = ?
      `, [participant.id]);

      const s = stats[0];
      totalPhotos += s.total || 0;
      downloadedPhotos += s.downloaded || 0;
      errorPhotos += s.errors || 0;
    }

    const pendingPhotos = totalPhotos - downloadedPhotos - errorPhotos;

    console.log('📈 Résultat final:');
    console.log(`   Total photos:        ${totalPhotos}`);
    console.log(`   Photos téléchargées: ${downloadedPhotos}  ← C'est ce chiffre qui s'affiche`);
    console.log(`   En attente:          ${pendingPhotos}`);
    console.log(`   Erreurs:             ${errorPhotos}`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 Diagnostic Final');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (downloadedPhotos === 0 && total > 0) {
      console.log('🔴 PROBLÈME IDENTIFIÉ:');
      console.log('   La table photos contient des photos, mais AUCUNE n\'a status = \'complete\'\n');
      
      console.log('💡 Causes possibles:');
      if (participants.length === 0) {
        console.log('   1. ❌ Aucun participant → les photos ne sont pas liées');
        console.log('      → Attendre la synchronisation API\n');
      }
      
      const pendingCount = statusStats.find(s => s.status === 'pending')?.count || 0;
      if (pendingCount > 0) {
        console.log(`   2. ⏳ ${pendingCount} photos en attente de téléchargement`);
        console.log('      → Vérifier que le service de téléchargement est actif');
        console.log('      → Vérifier les logs: [PhotoDownload] dans la console\n');
      }
      
      const errorCount = statusStats.find(s => s.status === 'error')?.count || 0;
      if (errorCount > 0) {
        console.log(`   3. ❌ ${errorCount} photos en erreur`);
        console.log('      → Vérifier les URLs des photos');
        console.log('      → Vérifier la connectivité réseau\n');
      }

      console.log('🔧 Solutions recommandées:');
      console.log('   1. Attendre 30-60 secondes pour que les téléchargements se terminent');
      console.log('   2. Vérifier les logs du service de téléchargement');
      console.log('   3. Tester manuellement une URL de photo');
      console.log('   4. Forcer un re-téléchargement depuis l\'admin\n');
      
    } else if (downloadedPhotos > 0) {
      console.log('✅ TOUT EST NORMAL:');
      console.log(`   ${downloadedPhotos} photos sont bien téléchargées`);
      console.log('   et devraient s\'afficher sur la page d\'accueil.\n');
      
      console.log('💡 Si les stats affichent encore 0 sur la page:');
      console.log('   1. Rafraîchir la page (Ctrl+R ou Cmd+R)');
      console.log('   2. Vérifier que le handler IPC fonctionne:');
      console.log('      → F12 → Console → Taper:');
      console.log('      → await window.photoAPI.admin.getDashboard()');
      console.log('   3. Vérifier les logs dans la console Electron (main process)\n');
      
    } else {
      console.log('⚠️  Base de données vide ou en cours d\'initialisation\n');
    }

  } catch (error) {
    console.error('\n❌ Erreur pendant le diagnostic:', error.message);
    console.error(error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Erreur fermeture DB:', err.message);
      }
      console.log('═══════════════════════════════════════════════════');
      console.log('Diagnostic terminé');
      console.log('═══════════════════════════════════════════════════\n');
    });
  }
}

// Exécuter le diagnostic
runDiagnostic();
