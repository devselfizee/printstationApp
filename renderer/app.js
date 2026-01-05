import { state, resetState, updateFurthestStep } from './src/state.js';
import { PRODUCTS, UNIVERSES } from './src/data.js';
import { t } from './src/i18n.js';
import { $, updateCartCount, addOne, removeOne } from './src/utils.js';
import { renderTopbar } from './src/pages/topbar.js';
import { renderQR } from './src/pages/qr.js';
import { renderListing } from './src/pages/listing.js';
import { renderDetail } from './src/pages/detail.js';
import { renderCart } from './src/pages/cart.js';
import { renderPayment } from './src/pages/payment.js';
import { renderForm } from './src/pages/form.js';
import { renderThanks } from './src/pages/thanks.js';
import { showUpsell, closeModal } from './src/pages/modal.js';
import { goBack } from './src/navigation.js';
import { initAdminButton } from './src/admin-system.js';
import { initDevSimulator } from './src/dev-simulator.js';
import { showSetupModal } from './src/pages/setup.js';
import { initInactivityTimer, startInactivityTimer, stopInactivityTimer } from './src/inactivity-timer.js';
import { initNetworkStatus } from './src/network-status.js';

// Note: stopAllPolls est exposé via window par photoDisplayService (chargé dans le main process)

// À appeler SEULEMENT sur la page QR
if (state.page === 'qr') {
  initDevSimulator();
}

// Au démarrage
initAdminButton();
initInactivityTimer();

window.state = state;
window.PRODUCTS = {}; // Vide par défaut, sera rempli par l'API Supabase
window.UNIVERSES = UNIVERSES;

// Variable pour tracker la page précédente
let previousPage = null;

async function render() {
  const app = $('#app');
  if (!app) return;

  // Log du changement de page
  if (window.photoAPI?.logger && state.page !== previousPage) {
    window.photoAPI.logger.pageChange(previousPage, state.page, {
      participantId: state.participantId || null,
      universeId: state.universeId || state.universe?.id || null,
      cartItems: state.cart?.length || 0
    });
    previousPage = state.page;
  }

  // Mettre à jour l'étape la plus avancée atteinte
  updateFurthestStep(state.page);

  // Nettoyer la page QR si on la quitte
  if (window.cleanupQRPage && state.page !== 'qr') {
    window.cleanupQRPage();
    window.cleanupQRPage = null;
  }

  // Arrêter tous les pollings photo si on quitte listing/detail (évite les fuites mémoire)
  if (previousPage && (previousPage === 'listing' || previousPage === 'detail') &&
      state.page !== 'listing' && state.page !== 'detail') {
    if (window.stopAllPolls) window.stopAllPolls();
  }

  app.innerHTML = '';

  // Appliquer la classe page-qr pour la page d'accueil (hauteur fixe)
  if (state.page === 'qr') {
    app.classList.add('page-qr');
    // Afficher la zone longpress admin sur la page d'accueil
    if (window.showAdminLongPressZone) window.showAdminLongPressZone();
  } else {
    app.classList.remove('page-qr');
    // Cacher la zone longpress admin sur les autres pages
    if (window.hideAdminLongPressZone) window.hideAdminLongPressZone();
  }

  // Appliquer la classe page-payment sur le body pour masquer le scrollX
  if (state.page === 'payment') {
    document.body.classList.add('page-payment');
  } else {
    document.body.classList.remove('page-payment');
  }

  const showHeader = state.page !== 'thanks' && state.page !== 'payment' && state.page !== 'form' && state.page !== 'qr';
  const showBackBtn = state.page !== 'qr' && state.page !== 'listing';

  if (showHeader) {
    app.classList.remove('no-header');
    renderTopbar(app, goBack);
    if (showBackBtn) {
      const back = $('.back-btn');
      if (back) back.classList.add('show');
    }
  } else {
    app.classList.add('no-header');
  }
  
  if (state.page === 'qr') renderQR(app);
  else if (state.page === 'listing') renderListing(app);
  else if (state.page === 'detail') renderDetail(app);
  else if (state.page === 'cart') renderCart(app);
  else if (state.page === 'payment') renderPayment(app);
  else if (state.page === 'form') renderForm(app);
  else if (state.page === 'thanks') await renderThanks(app);

  updateCartCount();

  // Gérer le timer d'inactivité selon la page
  startInactivityTimer();
}

function scanQR() {
  loadUniverse('B');
}

function loadUniverse(id) {
  // 🆕 Générer un sessionId unique pour cette session
  if (!state.sessionId) {
    state.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('✅ Session ID créé:', state.sessionId);
  }
  
  state.universe = UNIVERSES[id];
  state.photos = state.universe.photos;
  state.page = 'listing';
  render();
}

function addUpsell(photoId, productId) {
  state.cart = addOne(photoId, productId, state.cart, PRODUCTS);
  updateCartCount();
  closeModal();
  render();
}

async function backToQR() {
  clearInterval(state.timer);
  clearTimeout(state.timer);
  if (window.stopAllPolls) window.stopAllPolls();  // Arrêter tous les pollings photo
  resetState();
  // Recharger la langue par défaut depuis la config (sans re-render car on le fait après)
  await loadDefaultLang(false);
  render();
}

