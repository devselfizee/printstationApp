/**
 * qr-IMPROVED.js - Page d'accueil avec vraies stats
 * 
 * Remplace renderer/src/pages/qr.js
 * Affiche les stats en temps réel depuis la DB
 */

import { state } from '../state.js';
import { $ } from '../utils.js';

// ============================================
// SCANNER QR PHYSIQUE - Écouteur clavier
// ============================================
let scannerBuffer = '';
let scannerTimeout = null;
const SCANNER_TIMEOUT_MS = 100; // Les scanners envoient les caractères très rapidement

function initPhysicalScanner() {
  console.log('[QR] 🔌 Initialisation de l\'écouteur scanner physique...');

  document.addEventListener('keydown', handleScannerInput);
  console.log('[QR] ✅ Écouteur scanner physique activé');
}

function cleanupPhysicalScanner() {
  document.removeEventListener('keydown', handleScannerInput);
  if (scannerTimeout) {
    clearTimeout(scannerTimeout);
    scannerTimeout = null;
  }
  scannerBuffer = '';
  console.log('[QR] 🔌 Écouteur scanner physique désactivé');
}

async function handleScannerInput(e) {
  // Ignorer si on est dans un champ de saisie
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    return;
  }

  // Réinitialiser le timeout à chaque touche
  if (scannerTimeout) {
    clearTimeout(scannerTimeout);
  }

  // Si c'est la touche Entrée et qu'on a des données, traiter le scan
  if (e.key === 'Enter' && scannerBuffer.length > 0) {
    e.preventDefault();
    const scannedData = scannerBuffer;
    scannerBuffer = '';

    console.log('[QR] 📱 Scan physique détecté:', scannedData);
    console.log('[QR] 📱 Longueur:', scannedData.length, 'caractères');

    await processPhysicalScan(scannedData);
    return;
  }

  // Accumuler les caractères imprimables
  if (e.key.length === 1) {
    scannerBuffer += e.key;

    // Log pour debug (seulement les premiers caractères)
    if (scannerBuffer.length <= 5) {
      console.log('[QR] 🔤 Buffer scanner:', scannerBuffer);
    }
  }

  // Timeout pour réinitialiser le buffer si pas de nouvelles touches
  scannerTimeout = setTimeout(() => {
    if (scannerBuffer.length > 0) {
      console.log('[QR] ⏱️ Timeout scanner - buffer réinitialisé (était:', scannerBuffer.substring(0, 20) + '...)');
      scannerBuffer = '';
    }
  }, SCANNER_TIMEOUT_MS);
}

async function processPhysicalScan(rawData) {
  console.log('[QR] 🔍 Traitement du scan physique...');
  console.log('[QR] 📦 Données brutes:', rawData);

  try {
    // Essayer de parser comme JSON d'abord (format: {"universe":"B","participantId":"xxx"})
    let qrData;

    try {
      qrData = JSON.parse(rawData);
      console.log('[QR] ✅ Format JSON détecté:', qrData);
    } catch {
      // Si ce n'est pas du JSON, traiter comme un ID simple (format: B123456 ou juste 123456)
      console.log('[QR] 📝 Format simple détecté, analyse...');

      const upperData = rawData.trim().toUpperCase();
      const firstChar = upperData.charAt(0);

      // Vérifier si le premier caractère est une lettre d'univers (A-E)
      if (['A', 'B', 'C', 'D', 'E'].includes(firstChar) && upperData.length > 1) {
        qrData = {
          universe: firstChar,
          participantId: upperData.substring(1)
        };
        console.log('[QR] ✅ Format préfixe univers détecté:', qrData);
      } else {
        // Pas de préfixe univers, utiliser B par défaut
        qrData = {
          universe: 'B',
          participantId: upperData
        };
        console.log('[QR] ✅ Format ID simple, univers B par défaut:', qrData);
      }
    }

    // Appeler l'API de scan
    if (window.photoAPI?.scanQR) {
      console.log('[QR] 📡 Appel API scanQR...');
      const result = await window.photoAPI.scanQR(JSON.stringify(qrData));

      console.log('[QR] 📷 Résultat du scan:', result);

      if (result.status === 'success') {
        console.log('[QR] ✅ Scan réussi!');
        console.log('[QR] 👤 Participant:', result.participantId);
        console.log('[QR] 📸 Photos:', result.photos?.length || 0);

        // Navigation vers la page listing
        if (window.state && window.render) {
          window.state.universe = result.universe;
          window.state.photos = result.photos || [];
          window.state.participantId = result.participantId;
          window.state.universeId = result.universeId || qrData.universe;
          window.state.page = 'listing';
          window.render();
          console.log('[QR] ✅ Navigation vers listing effectuée');
        }
      } else {
        console.error('[QR] ❌ Erreur scan:', result.error);
        alert(`Erreur lors du scan: ${result.error}`);
      }
    } else {
      console.error('[QR] ❌ window.photoAPI.scanQR non disponible');
      alert('API de scan non disponible');
    }
  } catch (error) {
    console.error('[QR] ❌ Erreur traitement scan:', error);
    alert(`Erreur: ${error.message}`);
  }
}

