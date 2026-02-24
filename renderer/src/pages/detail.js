import { state } from '../state.js';
import { t, tProduct } from '../i18n.js';
import { $, getQty, getTotalCartQty, updateCartCount, toast, addOne, removeOne, cartSubtotal, cartNominal, handleOrderCancellation, showCancelOrderModal, formatPrice } from '../utils.js';
import { createFooterBar, attachFooterListeners, updateFooterBar } from '../utils.js';
import { getProductVisual } from '../data.js';

// Spinner SVG pour les boutons
const SPINNER_SVG = '<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>';

/**
 * Créer ou mettre à jour la commande locale + sync Supabase
 */
async function syncOrderAfterChange() {
  if (!window.photoAPI?.orders || !window.PRODUCTS || !state.sessionId) {
    return;
  }

  // Ne sync que si le panier n'est pas vide OU si on a déjà une commande (pour sync qty=0)
  if (state.cart.length === 0 && !state.localOrderId) {
    return;
  }

  try {
    // Calculer les montants
    const totalAmount = cartNominal(state.cart, window.PRODUCTS);
    const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
    const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

    if (state.localOrderId) {
      // MISE À JOUR de la commande existante
      console.log('[Detail] ✏️ Mise à jour commande:', state.localOrderId);

      await window.photoAPI.orders.updateDetails(state.localOrderId, {
        totalAmount,
        discountAmount,
        finalAmount,
        lastStep: 'detail'
      });

      // Re-lier les items
      await window.photoAPI.cart.linkSessionItems(state.sessionId, state.localOrderId);

      // Sync avec Supabase
      const syncResult = await window.photoAPI.orders.syncRemote(state.localOrderId, state.supabaseOrderId);
      if (syncResult?.status === 'success') {
        console.log('[Detail] ✅ Sync Supabase réussi');
        if (!state.supabaseOrderId && syncResult.response?.order?.id) {
          state.supabaseOrderId = syncResult.response.order.id;
        }
      }
    } else {
      // CRÉATION d'une nouvelle commande
      console.log('[Detail] 📦 Création nouvelle commande...');

      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const orderResult = await window.photoAPI.orders.create({
        orderId: orderId,
        participantId: state.participantId || state.sessionId,
        universeId: state.universe?.id || state.universeId || 'B',
        totalAmount: totalAmount,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        lang: state.lang || 'fr',
        email: null,
        optin: 0,
        paymentMethod: 'pending',
        notes: 'Commande créée depuis page détail',
        lastStep: 'detail'
      });

      if (orderResult?.status === 'success') {
        state.localOrderId = orderId;
        console.log('[Detail] ✅ Commande créée:', orderId);

        // Lier les items à la commande
        await window.photoAPI.cart.linkSessionItems(state.sessionId, orderId);

        // Sync avec Supabase
        const syncResult = await window.photoAPI.orders.syncRemote(orderId);
        if (syncResult?.status === 'success' && syncResult.response?.order?.id) {
          state.supabaseOrderId = syncResult.response.order.id;
          console.log('[Detail] ✅ Supabase Order ID:', state.supabaseOrderId);
        }
      }
    }
  } catch (error) {
    console.error('[Detail] ❌ Erreur sync:', error);
  }
}

// Helper pour générer les labels du footer
const getAbandonLabel = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>${t('abandon')}`;

const getPayLabel = () => {
  if (state.cart.length === 0) {
    return `${t('noProduct')} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;vertical-align:middle;margin-left:6px;"><path d="M9 18l6-6-6-6"></path></svg>`;
  }
  const total = cartSubtotal(state.cart, window.PRODUCTS);
  return `${t('pay')} ${formatPrice(total)}€ <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;vertical-align:middle;margin-left:6px;"><path d="M9 18l6-6-6-6"></path></svg>`;
};

const isCartEmpty = () => state.cart.length === 0;

const getArticleLabel = () => {
  const count = state.cart.reduce((n, l) => n + l.qty, 0);
  return `${count} ${count > 1 ? t('articles') : t('article')}`;
};

const getCartDetailHTML = () => {
  return `
    <div class="cart-detail">
      <div class="cart-detail-top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
        <span>${t('viewDetail')}</span>
      </div>
      <div class="cart-detail-bottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span class="cart-detail-count" id="cartDetailCount">${getArticleLabel()}</span>
      </div>
    </div>`;
};

