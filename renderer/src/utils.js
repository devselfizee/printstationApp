import { state } from './state.js';
import { t } from './i18n.js';

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

  // Icône X pour le bouton Abandonner
  const abandonIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  // Config par défaut avec traductions
  const {
    cancelLabel = `${abandonIcon}${t('abandon')}`,
    cancelClass = '',
    continueLabel = t('viewCart'),
    onCancel = null,
    onContinue = null,
    showPrice = false,
    showBadge = true
  } = config;

  // Désactiver le bouton "Voir le panier" si le panier est vide
  const isCartEmpty = totalQty === 0;

  // Classes du bouton cancel
  const cancelBtnClasses = `btn btn-cancel${cancelClass ? ' ' + cancelClass : ''}`;

  return `
    ${showPrice ? `
      <div class="info">
        <span style="font-size: 28px;">🛒</span>
        ${totalQty > 0 ? `<span class="qty-badge">${totalQty}</span>` : ''}
        <span class="price">${formatPrice(totalPrice)}€</span>
      </div>
    ` : ''}
    <div class="buttons">
      <button class="${cancelBtnClasses}">${cancelLabel}</button>
      <button class="btn btn-continue${isCartEmpty ? ' disabled' : ''}" ${isCartEmpty ? 'disabled' : ''}>${continueLabel}${showBadge && totalQty > 0 ? `<span class="btn-badge">${totalQty}</span>` : ''}</button>
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
  const abandonIconModal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  modal.innerHTML = `
    <div class="quit-confirm-overlay"></div>
    <div class="quit-confirm-box">
      <div class="quit-confirm-icon">🛒</div>
      <h3 class="quit-confirm-title">Attention</h3>
      <p class="quit-confirm-message">Des articles se trouvent déjà dans votre panier. Souhaitez-vous vraiment abandonner ?</p>
      <div class="quit-confirm-buttons">
        <button class="btn btn-cancel-modal">${t('continueShopping')}</button>
        <button class="btn btn-confirm-quit">${abandonIconModal}${t('abandon')}</button>
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

/**
 * Affiche un modal de confirmation pour annuler une commande (page panier ou paiement)
 */
