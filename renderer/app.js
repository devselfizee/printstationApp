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

// À appeler SEULEMENT sur la page QR
if (state.page === 'qr') {
  initDevSimulator();
}

// Au démarrage
initAdminButton();

window.state = state;
window.PRODUCTS = PRODUCTS;
window.UNIVERSES = UNIVERSES;

function render() {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = '';
  
  
  const showHeader = state.page !== 'thanks' && state.page !== 'payment' && state.page !== 'form' && state.page !== 'qr';
  const showBackBtn = state.page !== 'qr' && state.page !== 'listing';
  
  if (showHeader) {
    app.classList.remove('no-header');
    renderTopbar(app, goBack);
    if (showBackBtn) {
      const back = $('.back-btn');
      if (back) back.classList.add('show');
    }
  }else{

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
}

function scanQR() {
  loadUniverse('universe1');
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

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 PrintStation initialized');
  render();
});