// Mise à jour du footer personnalisé
const updateDetailFooter = () => {
  const footerBar = document.querySelector('.footer-bar');
  if (!footerBar) return;

  // Mettre à jour le bouton Payer
  const continueBtn = footerBar.querySelector('.btn-continue');
  if (continueBtn) {
    continueBtn.innerHTML = getPayLabel();
    // Activer/désactiver selon le panier
    if (isCartEmpty()) {
      continueBtn.disabled = true;
      continueBtn.classList.add('disabled');
    } else {
      continueBtn.disabled = false;
      continueBtn.classList.remove('disabled');
    }
  }

  // Mettre à jour le compteur d'articles
  const cartDetailCount = footerBar.querySelector('#cartDetailCount');
  if (cartDetailCount) cartDetailCount.textContent = getArticleLabel();
};

/**
 * Vérifie si un produit est de type "magnet" (basé sur le nom)
 */
const isProductMagnet = (product) => {
  const name = (product.title || '').toLowerCase();
  return name.includes('magnet');
};

/**
 * Vérifie si un produit est de type "chevalet" (basé sur le nom)
 */
const isProductChevalet = (product) => {
  const name = (product.title || '').toLowerCase();
  return name.includes('chevalet');
};

/**
 * Rafraîchir toutes les offres pour mettre à jour les prix dégressifs
 */
const refreshAllOffers = (photo) => {
  const offerElements = document.querySelectorAll('.offer');
  const currentUniverseId = state.universe?.id || state.universeId;

  // Récupérer les produits filtrés et triés par univers (même logique que dans render)
  const products = Object.values(window.PRODUCTS)
    .filter(product => {
      return !product.universe_id || product.universe_id === currentUniverseId;
    })
    .sort((a, b) => {
      // Chevalet en premier, magnet en dernier
      const aIsChevalet = isProductChevalet(a);
      const bIsChevalet = isProductChevalet(b);
      const aIsMagnet = isProductMagnet(a);
      const bIsMagnet = isProductMagnet(b);

      // Chevalet toujours en premier
      if (aIsChevalet && !bIsChevalet) return -1;
      if (!aIsChevalet && bIsChevalet) return 1;
      // Magnet toujours en dernier
      if (aIsMagnet && !bIsMagnet) return 1;
      if (!aIsMagnet && bIsMagnet) return -1;
      return 0;
    });

  offerElements.forEach((offerEl, index) => {
    if (index < products.length) {
      const product = products[index];
      const parent = offerEl.parentElement;
      const newOffer = renderOffer(photo, product);
      parent.replaceChild(newOffer, offerEl);
    }
  });
};

