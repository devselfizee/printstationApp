/**
 * admin-system.js - Simple admin login
 * Appuyer sur "A" pour afficher le login
 * "A" bloguée dans popup + boutons fixes
 */

const $ = (selector) => document.querySelector(selector);

const ADMIN_PASSWORD = 'admin123'; // À changer en ENV

// Timeout d'inactivité (par défaut 20s, configurable via .env ADMIN_INACTIVITY_TIMEOUT_MS)
const ADMIN_INACTIVITY_TIMEOUT = window.appConfig?.adminInactivityTimeout || 20000;

// Timeout pour le warning avant retour (10 secondes avant la fin)
const WARNING_BEFORE_TIMEOUT = 10000;

let isLoginOpen = false;
let inactivityTimer = null;
let warningTimer = null;
let adminWarningModal = null;
let countdownInterval = null;

// Layouts de claviers par langue (même style que form.js)
const KEYBOARD_LAYOUTS = {
  fr: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'AZERTYUIOP'],
    [...'QSDFGHJKLM'],
    [...'WXCVBN', '@', '.', '-', '_']
  ],
  en: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'QWERTYUIOP'],
    [...'ASDFGHJKL'],
    [...'ZXCVBNM', '@', '.', '-', '_']
  ]
};

/**
 * Fonctions helper pour calculer les périodes
 */
function getDateRanges() {
  const now = new Date();

  // Aujourd'hui : 00:00:00 à 23:59:59
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // Cette semaine : Lundi 00:00:00 à Dimanche 23:59:59
  const dayOfWeek = now.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
  const daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1); // Jours depuis lundi
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Ce mois : 1er jour 00:00:00 à dernier jour 23:59:59
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  return {
    today: { start: todayStart.toISOString(), end: todayEnd.toISOString() },
    week: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
    month: { start: monthStart.toISOString(), end: monthEnd.toISOString() }
  };
}

/**
 * Formater un montant en euros
 */
function formatEuro(amount) {
  return (amount || 0).toFixed(2).replace('.', ',');
}

// Variables pour le long press
let longPressTimer = null;
const LONG_PRESS_DURATION = 3000; // 3 secondes

// Initialiser
export function initAdminButton() {
  // Raccourcis clavier
  document.addEventListener('keydown', async (e) => {
    // F2 - Admin login (uniquement sur page d'accueil)
    if (e.key === 'F2') {
      // Si le login est ouvert, ignorer
      if (isLoginOpen) return;
      // Ne fonctionne que sur la page d'accueil (QR)
      if (window.state?.page !== 'qr') return;
      console.log('[Admin] Touche F2 détectée');
      showAdminLogin();
    }

    // F10 - Toggle fullscreen
    if (e.key === 'F10') {
      e.preventDefault();
      console.log('[Admin] Touche F10 détectée - Toggle fullscreen');
      if (window.photoAPI?.window?.toggleFullscreen) {
        const result = await window.photoAPI.window.toggleFullscreen();
        console.log('[Admin] Fullscreen:', result.fullscreen ? 'ON' : 'OFF');
      }
    }
  });

  // Long press sur le coin haut gauche
  createLongPressZone();

  console.log('[Admin] Ready - F2/Long press: Admin (page accueil), F10: Fullscreen');
}

/**
 * Créer une zone invisible pour le long press
 */
