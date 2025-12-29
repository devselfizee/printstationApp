/**
 * qr-IMPROVED.js - Page d'accueil avec vraies stats
 * 
 * Remplace renderer/src/pages/qr.js
 * Affiche les stats en temps réel depuis la DB
 */

import { state } from '../state.js';
import { $ } from '../utils.js';

// ============================================
// MODAL "PHOTOS NON DISPONIBLES"
// ============================================
function showNoPhotosModal() {
  // Supprimer un modal existant si présent
  const existingModal = document.getElementById('no-photos-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'no-photos-modal';
  modal.className = 'no-photos-modal-overlay';
  modal.innerHTML = `
    <div class="no-photos-modal">
      <div class="no-photos-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
          <line x1="2" y1="2" x2="22" y2="22" stroke-width="2"></line>
        </svg>
      </div>
      <h2 class="no-photos-title">Photos non disponibles</h2>
      <p class="no-photos-message">Les photos ne sont pas encore disponibles.</p>
      <p class="no-photos-hint">Veuillez réessayer dans quelques instants.</p>
      <button class="no-photos-btn" id="close-no-photos-modal">OK</button>
    </div>
  `;

  // Ajouter les styles inline si pas déjà présents
  if (!document.getElementById('no-photos-modal-styles')) {
    const styles = document.createElement('style');
    styles.id = 'no-photos-modal-styles';
    styles.textContent = `
      .no-photos-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .no-photos-modal {
        background: white;
        border-radius: 20px;
        padding: 40px 50px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease;
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .no-photos-icon {
        color: #f59e0b;
        margin-bottom: 20px;
      }
      .no-photos-icon svg {
        filter: drop-shadow(0 4px 6px rgba(245, 158, 11, 0.3));
      }
      .no-photos-title {
        font-size: 24px;
        font-weight: 700;
        color: #1f2937;
        margin: 0 0 15px 0;
      }
      .no-photos-message {
        font-size: 18px;
        color: #4b5563;
        margin: 0 0 10px 0;
      }
      .no-photos-hint {
        font-size: 14px;
        color: #9ca3af;
        margin: 0 0 25px 0;
      }
      .no-photos-btn {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        padding: 14px 50px;
        font-size: 18px;
        font-weight: 600;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .no-photos-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
      }
      .no-photos-btn:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(modal);

  // Fermer le modal au clic sur le bouton ou l'overlay
  document.getElementById('close-no-photos-modal').addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ============================================
// MODAL "QR CODE INVALIDE"
// ============================================
function showInvalidQRModal() {
  // Supprimer un modal existant si présent
  const existingModal = document.getElementById('invalid-qr-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'invalid-qr-modal';
  modal.className = 'invalid-qr-modal-overlay';
  modal.innerHTML = `
    <div class="invalid-qr-modal">
      <div class="invalid-qr-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3h6v6H3z"></path>
          <path d="M15 3h6v6h-6z"></path>
          <path d="M3 15h6v6H3z"></path>
          <path d="M15 15h6v6h-6z"></path>
          <line x1="9" y1="9" x2="15" y2="15" stroke-width="2.5" stroke="#ef4444"></line>
          <line x1="15" y1="9" x2="9" y2="15" stroke-width="2.5" stroke="#ef4444"></line>
        </svg>
      </div>
      <h2 class="invalid-qr-title">Oups !</h2>
      <p class="invalid-qr-message">Ce QR Code n'est pas valide.</p>
      <p class="invalid-qr-hint">Veuillez scanner un QR Code valide.</p>
      <button class="invalid-qr-btn" id="close-invalid-qr-modal">OK</button>
    </div>
  `;

  // Ajouter les styles inline si pas déjà présents
  if (!document.getElementById('invalid-qr-modal-styles')) {
    const styles = document.createElement('style');
    styles.id = 'invalid-qr-modal-styles';
    styles.textContent = `
      .invalid-qr-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeInInvalid 0.3s ease;
      }
      @keyframes fadeInInvalid {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .invalid-qr-modal {
        background: white;
        border-radius: 20px;
        padding: 40px 50px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUpInvalid 0.3s ease;
      }
      @keyframes slideUpInvalid {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .invalid-qr-icon {
        color: #6b7280;
        margin-bottom: 20px;
      }
      .invalid-qr-icon svg {
        filter: drop-shadow(0 4px 6px rgba(107, 114, 128, 0.3));
      }
      .invalid-qr-title {
        font-size: 28px;
        font-weight: 700;
        color: #ef4444;
        margin: 0 0 15px 0;
      }
      .invalid-qr-message {
        font-size: 18px;
        color: #4b5563;
        margin: 0 0 10px 0;
      }
      .invalid-qr-hint {
        font-size: 14px;
        color: #9ca3af;
        margin: 0 0 25px 0;
      }
      .invalid-qr-btn {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        border: none;
        padding: 14px 50px;
        font-size: 18px;
        font-weight: 600;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .invalid-qr-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
      }
      .invalid-qr-btn:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(modal);

  // Fermer le modal au clic sur le bouton ou l'overlay
  document.getElementById('close-invalid-qr-modal').addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ============================================
// SCANNER QR PHYSIQUE - Écouteur clavier
// ============================================
let scannerBuffer = '';
let scannerTimeout = null;
const SCANNER_TIMEOUT_MS = 100; // Les scanners envoient les caractères très rapidement

// ============================================
// STATS POLLING - Variable module-level pour éviter les fuites
// ============================================
let statsPollInterval = null;

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
    // ⭐ Vérifier si c'est une URL et extraire le basename
    let processedData = rawData.trim();
    const lowerData = processedData.toLowerCase();

    if (lowerData.startsWith('http://') || lowerData.startsWith('https://')) {
      console.log('[QR] 🌐 URL détectée, extraction du basename...');
      try {
        const url = new URL(processedData);
        const pathParts = url.pathname.split('/').filter(p => p.length > 0);
        if (pathParts.length > 0) {
          // Extraire le basename et supprimer les paramètres de requête éventuels
          let basename = pathParts[pathParts.length - 1];
          // Supprimer tout ce qui suit un ? ou #
          basename = basename.split('?')[0].split('#')[0];
          processedData = basename;
          console.log('[QR] ✅ Basename extrait:', processedData);
        }
      } catch (urlError) {
        console.warn('[QR] ⚠️ Erreur parsing URL, utilisation des données brutes');
      }
    }

    // ⭐ Validation du QR Code (sauf si c'est du JSON)
    // Règles: première lettre doit être A, B, C, D ou E et longueur = 6
    const isJSON = processedData.startsWith('{') || processedData.startsWith('[');
    if (!isJSON) {
      const upperData = processedData.toUpperCase();
      const firstChar = upperData.charAt(0);
      const isValidFirstChar = ['A', 'B', 'C', 'D', 'E'].includes(firstChar);
      const isValidLength = upperData.length === 6;

      console.log('[QR] 🔍 Validation QR Code:');
      console.log('[QR]   - Données:', upperData);
      console.log('[QR]   - Premier caractère:', firstChar, '→', isValidFirstChar ? '✅' : '❌');
      console.log('[QR]   - Longueur:', upperData.length, '→', isValidLength ? '✅' : '❌');

      if (!isValidFirstChar || !isValidLength) {
        console.log('[QR] ❌ QR Code invalide - affichage du modal');
        // Log du scan invalide
        if (window.photoAPI?.logger) {
          window.photoAPI.logger.qrScanInvalid(rawData, `Premier caractère: ${firstChar}, Longueur: ${upperData.length}`);
        }
        showInvalidQRModal();
        return;
      }
    }

    // Essayer de parser comme JSON d'abord (format: {"universe":"B","participantId":"xxx"})
    let qrData;

    try {
      qrData = JSON.parse(processedData);
      console.log('[QR] ✅ Format JSON détecté:', qrData);
    } catch {
      // Si ce n'est pas du JSON, traiter comme un ID simple (format: B123456 ou juste 123456)
      console.log('[QR] 📝 Format simple détecté, analyse...');

      const upperData = processedData.toUpperCase();
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

        // Log du scan réussi
        if (window.photoAPI?.logger) {
          window.photoAPI.logger.qrScan({
            participantId: result.participantId,
            universe: result.universeId || qrData.universe,
            photosCount: result.photos?.length || 0,
            rawData: rawData
          });
        }

        // Vérifier si le participant a des photos
        if (!result.photos || result.photos.length === 0) {
          console.log('[QR] ⚠️ Aucune photo disponible pour ce participant');
          showNoPhotosModal();
          return;
        }

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
        // Log de l'erreur de scan
        if (window.photoAPI?.logger) {
          window.photoAPI.logger.error('QR_SCAN', 'Erreur scan QR', { error: result.error, rawData });
        }
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
  // Par défaut masqué, toggle avec F5
  let statsHtml = `
    <div class="qr-stats dev-hidden" id="devStats" style="display: none;">
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
  `;

  root.appendChild(qrHome);

  // ===== CHARGER LES STATS =====
  loadStats();

  // ===== POLLING STATS TOUTES LES 5 SECONDES =====
  // Nettoyer l'ancien interval avant d'en créer un nouveau (évite les fuites)
  if (statsPollInterval) {
    clearInterval(statsPollInterval);
  }
  statsPollInterval = setInterval(loadStats, 5000);

  // Exposer le cleanup globalement pour que le routeur puisse l'appeler
  window.cleanupQRPage = () => {
    if (statsPollInterval) {
      clearInterval(statsPollInterval);
      statsPollInterval = null;
    }
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