export const renderOffer = (photo, product) => {
  const qty = getQty(photo.id, product.id, state.cart); // Quantité de CE produit (pour le message "déjà X dans le panier")
  const totalCartQty = getTotalCartQty(state.cart); // Quantité TOTALE du panier (pour le prix dégressif global)

  // Prix dégressif GLOBAL: si panier non vide, afficher le prix next
  const nextPrice = totalCartQty >= 1 ? product.next : product.first;
  const showOld = totalCartQty >= 1; // Afficher le prix barré si panier non vide

  const el = document.createElement('div');
  el.className = 'offer';
  

  // Récupérer l'image du produit
  // Priorité 1 : thumbnail_url de l'API
  // Priorité 2 : visuels spécifiques à l'univers
  // Priorité 3 : placeholder "Image non disponible"
  let imageUrl = null;

  if (product.thumbnail) {
    imageUrl = product.thumbnail;
  } else {
    const visual = getProductVisual(state.universe.id, product.id);
    if (visual && visual.image) {
      imageUrl = visual.image;
    }
  }

  const productTitle = tProduct(product.id, product.title);
  const visuHTML = imageUrl
    ? `<img src="${imageUrl}" alt="${productTitle}" style="max-width:100%;max-height:190px;object-fit:contain;">`
    : `<div style="width:100%;height:150px;background:#f0f0f0;display:grid;place-items:center;color:#999;">Image non disponible</div>`;



el.innerHTML = `
    <div class="visu" style="display:grid;place-items:center;">${visuHTML}</div>
    <div class="info">
      <h3 class="title">${productTitle}</h3>
      <div class="sub">${t('first')} ${formatPrice(product.first)}€ · ${t('next')} ${formatPrice(product.next)}€</div>
      ${qty >= 1 ? `<div class="meta">${t('already')} ${qty} ${t('inCart')} <a href="#" class="retirer" style="color:var(--brand);text-decoration:underline;cursor:pointer;">${t('remove')}</a></div>` : ''}
    </div>
    <div class="cta">
      <div class="price">
        ${showOld ? `<span class="old">${formatPrice(product.first)}€</span>` : ''}
        <span class="pill${showOld ? ' pulse' : ''}">${formatPrice(nextPrice)}€</span>
      </div>
      <button class="cmd">${t('add')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>`;
  
  el.querySelector('.cmd').onclick = async (e) => {
    e.stopPropagation();

    // Désactiver TOUS les boutons d'action pendant la sync
    const allCmdBtns = document.querySelectorAll('.offer .cmd');
    const allRetirerLinks = document.querySelectorAll('.offer .retirer');
    allCmdBtns.forEach(btn => { btn.disabled = true; });
    allRetirerLinks.forEach(link => { link.style.pointerEvents = 'none'; link.style.opacity = '0.5'; });

    // Afficher le spinner sur le bouton cliqué
    const cmdBtn = el.querySelector('.cmd');
    const originalHTML = cmdBtn.innerHTML;
    cmdBtn.innerHTML = SPINNER_SVG;

    try {
      // Ajouter au panier local (pour l'UI)
      state.cart = addOne(photo.id, product.id, state.cart, window.PRODUCTS);
      updateCartCount();
      updateDetailFooter();

      // 🆕 Enregistrer immédiatement dans la DB (statut: en_cours)
      console.log('🔍 Debug ajout produit:');
      console.log('  - sessionId:', state.sessionId);
      console.log('  - photoAPI.cart exists:', !!window.photoAPI?.cart);
      console.log('  - photo.id:', photo.id);
      console.log('  - product.id:', product.id);

      if (window.photoAPI?.cart && state.sessionId) {
        try {
          // Prix dégressif GLOBAL: 1er article du panier = first, tous les autres = next
          const totalCartQty = getTotalCartQty(state.cart); // Quantité après ajout (cart déjà mis à jour)
          const unitPrice = totalCartQty === 1 ? product.first : product.next;

          console.log('  - Quantité totale dans panier:', totalCartQty);
          console.log('  - Prix unitaire (dégressif global):', unitPrice);

          const result = await window.photoAPI.cart.addItemImmediate({
            photoId: photo.id,
            productId: product.id,
            productName: product.title,
            quantity: 1,  // On ajoute toujours 1 item par clic
            unitPrice: unitPrice,
            totalPrice: unitPrice,  // Prix pour 1 item
            incrustationId: photo.incrustationId || null,
            sessionId: state.sessionId
          });

          if (result?.status === 'success') {
            console.log('✅ Produit enregistré en DB:', result.itemId);
            // Log ajout au panier
            if (window.photoAPI?.logger) {
              window.photoAPI.logger.cartAdd(photo.id, product.id, product.title, totalCartQty, unitPrice);
            }
          } else {
            console.error('❌ Erreur enregistrement:', result);
          }
        } catch (error) {
          console.error('❌ Erreur enregistrement produit:', error);
        }
      } else {
        console.error('❌ Impossible d\'enregistrer:');
        console.error('  - photoAPI.cart:', !!window.photoAPI?.cart);
        console.error('  - sessionId:', state.sessionId);
      }

      // 🆕 Créer ou mettre à jour la commande + sync Supabase
      await syncOrderAfterChange();

      // TOAST au click "Ajouter"
      toast(t('added'));
    } finally {
      // Restaurer le bouton cliqué
      cmdBtn.disabled = false;
      cmdBtn.innerHTML = originalHTML;
    }

    // Rafraîchir TOUTES les offres (réactive naturellement tous les boutons)
    refreshAllOffers(photo);
  };

  const retirer = el.querySelector('.retirer');
  if (retirer) {
    retirer.onclick = async (e) => {
      e.preventDefault();

      // Désactiver TOUS les boutons d'action pendant la sync
      const allCmdBtns = document.querySelectorAll('.offer .cmd');
      const allRetirerLinks = document.querySelectorAll('.offer .retirer');
      allCmdBtns.forEach(btn => { btn.disabled = true; });
      allRetirerLinks.forEach(link => { link.style.pointerEvents = 'none'; link.style.opacity = '0.5'; });

      // Afficher le spinner sur le lien cliqué
      const originalText = retirer.textContent;
      retirer.innerHTML = SPINNER_SVG;

      try {
        // Retirer du panier local
        state.cart = removeOne(photo.id, product.id, state.cart);
        updateCartCount();
        updateDetailFooter();

        // 🆕 Annuler dans la DB (statut: annulé)
        if (window.photoAPI?.cart && state.sessionId) {
          try {
            // Récupérer les items actifs de la session
            const items = await window.photoAPI.cart.getActiveSessionItems(state.sessionId);

            // Trouver l'item correspondant
            const item = items.find(i => i.photo_id === photo.id && i.product_id === product.id);

            if (item) {
              await window.photoAPI.cart.cancelItem(item.id);
              console.log('✅ Produit annulé dans DB:', item.id);
              // Log retrait du panier
              if (window.photoAPI?.logger) {
                window.photoAPI.logger.cartRemove(photo.id, product.id);
              }
            }
          } catch (error) {
            console.error('❌ Erreur annulation produit:', error);
          }
        }

        // 🆕 Créer ou mettre à jour la commande + sync Supabase
        await syncOrderAfterChange();
      } finally {
        // Restaurer le lien (même si ça va être re-rendu)
        retirer.style.pointerEvents = '';
        retirer.style.opacity = '';
        retirer.textContent = originalText;
      }

      // Rafraîchir TOUTES les offres (réactive naturellement tous les boutons)
      refreshAllOffers(photo);
    };
  }
  
  return el;
};

