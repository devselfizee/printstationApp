/**
 * qr-IMPROVED.js - Page d'accueil avec vraies stats
 * 
 * Remplace renderer/src/pages/qr.js
 * Affiche les stats en temps réel depuis la DB
 */

import { state } from '../state.js';
import { $ } from '../utils.js';

export const renderQR = (root) => {
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
    //     universe: 'universe1',
    //     participantId: 'participant_' + Date.now(),
    //   }));
    // };

    scanBtn.onclick = async () => {
      console.log('🎯 Scan button clicked');
      
      const qrData = {
        universe: 'universe1',
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

  // Nettoyer le polling quand on quitte la page
  window.addEventListener('beforeunload', () => {
    clearInterval(statsPollInterval);
  });

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