window.render = render;
window.scanQR = scanQR;
window.loadUniverse = loadUniverse;
window.showUpsell = showUpsell;
window.closeModal = closeModal;
window.addUpsell = addUpsell;
window.backToQR = backToQR;

// Attendre que photoAPI soit disponible
function waitForPhotoAPI(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkAPI = () => {
      if (window.photoAPI && window.photoAPI.machine) {
        console.log('[App] ✅ photoAPI disponible');
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout: photoAPI non disponible'));
      } else {
        setTimeout(checkAPI, 100);
      }
    };

    checkAPI();
  });
}

// Charger les produits depuis l'API Supabase
async function loadProducts() {
  try {
    // Attendre que photoAPI soit disponible
    await waitForPhotoAPI();

    console.log('[App] 📦 Chargement des produits depuis l\'API...');
    const result = await window.photoAPI.products.fetch();

    if (result.status === 'success' && result.products && Object.keys(result.products).length > 0) {
      // Remplacer les produits par ceux de l'API
      window.PRODUCTS = result.products;
      console.log('[App] ✅ Produits chargés depuis l\'API:', Object.keys(result.products).length, 'produit(s)');
      console.log('[App] Produits disponibles:', result.products);
    } else if (result.status === 'success') {
      // L'API a retourné 0 produits - garder vide pour éviter confusion d'IDs
      window.PRODUCTS = {};
      console.warn('[App] ⚠️  L\'API a retourné 0 produits - aucun produit disponible');
    } else if (result.status === 'skipped') {
      // Pas de connexion ou config manquante - garder vide
      window.PRODUCTS = {};
      console.log('[App] ⏭️  Chargement des produits ignoré:', result.message);
    } else {
      // Erreur API - garder vide pour éviter confusion d'IDs
      window.PRODUCTS = {};
      console.warn('[App] ⚠️  Erreur chargement produits:', result.error);
      console.log('[App] ❌ Aucun produit disponible (erreur API)');
    }
  } catch (error) {
    // Erreur système - garder vide pour éviter confusion d'IDs
    window.PRODUCTS = {};
    console.error('[App] ❌ Erreur chargement produits:', error);
    console.log('[App] ❌ Aucun produit disponible (erreur système)');
  }
}

// Charger la langue par défaut depuis la configuration
async function loadDefaultLang(shouldRender = true) {
  try {
    await waitForPhotoAPI();

    if (window.photoAPI?.admin?.getMachineConfig) {
      const result = await window.photoAPI.admin.getMachineConfig();
      if (result.status === 'success' && result.config?.default_lang) {
        state.lang = result.config.default_lang;
        console.log('[App] 🌍 Langue par défaut chargée:', state.lang);
        // Re-render pour appliquer la langue (optionnel)
        if (shouldRender) {
          render();
        }
      }
    }
  } catch (error) {
    console.error('[App] Erreur chargement langue par défaut:', error);
    // Garder 'fr' par défaut en cas d'erreur
  }
}

// Vérifier la configuration au démarrage
async function checkSetup() {
  try {
    // Attendre que photoAPI soit disponible
    await waitForPhotoAPI();

    console.log('[App] 🔍 Vérification de la configuration...');
    const result = await window.photoAPI.machine.isSetupCompleted();
    console.log('[App] Résultat complet isSetupCompleted:', JSON.stringify(result, null, 2));

    // Vérifier d'abord le statut de la réponse
    if (result.status !== 'success') {
      console.warn('[App] ⚠️  Erreur lors de la vérification:', result.error);
      // Ne pas afficher le modal si c'est une erreur système
      return;
    }

    // Si pas de config, afficher le modal
    if (!result.completed) {
      console.log('[App] ⚙️  Configuration initiale requise - Affichage du modal');
      // Petit délai pour que le DOM soit complètement chargé
      setTimeout(() => showSetupModal(), 500);
    } else {
      console.log('[App] ✅ Configuration machine OK - kiosk configuré');
    }
  } catch (error) {
    console.error('[App] ❌ Erreur vérification setup:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 PrintStation initialized');

  // Initialiser la détection réseau
  initNetworkStatus();

  render();

  // Charger la langue par défaut depuis la configuration
  loadDefaultLang();

  // Charger les produits depuis l'API en parallèle
  loadProducts();

  // Vérifier la configuration après l'initialisation
  checkSetup();
});

// ============================================
// DEV TOOLS TOGGLE (F5)
// ============================================
let devToolsVisible = false;

function toggleDevTools() {
  devToolsVisible = !devToolsVisible;
  console.log(`[DevTools] Mode dev ${devToolsVisible ? 'activé' : 'désactivé'}`);

  // Toggle le menu via IPC
  if (window.photoAPI?.app?.toggleDevMenu) {
    window.photoAPI.app.toggleDevMenu();
  }

  // Toggle les stats (.qr-stats)
  const devStats = document.getElementById('devStats');
  if (devStats) {
    devStats.style.display = devToolsVisible ? 'flex' : 'none';
  }

  // Toggle le bouton dev simulator
  const devSimBtn = document.getElementById('dev-simulator-btn');
  if (devSimBtn) {
    devSimBtn.style.display = devToolsVisible ? 'block' : 'none';
  }
}

// Écouter la touche F5 pour toggle les outils dev
document.addEventListener('keydown', (e) => {
  if (e.key === 'F5') {
    e.preventDefault(); // Empêcher le refresh par défaut
    toggleDevTools();
  }
});
