#!/usr/bin/env node
/**
 * test-console.js - Console de diagnostic interactive pour PrintStation
 *
 * Usage: node test-console.js
 *
 * Tests:
 * - Base de données SQLite (connexion, tables, données)
 * - Configuration machine (kiosk_id, sales_point_id)
 * - API Supabase (authentification, connexion)
 * - Statistiques complètes
 * - Photos et téléchargements
 * - Commandes et synchronisation
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

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

// Charger les variables d'environnement
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');

  const envFile = fs.existsSync(envPath) ? envPath : envExamplePath;

  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}

loadEnv();

// ============================================
// COULEURS TERMINAL
// ============================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const c = {
  ok: (t) => `${colors.green}${t}${colors.reset}`,
  err: (t) => `${colors.red}${t}${colors.reset}`,
  warn: (t) => `${colors.yellow}${t}${colors.reset}`,
  info: (t) => `${colors.cyan}${t}${colors.reset}`,
  title: (t) => `${colors.bright}${colors.blue}${t}${colors.reset}`,
  dim: (t) => `${colors.dim}${t}${colors.reset}`,
  highlight: (t) => `${colors.bright}${colors.magenta}${t}${colors.reset}`,
};

// ============================================
// HELPERS
// ============================================

function log(msg = '') { console.log(msg); }
function separator(char = '─', len = 60) { log(c.dim(char.repeat(len))); }
function header(title) {
  log('');
  log(c.title('═'.repeat(60)));
  log(c.title(`  ${title}`));
  log(c.title('═'.repeat(60)));
}

function table(data, columns) {
  if (!data || data.length === 0) {
    log(c.dim('  (aucune donnée)'));
    return;
  }

  // Calculer les largeurs de colonnes
  const widths = {};
  columns.forEach(col => {
    widths[col] = Math.max(col.length, ...data.map(row => String(row[col] ?? '').length));
  });

  // En-tête
  const headerLine = columns.map(col => col.padEnd(widths[col])).join(' | ');
  log(c.info(`  ${headerLine}`));
  log(c.dim(`  ${columns.map(col => '─'.repeat(widths[col])).join('─┼─')}`));

  // Données
  data.forEach(row => {
    const line = columns.map(col => String(row[col] ?? '').padEnd(widths[col])).join(' | ');
    log(`  ${line}`);
  });
}

// ============================================
// DATABASE HELPERS
// ============================================

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DB_PATH)) {
      reject(new Error(`Base de données non trouvée: ${DB_PATH}`));
      return;
    }

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function closeDB() {
  return new Promise((resolve) => {
    if (db) {
      db.close(() => resolve());
      db = null;
    } else {
      resolve();
    }
  });
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function queryOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ============================================
// TESTS
// ============================================

async function testDatabase() {
  header('TEST BASE DE DONNEES');

  log(`\n${c.info('Chemin:')} ${DB_PATH}`);
  log(`${c.info('Plateforme:')} ${process.platform}`);

  try {
    // Vérifier si le fichier existe
    if (!fs.existsSync(DB_PATH)) {
      log(`\n${c.err('ERREUR:')} La base de données n'existe pas.`);
      log(c.dim('Lancez l\'application pour la créer automatiquement.'));
      return false;
    }

    const stats = fs.statSync(DB_PATH);
    log(`${c.info('Taille:')} ${(stats.size / 1024).toFixed(2)} KB`);

    await openDB();
    log(`\n${c.ok('OK')} Connexion établie`);

    // Lister les tables
    const tables = await query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    log(`\n${c.info('Tables trouvées:')} ${tables.length}`);

    const expectedTables = ['universes', 'participants', 'photos', 'orders', 'order_items', 'machine_config'];
    for (const expected of expectedTables) {
      const found = tables.some(t => t.name === expected);
      log(`  ${found ? c.ok('✓') : c.err('✗')} ${expected}`);
    }

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testMachineConfig() {
  header('CONFIGURATION MACHINE');

  try {
    const config = await queryOne('SELECT * FROM machine_config WHERE id = 1');

    if (!config) {
      log(`\n${c.warn('ATTENTION:')} Aucune configuration trouvée.`);
      log(c.dim('La configuration sera demandée au premier démarrage.'));
      return false;
    }

    log(`\n${c.info('Configuration actuelle:')}`);
    log(`  Kiosk ID:       ${c.highlight(config.kiosk_id || 'non défini')}`);
    log(`  Sales Point ID: ${c.highlight(config.sales_point_id || 'non défini')}`);
    log(`  Nom machine:    ${config.machine_name || c.dim('(non défini)')}`);
    log(`  TVA:            ${config.tva || 20}%`);
    log(`  Setup terminé:  ${config.setup_completed ? c.ok('Oui') : c.err('Non')}`);

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testUniverses() {
  header('UNIVERS');

  try {
    const universes = await query('SELECT * FROM universes');

    if (universes.length === 0) {
      log(`\n${c.warn('ATTENTION:')} Aucun univers trouvé.`);
      return false;
    }

    log(`\n${c.ok(universes.length)} univers trouvés:\n`);

    for (const u of universes) {
      const participantCount = await queryOne(
        'SELECT COUNT(*) as count FROM participants WHERE universe_id = ?',
        [u.id]
      );
      const photoCount = await queryOne(
        `SELECT COUNT(*) as count FROM photos p
         INNER JOIN participants part ON p.participant_id = part.id
         WHERE part.universe_id = ?`,
        [u.id]
      );

      log(`  ${c.highlight(u.id)} - ${u.name}`);
      log(`     Status: ${u.status === 'active' ? c.ok('actif') : c.dim(u.status)}`);
      log(`     Participants: ${participantCount?.count || 0}`);
      log(`     Photos: ${photoCount?.count || 0}`);
      log('');
    }

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testPhotos() {
  header('PHOTOS');

  try {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as downloaded,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN status = 'downloading' THEN 1 ELSE 0 END) as downloading
      FROM photos
    `);

    if (!stats || stats.total === 0) {
      log(`\n${c.warn('ATTENTION:')} Aucune photo trouvée.`);
      log(c.dim('Les photos seront synchronisées au prochain cycle.'));
      return false;
    }

    const completionRate = Math.round((stats.downloaded / stats.total) * 100);

    log(`\n${c.info('Statistiques photos:')}\n`);
    log(`  Total:         ${c.highlight(stats.total)}`);
    log(`  Téléchargées:  ${c.ok(stats.downloaded)} (${completionRate}%)`);
    log(`  En attente:    ${stats.pending > 0 ? c.warn(stats.pending) : c.dim('0')}`);
    log(`  En cours:      ${stats.downloading > 0 ? c.info(stats.downloading) : c.dim('0')}`);
    log(`  Erreurs:       ${stats.errors > 0 ? c.err(stats.errors) : c.dim('0')}`);

    // Vérifier les erreurs récentes
    if (stats.errors > 0) {
      log(`\n${c.warn('Photos en erreur (5 dernières):')}\n`);
      const errorPhotos = await query(
        `SELECT id, participant_id, last_error, retry_count, corruption_count
         FROM photos WHERE status = 'error'
         ORDER BY created_at DESC LIMIT 5`
      );
      table(errorPhotos, ['id', 'participant_id', 'last_error']);
    }

    // Progression bar visuelle
    const barLen = 40;
    const filled = Math.round((stats.downloaded / stats.total) * barLen);
    const bar = c.ok('█'.repeat(filled)) + c.dim('░'.repeat(barLen - filled));
    log(`\n  Progression: [${bar}] ${completionRate}%`);

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testOrders() {
  header('COMMANDES');

  try {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN synced_to_remote = 1 THEN 1 ELSE 0 END) as synced,
        SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END) as revenue
      FROM orders
    `);

    if (!stats || stats.total === 0) {
      log(`\n${c.dim('Aucune commande trouvée.')}`);
      return true;
    }

    log(`\n${c.info('Statistiques commandes:')}\n`);
    log(`  Total:      ${c.highlight(stats.total)}`);
    log(`  En attente: ${stats.pending || 0}`);
    log(`  En cours:   ${stats.processing || 0}`);
    log(`  Terminées:  ${c.ok(stats.completed || 0)}`);
    log(`  Annulées:   ${stats.cancelled > 0 ? c.warn(stats.cancelled) : c.dim('0')}`);
    log(`  Synchro:    ${stats.synced || 0}/${stats.total}`);
    log(`\n  ${c.info('Revenu total:')} ${c.highlight((stats.revenue || 0).toFixed(2) + ' EUR')}`);

    // Dernières commandes
    const recentOrders = await query(
      `SELECT id, participant_id, status, final_amount, synced_to_remote, created_at
       FROM orders ORDER BY created_at DESC LIMIT 5`
    );

    if (recentOrders.length > 0) {
      log(`\n${c.info('Dernières commandes:')}\n`);
      table(recentOrders.map(o => ({
        id: o.id.substring(0, 8) + '...',
        status: o.status,
        montant: o.final_amount?.toFixed(2) + ' EUR',
        sync: o.synced_to_remote ? 'Oui' : 'Non',
        date: o.created_at?.substring(0, 16)
      })), ['id', 'status', 'montant', 'sync', 'date']);
    }

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testSupabaseConnection() {
  header('CONNEXION SUPABASE');

  const apiUrl = process.env.API_AUTH_URL;
  const email = process.env.API_AUTH_EMAIL;
  const password = process.env.API_AUTH_PASSWORD;
  const anonKey = process.env.API_SUPABASE_ANON_KEY;

  log(`\n${c.info('Configuration:')}`);
  log(`  Auth URL:  ${apiUrl ? c.ok('configuré') : c.err('manquant')}`);
  log(`  Email:     ${email ? c.ok(email) : c.err('manquant')}`);
  log(`  Password:  ${password ? c.ok('***') : c.err('manquant')}`);
  log(`  Anon Key:  ${anonKey ? c.ok(anonKey.substring(0, 20) + '...') : c.err('manquant')}`);

  if (!apiUrl || !email || !password || !anonKey) {
    log(`\n${c.warn('ATTENTION:')} Configuration Supabase incomplète.`);
    log(c.dim('Vérifiez le fichier .env'));
    return false;
  }

  try {
    log(`\n${c.info('Test d\'authentification...')}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok && data.access_token) {
      log(`${c.ok('OK')} Authentification réussie`);
      log(`  Token: ${data.access_token.substring(0, 30)}...`);
      log(`  Expire dans: ${data.expires_in} secondes`);
      return true;
    } else {
      log(`${c.err('ERREUR')} Authentification échouée`);
      log(`  Code: ${response.status}`);
      log(`  Message: ${data.error_description || data.error || JSON.stringify(data)}`);
      return false;
    }
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testPhotoApi() {
  header('API PHOTOS');

  const apiUrl = process.env.PHOTO_API_URL;

  log(`\n${c.info('URL configurée:')} ${apiUrl || c.err('non défini')}`);

  if (!apiUrl) {
    log(`\n${c.warn('ATTENTION:')} PHOTO_API_URL non configuré dans .env`);
    return false;
  }

  try {
    log(`\n${c.info('Test de connexion...')}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      log(`${c.ok('OK')} API accessible (status ${response.status})`);
      const contentType = response.headers.get('content-type');
      log(`  Content-Type: ${contentType}`);
      return true;
    } else {
      log(`${c.warn('ATTENTION')} API répond avec status ${response.status}`);
      return false;
    }
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    log(c.dim('L\'API n\'est peut-être pas accessible depuis ce réseau.'));
    return false;
  }
}

async function testCartItems() {
  header('PANIER (ORDER_ITEMS)');

  try {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        COUNT(DISTINCT session_id) as sessions
      FROM order_items
    `);

    if (!stats || stats.total === 0) {
      log(`\n${c.dim('Aucun item de panier trouvé.')}`);
      return true;
    }

    log(`\n${c.info('Statistiques items:')}\n`);
    log(`  Total items:  ${c.highlight(stats.total)}`);
    log(`  En attente:   ${stats.pending || 0}`);
    log(`  Validés:      ${c.ok(stats.completed || 0)}`);
    log(`  Annulés:      ${stats.cancelled > 0 ? c.warn(stats.cancelled) : c.dim('0')}`);
    log(`  Sessions:     ${stats.sessions || 0}`);

    // Produits les plus vendus
    const topProducts = await query(`
      SELECT product_name, SUM(quantity) as qty, COUNT(*) as orders
      FROM order_items
      WHERE status = 'completed'
      GROUP BY product_id
      ORDER BY qty DESC
      LIMIT 5
    `);

    if (topProducts.length > 0) {
      log(`\n${c.info('Top produits (validés):')}\n`);
      table(topProducts, ['product_name', 'qty', 'orders']);
    }

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testEnvConfig() {
  header('CONFIGURATION ENV');

  const envPath = path.join(__dirname, '.env');
  const envExists = fs.existsSync(envPath);

  log(`\n${c.info('Fichier .env:')} ${envExists ? c.ok('trouvé') : c.warn('utilise .env.example')}`);

  const config = {
    NODE_ENV: process.env.NODE_ENV,
    PHOTO_API_URL: process.env.PHOTO_API_URL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? '***' : null,
    SYNC_INTERVAL_MS: process.env.SYNC_INTERVAL_MS,
    INACTIVITY_TIMEOUT_MS: process.env.INACTIVITY_TIMEOUT_MS,
    ORDER_SYNC_API_URL: process.env.ORDER_SYNC_API_URL,
    ENABLE_API_SYNC: process.env.ENABLE_API_SYNC,
    SALES_POINT_ID: process.env.SALES_POINT_ID,
    KIOSK_ID: process.env.KIOSK_ID,
  };

  log(`\n${c.info('Variables d\'environnement:')}\n`);

  for (const [key, value] of Object.entries(config)) {
    const status = value ? c.ok('✓') : c.warn('○');
    const display = value || c.dim('(non défini)');
    log(`  ${status} ${key}: ${display}`);
  }

  return true;
}

async function testSyncLog() {
  header('LOGS DE SYNCHRONISATION');

  try {
    const logs = await query(`
      SELECT * FROM sync_log
      ORDER BY synced_at DESC
      LIMIT 10
    `);

    if (logs.length === 0) {
      log(`\n${c.dim('Aucun log de synchronisation trouvé.')}`);
      return true;
    }

    log(`\n${c.info('Dernières synchronisations:')}\n`);

    table(logs.map(l => ({
      univers: l.universe_id || '-',
      participant: l.participant_id ? l.participant_id.substring(0, 8) + '...' : '-',
      checked: l.photos_checked || 0,
      added: l.photos_added || 0,
      failed: l.photos_failed || 0,
      date: l.synced_at?.substring(0, 16)
    })), ['univers', 'participant', 'checked', 'added', 'failed', 'date']);

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

async function testFileSystem() {
  header('SYSTEME DE FICHIERS');

  log(`\n${c.info('Dossier données:')} ${DATA_DIR}`);

  if (!fs.existsSync(DATA_DIR)) {
    log(`${c.warn('ATTENTION:')} Le dossier n'existe pas encore.`);
    log(c.dim('Il sera créé au premier démarrage de l\'application.'));
    return false;
  }

  try {
    const files = fs.readdirSync(DATA_DIR);
    log(`${c.ok('OK')} Dossier accessible\n`);

    log(`${c.info('Contenu:')}`);

    let totalSize = 0;
    const fileList = [];

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        const subFiles = fs.readdirSync(filePath);
        fileList.push({
          name: `${file}/`,
          type: 'dossier',
          size: `${subFiles.length} fichiers`
        });
      } else {
        totalSize += stat.size;
        fileList.push({
          name: file,
          type: 'fichier',
          size: `${(stat.size / 1024).toFixed(1)} KB`
        });
      }
    }

    table(fileList, ['name', 'type', 'size']);

    log(`\n${c.info('Taille totale:')} ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    // Compter les photos téléchargées
    const photoDir = path.join(DATA_DIR, 'photos');
    if (fs.existsSync(photoDir)) {
      const universes = fs.readdirSync(photoDir);
      let totalPhotos = 0;

      for (const universe of universes) {
        const universePath = path.join(photoDir, universe);
        if (fs.statSync(universePath).isDirectory()) {
          const participants = fs.readdirSync(universePath);
          for (const participant of participants) {
            const participantPath = path.join(universePath, participant);
            if (fs.statSync(participantPath).isDirectory()) {
              const photos = fs.readdirSync(participantPath);
              totalPhotos += photos.filter(f => f.endsWith('.jpg') || f.endsWith('.png')).length;
            }
          }
        }
      }

      log(`${c.info('Photos sur disque:')} ${totalPhotos}`);
    }

    return true;
  } catch (error) {
    log(`\n${c.err('ERREUR:')} ${error.message}`);
    return false;
  }
}

// ============================================
// MENU INTERACTIF
// ============================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function showMenu() {
  log('');
  separator('═');
  log(c.title('  CONSOLE DE DIAGNOSTIC PRINTSTATION'));
  separator('═');
  log('');
  log('  ' + c.highlight('1') + '  Test complet (tous les tests)');
  log('  ' + c.highlight('2') + '  Base de données');
  log('  ' + c.highlight('3') + '  Configuration machine');
  log('  ' + c.highlight('4') + '  Univers');
  log('  ' + c.highlight('5') + '  Photos');
  log('  ' + c.highlight('6') + '  Commandes');
  log('  ' + c.highlight('7') + '  Connexion Supabase');
  log('  ' + c.highlight('8') + '  API Photos');
  log('  ' + c.highlight('9') + '  Système de fichiers');
  log('  ' + c.highlight('10') + ' Variables d\'environnement');
  log('  ' + c.highlight('11') + ' Logs de synchronisation');
  log('  ' + c.highlight('12') + ' Panier (order_items)');
  log('');
  log('  ' + c.dim('q') + '  Quitter');
  log('');
  separator();

  const choice = await prompt(c.info('  Choix: '));
  return choice.toLowerCase();
}

async function runAllTests() {
  const results = [];

  log('\n' + c.info('Lancement de tous les tests...\n'));

  // Tests DB
  let dbOk = false;
  try {
    dbOk = await testDatabase();
    results.push({ test: 'Base de données', ok: dbOk });
  } catch (e) {
    results.push({ test: 'Base de données', ok: false });
  }

  if (dbOk) {
    try {
      results.push({ test: 'Configuration machine', ok: await testMachineConfig() });
    } catch (e) { results.push({ test: 'Configuration machine', ok: false }); }

    try {
      results.push({ test: 'Univers', ok: await testUniverses() });
    } catch (e) { results.push({ test: 'Univers', ok: false }); }

    try {
      results.push({ test: 'Photos', ok: await testPhotos() });
    } catch (e) { results.push({ test: 'Photos', ok: false }); }

    try {
      results.push({ test: 'Commandes', ok: await testOrders() });
    } catch (e) { results.push({ test: 'Commandes', ok: false }); }

    try {
      results.push({ test: 'Panier', ok: await testCartItems() });
    } catch (e) { results.push({ test: 'Panier', ok: false }); }

    try {
      results.push({ test: 'Logs sync', ok: await testSyncLog() });
    } catch (e) { results.push({ test: 'Logs sync', ok: false }); }
  }

  // Tests réseau
  try {
    results.push({ test: 'Supabase', ok: await testSupabaseConnection() });
  } catch (e) { results.push({ test: 'Supabase', ok: false }); }

  try {
    results.push({ test: 'API Photos', ok: await testPhotoApi() });
  } catch (e) { results.push({ test: 'API Photos', ok: false }); }

  // Tests fichiers
  try {
    results.push({ test: 'Fichiers', ok: await testFileSystem() });
  } catch (e) { results.push({ test: 'Fichiers', ok: false }); }

  try {
    results.push({ test: 'Env config', ok: await testEnvConfig() });
  } catch (e) { results.push({ test: 'Env config', ok: false }); }

  // Résumé
  header('RESUME');
  log('');

  const passed = results.filter(r => r.ok).length;
  const total = results.length;

  for (const r of results) {
    log(`  ${r.ok ? c.ok('✓') : c.err('✗')} ${r.test}`);
  }

  log('');
  separator();

  if (passed === total) {
    log(c.ok(`  TOUS LES TESTS PASSES (${passed}/${total})`));
  } else if (passed > total / 2) {
    log(c.warn(`  ${passed}/${total} tests passés`));
  } else {
    log(c.err(`  ${passed}/${total} tests passés`));
  }

  separator();
}

async function main() {
  console.clear();
  log(c.title('\n  PrintStation - Console de Diagnostic v1.0\n'));

  let running = true;

  while (running) {
    const choice = await showMenu();

    // S'assurer que la DB est ouverte pour les tests qui en ont besoin
    const needsDB = ['1', '2', '3', '4', '5', '6', '11', '12'].includes(choice);

    if (needsDB && !db) {
      try {
        await openDB();
      } catch (e) {
        if (choice !== '1') {
          log(`\n${c.err('ERREUR:')} Impossible d'ouvrir la base de données.`);
          log(c.dim(e.message));
          continue;
        }
      }
    }

    switch (choice) {
      case '1':
        await runAllTests();
        break;
      case '2':
        await testDatabase();
        break;
      case '3':
        await testMachineConfig();
        break;
      case '4':
        await testUniverses();
        break;
      case '5':
        await testPhotos();
        break;
      case '6':
        await testOrders();
        break;
      case '7':
        await testSupabaseConnection();
        break;
      case '8':
        await testPhotoApi();
        break;
      case '9':
        await testFileSystem();
        break;
      case '10':
        await testEnvConfig();
        break;
      case '11':
        await testSyncLog();
        break;
      case '12':
        await testCartItems();
        break;
      case 'q':
      case 'quit':
      case 'exit':
        running = false;
        break;
      default:
        log(c.warn('\n  Choix invalide.'));
    }

    if (running && choice !== 'q') {
      await prompt(c.dim('\n  Appuyez sur Entrée pour continuer...'));
    }
  }

  await closeDB();
  rl.close();

  log(c.dim('\n  Au revoir!\n'));
}

// Lancer
main().catch(console.error);
