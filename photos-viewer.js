/**
 * photos-viewer.js - Viewer pour les photos téléchargées
 * 
 * Usage: node photos-viewer.js [command] [participantId]
 * 
 * Commands:
 *   list              - Liste tous les dossiers de photos
 *   list [participantId] - Liste les photos d'un participant
 *   open [participantId] - Ouvre le dossier dans l'explorateur
 *   info [participantId] - Affiche les infos détaillées
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';

function getPhotosDir() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return path.join('C:', 'PrintStationApp', 'Medias', 'photos', 'by_participant');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Documents', 'PrintStationApp', 'Medias', 'photos', 'by_participant');
  } else {
    return path.join(os.homedir(), '.PrintStationApp', 'Medias', 'photos', 'by_participant');
  }
}

const PHOTOS_DIR = getPhotosDir();

console.log(`\n📁 Dossier photos: ${PHOTOS_DIR}\n`);

// Vérifier que le dossier existe
if (!fs.existsSync(PHOTOS_DIR)) {
  console.error(`❌ Dossier non trouvé: ${PHOTOS_DIR}`);
  process.exit(1);
}

// ============================================
// HELPERS
// ============================================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getFileStats(filepath) {
  try {
    const stat = fs.statSync(filepath);
    return {
      size: stat.size,
      created: stat.birthtime,
      modified: stat.mtime,
    };
  } catch (e) {
    return null;
  }
}

// ============================================
// COMMANDS
// ============================================

function listParticipants() {
  console.log('📋 Dossiers de participants:\n');

  if (!fs.existsSync(PHOTOS_DIR)) {
    console.log('  (aucun dossier)');
    return;
  }

  const folders = fs.readdirSync(PHOTOS_DIR)
    .filter(f => fs.statSync(path.join(PHOTOS_DIR, f)).isDirectory());

  if (folders.length === 0) {
    console.log('  (aucun participant)');
    return;
  }

  folders.forEach(folder => {
    const folderPath = path.join(PHOTOS_DIR, folder);
    const files = fs.readdirSync(folderPath).filter(f => !f.startsWith('.'));
    console.log(`  📂 ${folder}`);
    console.log(`     → ${files.length} fichier(s)`);
  });

  console.log(`\n  ✅ Total: ${folders.length} participant(s)\n`);
}

function listPhotos(participantId) {
  if (!participantId) {
    console.error('❌ Veuillez spécifier un participantId');
    console.log('   Usage: node photos-viewer.js list [participantId]');
    process.exit(1);
  }

  const participantDir = path.join(PHOTOS_DIR, participantId);

  if (!fs.existsSync(participantDir)) {
    console.error(`❌ Participant non trouvé: ${participantId}`);
    process.exit(1);
  }

  console.log(`📸 Photos du participant: ${participantId}\n`);

  const files = fs.readdirSync(participantDir)
    .filter(f => !f.startsWith('.'))
    .sort();

  if (files.length === 0) {
    console.log('  (aucune photo)');
    return;
  }

  let totalSize = 0;

  files.forEach(file => {
    const filepath = path.join(participantDir, file);
    const stat = getFileStats(filepath);

    if (stat) {
      console.log(`  📷 ${file}`);
      console.log(`     Taille: ${formatBytes(stat.size)}`);
      console.log(`     Modifié: ${stat.modified.toLocaleString()}`);
      totalSize += stat.size;
    }
  });

  console.log(`\n  ✅ Total: ${files.length} photo(s) - ${formatBytes(totalSize)}\n`);
}

function openFolder(participantId) {
  if (!participantId) {
    console.error('❌ Veuillez spécifier un participantId');
    process.exit(1);
  }

  const participantDir = path.join(PHOTOS_DIR, participantId);

  if (!fs.existsSync(participantDir)) {
    console.error(`❌ Participant non trouvé: ${participantId}`);
    process.exit(1);
  }

  console.log(`\n🔓 Ouverture du dossier: ${participantDir}\n`);

  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      execSync(`open "${participantDir}"`);
    } else if (platform === 'win32') {
      execSync(`explorer "${participantDir}"`);
    } else {
      execSync(`xdg-open "${participantDir}"`);
    }
    console.log('✅ Dossier ouvert');
  } catch (error) {
    console.error('❌ Impossible d\'ouvrir le dossier:', error.message);
  }
}

function showInfo(participantId) {
  if (!participantId) {
    console.error('❌ Veuillez spécifier un participantId');
    process.exit(1);
  }

  const participantDir = path.join(PHOTOS_DIR, participantId);

  if (!fs.existsSync(participantDir)) {
    console.error(`❌ Participant non trouvé: ${participantId}`);
    process.exit(1);
  }

  console.log(`\n📊 Infos du participant: ${participantId}\n`);

  const dirStat = fs.statSync(participantDir);
  const files = fs.readdirSync(participantDir)
    .filter(f => !f.startsWith('.'));

  let totalSize = 0;
  const imageFormats = {};

  files.forEach(file => {
    const filepath = path.join(participantDir, file);
    const stat = getFileStats(filepath);

    if (stat) {
      totalSize += stat.size;

      const ext = path.extname(file).toLowerCase();
      imageFormats[ext] = (imageFormats[ext] || 0) + 1;
    }
  });

  console.log(`  Chemin: ${participantDir}`);
  console.log(`  Créé: ${dirStat.birthtime.toLocaleString()}`);
  console.log(`  Nombre de fichiers: ${files.length}`);
  console.log(`  Taille totale: ${formatBytes(totalSize)}`);
  console.log(`  Formats: ${Object.entries(imageFormats).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  console.log('');
}

// ============================================
// MAIN
// ============================================

function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];

  try {
    switch (command) {
      case 'list':
        if (arg1) {
          listPhotos(arg1);
        } else {
          listParticipants();
        }
        break;
      case 'open':
        openFolder(arg1);
        break;
      case 'info':
        showInfo(arg1);
        break;
      default:
        console.log(`
Usage: node photos-viewer.js [command] [participantId]

Commands:
  list                      - Liste tous les participants
  list [participantId]      - Liste les photos d'un participant
  open [participantId]      - Ouvre le dossier dans l'explorateur
  info [participantId]      - Affiche les infos détaillées

Exemples:
  node photos-viewer.js list
  node photos-viewer.js list participant_001
  node photos-viewer.js open participant_001
  node photos-viewer.js info participant_001
        `);
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

main();