function createLongPressZone() {
  const zone = document.createElement('div');
  zone.id = 'admin-longpress-zone';
  zone.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100px;
    height: 100px;
    z-index: 9999;
    cursor: default;
    background: transparent;
    display: none;
  `;

  // Long press handlers
  zone.addEventListener('mousedown', startLongPress);
  zone.addEventListener('mouseup', cancelLongPress);
  zone.addEventListener('mouseleave', cancelLongPress);

  // Touch support
  zone.addEventListener('touchstart', startLongPress);
  zone.addEventListener('touchend', cancelLongPress);
  zone.addEventListener('touchcancel', cancelLongPress);

  document.body.appendChild(zone);
  console.log('[Admin] Zone long press créée (coin haut gauche, cachée par défaut)');

  // Exposer les fonctions pour afficher/cacher la zone
  window.showAdminLongPressZone = () => {
    zone.style.display = 'block';
  };
  window.hideAdminLongPressZone = () => {
    zone.style.display = 'none';
  };
}

function startLongPress(e) {
  if (isLoginOpen) return;

  // Ne fonctionne que sur la page d'accueil (QR)
  if (window.state?.page !== 'qr') return;

  e.preventDefault();
  console.log('[Admin] Long press démarré...');

  longPressTimer = setTimeout(() => {
    console.log('[Admin] Long press validé!');
    showAdminLogin();
  }, LONG_PRESS_DURATION);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

/**
 * Afficher le login avec clavier virtuel complet (style form.js)
 */
function showAdminLogin() {
  isLoginOpen = true;

  // Détecter la langue (utiliser fr par défaut)
  const lang = window.state?.lang || 'fr';
  const layout = KEYBOARD_LAYOUTS[lang] || KEYBOARD_LAYOUTS.fr;

  const modal = document.createElement('div');
  modal.id = 'admin-login-modal';
  modal.className = 'admin-login-modal';
  modal.innerHTML = `
    <!-- Overlay centré -->
    <div class="admin-login-overlay">
      <div class="admin-login-wrapper">
        <!-- Formulaire -->
        <div class="admin-login-box" id="adminLoginBox">
          <h2>🔐 Admin</h2>
          <div class="admin-password-display" id="adminPasswordDisplay">
            <span class="password-dots" id="passwordDots"></span>
          </div>
          <div class="admin-error-msg" id="adminErrorMsg"></div>

          <div class="admin-buttons">
            <button id="adminOkBtn" class="admin-btn-ok">Valider</button>
            <button id="adminCancelBtn" class="admin-btn-cancel">Annuler</button>
          </div>
        </div>

        <!-- Clavier virtuel -->
        <div class="admin-kb" id="adminKb"></div>
      </div>
    </div>

    <style>
      .admin-login-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      }
      .admin-login-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 30px;
      }
      .admin-login-box {
        text-align: center;
        color: #fff;
      }
      .admin-login-box h2 {
        margin: 0 0 20px 0;
      }
      .admin-password-display {
        background: rgba(255,255,255,0.1);
        border: 2px solid rgba(255,255,255,0.3);
        border-radius: 8px;
        padding: 15px 20px;
        min-height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        width: 400px;
      }
      .password-dots {
        font-size: 24px;
        letter-spacing: 8px;
        color: #fff;
        min-height: 1em;
        line-height: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .password-dots:empty::before {
        content: '●';
        visibility: hidden;
      }
      .admin-error-msg {
        display: none;
        color: #f87171;
        margin-top: 10px;
        font-size: 14px;
      }
      .admin-buttons {
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 20px;
      }
      .admin-btn-ok {
        background: rgba(100,255,100,0.3);
        border: 1px solid rgba(100,255,100,0.5);
        border-radius: 8px;
        color: #fff;
        font-size: 18px;
        font-weight: bold;
        padding: 14px 40px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .admin-btn-ok:hover {
        background: rgba(100,255,100,0.5);
      }
      .admin-kb {
        width: 1080px;
        background: #fff;
        border-radius: 16px;
        padding: 30px 40px;
        display: flex;
        flex-direction: column;
        gap: 0;
        box-shadow: 0 12px 28px rgba(17, 24, 39, 0.15);
        box-sizing: border-box;
      }
      .admin-kb-row {
        display: flex;
        justify-content: center;
        gap: 14px;
        margin: 10px 0;
      }
      .admin-key {
        background: #f3f4f6;
        border: none;
        border-radius: 12px;
        color: #111827;
        font-size: 20px;
        font-weight: 900;
        width: 75px;
        height: 65px;
        cursor: pointer;
        transition: all 0.12s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .admin-key:hover {
        background: #e5e7eb;
      }
      .admin-key:active {
        transform: scale(0.94);
        background: #d1d5db;
      }
      .admin-key.delete-key {
        background: #fee2e2;
        color: #dc2626;
        width: 140px;
        font-size: 16px;
      }
      .admin-key.delete-key:hover {
        background: #fecaca;
      }
    </style>
  `;

  document.body.appendChild(modal);

  let password = '';
  const passwordDots = $('#passwordDots');
  const cancelBtn = $('#adminCancelBtn');
  const okBtn = $('#adminOkBtn');
  const errorMsg = $('#adminErrorMsg');
  const kb = $('#adminKb');

  // Timer d'inactivité
  function resetInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => {
      console.log('[Admin] ⏰ Timeout inactivité - fermeture login');
      closeModal();
    }, ADMIN_INACTIVITY_TIMEOUT);
  }

  // Démarrer le timer
  resetInactivityTimer();

  // Mettre à jour l'affichage des points
  function updateDisplay() {
    passwordDots.textContent = '●'.repeat(password.length);
  }

  // Construire le clavier virtuel
  layout.forEach((row) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'admin-kb-row';

    row.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'admin-key' + (k === 'EFFACER' ? ' delete-key' : '');
      btn.textContent = k;
      btn.onclick = () => {
        resetInactivityTimer(); // Reset timer on activity
        if (k === 'EFFACER') {
          password = password.slice(0, -1);
        } else {
          if (password.length < 32) {
            password += k.toLowerCase();
          }
        }
        updateDisplay();
        errorMsg.style.display = 'none';
      };
      rowDiv.appendChild(btn);
    });

    kb.appendChild(rowDiv);
  });

  // Support clavier physique aussi
  document.addEventListener('keydown', handleKeydown);

  function handleKeydown(e) {
    if (!isLoginOpen) return;

    resetInactivityTimer(); // Reset timer on any key

    // Lettres et chiffres
    if (/^[a-zA-Z0-9@.\-_]$/.test(e.key)) {
      if (password.length < 32) {
        password += e.key.toLowerCase();
        updateDisplay();
        errorMsg.style.display = 'none';
      }
    } else if (e.key === 'Backspace') {
      password = password.slice(0, -1);
      updateDisplay();
      errorMsg.style.display = 'none';
    } else if (e.key === 'Enter') {
      attemptLogin();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  }

  if (okBtn) {
    okBtn.addEventListener('click', attemptLogin);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  function attemptLogin() {
    if (password === ADMIN_PASSWORD) {
      console.log('[Admin] ✅ Login success');
      closeModal();
      showAdminDashboard();
    } else {
      console.log('[Admin] ❌ Wrong password');
      errorMsg.textContent = '❌ Mot de passe incorrect';
      errorMsg.style.display = 'block';
      password = '';
      updateDisplay();
    }
  }

  function closeModal() {
    console.log('[Admin] Fermeture login');
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    document.removeEventListener('keydown', handleKeydown);
    isLoginOpen = false;
    modal.remove();
  }
}

/**
 * Afficher le dashboard
 */
async function showAdminDashboard() {
  const dashboard = document.createElement('div');
  dashboard.id = 'admin-dashboard';
  dashboard.className = 'admin-dashboard';

  // Charger les stats globales (photos, participants, univers)
  let stats = null;
  try {
    if (window.photoAPI?.admin?.getDashboard) {
      console.log('✅ Appel getDashboard');
      stats = await window.photoAPI.admin.getDashboard();
      console.log('[Admin] Stats globales:', stats);
    }
  } catch (error) {
    console.error('[Admin] Erreur stats globales:', error);
  }

  const photos = stats?.photos || {};
  const participants = stats?.participants || {};
  const universes = stats?.universes || {};

  // 🆕 Charger les stats de commandes par période
  const dateRanges = getDateRanges();
  let todayStats = null;
  let weekStats = null;
  let monthStats = null;
  let topProducts = [];

  try {
    if (window.photoAPI?.orders?.getStats) {
      console.log('✅ Chargement stats commandes...');

      // Stats par période
      [todayStats, weekStats, monthStats] = await Promise.all([
        window.photoAPI.orders.getStats(dateRanges.today.start, dateRanges.today.end),
        window.photoAPI.orders.getStats(dateRanges.week.start, dateRanges.week.end),
        window.photoAPI.orders.getStats(dateRanges.month.start, dateRanges.month.end)
      ]);

      console.log('[Admin] Stats aujourd\'hui:', todayStats);
      console.log('[Admin] Stats semaine:', weekStats);
      console.log('[Admin] Stats mois:', monthStats);
    }

    if (window.photoAPI?.orders?.getTopProducts) {
      topProducts = await window.photoAPI.orders.getTopProducts(5); // Top 5 produits
      console.log('[Admin] Top produits:', topProducts);
    }
  } catch (error) {
    console.error('[Admin] Erreur stats commandes:', error);
  }

  // Calculer le total revenue de tous les temps
  const totalRevenue = monthStats?.total_revenue || 0;

  dashboard.innerHTML = `
    <div class="admin-dashboard-container">
      <div class="admin-header">
        <h1>📊 Admin Dashboard</h1>
        <button id="adminCloseBtn" class="admin-btn-close">✕</button>
      </div>

      <section class="admin-section">
        <h2>📈 Stats Globales</h2>
        <div class="admin-stats-grid">
          <div class="stat-card">
            <div class="stat-label">Photos totales</div>
            <div class="stat-value">${photos.total || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Téléchargées</div>
            <div class="stat-value">${photos.downloaded || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">En attente</div>
            <div class="stat-value">${photos.pending || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Erreurs</div>
            <div class="stat-value error">${photos.errors || 0}</div>
            ${(photos.errors || 0) > 0 ? `
              <button id="forceRetryBtn" class="force-retry-btn">
                Forcer retry
              </button>
            ` : ''}
          </div>
          <div class="stat-card">
            <div class="stat-label">Participants</div>
            <div class="stat-value">${participants.total || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Univers</div>
            <div class="stat-value">${universes.total || 0}</div>
          </div>
        </div>
      </section>

      <section class="admin-section">
        <h2>💰 Stats par Période</h2>
        <div class="period-stats">
          <div class="period-card">
            <div class="period-label">Aujourd'hui</div>
            <div class="period-value">${formatEuro(todayStats?.total_revenue || 0)} €</div>
            <div class="period-detail">${todayStats?.total_orders || 0} commande(s)</div>
          </div>
          <div class="period-card">
            <div class="period-label">Cette semaine</div>
            <div class="period-value">${formatEuro(weekStats?.total_revenue || 0)} €</div>
            <div class="period-detail">${weekStats?.total_orders || 0} commande(s)</div>
          </div>
          <div class="period-card">
            <div class="period-label">Ce mois</div>
            <div class="period-value">${formatEuro(monthStats?.total_revenue || 0)} €</div>
            <div class="period-detail">${monthStats?.total_orders || 0} commande(s)</div>
          </div>
        </div>
      </section>

      <section class="admin-section">
        <h2>🛍️ Top Produits</h2>
        <table class="admin-table">
          <tr>
            <th>Produit</th>
            <th>Quantité</th>
            <th>Montant</th>
          </tr>
          ${topProducts.length > 0
            ? topProducts.map(p => `
              <tr>
                <td>${p.product_name || p.product_id}</td>
                <td>${p.total_quantity || 0}</td>
                <td>${formatEuro(p.total_revenue || 0)} €</td>
              </tr>
            `).join('')
            : '<tr><td colspan="3" style="text-align:center;color:#999;">Aucune vente</td></tr>'
          }
        </table>
      </section>

      <section class="admin-section">
        <div class="admin-total">
          <div>TOTAL (ce mois)</div>
          <div class="total-value">${formatEuro(totalRevenue)} €</div>
        </div>
      </section>

      <section class="admin-section admin-actions">
        <button id="adminQuitBtn" class="admin-btn-quit">🚪 Quitter l'application</button>
      </section>
    </div>
  `;

  document.body.appendChild(dashboard);

  // Timer d'inactivité pour le dashboard
  let dashboardTimer = null;
  let dashboardWarningTimer = null;

  function resetDashboardTimer() {
    if (dashboardTimer) {
      clearTimeout(dashboardTimer);
    }
    if (dashboardWarningTimer) {
      clearTimeout(dashboardWarningTimer);
    }

    // Fermer le warning s'il est affiché
    closeAdminWarningModal();

    // Timer pour afficher le warning
    const warningTime = ADMIN_INACTIVITY_TIMEOUT - WARNING_BEFORE_TIMEOUT;
    if (warningTime > 0) {
      dashboardWarningTimer = setTimeout(() => {
        showAdminWarningModal(closeDashboardAndGoHome);
      }, warningTime);
    }

    // Timer principal pour retour à l'accueil
    dashboardTimer = setTimeout(() => {
      console.log('[Admin] ⏰ Timeout inactivité - retour accueil');
      closeDashboardAndGoHome();
    }, ADMIN_INACTIVITY_TIMEOUT);
  }

  function closeDashboard() {
    console.log('[Admin] Fermeture dashboard');
    if (dashboardTimer) {
      clearTimeout(dashboardTimer);
      dashboardTimer = null;
    }
    if (dashboardWarningTimer) {
      clearTimeout(dashboardWarningTimer);
      dashboardWarningTimer = null;
    }
    closeAdminWarningModal();
    document.removeEventListener('keydown', escapeHandler);
    document.removeEventListener('click', activityHandler);
    document.removeEventListener('mousemove', activityHandler);
    dashboard.remove();
  }

  function closeDashboardAndGoHome() {
    closeDashboard();
    // Retour à l'accueil
    if (window.backToQR) {
      window.backToQR();
    } else if (window.state) {
      window.state.page = 'qr';
      if (window.render) {
        window.render();
      }
    }
  }

  // Démarrer le timer
  resetDashboardTimer();

  // Reset timer sur activité (clic, mouvement souris, touche)
  function activityHandler(e) {
    // Ignorer les clics sur le modal warning
    if (adminWarningModal && e.target.closest('#admin-warning-modal')) {
      return;
    }
    closeAdminWarningModal();
    resetDashboardTimer();
  }

  document.addEventListener('click', activityHandler);
  document.addEventListener('mousemove', activityHandler);

  const closeBtn = $('#adminCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDashboard);
  }

  // Bouton Quitter l'application
  const quitBtn = $('#adminQuitBtn');
  if (quitBtn) {
    quitBtn.addEventListener('click', () => {
      showQuitConfirmModal();
    });
  }

  // Bouton Forcer retry (visible seulement s'il y a des erreurs)
  const forceRetryBtn = $('#forceRetryBtn');
  if (forceRetryBtn) {
    forceRetryBtn.addEventListener('click', async () => {
      forceRetryBtn.disabled = true;
      forceRetryBtn.textContent = 'Retry en cours...';

      try {
        const result = await window.photoAPI.admin.forceRetryAll();
        console.log('[Admin] Force retry result:', result);
        forceRetryBtn.textContent = `${result.count} photo(s) relancées`;

        // Rafraîchir le dashboard après 2 secondes
        setTimeout(() => {
          closeDashboard();
          showAdminDashboard();
        }, 2000);
      } catch (error) {
        console.error('[Admin] Force retry error:', error);
        forceRetryBtn.textContent = 'Erreur!';
        forceRetryBtn.disabled = false;
      }
    });
  }

  // Fermer avec Escape
  const escapeHandler = (e) => {
    // Reset timer sur activité
    closeAdminWarningModal();
    resetDashboardTimer();
    if (e.key === 'Escape' && $('#admin-dashboard')) {
      closeDashboard();
    }
  };

  document.addEventListener('keydown', escapeHandler);
}

/**
 * Afficher le modal de warning pour l'admin
 */
function showAdminWarningModal(onTimeoutCallback) {
  if (adminWarningModal) return;

  let countdown = Math.ceil(WARNING_BEFORE_TIMEOUT / 1000);

  adminWarningModal = document.createElement('div');
  adminWarningModal.id = 'admin-warning-modal';
  adminWarningModal.innerHTML = `
    <div class="inactivity-warning-container">
      <div class="inactivity-warning-box">
        <div class="inactivity-warning-icon">⏰</div>
        <h2>Êtes-vous toujours là ?</h2>
        <div class="inactivity-countdown-display">
          <span id="admin-warning-countdown">${countdown}</span>
        </div>
        <div class="inactivity-warning-message">
          Retour à l'accueil dans ${countdown} secondes
        </div>
        <div class="admin-buttons">
          <button class="admin-btn-ok" id="admin-warning-continue-btn">
            Continuer
          </button>
        </div>
      </div>
    </div>
    <style>
      #admin-warning-modal .inactivity-warning-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        animation: adminFadeIn 0.3s ease;
      }
      @keyframes adminFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      #admin-warning-modal .inactivity-warning-box {
        background: rgba(30, 58, 95, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 40px 60px;
        text-align: center;
        color: white;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        min-width: 400px;
      }
      #admin-warning-modal .inactivity-warning-box h2 {
        margin: 0 0 20px 0;
        font-size: 28px;
      }
      #admin-warning-modal .inactivity-warning-icon {
        font-size: 64px;
        margin-bottom: 15px;
        animation: adminPulse 1s infinite;
      }
      @keyframes adminPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      #admin-warning-modal .inactivity-countdown-display {
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        width: 100px;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 20px auto;
      }
      #admin-warning-countdown {
        font-size: 48px;
        font-weight: bold;
        color: #fbbf24;
      }
      #admin-warning-modal .inactivity-warning-message {
        font-size: 18px;
        margin-bottom: 25px;
        opacity: 0.8;
      }
      #admin-warning-modal .admin-buttons {
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 20px;
      }
      #admin-warning-modal .admin-btn-ok {
        background: rgba(100, 255, 100, 0.3);
        border: 1px solid rgba(100, 255, 100, 0.5);
        border-radius: 8px;
        color: #fff;
        font-size: 18px;
        font-weight: bold;
        padding: 14px 40px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      #admin-warning-modal .admin-btn-ok:hover {
        background: rgba(100, 255, 100, 0.5);
      }
      #admin-warning-modal .admin-btn-ok:active {
        transform: scale(0.98);
      }
    </style>
  `;

  document.body.appendChild(adminWarningModal);

  // Bouton continuer
  const continueBtn = document.getElementById('admin-warning-continue-btn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      closeAdminWarningModal();
    });
  }

  // Countdown
  const countdownEl = document.getElementById('admin-warning-countdown');
  const messageEl = adminWarningModal.querySelector('.inactivity-warning-message');

  countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) {
      countdownEl.textContent = countdown;
    }
    if (messageEl) {
      messageEl.textContent = `Retour à l'accueil dans ${countdown} seconde${countdown > 1 ? 's' : ''}`;
    }
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);

  console.log('[Admin] Warning affiché');
}

