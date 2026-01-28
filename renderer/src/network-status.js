/**
 * network-status.js - Détection et affichage du statut réseau
 * Affiche un écran bloquant quand il n'y a pas de connexion internet
 */

import { t } from './i18n.js';

let isOnline = navigator.onLine;
let banner = null;
let blockingScreen = null;
let networkCheckInterval = null;
let onlineHandler = null;
let offlineHandler = null;
let isChecking = false;

/**
 * Créer l'écran bloquant plein écran
 */
async function createBlockingScreen() {
  if (blockingScreen) return blockingScreen;

  blockingScreen = document.createElement('div');
  blockingScreen.id = 'network-blocking-screen';
  blockingScreen.className = 'network-blocking-screen';

  // Récupérer la version depuis appConfig de manière async
  let version = '';
  try {
    const config = await window.appConfig?.getConfig?.();
    version = config?.version || '';
  } catch (err) {
    console.warn('[Network] Impossible de récupérer la version:', err);
  }

  blockingScreen.innerHTML = `
    <div class="network-blocking-content">
      <div class="network-blocking-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
      </div>
      <h1 class="network-blocking-title">Connexion interrompue</h1>
      <p class="network-blocking-message">
        La connexion internet est momentanément indisponible.<br>
        Merci de patienter ou de signaler ce problème au personnel.
      </p>
      <button class="network-blocking-retry-btn" id="network-retry-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>Réessayer</span>
      </button>
      <p class="network-blocking-footer">
        Le service reprendra dès que la connexion sera rétablie.
      </p>
    </div>
    ${version ? `<div class="network-blocking-version">version ${version}</div>` : ''}
  `;

  return blockingScreen;
}

/**
 * Créer le bandeau d'avertissement (mode non-bloquant)
 */
function createBanner() {
  if (banner) return banner;

  banner = document.createElement('div');
  banner.id = 'network-offline-banner';
  banner.className = 'network-offline-banner';
  banner.innerHTML = `
    <div class="network-offline-content">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
      <span class="network-offline-text">${t('noInternet')}</span>
    </div>
  `;

  return banner;
}

/**
 * Afficher l'écran bloquant plein écran
 */
async function showBlockingScreen() {
  const existingScreen = document.getElementById('network-blocking-screen');
  if (existingScreen) return;

  const screenEl = await createBlockingScreen();
  document.body.appendChild(screenEl);

  // Ajouter l'événement sur le bouton retry
  const retryBtn = document.getElementById('network-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', handleRetryClick);
  }

  // Animation d'entrée
  requestAnimationFrame(() => {
    screenEl.classList.add('visible');
  });

  console.log('[Network] Écran bloquant affiché');
}

/**
 * Masquer l'écran bloquant
 */
function hideBlockingScreen() {
  const screenEl = document.getElementById('network-blocking-screen');
  if (!screenEl) return;

  screenEl.classList.remove('visible');

  // Supprimer après l'animation
  setTimeout(() => {
    screenEl.remove();
    blockingScreen = null;
  }, 300);

  console.log('[Network] Écran bloquant masqué');
}

/**
 * Gérer le clic sur le bouton retry
 */
