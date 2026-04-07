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
            <input type="text" id="adminPasswordInput" inputmode="none" readonly autocomplete="off" style="position:absolute;opacity:0;pointer-events:none;"/>
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
  const passwordInput = $('#adminPasswordInput');
  const passwordDisplay = $('#adminPasswordDisplay');
  const cancelBtn = $('#adminCancelBtn');
  const okBtn = $('#adminOkBtn');
  const errorMsg = $('#adminErrorMsg');
  const kb = $('#adminKb');

  // Focus l'input caché pour empêcher le clavier Windows d'apparaître
  passwordDisplay.onclick = () => passwordInput.focus();
  passwordInput.focus();

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

  // Charger la configuration machine (pour la langue par défaut)
  let machineConfig = null;
  let currentDefaultLang = 'fr';
  try {
    if (window.photoAPI?.admin?.getMachineConfig) {
      const result = await window.photoAPI.admin.getMachineConfig();
      if (result.status === 'success' && result.config) {
        machineConfig = result.config;
        currentDefaultLang = machineConfig.default_lang || 'fr';
        console.log('[Admin] Config machine:', machineConfig);
      }
    }
  } catch (error) {
    console.error('[Admin] Erreur config machine:', error);
  }

  // Charger les messages de remerciement personnalisés
  let thanksMessages = {};
  try {
    if (window.photoAPI?.admin?.getThanksMessages) {
      const result = await window.photoAPI.admin.getThanksMessages();
      if (result.status === 'success' && result.messages) {
        result.messages.forEach(msg => {
          thanksMessages[msg.lang] = { title: msg.title, subtitle: msg.subtitle };
        });
        console.log('[Admin] Messages remerciement:', thanksMessages);
      }
    }
  } catch (error) {
    console.error('[Admin] Erreur messages remerciement:', error);
  }

  // Charger les univers de l'écran d'accueil
  let homeUniverses = [];
  try {
    if (window.photoAPI?.admin?.getHomeUniverses) {
      const result = await window.photoAPI.admin.getHomeUniverses();
      if (result.status === 'success' && result.universes) {
        homeUniverses = result.universes;
        console.log('[Admin] Univers écran d\'accueil:', homeUniverses);
      }
    }
  } catch (error) {
    console.error('[Admin] Erreur univers écran d\'accueil:', error);
  }

  dashboard.innerHTML = `
    <div class="admin-dashboard-container">
      <div class="admin-header">
        <h1>Admin Dashboard</h1>
        <button id="adminCloseBtn" class="admin-btn-close">✕</button>
      </div>

      <nav class="admin-tabs">
        <button class="admin-tab active" data-tab="stats">Statistiques</button>
        <button class="admin-tab" data-tab="settings">Paramètres</button>
        <button class="admin-tab" data-tab="maintenance">Maintenance</button>
      </nav>

      <!-- TAB: Statistiques -->
      <div class="admin-tab-content active" id="tab-stats">
        <section class="admin-section">
          <h2>Stats Globales</h2>
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
                  Relancer
                </button>
              ` : ''}
            </div>
            <div class="stat-card">
              <div class="stat-label">Participants</div>
              <div class="stat-value">${participants.total || 0}</div>
            </div>
          </div>
        </section>

        <section class="admin-section">
          <h2>Revenus par Période</h2>
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
          <h2>Top Produits</h2>
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
      </div>

      <!-- TAB: Paramètres -->
      <div class="admin-tab-content" id="tab-settings">
        <section class="admin-section">
          <h2>Langue par défaut</h2>
          <div class="admin-settings">
            <div class="setting-row">
              <label for="defaultLangSelect">Langue de l'interface</label>
              <select id="defaultLangSelect" class="admin-select">
                <option value="fr" ${currentDefaultLang === 'fr' ? 'selected' : ''}>Français</option>
                <option value="en" ${currentDefaultLang === 'en' ? 'selected' : ''}>English</option>
                <option value="es" ${currentDefaultLang === 'es' ? 'selected' : ''}>Español</option>
                <option value="de" ${currentDefaultLang === 'de' ? 'selected' : ''}>Deutsch</option>
                <option value="it" ${currentDefaultLang === 'it' ? 'selected' : ''}>Italiano</option>
                <option value="zh" ${currentDefaultLang === 'zh' ? 'selected' : ''}>中文</option>
              </select>
            </div>
          </div>
        </section>

        <section class="admin-section">
          <h2>Univers écran d'accueil</h2>
          <div class="admin-settings">
            <div class="setting-row setting-row-universes">
              <label>Activer / Désactiver les univers</label>
              <div class="universe-checkboxes" id="universeCheckboxes">
                ${homeUniverses.map(u => `
                  <label class="universe-checkbox">
                    <input type="checkbox" name="homeUniverse" value="${u.universe_key}" ${u.enabled ? 'checked' : ''}>
                    <span class="checkbox-label">${u.universe_key}. ${u.name}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        </section>

        <section class="admin-section">
          <h2>Messages de remerciement</h2>
          <div class="admin-settings">
            <div class="setting-row">
              <label for="thanksLangSelect">Langue à configurer</label>
              <select id="thanksLangSelect" class="admin-select">
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div class="setting-row" style="flex-direction: column; align-items: stretch; gap: 10px;">
              <label for="thanksTitleInput">Ligne 1 (titre principal)</label>
              <input type="text" id="thanksTitleInput" class="admin-input" placeholder="Ex: Dirigez-vous vers le comptoir de la boutique">
            </div>
            <div class="setting-row" style="flex-direction: column; align-items: stretch; gap: 10px;">
              <label for="thanksSubtitleInput">Ligne 2 (sous-titre)</label>
              <input type="text" id="thanksSubtitleInput" class="admin-input" placeholder="Ex: pour récupérer votre commande.">
            </div>
            <div class="setting-row" style="justify-content: flex-end; gap: 10px;">
              <button id="thanksResetBtn" class="admin-btn-reset">Réinitialiser</button>
              <button id="thanksSaveBtn" class="admin-btn-save">Enregistrer</button>
            </div>
          </div>
        </section>
      </div>

      <!-- TAB: Maintenance -->
      <div class="admin-tab-content" id="tab-maintenance">
        <section class="admin-section">
          <h2>Purge des photos</h2>
          <p class="admin-section-desc">Supprimez les fichiers physiques des photos sur une période donnée. Les enregistrements sont conservés en base avec un marqueur de purge.</p>
          <div class="admin-settings">
            <div class="setting-row">
              <label for="purgeStartDate">Date de début</label>
              <input type="date" id="purgeStartDate" class="admin-input admin-date-input">
            </div>
            <div class="setting-row">
              <label for="purgeEndDate">Date de fin</label>
              <input type="date" id="purgeEndDate" class="admin-input admin-date-input">
            </div>
            <div class="setting-row" style="justify-content: center;">
              <button id="purgePhotosBtn" class="admin-btn-purge">Purger les photos</button>
            </div>
            <div id="purgeResultMsg" class="purge-result-msg" style="display:none;"></div>
          </div>
        </section>

        <section class="admin-section admin-actions">
          <button id="adminQuitBtn" class="admin-btn-quit">Quitter l'application</button>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(dashboard);

  // Tab switching
  const tabs = dashboard.querySelectorAll('.admin-tab');
  const tabContents = dashboard.querySelectorAll('.admin-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      const targetContent = dashboard.querySelector(`#tab-${targetTab}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });

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

    // Rafraîchir les visuels de l'accueil si des univers ont été modifiés
    if (universesModified) {
      console.log('[Admin] Univers modifiés - rafraîchissement des visuels d\'accueil');
      refreshHomeVisuals();
    }
  }

  async function refreshHomeVisuals() {
    try {
      const overlay = document.getElementById('homeVisualsOverlay');
      if (!overlay) return;

      // Vider le carrousel actuel
      overlay.innerHTML = '';

      // Recharger les images depuis les univers activés
      const result = await window.photoAPI.admin.getHomeVisuals();
      if (result.status !== 'success' || !result.images || result.images.length === 0) {
        console.log('[Admin] Aucun visuel après rafraîchissement');
        return;
      }

      const images = result.images;
      console.log('[Admin] Visuels rafraîchis:', images.length, 'images');

      const NUM_ROWS = 3;
      const speeds = [90, 80, 95];

      for (let row = 0; row < NUM_ROWS; row++) {
        const rowEl = document.createElement('div');
        rowEl.className = `home-visual-row ${row % 2 === 0 ? 'scroll-left' : 'scroll-right'}`;
        rowEl.style.setProperty('--scroll-duration', `${speeds[row]}s`);

        // Mélange aléatoire des images pour chaque rangée (Fisher-Yates)
        const rowImages = [...images];
        for (let i = rowImages.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rowImages[i], rowImages[j]] = [rowImages[j], rowImages[i]];
        }

        const cardsHtml = rowImages.map((src) => {
          return `<div class="home-visual-card">
            <img src="${src}" alt="" loading="lazy">
          </div>`;
        }).join('');

        rowEl.innerHTML = cardsHtml + cardsHtml;
        overlay.appendChild(rowEl);
      }
    } catch (error) {
      console.error('[Admin] Erreur rafraîchissement visuels:', error);
    }
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
      forceRetryBtn.textContent = 'Relance en cours...';

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

  // Sélecteur de langue par défaut
  const defaultLangSelect = $('#defaultLangSelect');
  if (defaultLangSelect) {
    defaultLangSelect.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      console.log('[Admin] Changement langue par défaut:', newLang);

      try {
        const result = await window.photoAPI.admin.updateDefaultLang(newLang);
        if (result.status === 'success') {
          console.log('[Admin] Langue mise à jour:', newLang);

          // Appliquer immédiatement la nouvelle langue
          if (window.state) {
            window.state.lang = newLang;
            console.log('[Admin] Langue appliquée immédiatement:', newLang);
          }

          // Afficher un feedback visuel
          defaultLangSelect.style.borderColor = '#10b981';
          setTimeout(() => {
            defaultLangSelect.style.borderColor = '';
          }, 2000);
        } else {
          console.error('[Admin] Erreur mise à jour langue:', result.error);
          defaultLangSelect.style.borderColor = '#ef4444';
        }
      } catch (error) {
        console.error('[Admin] Erreur changement langue:', error);
        defaultLangSelect.style.borderColor = '#ef4444';
      }
    });
  }

  // Checkboxes des univers de l'écran d'accueil
  let universesModified = false;
  const universeCheckboxes = document.querySelectorAll('#universeCheckboxes input[type="checkbox"]');
  universeCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const universeKey = e.target.value;
      const enabled = e.target.checked;
      console.log('[Admin] Changement univers écran d\'accueil:', universeKey, enabled);

      try {
        const result = await window.photoAPI.admin.updateHomeUniverse(universeKey, enabled);
        if (result.status === 'success') {
          console.log('[Admin] Univers mis à jour:', universeKey, enabled);
          universesModified = true;
          // Feedback visuel
          e.target.parentElement.classList.add('saved');
          setTimeout(() => {
            e.target.parentElement.classList.remove('saved');
          }, 2000);
        } else {
          console.error('[Admin] Erreur mise à jour univers:', result.error);
          e.target.checked = !enabled; // Revert
        }
      } catch (error) {
        console.error('[Admin] Erreur changement univers:', error);
        e.target.checked = !enabled; // Revert
      }
    });
  });

  // Gestion des messages de remerciement
  const thanksLangSelect = $('#thanksLangSelect');
  const thanksTitleInput = $('#thanksTitleInput');
  const thanksSubtitleInput = $('#thanksSubtitleInput');
  const thanksSaveBtn = $('#thanksSaveBtn');
  const thanksResetBtn = $('#thanksResetBtn');

  // Fonction pour charger les valeurs pour une langue
  function loadThanksValuesForLang(lang) {
    if (thanksMessages[lang]) {
      thanksTitleInput.value = thanksMessages[lang].title || '';
      thanksSubtitleInput.value = thanksMessages[lang].subtitle || '';
    } else {
      // Valeurs par défaut vides (utilisera les traductions i18n)
      thanksTitleInput.value = '';
      thanksSubtitleInput.value = '';
    }
  }

  // Charger les valeurs initiales (français par défaut)
  if (thanksLangSelect && thanksTitleInput && thanksSubtitleInput) {
    loadThanksValuesForLang('fr');

    // Changer de langue
    thanksLangSelect.addEventListener('change', (e) => {
      loadThanksValuesForLang(e.target.value);
      resetDashboardTimer();
    });

    // Sauvegarder
    if (thanksSaveBtn) {
      thanksSaveBtn.addEventListener('click', async () => {
        const lang = thanksLangSelect.value;
        const title = thanksTitleInput.value.trim();
        const subtitle = thanksSubtitleInput.value.trim();

        if (!title || !subtitle) {
          thanksSaveBtn.style.background = '#ef4444';
          thanksSaveBtn.textContent = 'Champs requis!';
          setTimeout(() => {
            thanksSaveBtn.style.background = '';
            thanksSaveBtn.textContent = 'Enregistrer';
          }, 2000);
          return;
        }

        try {
          thanksSaveBtn.disabled = true;
          thanksSaveBtn.textContent = 'Enregistrement...';

          const result = await window.photoAPI.admin.updateThanksMessage(lang, title, subtitle);
          if (result.status === 'success') {
            // Mettre à jour le cache local
            thanksMessages[lang] = { title, subtitle };
            thanksSaveBtn.style.background = '#10b981';
            thanksSaveBtn.textContent = 'Enregistré!';
            console.log('[Admin] Message remerciement mis à jour:', lang);
          } else {
            thanksSaveBtn.style.background = '#ef4444';
            thanksSaveBtn.textContent = 'Erreur!';
          }
        } catch (error) {
          console.error('[Admin] Erreur sauvegarde message:', error);
          thanksSaveBtn.style.background = '#ef4444';
          thanksSaveBtn.textContent = 'Erreur!';
        }

        setTimeout(() => {
          thanksSaveBtn.disabled = false;
          thanksSaveBtn.style.background = '';
          thanksSaveBtn.textContent = 'Enregistrer';
        }, 2000);
      });
    }

    // Réinitialiser (supprimer la config personnalisée)
    if (thanksResetBtn) {
      thanksResetBtn.addEventListener('click', async () => {
        const lang = thanksLangSelect.value;

        try {
          thanksResetBtn.disabled = true;
          thanksResetBtn.textContent = 'Réinitialisation...';

          const result = await window.photoAPI.admin.deleteThanksMessage(lang);
          if (result.status === 'success') {
            // Supprimer du cache local
            delete thanksMessages[lang];
            // Vider les champs
            thanksTitleInput.value = '';
            thanksSubtitleInput.value = '';
            thanksResetBtn.style.background = '#10b981';
            thanksResetBtn.textContent = 'Réinitialisé!';
            console.log('[Admin] Message remerciement réinitialisé:', lang);
          } else {
            thanksResetBtn.style.background = '#ef4444';
            thanksResetBtn.textContent = 'Erreur!';
          }
        } catch (error) {
          console.error('[Admin] Erreur réinitialisation:', error);
          thanksResetBtn.style.background = '#ef4444';
          thanksResetBtn.textContent = 'Erreur!';
        }

        setTimeout(() => {
          thanksResetBtn.disabled = false;
          thanksResetBtn.style.background = '';
          thanksResetBtn.textContent = 'Réinitialiser';
        }, 2000);
      });
    }
  }

  // Purge des photos
  const purgePhotosBtn = $('#purgePhotosBtn');
  const purgeStartDate = $('#purgeStartDate');
  const purgeEndDate = $('#purgeEndDate');
  const purgeResultMsg = $('#purgeResultMsg');

  if (purgePhotosBtn && purgeStartDate && purgeEndDate) {
    // Pré-remplir les dates (début du mois -> aujourd'hui)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    purgeEndDate.value = today.toISOString().split('T')[0];
    purgeStartDate.value = firstDayOfMonth.toISOString().split('T')[0];

    purgePhotosBtn.addEventListener('click', async () => {
      const startVal = purgeStartDate.value;
      const endVal = purgeEndDate.value;

      if (!startVal || !endVal) {
        showPurgeResult('Veuillez sélectionner les deux dates.', 'error');
        return;
      }

      if (new Date(startVal) > new Date(endVal)) {
        showPurgeResult('La date de début doit être avant la date de fin.', 'error');
        return;
      }

      const startISO = new Date(startVal + 'T00:00:00').toISOString();
      const endISO = new Date(endVal + 'T23:59:59').toISOString();

      // Compter les photos d'abord
      try {
        const countResult = await window.photoAPI.admin.countPhotosToPurge(startISO, endISO);
        const count = countResult?.count || 0;

        if (count === 0) {
          showPurgeResult('Aucune photo à purger dans cette période.', 'info');
          return;
        }

        // Afficher le popup de confirmation
        showPurgeConfirmModal(count, startVal, endVal, startISO, endISO);
      } catch (error) {
        console.error('[Admin] Erreur comptage purge:', error);
        showPurgeResult('Erreur lors du comptage des photos.', 'error');
      }
    });
  }

  function showPurgeResult(message, type = 'info') {
    if (!purgeResultMsg) return;
    purgeResultMsg.style.display = 'block';
    purgeResultMsg.textContent = message;
    purgeResultMsg.className = `purge-result-msg purge-result-${type}`;
    setTimeout(() => {
      purgeResultMsg.style.display = 'none';
    }, 5000);
  }

  function showPurgeConfirmModal(count, startVal, endVal, startISO, endISO) {
    const modal = document.createElement('div');
    modal.id = 'purge-confirm-modal';
    modal.innerHTML = `
      <div class="purge-confirm-overlay">
        <div class="purge-confirm-box">
          <div class="purge-confirm-icon">🗑️</div>
          <h2>Confirmer la purge</h2>
          <p>Vous êtes sur le point de supprimer <strong>${count} photo(s)</strong> du <strong>${formatDateFR(startVal)}</strong> au <strong>${formatDateFR(endVal)}</strong>.</p>
          <p class="purge-warning">Cette action est irréversible. Les fichiers seront supprimés définitivement.</p>
          <div class="purge-confirm-buttons">
            <button id="purgeConfirmYes" class="purge-btn purge-btn-yes">Oui, purger</button>
            <button id="purgeConfirmNo" class="purge-btn purge-btn-no">Annuler</button>
          </div>
        </div>
      </div>
      <style>
        .purge-confirm-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: purgeFadeIn 0.2s ease;
        }
        @keyframes purgeFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .purge-confirm-box {
          background: rgba(30, 58, 95, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 40px 60px;
          text-align: center;
          color: white;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          min-width: 400px;
          max-width: 550px;
        }
        .purge-confirm-icon {
          font-size: 64px;
          margin-bottom: 15px;
        }
        .purge-confirm-box h2 {
          margin: 0 0 15px 0;
          font-size: 24px;
        }
        .purge-confirm-box p {
          margin: 0 0 15px 0;
          opacity: 0.9;
          font-size: 16px;
          line-height: 1.5;
        }
        .purge-warning {
          color: #fbbf24;
          font-weight: 600;
          font-size: 14px !important;
        }
        .purge-confirm-buttons {
          display: flex;
          gap: 20px;
          justify-content: center;
          margin-top: 25px;
        }
        .purge-btn {
          border: none;
          border-radius: 12px;
          font-size: 18px;
          font-weight: bold;
          padding: 16px 40px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .purge-btn-yes {
          background: rgba(239, 68, 68, 0.3);
          border: 2px solid rgba(239, 68, 68, 0.5);
          color: #fff;
        }
        .purge-btn-yes:hover {
          background: rgba(239, 68, 68, 0.5);
        }
        .purge-btn-yes:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .purge-btn-no {
          background: rgba(100, 255, 100, 0.3);
          border: 2px solid rgba(100, 255, 100, 0.5);
          color: #fff;
        }
        .purge-btn-no:hover {
          background: rgba(100, 255, 100, 0.5);
        }
        .purge-btn:active {
          transform: scale(0.98);
        }
      </style>
    `;

    document.body.appendChild(modal);

    // Bouton Oui - Purger
    const yesBtn = document.getElementById('purgeConfirmYes');
    if (yesBtn) {
      yesBtn.addEventListener('click', async () => {
        yesBtn.disabled = true;
        yesBtn.textContent = 'Purge en cours...';

        try {
          const result = await window.photoAPI.admin.purgePhotos(startISO, endISO);
          modal.remove();

          if (result.status === 'success') {
            showPurgeResult(
              `${result.purged} photo(s) purgée(s) (${result.freed?.mb || 0} MB libérés)${result.errors > 0 ? `, ${result.errors} erreur(s)` : ''}`,
              result.errors > 0 ? 'warning' : 'success'
            );
            // Rafraîchir le dashboard après 3 secondes
            setTimeout(() => {
              closeDashboard();
              showAdminDashboard();
            }, 3000);
          } else {
            showPurgeResult('Erreur: ' + (result.error || 'Inconnue'), 'error');
          }
        } catch (error) {
          modal.remove();
          console.error('[Admin] Erreur purge:', error);
          showPurgeResult('Erreur lors de la purge.', 'error');
        }
      });
    }

    // Bouton Non - Annuler
    const noBtn = document.getElementById('purgeConfirmNo');
    if (noBtn) {
      noBtn.addEventListener('click', () => {
        modal.remove();
      });
    }
  }

  function formatDateFR(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  // Fermer avec Escape
  const escapeHandler = (e) => {
    // Reset timer sur activité
    closeAdminWarningModal();
    resetDashboardTimer();
    if (e.key === 'Escape' && $('#admin-dashboard')) {
      // Fermer le modal de purge si ouvert
      const purgeModal = document.getElementById('purge-confirm-modal');
      if (purgeModal) {
        purgeModal.remove();
        return;
      }
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