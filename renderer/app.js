import { state, resetState } from './src/state.js';
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

// À appeler SEULEMENT sur la page QR
if (state.page === 'qr') {
  initDevSimulator();
}

// Au démarrage
initAdminButton();
initInactivityTimer();

window.state = state;
window.PRODUCTS = PRODUCTS;
window.UNIVERSES = UNIVERSES;

// Variable pour tracker la page précédente
let previousPage = null;

function render() {
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

  // Nettoyer la page QR si on la quitte
  if (window.cleanupQRPage && state.page !== 'qr') {
    window.cleanupQRPage();
    window.cleanupQRPage = null;
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
  else if (state.page === 'thanks') renderThanks(app);

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

function backToQR() {
  clearInterval(state.timer);
  clearTimeout(state.timer);
  resetState();
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
      // Remplacer les produits par ceux de l'API seulement s'il y en a
      window.PRODUCTS = result.products;
      console.log('[App] ✅ Produits chargés depuis l\'API:', Object.keys(result.products).length, 'produit(s)');
      console.log('[App] Produits disponibles:', result.products);
    } else if (result.status === 'success') {
      console.warn('[App] ⚠️  L\'API a retourné 0 produits - utilisation des produits par défaut');
      // Garder les produits par défaut de data.js
    } else if (result.status === 'skipped') {
      console.log('[App] ⏭️  Chargement des produits ignoré:', result.message);
      // Garder les produits par défaut
    } else {
      console.warn('[App] ⚠️  Erreur chargement produits:', result.error);
      console.log('[App] 🔄 Utilisation des produits par défaut');
      // Garder les produits par défaut de data.js
    }
  } catch (error) {
    console.error('[App] ❌ Erreur chargement produits:', error);
    console.log('[App] 🔄 Utilisation des produits par défaut');
    // Garder les produits par défaut de data.js
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
  render();

  // Charger les produits depuis l'API en parallèle
  loadProducts();

  // Vérifier la configuration après l'initialisation
  checkSetup();
});