export const showCancelOrderModal = (onCancel) => {
  // Supprimer un modal existant
  const existingModal = document.getElementById('cancel-order-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'cancel-order-modal';
  modal.className = 'quit-confirm-modal';
  modal.innerHTML = `
    <div class="quit-confirm-overlay"></div>
    <div class="quit-confirm-box">
      <div class="quit-confirm-icon">⚠️</div>
      <h3 class="quit-confirm-title">Attention</h3>
      <p class="quit-confirm-message">${t('cancelOrderConfirm')}</p>
      <div class="quit-confirm-buttons">
        <button class="btn btn-confirm-quit btn-cancel-order">${t('cancelOrder')}</button>
        <button class="btn btn-cancel-modal btn-continue-shopping">${t('continueShopping')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Animations d'entrée
  setTimeout(() => modal.classList.add('visible'), 10);

  // Gestionnaires de boutons
  modal.querySelector('.btn-continue-shopping').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('.btn-cancel-order').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.remove();
      onCancel();
    }, 300);
  };

  // Fermer en cliquant sur l'overlay
  modal.querySelector('.quit-confirm-overlay').onclick = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };
};

/**
 * Gérer l'annulation d'une commande avec enregistrement dans la DB et sync Supabase
 * À utiliser depuis listing.js, detail.js et inactivity-timer.js
 */
export const handleOrderCancellation = async (source = 'unknown') => {
  const { state } = window;

  // Si le panier est vide, rien à annuler
  if (!state.cart || state.cart.length === 0) {
    console.log('[CancelOrder] Panier vide, rien à annuler');
    return;
  }

  console.log(`[CancelOrder] Annulation depuis: ${source}`);
  console.log(`[CancelOrder] Articles dans le panier: ${state.cart.length}`);
  console.log(`[CancelOrder] Étape la plus avancée: ${state.furthestStep}`);
  console.log(`[CancelOrder] Local Order ID: ${state.localOrderId || 'non défini'}`);
  console.log(`[CancelOrder] Supabase Order ID: ${state.supabaseOrderId || 'non défini'}`);

  try {
    // CAS 1: Une commande existe déjà (localOrderId et/ou supabaseOrderId)
    if (state.localOrderId || state.supabaseOrderId) {
      console.log('[CancelOrder] Commande existante détectée, mise à jour du statut...');

      // 1a. Mettre à jour le statut sur Supabase si l'ID existe
      if (state.supabaseOrderId && window.photoAPI?.orders?.cancelRemote) {
        try {
          console.log('[CancelOrder] Annulation sur Supabase...');
          await window.photoAPI.orders.cancelRemote(state.supabaseOrderId);
          console.log('[CancelOrder] ✅ Commande annulée sur Supabase');
        } catch (error) {
          console.error('[CancelOrder] ❌ Erreur annulation Supabase:', error);
        }
      }

      // 1b. Mettre à jour le statut en local si l'ID existe
      if (state.localOrderId && window.photoAPI?.orders) {
        try {
          // Annuler les items de la session
          await window.photoAPI.cart.cancelSession(state.sessionId, state.localOrderId);
          console.log('[CancelOrder] ✅ Items annulés');

          // Mettre à jour le statut de la commande à "cancelled"
          await window.photoAPI.orders.updateStatus(state.localOrderId, 'cancelled', `Annulée - ${source}`);
          console.log('[CancelOrder] ✅ Commande locale marquée comme annulée:', state.localOrderId);
        } catch (error) {
          console.error('[CancelOrder] ❌ Erreur mise à jour locale:', error);
        }
      }
    }
    // CAS 2: Aucune commande n'existe, en créer une nouvelle avec statut cancelled
    else if (window.photoAPI?.orders && window.photoAPI?.cart && state.sessionId) {
      console.log('[CancelOrder] Aucune commande existante, création d\'une commande annulée...');

      // Créer l'ID de commande
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Calculer les montants
      const totalAmount = cartNominal(state.cart, window.PRODUCTS);
      const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
      const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

      // Créer la commande avec statut "pending" (sera changé à cancelled après)
      const orderResult = await window.photoAPI.orders.create({
        orderId: orderId,
        participantId: state.participantId || state.sessionId,
        universeId: state.universe?.id || state.universeId || 'B',
        totalAmount: totalAmount,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        lang: state.lang || 'fr',  // Langue choisie par le client
        email: null,
        optin: 0,
        paymentMethod: null,
        notes: `Commande annulée - source: ${source}`,
        lastStep: state.furthestStep || null  // Étape la plus avancée atteinte
      });

      if (orderResult?.status === 'success') {
        console.log('[CancelOrder] ✅ Commande créée:', orderId);

        // Associer tous les items de la session à cette commande et les marquer comme annulés
        await window.photoAPI.cart.cancelSession(state.sessionId, orderId);
        console.log('[CancelOrder] ✅ Items annulés et liés à la commande:', orderId);

        // Mettre à jour le statut de la commande à "cancelled"
        await window.photoAPI.orders.updateStatus(orderId, 'cancelled', `Annulée - ${source}`);
        console.log('[CancelOrder] ✅ Commande marquée comme annulée');

        // Synchroniser la nouvelle commande annulée avec l'API distante
        try {
          console.log('[CancelOrder] 🔄 Synchronisation de la commande annulée avec l\'API distante...');
          const syncResult = await window.photoAPI.orders.syncRemote(orderId);

          if (syncResult?.status === 'success') {
            console.log('[CancelOrder] ✅ Commande annulée synchronisée avec l\'API distante');
          } else if (syncResult?.status === 'skipped') {
            console.log('[CancelOrder] ⏭️  Synchronisation ignorée:', syncResult.message);
          } else {
            console.warn('[CancelOrder] ⚠️  Erreur synchronisation API:', syncResult?.error);
          }
        } catch (syncError) {
          console.error('[CancelOrder] ❌ Erreur lors de la synchronisation:', syncError);
        }
      } else {
        console.error('[CancelOrder] ❌ Erreur création commande annulée:', orderResult?.error);
      }
    }

    // Log de l'événement
    if (window.photoAPI?.logger) {
      window.photoAPI.logger.info('ORDER_CANCELLED', `Commande annulée depuis ${source}`, {
        cartItems: state.cart.length,
        sessionId: state.sessionId
      });
    }

  } catch (error) {
    console.error('[CancelOrder] ❌ Erreur globale annulation:', error);
  }
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