// Fonction pour recharger les produits si la liste est vide
async function retryLoadProducts() {
  if (Object.keys(window.PRODUCTS).length > 0) {
    return; // Produits déjà chargés
  }

  console.log('[Detail] 🔄 Produits vides, tentative de rechargement...');

  try {
    if (window.photoAPI?.products?.fetch) {
      const result = await window.photoAPI.products.fetch();

      if (result.status === 'success' && result.products && Object.keys(result.products).length > 0) {
        window.PRODUCTS = result.products;
        console.log('[Detail] ✅ Produits rechargés:', Object.keys(result.products).length, 'produit(s)');
        // Re-render la page pour afficher les produits
        window.render();
      } else {
        console.warn('[Detail] ⚠️ Aucun produit récupéré');
      }
    }
  } catch (error) {
    console.error('[Detail] ❌ Erreur rechargement produits:', error);
  }
}

export const renderDetail = (root) => {
  const p = state.currentPhoto || state.photos[0];
  const main = document.createElement('div');
  main.className = 'main detail-enter';
  const section = document.createElement('section');
  section.innerHTML = `<h2 class="detail-title">${t('photo')}</h2>
    <div class="detail-preview"><img src="${p.source}" alt=""></div>
    <!-- Notice retrait comptoir -->
    <div class="pickup-notice">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
      <span>${t('pickupNotice')}</span>
    </div>`;

  // Si aucun produit, tenter de recharger
  if (Object.keys(window.PRODUCTS).length === 0) {
    section.innerHTML += `<div style="padding:20px;text-align:center;color:#6b7280;">
      <div class="spinner" style="margin:0 auto 10px;width:24px;height:24px;border:2px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;"></div>
      <div>${t('loadingProducts') || 'Chargement des produits...'}</div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;

    // Lancer le rechargement en arrière-plan
    retryLoadProducts();
  }

  // Afficher les produits filtrés par univers
  const currentUniverseId = state.universe?.id || state.universeId;

  Object.values(window.PRODUCTS)
    .filter(product => {
      // Afficher le produit si:
      // - universe_id est null (produit global disponible pour tous les univers)
      // - universe_id correspond à l'univers actuel
      return !product.universe_id || product.universe_id === currentUniverseId;
    })
    .sort((a, b) => {
      // Chevalet en premier, magnet en dernier
      const aIsChevalet = isProductChevalet(a);
      const bIsChevalet = isProductChevalet(b);
      const aIsMagnet = isProductMagnet(a);
      const bIsMagnet = isProductMagnet(b);

      // Chevalet toujours en premier
      if (aIsChevalet && !bIsChevalet) return -1;
      if (!aIsChevalet && bIsChevalet) return 1;
      // Magnet toujours en dernier
      if (aIsMagnet && !bIsMagnet) return 1;
      if (!aIsMagnet && bIsMagnet) return -1;
      return 0;
    })
    .forEach(product => {
      section.appendChild(renderOffer(p, product));
    });

  // Ajouter un séparateur entre les produits et les autres photos
  // const sep = document.createElement('div');
  // sep.style.height = '40px';
  // section.appendChild(sep);
  
  const wrap = document.createElement('div');
  wrap.className = 'other';
  wrap.innerHTML = `<div class="section"><h2>${t('other')}</h2></div><div class="grid" id="other"></div>`;
  const grid = wrap.querySelector('#other');
  state.photos.filter(ph => ph.id !== p.id).slice(0, 2).forEach((ph, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animation = `riseIn .40s ease ${i * 140}ms both`;
    card.innerHTML = `<div class="landscape"><img src="${ph.source}" alt=""></div>`;
    card.onclick = () => { 
      state.currentPhoto = ph; 
      state.page = 'detail'; 
      state.photoIndex = 0; 
      window.render(); 
    };
    grid.appendChild(card);
  });
  section.appendChild(wrap);

  // === FOOTER ===

  const footer = document.createElement('div');
  footer.className = 'footer-bar';
  const empty = isCartEmpty();
  footer.innerHTML = `
    <div class="buttons">
      <button class="btn btn-cancel">${getAbandonLabel()}</button>
      ${getCartDetailHTML()}
      <button class="btn btn-continue${empty ? ' disabled' : ''}" ${empty ? 'disabled' : ''}>${getPayLabel()}</button>
    </div>`;

  // Event listeners pour le footer
  footer.querySelector('.btn-cancel').onclick = async () => {
    // Si le panier n'est pas vide, afficher le modal de confirmation
    if (state.cart && state.cart.length > 0) {
      showCancelOrderModal(async () => {
        // Annuler la commande et l'enregistrer dans la DB
        await handleOrderCancellation('detail_abandonner');

        // Réinitialiser l'état et retourner au QR (avec reset langue)
        if (window.backToQR) {
          await window.backToQR();
        } else {
          state.page = 'qr';
          state.universe = null;
          state.photos = [];
          state.cart = [];
          state.localOrderId = null;
          state.supabaseOrderId = null;
          updateCartCount();
          window.render();
        }
      });
    } else {
      // Panier vide, retourner directement au QR (avec reset langue)
      if (window.backToQR) {
        window.backToQR();
      } else {
        state.page = 'qr';
        state.universe = null;
        state.photos = [];
        state.cart = [];
        window.render();
      }
    }
  };

  footer.querySelector('.btn-continue').onclick = () => {
    // Naviguer vers la page panier
    state.page = 'cart';
    window.render();
  };

  // Click sur cart-detail pour aller au panier
  footer.querySelector('.cart-detail').onclick = () => {
    // alert("Ce bouton n'est pas encore fonctionnel pour le moment.");
    state.page = 'cart';
    window.render();
  };

/*
const footerBar = document.createElement('div');
footerBar.className = 'footer-bar';
footerBar.innerHTML = `
  <div class="info">
    <span style="font-size: 28px;">🛒</span>
    ${state.cart.length > 0 ? `<span class="qty-badge">${state.cart.reduce((n, l) => n + l.qty, 0)}</span>` : ''}
    <span class="price">${state.cart.length > 0 ? (state.cart.reduce((s, l) => s + (window.PRODUCTS[l.productId].first * l.qty), 0)).toFixed(2) : '0.00'}€</span>
  </div>
  <div class="buttons">
    <button class="btn btn-cancel">${t('quit')}</button>
    <button class="btn btn-continue">${t('viewCart')}</button>
  </div>`;

footerBar.querySelector('.btn-cancel').onclick = () => {
  // Retourner au QR (avec reset langue)
  if (window.backToQR) {
    window.backToQR();
  } else {
    state.page = 'qr';
    state.universe = null;
    state.photos = [];
    state.cart = [];
    window.render();
  }
};

footerBar.querySelector('.btn-continue').onclick = () => {
  state.page = 'cart';
  window.render();
};


  */
  main.appendChild(section);
  main.appendChild(footer);
  //main.appendChild(footerBar);
  root.appendChild(main);

};