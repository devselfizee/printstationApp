/**
 * inactivity-timer.js - Global inactivity timer for kiosk mode
 * Returns to QR page after a period of inactivity on any other page
 */

import { t } from './i18n.js';
import { handleOrderCancellation, updateCartCount } from './utils.js';

// Timeout d'inactivité global (par défaut 60s, configurable via .env INACTIVITY_TIMEOUT_MS)
const INACTIVITY_TIMEOUT = window.appConfig?.inactivityTimeout || 60000;

// Timeout pour le warning avant retour (10 secondes avant la fin)
const WARNING_BEFORE_TIMEOUT = 10000;

let inactivityTimer = null;
let warningTimer = null;
let warningModal = null;
let countdownInterval = null;
let isTimerActive = false;
let isInitialized = false;

// Pages exemptées du timer (page d'accueil)
const EXEMPT_PAGES = ['qr'];

// Pages où le timer est pausé (paiement en cours)
const PAUSED_PAGES = ['payment'];

// Liste des événements d'activité
const ACTIVITY_EVENTS = ['click', 'touchstart', 'mousemove', 'keydown', 'scroll'];

/**
 * Initialiser le système de timer d'inactivité
 */
export function initInactivityTimer() {
  // Éviter les initialisations multiples (source de fuite mémoire)
  if (isInitialized) {
    console.log('[Inactivity] Déjà initialisé, skip');
    return;
  }

  // Écouter les événements d'activité utilisateur
  ACTIVITY_EVENTS.forEach(event => {
    document.addEventListener(event, handleUserActivity, { passive: true });
  });

  isInitialized = true;
  console.log(`[Inactivity] Timer initialisé (timeout: ${INACTIVITY_TIMEOUT / 1000}s)`);
}

/**
 * Nettoyer complètement le timer et les listeners (pour shutdown)
 */
export function cleanupInactivityTimer() {
  stopInactivityTimer();

  // Retirer les event listeners
  if (isInitialized) {
    ACTIVITY_EVENTS.forEach(event => {
      document.removeEventListener(event, handleUserActivity);
    });
    isInitialized = false;
    console.log('[Inactivity] Cleanup complet - listeners retirés');
  }
}

/**
 * Gérer l'activité utilisateur - reset le timer
 */
function handleUserActivity() {
  if (!isTimerActive) return;

  // Fermer le warning si affiché
  if (warningModal) {
    closeWarningModal();
  }

  // Reset le timer
  resetTimer();
}

/**
 * Démarrer le timer d'inactivité
 */
export function startInactivityTimer() {
  const currentPage = window.state?.page;

  // Ne pas démarrer sur les pages exemptées
  if (EXEMPT_PAGES.includes(currentPage)) {
    console.log('[Inactivity] Page exemptée, timer non démarré');
    stopInactivityTimer();
    return;
  }

  // Pause sur les pages de paiement
  if (PAUSED_PAGES.includes(currentPage)) {
    console.log('[Inactivity] Page de paiement, timer en pause');
    stopInactivityTimer();
    return;
  }

  isTimerActive = true;
  resetTimer();
  console.log(`[Inactivity] Timer démarré sur page: ${currentPage}`);
}

/**
 * Arrêter le timer d'inactivité
 */
export function stopInactivityTimer() {
  isTimerActive = false;

  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  closeWarningModal();
}

/**
 * Reset le timer
 */
function resetTimer() {
  // Clear existing timers
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  if (warningTimer) {
    clearTimeout(warningTimer);
  }

  // Timer pour afficher le warning
  const warningTime = INACTIVITY_TIMEOUT - WARNING_BEFORE_TIMEOUT;
  if (warningTime > 0) {
    warningTimer = setTimeout(() => {
      showWarningModal();
    }, warningTime);
  }

  // Timer principal pour retour à l'accueil
  inactivityTimer = setTimeout(() => {
    handleTimeout();
  }, INACTIVITY_TIMEOUT);
}

/**
 * Afficher le modal de warning
 */
