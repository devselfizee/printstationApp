/**
 * Script de Migration - Ajout de session_id dans order_items
 * 
 * Ce script ajoute la colonne session_id à la table order_items
 * si elle n'existe pas déjà.
 * 
 * Usage: node migration_add_sessionid.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Configuration
const DB_PATH = path.join(__dirname, 'data', 'printstation.db');

console.log('='.repeat(60));
console.log('🔄 Migration: Ajout de session_id dans order_items');
console.log('='.repeat(60));
console.log(`📁 Base de données: ${DB_PATH}`);

// Vérifier que la base existe
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ La base de données n\'existe pas:', DB_PATH);
  console.log('💡 Lancez l\'application une première fois pour créer la base');
  process.exit(1);
}

// Créer une sauvegarde
const backupPath = `${DB_PATH}.backup.${Date.now()}`;
try {
  fs.copyFileSync(DB_PATH, backupPath);
  console.log('✅ Sauvegarde créée:', backupPath);
} catch (error) {
  console.error('❌ Erreur création sauvegarde:', error.message);
  process.exit(1);
}

// Fonction de migration
async function migrateDatabase() {
  const db = new sqlite3.Database(DB_PATH);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('\n⏳ Vérification de la structure actuelle...');
      
      // 1. Vérifier si la colonne existe
      db.all(`PRAGMA table_info(order_items)`, (err, columns) => {
        if (err) {
          console.error('❌ Erreur lecture structure:', err.message);
          reject(err);
          return;
        }

        console.log(`📊 Colonnes actuelles: ${columns.length}`);
        columns.forEach(col => {
          console.log(`   - ${col.name} (${col.type})`);
        });

        const hasSessionId = columns.some(col => col.name === 'session_id');

        if (hasSessionId) {
          console.log('\n✅ La colonne session_id existe déjà!');
          console.log('🎉 Aucune migration nécessaire');
          db.close();
          resolve({ alreadyExists: true });
          return;
        }

        console.log('\n⏳ Ajout de la colonne session_id...');

        // 2. Ajouter la colonne
        db.run(`ALTER TABLE order_items ADD COLUMN session_id TEXT`, (err) => {
          if (err) {
            console.error('❌ Erreur ajout colonne:', err.message);
            reject(err);
            return;
          }

          console.log('✅ Colonne session_id ajoutée');

          // 3. Créer l'index
          console.log('⏳ Création de l\'index...');
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_order_items_session 
            ON order_items(session_id)
          `, (err) => {
            if (err) {
              console.warn('⚠️  Erreur création index:', err.message);
            } else {
              console.log('✅ Index créé');
            }

            // 4. Vérifier le résultat
            console.log('\n⏳ Vérification de la migration...');
            db.all(`PRAGMA table_info(order_items)`, (err, newColumns) => {
              if (err) {
                console.error('❌ Erreur vérification:', err.message);
                reject(err);
                return;
              }

              const sessionIdCol = newColumns.find(col => col.name === 'session_id');
              
              if (sessionIdCol) {
                console.log('✅ Migration réussie!');
                console.log(`   session_id: ${sessionIdCol.type} ${sessionIdCol.notnull ? 'NOT NULL' : 'NULL'}`);
                
                // 5. Compter les enregistrements
                db.get(`SELECT COUNT(*) as count FROM order_items`, (err, row) => {
                  if (err) {
                    console.warn('⚠️  Impossible de compter les enregistrements');
                  } else {
                    console.log(`📊 Enregistrements existants: ${row.count}`);
                    if (row.count > 0) {
                      console.log('⚠️  Note: Les enregistrements existants ont session_id = NULL');
                      console.log('   Ils devront être associés manuellement à une session');
                    }
                  }

                  db.close();
                  resolve({ success: true, recordsCount: row ? row.count : 0 });
                });
              } else {
                console.error('❌ La colonne n\'a pas été ajoutée!');
                reject(new Error('Migration échouée'));
              }
            });
          });
        });
      });
    });

    // Gestion des erreurs de la base
    db.on('error', (err) => {
      console.error('❌ Erreur base de données:', err.message);
      reject(err);
    });
  });
}

// Exécuter la migration
console.log('\n🚀 Démarrage de la migration...\n');

migrateDatabase()
  .then((result) => {
    console.log('\n' + '='.repeat(60));
    if (result.alreadyExists) {
      console.log('🎉 Base de données déjà à jour!');
    } else {
      console.log('🎉 Migration terminée avec succès!');
      console.log('\n📝 Prochaines étapes:');
      console.log('   1. Testez l\'application: npm start');
      console.log('   2. Vérifiez que l\'ajout au panier fonctionne');
      console.log('   3. Si problème, restaurez: cp ' + backupPath + ' ' + DB_PATH);
    }
    console.log('='.repeat(60));
    process.exit(0);
  })
  .catch((err) => {
    console.log('\n' + '='.repeat(60));
    console.error('💥 Erreur lors de la migration!');
    console.error('Détails:', err.message);
    console.log('\n🔄 Pour restaurer la sauvegarde:');
    console.log(`   cp ${backupPath} ${DB_PATH}`);
    console.log('='.repeat(60));
    process.exit(1);
  });
