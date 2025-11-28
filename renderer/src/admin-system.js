/**
 * admin-system.js - Simple admin login
 * Appuyer sur "A" pour afficher le login
 * "A" bloguée dans popup + boutons fixes
 */

const $ = (selector) => document.querySelector(selector);

const ADMIN_PASSWORD = 'admin123'; // À changer en ENV

let isLoginOpen = false;

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
  console.log('[Admin] Zone long press créée (coin haut gauche)');
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
    <div class="admin-login-container">
      <div class="admin-login-box">
        <h2>🔐 Admin</h2>
        <div class="admin-password-display" id="adminPasswordDisplay">
          <span class="password-dots" id="passwordDots"></span>
        </div>
        <div class="admin-error-msg" id="adminErrorMsg"></div>

        <!-- Clavier virtuel complet (style form.js) -->
        <div class="admin-kb" id="adminKb"></div>

        <div class="admin-buttons">
          <button id="adminOkBtn" class="admin-btn-ok">Valider</button>
          <button id="adminCancelBtn" class="admin-btn-cancel">Annuler</button>
        </div>
      </div>
    </div>

    <style>
      .admin-password-display {
        background: rgba(255,255,255,0.1);
        border: 2px solid rgba(255,255,255,0.3);
        border-radius: 8px;
        padding: 15px 20px;
        margin-bottom: 15px;
        min-height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .password-dots {
        font-size: 24px;
        letter-spacing: 8px;
        color: #fff;
      }
      .admin-kb {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }
      .admin-kb-row {
        display: flex;
        justify-content: center;
        gap: 6px;
      }
      .admin-key {
        background: rgba(255,255,255,0.15);
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 8px;
        color: #fff;
        font-size: 18px;
        font-weight: bold;
        min-width: 44px;
        height: 48px;
        padding: 0 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .admin-key:hover {
        background: rgba(255,255,255,0.25);
        transform: scale(1.05);
      }
      .admin-key:active {
        background: rgba(255,255,255,0.35);
        transform: scale(0.95);
      }
      .admin-key.delete-key {
        background: rgba(255,100,100,0.3);
        min-width: 80px;
        font-size: 14px;
      }
      .admin-key.delete-key:hover {
        background: rgba(255,100,100,0.5);
      }
      .admin-buttons {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .admin-btn-ok {
        background: rgba(100,255,100,0.3);
        border: 1px solid rgba(100,255,100,0.5);
        border-radius: 8px;
        color: #fff;
        font-size: 16px;
        font-weight: bold;
        padding: 12px 30px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .admin-btn-ok:hover {
        background: rgba(100,255,100,0.5);
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
    </div>
  `;

  document.body.appendChild(dashboard);
  
  const closeBtn = $('#adminCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('[Admin] Fermeture dashboard');
      dashboard.remove();
    });
  }

  // Fermer avec Escape
  const escapeHandler = (e) => {
    if (e.key === 'Escape' && $('#admin-dashboard')) {
      dashboard.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  
  document.addEventListener('keydown', escapeHandler);
}