import { state } from './state.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => root.querySelectorAll(sel);

export const keyFor = (photoId, productId) => `${photoId}::${productId}`;
export const getQty = (photoId, productId, cart) => 
  (cart.find(l => l.key === keyFor(photoId, productId))?.qty) || 0;

export const unitPrice = (product, idx) => idx === 1 ? product.first : product.next;

export const lineTotal = (product, qty) => {
  let sum = 0;
  for (let i = 1; i <= qty; i++) sum += unitPrice(product, i);
  return sum;
};

export const cartSubtotal = (cart, products) => 
  cart.reduce((s, l) => s + lineTotal(products[l.productId], l.qty), 0);

export const cartNominal = (cart, products) => 
  cart.reduce((s, l) => s + l.qty * products[l.productId].first, 0);

export const toast = (text, isError = false) => {
  //console.log('iserror ?' + isError);
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  if (isError) {
    toastEl.classList.add('error');
  }
  toastEl.textContent = text;
  container.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 2000);
};



export const updateCartCount = () => {
  const c = $('#cartCount');
  if (c) c.textContent = state.cart.reduce((a, b) => a + b.qty, 0);
};

export const addOne = (photoId, productId, cart, products) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (line) line.qty += 1;
  else cart.push({ key: k, photoId, productId, qty: 1 });
  return cart;
};

export const removeOne = (photoId, productId, cart) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (!line) return cart;
  line.qty -= 1;
  return line.qty <= 0 ? cart.filter(l => l.key !== k) : cart;
};

export const formatPrice = (price) => {
  const rounded = Math.round(price * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
};



// Ajouter dans renderer/src/utils.js

export const createFooterBar = (config = {}) => {
  const footerBar = document.createElement('div');
  footerBar.className = 'footer-bar';
  footerBar.innerHTML = getFooterHTML(config);
  return footerBar;
};

export const getFooterHTML = (config = {}) => {
  const { state } = window;
  const totalQty = state.cart.reduce((n, l) => n + l.qty, 0);
  const totalPrice = state.cart.length > 0 ? cartSubtotal(state.cart, window.PRODUCTS) : 0;

  // Config par défaut
  const {
    cancelLabel = 'Quitter',
    continueLabel = 'Voir le panier',
    onCancel = null,
    onContinue = null,
    showPrice = false
  } = config;
  
  // Désactiver le bouton "Voir le panier" si le panier est vide
  const isCartEmpty = totalQty === 0;

  return `
    ${showPrice ? `
      <div class="info">
        <span style="font-size: 28px;">🛒</span>
        ${totalQty > 0 ? `<span class="qty-badge">${totalQty}</span>` : ''}
        <span class="price">${formatPrice(totalPrice)}€</span>
      </div>
    ` : ''}
    <div class="buttons">
      <button class="btn btn-cancel">${cancelLabel}</button>
      <button class="btn btn-continue${isCartEmpty ? ' disabled' : ''}" ${isCartEmpty ? 'disabled' : ''}>${continueLabel}</button>
    </div>`;
};

export const updateFooterBar = (config = {}) => {
  const footerBar = document.querySelector('.footer-bar');
  if (!footerBar) return;
  footerBar.innerHTML = getFooterHTML(config);
  attachFooterListeners(config);
};

/**
 * Affiche un modal de confirmation pour quitter si le panier n'est pas vide
 */
export const showQuitConfirmModal = (onConfirm) => {
  // Supprimer un modal existant
  const existingModal = document.getElementById('quit-confirm-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'quit-confirm-modal';
  modal.className = 'quit-confirm-modal';
  modal.innerHTML = `
    <div class="quit-confirm-overlay"></div>
    <div class="quit-confirm-box">
      <div class="quit-confirm-icon">🛒</div>
      <h3 class="quit-confirm-title">Attention</h3>
      <p class="quit-confirm-message">Des articles se trouvent déjà dans votre panier. Souhaitez-vous vraiment quitter la page ?</p>
      <div class="quit-confirm-buttons">
        <button class="btn btn-cancel-modal">Annuler</button>
        <button class="btn btn-confirm-quit">Quitter</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Animations d'entrée
  setTimeout(() => modal.classList.add('visible'), 10);

  // Gestionnaires de boutons
  modal.querySelector('.btn-cancel-modal').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('.btn-confirm-quit').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.remove();
      onConfirm();
    }, 300);
  };

  // Fermer en cliquant sur l'overlay
  modal.querySelector('.quit-confirm-overlay').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };
};

export const attachFooterListeners = (config = {}) => {
  setTimeout(() => {
    const { state } = window;
    const cancelBtn = document.querySelector('.btn-cancel');
    const continueBtn = document.querySelector('.btn-continue');

    // Action par défaut pour quitter
    const defaultQuitAction = () => {
      state.page = 'qr';
      state.universe = null;
      state.photos = [];
      state.cart = [];
      window.render();
    };

    // Handlers custom ou defaults
    const onCancel = config.onCancel || (() => {
      // Si le panier n'est pas vide, afficher le modal de confirmation
      if (state.cart && state.cart.length > 0) {
        showQuitConfirmModal(defaultQuitAction);
      } else {
        defaultQuitAction();
      }
    });

    const onContinue = config.onContinue || (() => {
      state.page = 'cart';
      window.render();
    });

    if (cancelBtn) {
      cancelBtn.onclick = onCancel;
    }

    if (continueBtn) {
      continueBtn.onclick = onContinue;
    }
  }, 0);
};

