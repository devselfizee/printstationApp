/**
 * db-viewer.js - Outil pour explorer la DB SQLite
 * 
 * Usage: node db-viewer.js [command] [options]
 * 
 * Commands:
 *   list-participants    - Affiche tous les participants
 *   list-photos [participantId] - Affiche les photos d'un participant
 *   list-universes      - Affiche tous les univers
 *   stats               - Affiche les stats globales
 *   export [format]     - Exporte les données (json, csv)
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

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

const DB_PATH = path.join(getDataDir(), 'data.db');

console.log(`📁 DB Path: ${DB_PATH}`);

// Vérifier que la DB existe
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ DB non trouvée: ${DB_PATH}`);
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);

// ============================================
// HELPERS
// ============================================

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function printTable(data) {
  if (!data || data.length === 0) {
    console.log('  (aucunes données)');
    return;
  }

  const keys = Object.keys(data[0]);
  const colWidths = keys.map(k => Math.max(k.length, 15));

  // Header
  const header = keys.map((k, i) => k.padEnd(colWidths[i])).join(' | ');
  console.log('  ' + header);
  console.log('  ' + '-'.repeat(header.length));

  // Rows
  data.forEach(row => {
    const values = keys.map((k, i) => {
      const val = String(row[k] || '').substring(0, colWidths[i]);
      return val.padEnd(colWidths[i]);
    });
    console.log('  ' + values.join(' | '));
  });
}

// ============================================
// COMMANDS
// ============================================

async function listParticipants() {
  console.log('\n📋 Participants:\n');
  const data = await runQuery('SELECT * FROM participants');
  printTable(data);
  console.log(`\n  ✅ Total: ${data.length} participants`);
}

async function listPhotos(participantId) {
  if (!participantId) {
    console.log('❌ Veuillez spécifier un participantId');
    process.exit(1);
  }

  console.log(`\n📸 Photos du participant: ${participantId}\n`);
  const data = await runQuery(
    'SELECT id, file_name, status, checksum, size_bytes, downloaded_at FROM photos WHERE participant_id = ?',
    [participantId]
  );
  printTable(data);
  console.log(`\n  ✅ Total: ${data.length} photos`);
}

async function listUniverses() {
  console.log('\n🌍 Univers:\n');
  const data = await runQuery('SELECT * FROM universes');
  printTable(data);
  console.log(`\n  ✅ Total: ${data.length} univers`);
}

async function showStats() {
  console.log('\n📊 Stats Globales:\n');

  const universes = await runQuery('SELECT COUNT(*) as count FROM universes');
  const participants = await runQuery('SELECT COUNT(*) as count FROM participants');
  const photos = await runQuery(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as downloaded,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
      SUM(size_bytes) as total_bytes
    FROM photos
  `);

  console.log(`  Univers: ${universes[0].count}`);
  console.log(`  Participants: ${participants[0].count}`);
  console.log(`  Photos totales: ${photos[0].total || 0}`);
  console.log(`  Téléchargées: ${photos[0].downloaded || 0}`);
  console.log(`  En attente: ${photos[0].pending || 0}`);
  console.log(`  Erreurs: ${photos[0].errors || 0}`);
  console.log(`  Taille totale: ${Math.round((photos[0].total_bytes || 0) / 1024 / 1024)} MB`);
}

async function exportData(format = 'json') {
  console.log(`\n💾 Export en ${format.toUpperCase()}:\n`);

  const universes = await runQuery('SELECT * FROM universes');
  const participants = await runQuery('SELECT * FROM participants');
  const photos = await runQuery('SELECT * FROM photos');

  const data = {
    timestamp: new Date().toISOString(),
    universes,
    participants,
    photos,
  };

  if (format === 'json') {
    const json = JSON.stringify(data, null, 2);
    const filename = `export_${Date.now()}.json`;
    fs.writeFileSync(filename, json);
    console.log(`  ✅ Exporté: ${filename}`);
  } else if (format === 'csv') {
    // Universes CSV
    const universesCSV = [Object.keys(universes[0] || {})].concat(
      universes.map(u => Object.values(u))
    ).map(row => row.join(',')).join('\n');

    fs.writeFileSync('export_universes.csv', universesCSV);

    // Participants CSV
    const participantsCSV = [Object.keys(participants[0] || {})].concat(
      participants.map(p => Object.values(p))
    ).map(row => row.join(',')).join('\n');

    fs.writeFileSync('export_participants.csv', participantsCSV);

    // Photos CSV
    const photosCSV = [Object.keys(photos[0] || {})].concat(
      photos.map(p => Object.values(p))
    ).map(row => row.join(',')).join('\n');

    fs.writeFileSync('export_photos.csv', photosCSV);

    console.log('  ✅ Exportés: export_universes.csv, export_participants.csv, export_photos.csv');
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];

  try {
    switch (command) {
      case 'list-participants':
        await listParticipants();
        break;
      case 'list-photos':
        await listPhotos(arg1);
        break;
      case 'list-universes':
        await listUniverses();
        break;
      case 'stats':
        await showStats();
        break;
      case 'export':
        await exportData(arg1 || 'json');
        break;
      default:
        console.log(`
Usage: node db-viewer.js [command]

Commands:
  list-participants     - Affiche tous les participants
  list-photos [id]      - Affiche les photos d'un participant
  list-universes        - Affiche tous les univers
  stats                 - Affiche les stats
  export [json|csv]     - Exporte les données

Example:
  node db-viewer.js list-participants
  node db-viewer.js list-photos participant_123
  node db-viewer.js export csv
        `);
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }

  db.close();
}

main();