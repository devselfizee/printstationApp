/**
 * network-status.js - Détection et affichage du statut réseau
 * Affiche un bandeau d'avertissement quand il n'y a pas de connexion internet
 */

import { t } from './i18n.js';

let isOnline = navigator.onLine;
let banner = null;
let networkCheckInterval = null;
let onlineHandler = null;
let offlineHandler = null;

/**
 * Créer le bandeau d'avertissement
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
 * Afficher le bandeau
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
    showBanner();
  } else {
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
  isOnline: isNetworkOnline
};