async function handleRetryClick() {
  if (isChecking) return;

  const retryBtn = document.getElementById('network-retry-btn');
  if (!retryBtn) return;

  isChecking = true;
  retryBtn.disabled = true;
  retryBtn.innerHTML = `
    <svg class="spinning" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
    <span>Vérification en cours...</span>
  `;

  console.log('[Network] Vérification manuelle de la connexion...');

  try {
    // Utiliser l'API principale pour vérifier la connexion
    const result = await window.photoAPI?.network?.checkConnection();

    if (result && result.connected) {
      console.log('[Network] ✅ Connexion rétablie !');
      isOnline = true;
      hideBlockingScreen();
      hideBanner();
      // Recharger la page pour réinitialiser l'app
      window.location.reload();
    } else {
      console.log('[Network] ❌ Toujours pas de connexion');
      retryBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>Réessayer</span>
      `;
      retryBtn.disabled = false;
    }
  } catch (error) {
    console.error('[Network] Erreur vérification:', error);
    retryBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
      <span>Réessayer</span>
    `;
    retryBtn.disabled = false;
  }

  isChecking = false;
}

/**
 * Afficher le bandeau (mode non-bloquant)
 */
function showBanner() {
  const existingBanner = document.getElementById('network-offline-banner');
  if (existingBanner) return;

  const bannerEl = createBanner();
  document.body.insertBefore(bannerEl, document.body.firstChild);

  // Animation d'entrée
  requestAnimationFrame(() => {
    bannerEl.classList.add('visible');
  });

  console.log('[Network] Bandeau hors-ligne affiché');
}

/**
 * Masquer le bandeau
 */
function hideBanner() {
  const bannerEl = document.getElementById('network-offline-banner');
  if (!bannerEl) return;

  bannerEl.classList.remove('visible');

  // Supprimer après l'animation
  setTimeout(() => {
    bannerEl.remove();
    banner = null;
  }, 300);

  console.log('[Network] Bandeau hors-ligne masqué');
}

/**
 * Mettre à jour le statut
 */
function updateStatus() {
  const wasOnline = isOnline;
  isOnline = navigator.onLine;

  if (wasOnline !== isOnline) {
    console.log(`[Network] Statut changé: ${isOnline ? 'En ligne' : 'Hors ligne'}`);
  }

  if (!isOnline) {
    // Afficher l'écran bloquant plein écran (plus visible qu'un simple bandeau)
    showBlockingScreen();
  } else {
    hideBlockingScreen();
    hideBanner();
  }
}

/**
 * Vérification supplémentaire via une requête réelle
 * (navigator.onLine peut être faux positif)
 */
async function checkRealConnectivity() {
  try {
    // Essayer de ping un endpoint fiable
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!isOnline) {
      isOnline = true;
      hideBanner();
      console.log('[Network] Connexion restaurée (vérification réelle)');
    }
  } catch (error) {
    if (isOnline && navigator.onLine) {
      // navigator.onLine dit qu'on est connecté mais la requête a échoué
      // Peut-être un problème de DNS ou de firewall
      console.log('[Network] Connexion détectée mais accès limité');
    }
  }
}

/**
 * Vérification initiale de la connexion au démarrage
 * Bloque l'application si pas de connexion
 * @returns {Promise<boolean>} true si connecté, false sinon
 */
export async function checkInitialConnection() {
  console.log('[Network] ═══════════════════════════════════════════════');
  console.log('[Network] 🔍 VÉRIFICATION INITIALE DE LA CONNEXION');
  console.log('[Network] ═══════════════════════════════════════════════');

  try {
    // Utiliser l'API principale pour une vérification robuste
    const result = await window.photoAPI?.network?.checkConnection();

    if (result && result.connected) {
      console.log('[Network] ✅ Connexion internet OK au démarrage');
      isOnline = true;
      return true;
    } else {
      console.log('[Network] ❌ Pas de connexion internet au démarrage');
      isOnline = false;
      await showBlockingScreen();
      return false;
    }
  } catch (error) {
    console.error('[Network] Erreur vérification initiale:', error);
    // En cas d'erreur, on bloque par précaution
    isOnline = false;
    await showBlockingScreen();
    return false;
  }
}

/**
 * Initialiser la détection réseau
 */
export function initNetworkStatus() {
  // Éviter les initialisations multiples
  if (networkCheckInterval) {
    console.log('[Network] Déjà initialisé, skip');
    return;
  }

  console.log('[Network] Initialisation détection réseau...');
  console.log(`[Network] Statut initial: ${navigator.onLine ? 'En ligne' : 'Hors ligne'}`);

  // Vérifier le statut initial
  updateStatus();

  // Écouter les événements online/offline (stocker les handlers pour cleanup)
  onlineHandler = () => {
    console.log('[Network] Événement: online');
    updateStatus();
    // Si on repasse en ligne, masquer l'écran bloquant
    if (navigator.onLine) {
      hideBlockingScreen();
    }
  };

  offlineHandler = () => {
    console.log('[Network] Événement: offline');
    updateStatus();
  };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  // Vérification périodique (toutes les 30 secondes)
  networkCheckInterval = setInterval(() => {
    updateStatus();
    // Vérification réelle si on pense être en ligne
    if (navigator.onLine) {
      checkRealConnectivity();
    }
  }, 30000);

  console.log('[Network] Détection réseau initialisée');
}

/**
 * Nettoyer les ressources (appelé lors du shutdown)
 */
export function cleanupNetworkStatus() {
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
    console.log('[Network] Interval nettoyé');
  }

  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }

  if (offlineHandler) {
    window.removeEventListener('offline', offlineHandler);
    offlineHandler = null;
  }

  hideBanner();
  console.log('[Network] Cleanup terminé');
}

/**
 * Obtenir le statut actuel
 */
export function isNetworkOnline() {
  return isOnline;
}

export default {
  init: initNetworkStatus,
  cleanup: cleanupNetworkStatus,
  isOnline: isNetworkOnline,
  checkInitial: checkInitialConnection
};
