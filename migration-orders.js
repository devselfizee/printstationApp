/**
 * migration-orders.js
 * 
 * Script de migration pour ajouter les tables de gestion des commandes
 * 
 * Usage: node migration-orders.js
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
console.log('🔄 Migration: Ajout des Tables de Commandes');
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
 * Vérifier si une table existe
 */
function tableExists(tableName) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(!!row);
      }
    );
  });
}

/**
 * Créer les tables de commandes
 */
async function createOrdersTables() {
  const queries = [
    // Table orders
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY(participant_id) REFERENCES participants(id),
      FOREIGN KEY(universe_id) REFERENCES universes(id)
    )`,

    // Table order_items
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      photo_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      incrustation_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(photo_id) REFERENCES photos(id)
    )`,

    // Table order_status_history
    `CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )`,

    // Index pour orders
    `CREATE INDEX IF NOT EXISTS idx_orders_participant ON orders(participant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`,

    // Index pour order_items
    `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_photo ON order_items(photo_id)`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status)`,

    // Index pour order_status_history
    `CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id)`
  ];

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
}

/**
 * Exécuter la migration
 */
async function runMigration() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 1: Vérification des tables');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const ordersExists = await tableExists('orders');
    const orderItemsExists = await tableExists('order_items');
    const historyExists = await tableExists('order_status_history');

    console.log(`Table orders: ${ordersExists ? '✅ existe' : '⚠️  n\'existe pas'}`);
    console.log(`Table order_items: ${orderItemsExists ? '✅ existe' : '⚠️  n\'existe pas'}`);
    console.log(`Table order_status_history: ${historyExists ? '✅ existe' : '⚠️  n\'existe pas'}`);

    if (ordersExists && orderItemsExists && historyExists) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Toutes les tables existent déjà');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 2: Création des tables et index');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔄 Création en cours...\n');

    await createOrdersTables();

    console.log('✅ Table orders créée');
    console.log('✅ Table order_items créée');
    console.log('✅ Table order_status_history créée');
    console.log('✅ Index créés\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Étape 3: Vérification finale');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const verifyOrders = await tableExists('orders');
    const verifyItems = await tableExists('order_items');
    const verifyHistory = await tableExists('order_status_history');

    if (verifyOrders && verifyItems && verifyHistory) {
      console.log('✅ Table orders confirmée');
      console.log('✅ Table order_items confirmée');
      console.log('✅ Table order_status_history confirmée\n');
    } else {
      console.log('❌ Erreur: Une ou plusieurs tables n\'ont pas été créées\n');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration terminée avec succès');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📝 Résumé:');
    console.log('   - 3 nouvelles tables créées');
    console.log('   - 7 index ajoutés pour optimisation');
    console.log('   - Système de commandes opérationnel\n');

    console.log('📚 Documentation:');
    console.log('   - Voir SYSTEME-COMMANDES.md pour l\'utilisation\n');

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