/**
 * Fermer le modal de warning admin
 */
function closeAdminWarningModal() {
  if (adminWarningModal) {
    adminWarningModal.remove();
    adminWarningModal = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/**
 * Afficher le modal de confirmation pour quitter l'application
 */
function showQuitConfirmModal() {
  const modal = document.createElement('div');
  modal.id = 'quit-confirm-modal';
  modal.innerHTML = `
    <div class="quit-confirm-overlay">
      <div class="quit-confirm-box">
        <div class="quit-confirm-icon">🚪</div>
        <h2>Quitter l'application ?</h2>
        <p>Êtes-vous sûr de vouloir fermer l'application ?</p>
        <div class="quit-confirm-buttons">
          <button id="quitConfirmYes" class="quit-btn quit-btn-yes">Oui, quitter</button>
          <button id="quitConfirmNo" class="quit-btn quit-btn-no">Non, annuler</button>
        </div>
      </div>
    </div>
    <style>
      .quit-confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        animation: quitFadeIn 0.2s ease;
      }
      @keyframes quitFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .quit-confirm-box {
        background: rgba(30, 58, 95, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 40px 60px;
        text-align: center;
        color: white;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        min-width: 400px;
      }
      .quit-confirm-icon {
        font-size: 64px;
        margin-bottom: 15px;
      }
      .quit-confirm-box h2 {
        margin: 0 0 15px 0;
        font-size: 24px;
      }
      .quit-confirm-box p {
        margin: 0 0 30px 0;
        opacity: 0.8;
        font-size: 16px;
      }
      .quit-confirm-buttons {
        display: flex;
        gap: 20px;
        justify-content: center;
      }
      .quit-btn {
        border: none;
        border-radius: 12px;
        font-size: 18px;
        font-weight: bold;
        padding: 16px 40px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .quit-btn-yes {
        background: rgba(239, 68, 68, 0.3);
        border: 2px solid rgba(239, 68, 68, 0.5);
        color: #fff;
      }
      .quit-btn-yes:hover {
        background: rgba(239, 68, 68, 0.5);
      }
      .quit-btn-no {
        background: rgba(100, 255, 100, 0.3);
        border: 2px solid rgba(100, 255, 100, 0.5);
        color: #fff;
      }
      .quit-btn-no:hover {
        background: rgba(100, 255, 100, 0.5);
      }
      .quit-btn:active {
        transform: scale(0.98);
      }
    </style>
  `;

  document.body.appendChild(modal);

  // Bouton Oui - Quitter
  const yesBtn = document.getElementById('quitConfirmYes');
  if (yesBtn) {
    yesBtn.addEventListener('click', async () => {
      console.log('[Admin] Confirmation quitter - OUI cliqué');
      modal.remove();

      console.log('[Admin] Appel window.photoAPI.app.quit()...');
      if (window.photoAPI?.app?.quit) {
        try {
          await window.photoAPI.app.quit();
          console.log('[Admin] quit() appelé avec succès');
        } catch (error) {
          console.error('[Admin] Erreur quit():', error);
        }
      } else {
        console.error('[Admin] window.photoAPI.app.quit non disponible');
      }
    });
  }

  // Bouton Non - Annuler
  const noBtn = document.getElementById('quitConfirmNo');
  if (noBtn) {
    noBtn.addEventListener('click', () => {
      console.log('[Admin] Confirmation quitter - NON cliqué');
      modal.remove();
    });
  }
}