function showWarningModal() {
  if (warningModal) return;

  let countdown = Math.ceil(WARNING_BEFORE_TIMEOUT / 1000);

  warningModal = document.createElement('div');
  warningModal.id = 'inactivity-warning-modal';
  warningModal.className = 'admin-login-modal'; // Réutiliser le style admin
  warningModal.innerHTML = `
    <div class="inactivity-warning-container">
      <div class="inactivity-warning-box">
        <div class="inactivity-warning-icon">⏰</div>
        <h2>${t('inactivityTitle')}</h2>
        <div class="inactivity-countdown-display">
          <span id="inactivity-countdown">${countdown}</span>
        </div>
        <div class="inactivity-warning-message">
          ${t('backHome')} in ${countdown}s
        </div>
        <div class="admin-buttons">
          <button class="admin-btn-ok" id="inactivity-continue-btn">
            ${t('continueShopping')}
          </button>
        </div>
      </div>
    </div>
    <style>
      .inactivity-warning-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .inactivity-warning-box {
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
      .inactivity-warning-box h2 {
        margin: 0 0 20px 0;
        font-size: 28px;
      }
      .inactivity-warning-icon {
        font-size: 64px;
        margin-bottom: 15px;
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      .inactivity-countdown-display {
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
      #inactivity-countdown {
        font-size: 48px;
        font-weight: bold;
        color: #fbbf24;
      }
      .inactivity-warning-message {
        font-size: 18px;
        margin-bottom: 25px;
        opacity: 0.8;
      }
      .inactivity-warning-box .admin-buttons {
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 20px;
      }
      .inactivity-warning-box .admin-btn-ok {
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
      .inactivity-warning-box .admin-btn-ok:hover {
        background: rgba(100, 255, 100, 0.5);
      }
      .inactivity-warning-box .admin-btn-ok:active {
        transform: scale(0.98);
      }
    </style>
  `;

  document.body.appendChild(warningModal);

  // Bouton continuer
  const continueBtn = document.getElementById('inactivity-continue-btn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      handleUserActivity();
    });
  }

  // Countdown
  const countdownEl = document.getElementById('inactivity-countdown');
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) {
      countdownEl.textContent = countdown;
    }
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);

  console.log('[Inactivity] Warning affiché');
}

/**
 * Fermer le modal de warning
 */
function closeWarningModal() {
  if (warningModal) {
    warningModal.remove();
    warningModal = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/**
 * Gérer le timeout - retour à l'accueil
 */
async function handleTimeout() {
  const currentPage = window.state?.page;
  console.log('[Inactivity] Timeout - retour à l\'accueil depuis page:', currentPage);

  // Log de l'événement
  if (window.photoAPI?.logger) {
    window.photoAPI.logger.info('INACTIVITY', 'Timeout inactivité - retour accueil', {
      previousPage: currentPage,
      timeout: INACTIVITY_TIMEOUT
    });
  }

  // Fermer le warning
  closeWarningModal();

  // Arrêter le timer
  stopInactivityTimer();

  // Si on est sur la page form, ne PAS créer de commande ni poster vers Supabase
  // Juste retourner à l'accueil
  if (currentPage === 'form') {
    console.log('[Inactivity] Page form - retour accueil sans création de commande');
  } else {
    // Si le panier n'est pas vide et qu'on n'est PAS sur form, annuler la commande et l'enregistrer
    if (window.state?.cart && window.state.cart.length > 0) {
      console.log('[Inactivity] Panier non vide, annulation de la commande...');
      await handleOrderCancellation('inactivity_timeout');
    }
  }

  // Réinitialiser l'état et retourner à l'accueil
  if (window.state) {
    window.state.page = 'qr';
    window.state.universe = null;
    window.state.photos = [];
    window.state.cart = [];
    window.state.localOrderId = null;
    window.state.supabaseOrderId = null;
    updateCartCount();
    if (window.render) {
      window.render();
    }
  } else if (window.backToQR) {
    window.backToQR();
  }
}

/**
 * Vérifier si le timer est actif
 */
export function isInactivityTimerActive() {
  return isTimerActive;
}
