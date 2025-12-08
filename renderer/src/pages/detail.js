import { state } from '../state.js';
import { t } from '../i18n.js';
import { $, getQty, lineTotal, updateCartCount, toast, addOne, removeOne, cartSubtotal } from '../utils.js';
import { createFooterBar, attachFooterListeners, updateFooterBar, formatPrice } from '../utils.js';
import { getProductVisual } from '../data.js';

// Helper pour générer les labels du footer
const getAbandonLabel = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>${t('abandon')}`;

const getPayLabel = () => {
  const total = state.cart.length > 0 ? cartSubtotal(state.cart, window.PRODUCTS) : 0;
  return `${t('pay')} ${formatPrice(total)}€ <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;vertical-align:middle;margin-left:6px;"><path d="M9 18l6-6-6-6"></path></svg>`;
};

export const renderOffer = (photo, product) => {
  const qty = getQty(photo.id, product.id, state.cart);
  const nextPrice = qty >= 1 ? product.next : product.first;
  const showOld = qty >= 1;
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

  const visuHTML = imageUrl
    ? `<img src="${imageUrl}" alt="${product.title}" style="max-width:100%;max-height:190px;object-fit:contain;">`
    : `<div style="width:100%;height:150px;background:#f0f0f0;display:grid;place-items:center;color:#999;">Image non disponible</div>`;



el.innerHTML = `
    <div class="visu" style="display:grid;place-items:center;">${visuHTML}</div>
    <div class="info">
      <h3 class="title">${product.title}</h3>
      <div class="sub">${t('first')} ${product.first}€ · ${t('next')} ${product.next}€</div>
      ${qty >= 1 ? `<div class="meta">${t('already')} ${qty} ${t('inCart')} <a href="#" class="retirer" style="color:var(--brand);text-decoration:underline;cursor:pointer;">${t('remove')}</a></div>` : ''}
    </div>
    <div class="cta">
      <div class="price">
        ${showOld ? `<span class="old">${product.first}€</span>` : ''}
        <span class="pill${showOld ? ' pulse' : ''}">${nextPrice}€</span>
      </div>
      <button class="cmd">${t('add')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>`;
  
  el.querySelector('.cmd').onclick = async (e) => {
    e.stopPropagation();
    
    // Ajouter au panier local (pour l'UI)
    state.cart = addOne(photo.id, product.id, state.cart, window.PRODUCTS);
    updateCartCount();
    updateFooterBar({
      showPrice: false,
      cancelLabel: getAbandonLabel(),
      continueLabel: getPayLabel()
    });

    // 🆕 Enregistrer immédiatement dans la DB (statut: en_cours)
    console.log('🔍 Debug ajout produit:');
    console.log('  - sessionId:', state.sessionId);
    console.log('  - photoAPI.cart exists:', !!window.photoAPI?.cart);
    console.log('  - photo.id:', photo.id);
    console.log('  - product.id:', product.id);
    
    if (window.photoAPI?.cart && state.sessionId) {
      try {
        const qty = getQty(photo.id, product.id, state.cart);
        const unitPrice = qty === 1 ? product.first : product.next;
        const totalPrice = lineTotal(product, qty);
        
        console.log('  - Quantité:', qty);
        console.log('  - Prix unitaire:', unitPrice);
        console.log('  - Prix total:', totalPrice);
        
        const result = await window.photoAPI.cart.addItemImmediate({
          photoId: photo.id,
          productId: product.id,
          productName: product.title,
          quantity: qty,
          unitPrice: unitPrice,
          totalPrice: totalPrice,
          incrustationId: photo.incrustationId || null,
          sessionId: state.sessionId
        });
        
        if (result?.status === 'success') {
          console.log('✅ Produit enregistré en DB:', result.itemId);
          // Log ajout au panier
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.cartAdd(photo.id, product.id, product.title, qty, totalPrice);
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

    // TOAST au click "Ajouter"
    toast(t('added'));
    const parent = el.parentElement;
    const idx = Array.from(parent.children).indexOf(el);
    parent.replaceChild(renderOffer(photo, product), parent.children[idx]);
  };
  
  const retirer = el.querySelector('.retirer');
  if (retirer) {
    retirer.onclick = async (e) => {
      e.preventDefault();
      
      // Retirer du panier local
      state.cart = removeOne(photo.id, product.id, state.cart);
      updateCartCount();
      updateFooterBar({
        showPrice: false,
        cancelLabel: getAbandonLabel(),
        continueLabel: getPayLabel()
      });

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
      
      const parent = el.parentElement;
      const idx = Array.from(parent.children).indexOf(el);
      parent.replaceChild(renderOffer(photo, product), parent.children[idx]);
    };
  }
  
  return el;
};

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

  // Afficher les produits filtrés par univers
  const currentUniverseId = state.universe?.id || state.universeId;

  Object.values(window.PRODUCTS)
    .filter(product => {
      // Afficher le produit si:
      // - universe_id est null (produit global disponible pour tous les univers)
      // - universe_id correspond à l'univers actuel
      return !product.universe_id || product.universe_id === currentUniverseId;
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

  const footer = createFooterBar({
    showPrice: false,
    cancelLabel: getAbandonLabel(),
    continueLabel: getPayLabel()
  });

attachFooterListeners();

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
  state.page = 'qr';
  state.universe = null;
  state.photos = [];
  state.cart = [];
  window.render();
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