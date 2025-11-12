/**
 * admin-system.js - Simple admin login
 * Appuyer sur "A" pour afficher le login
 * "A" bloguée dans popup + boutons fixes
 */

const $ = (selector) => document.querySelector(selector);

const ADMIN_PASSWORD = 'admin123'; // À changer en ENV

let isLoginOpen = false;

// Initialiser
export function initAdminButton() {
  document.addEventListener('keydown', (e) => {
    // Si le login est ouvert, ignorer "A"
    if (isLoginOpen) return;
    
    if (e.key.toLowerCase() === 'a') {
      console.log('[Admin] Touche A détectée');
      showAdminLogin();
    }
  });
  
  console.log('[Admin] Ready - Appuyer sur "A" pour login');
}

/**
 * Afficher le login
 */
function showAdminLogin() {
  isLoginOpen = true;
  
  const modal = document.createElement('div');
  modal.id = 'admin-login-modal';
  modal.className = 'admin-login-modal';
  modal.innerHTML = `
    <div class="admin-login-container">
      <div class="admin-login-box">
        <h2>🔐 Admin</h2>
        <input type="password" id="adminPassword" placeholder="Mot de passe..." autofocus />
        <div class="admin-error-msg" id="adminErrorMsg"></div>
        <div class="admin-buttons">
          <button id="adminLoginBtn" class="admin-btn-login">Connexion</button>
          <button id="adminCancelBtn" class="admin-btn-cancel">Annuler</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const passwordInput = $('#adminPassword');
  const loginBtn = $('#adminLoginBtn');
  const cancelBtn = $('#adminCancelBtn');
  const errorMsg = $('#adminErrorMsg');

  passwordInput.onkeydown = (e) => {
    if (e.key === 'Enter') attemptLogin();
    if (e.key === 'Escape') closeModal();
  };

  // ⭐ Ajouter event listeners correctement
  if (loginBtn) {
    loginBtn.addEventListener('click', attemptLogin);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  function attemptLogin() {
    const password = passwordInput.value.trim();
    if (password === ADMIN_PASSWORD) {
      console.log('[Admin] ✅ Login success');
      closeModal();
      showAdminDashboard();
    } else {
      console.log('[Admin] ❌ Wrong password');
      errorMsg.textContent = '❌ Mot de passe incorrect';
      errorMsg.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  function closeModal() {
    console.log('[Admin] Fermeture login');
    isLoginOpen = false;
    modal.remove();
  }

  // Focus sur input
  setTimeout(() => {
    const input = $('#adminPassword');
    if (input) input.focus();
  }, 100);
}

/**
 * Afficher le dashboard
 */
async function showAdminDashboard() {
  const dashboard = document.createElement('div');
  dashboard.id = 'admin-dashboard';
  dashboard.className = 'admin-dashboard';

  // Charger les stats
  let stats = null;
  /*
  try {
    if (window.photoAPI?.getDashboardStats) {
      console.log('ye ass');
      stats = await window.photoAPI.getDashboardStats();
    }
    console.log('-----------------')
    console.log(stats);
    console.log('-----------------')
  } catch (error) {
    console.error('[Admin] Erreur stats:', error);
  }
  */

  try {
    if (window.photoAPI?.admin?.getDashboard) {
      console.log('✅ Appel getDashboard');
      stats = await window.photoAPI.admin.getDashboard();
    }
    console.log('-----------------');
    console.log(stats);
    console.log('-----------------');
  } catch (error) {
    console.error('[Admin] Erreur stats:', error);
  }

  const photos = stats?.photos || {};
  const participants = stats?.participants || {};
  const universes = stats?.universes || {};

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
            <div class="period-value">-- €</div>
          </div>
          <div class="period-card">
            <div class="period-label">Cette semaine</div>
            <div class="period-value">-- €</div>
          </div>
          <div class="period-card">
            <div class="period-label">Ce mois</div>
            <div class="period-value">-- €</div>
          </div>
        </div>
      </section>

      <section class="admin-section">
        <h2>🛍️ Par Produit</h2>
        <table class="admin-table">
          <tr>
            <th>Produit</th>
            <th>Quantité</th>
            <th>Montant</th>
          </tr>
          <tr><td colspan="3" style="text-align:center;color:#999;">À implémenter</td></tr>
        </table>
      </section>

      <section class="admin-section">
        <div class="admin-total">
          <div>TOTAL</div>
          <div class="total-value">-- €</div>
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