// ============================================
// RENDER QR PAGE
// ============================================

export const renderQR = (root) => {
  // Initialiser l'écouteur du scanner physique
  initPhysicalScanner();

  const qrHome = document.createElement('div');
  qrHome.className = 'qr-home';

  // ===== RÉCUPÉRER LES STATS =====
  let statsHtml = `
    <div class="qr-stats">
      <div class="stat-item">
        <div class="stat-label">Photos téléchargées</div>
        <div class="stat-value" id="statsDownloaded">-- </div>
      </div>
      <div class="stat-item">
        <div class="stat-label">En cours</div>
        <div class="stat-value" id="statsPending">--</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Erreurs</div>
        <div class="stat-value" id="statsErrors">--</div>
      </div>
    </div>
  `;

  qrHome.innerHTML = `
    ${statsHtml}
    <div class="qr-spacer"></div>
    <div class="qr-buttons-container">
      <div class="qr-buttons-row">
        <button class="qr-btn qr-btn-scanner" id="scanBtn">📱 Scanner QR</button>
      </div>
    </div>
  `;

  root.appendChild(qrHome);

  // ===== EVENT LISTENERS =====
  const scanBtn = $('#scanBtn');
  if (scanBtn) {
    // scanBtn.onclick = () => {
    //   console.log('🎯 Scan button clicked');
    //   window.handleQRScan(JSON.stringify({
    //     universe: 'B',
    //     participantId: 'participant_' + Date.now(),
    //   }));
    // };

    scanBtn.onclick = async () => {
      console.log('🎯 Scan button clicked');

      const qrData = {
        universe: 'B',
        participantId: 'participant_' + Date.now(),
      };

      try {
        const result = await window.photoAPI.scanQR(JSON.stringify(qrData));
        console.log('📷 Résultat du scan:', result);
      } catch (err) {
        console.error('Erreur pendant le scan:', err);
      }
    };
  }

  // ===== CHARGER LES STATS =====
  loadStats();

  // ===== POLLING STATS TOUTES LES 5 SECONDES =====
  let statsPollInterval = setInterval(loadStats, 5000);

  // Nettoyer le polling et l'écouteur scanner quand on quitte la page
  window.addEventListener('beforeunload', () => {
    clearInterval(statsPollInterval);
    cleanupPhysicalScanner();
  });

  // Exposer le cleanup globalement pour que le routeur puisse l'appeler
  window.cleanupQRPage = () => {
    clearInterval(statsPollInterval);
    cleanupPhysicalScanner();
  };

  /**
   * CORRIGER CAR LA VALEUR DE REOTUR EST ENCORE UNE PROMESSE PAS ARRAY
   *
  function loadStats() {
    // ⭐ Appeler l'API IPC pour récupérer les stats
    if (window.photoAPI && window.photoAPI.getDashboardStats) {
      window.photoAPI.getDashboardStats()
        .then(stats => {
          console.log('[QR] Stats:', stats);
          
          if (stats && stats.photos) {
            const downloaded = stats.photos.downloaded || 0;
            const pending = stats.photos.pending || 0;
            const errors = stats.photos.errors || 0;

            const downloadedEl = $('#statsDownloaded');
            const pendingEl = $('#statsPending');
            const errorsEl = $('#statsErrors');

            if (downloadedEl) downloadedEl.textContent = downloaded;
            if (pendingEl) pendingEl.textContent = pending;
            if (errorsEl) errorsEl.textContent = errors;

            console.log(`[QR] ✅ ${downloaded} téléchargées, ${pending} en cours, ${errors} erreurs`);
          }
        })
        .catch(error => {
          console.error('[QR] Erreur stats:', error.message);
        });
    }
  }
    */
  async function loadStats() {
    try {
      // ✅ Vérifie que l’API admin existe
      if (!window.photoAPI?.admin?.getDashboard) {
        console.warn('[QR] API admin.getDashboard non disponible');
        return;
      }

      // ✅ Appel asynchrone vers le main process
      const stats = await window.photoAPI.admin.getDashboard();
      console.log('[QR] Stats:', stats);

      if (stats && stats.photos) {
        const downloaded = stats.photos.downloaded || 0;
        const pending = stats.photos.pending || 0;
        const errors = stats.photos.errors || 0;

        const downloadedEl = document.getElementById('statsDownloaded');
        const pendingEl = document.getElementById('statsPending');
        const errorsEl = document.getElementById('statsErrors');

        if (downloadedEl) downloadedEl.textContent = downloaded;
        if (pendingEl) pendingEl.textContent = pending;
        if (errorsEl) errorsEl.textContent = errors;

        console.log(`[QR] ✅ ${downloaded} téléchargées, ${pending} en cours, ${errors} erreurs`);
      }
    } catch (error) {
      console.error('[QR] Erreur stats:', error);
    }
  }

};