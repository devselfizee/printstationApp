import { state } from '../state.js';
import { t, tProduct } from '../i18n.js';
import { lineTotal, cartSubtotal, cartNominal, updateCartCount, addOne, removeOne, createFooterBar, attachFooterListeners, updateFooterBar, formatPrice } from '../utils.js';
import { getProductVisual, UNIVERSES } from '../data.js';
import { syncOrderOnBack } from '../navigation.js';

// Spinner SVG pour les boutons
const SPINNER_SVG = '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>';

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
      console.log('[Cart] ✏️ Mise à jour commande:', state.localOrderId);

      await window.photoAPI.orders.updateDetails(state.localOrderId, {
        totalAmount,
        discountAmount,
        finalAmount,
        lastStep: 'cart'
      });

      // Re-lier les items
      await window.photoAPI.cart.linkSessionItems(state.sessionId, state.localOrderId);

      // Sync avec Supabase
      const syncResult = await window.photoAPI.orders.syncRemote(state.localOrderId, state.supabaseOrderId);
      if (syncResult?.status === 'success') {
        console.log('[Cart] ✅ Sync Supabase réussi');
        if (!state.supabaseOrderId && syncResult.response?.order?.id) {
          state.supabaseOrderId = syncResult.response.order.id;
        }
      }
    } else {
      // CRÉATION d'une nouvelle commande
      console.log('[Cart] 📦 Création nouvelle commande...');

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
        notes: 'Commande créée depuis page panier',
        lastStep: 'cart'
      });

      if (orderResult?.status === 'success') {
        state.localOrderId = orderId;
        console.log('[Cart] ✅ Commande créée:', orderId);

        // Lier les items à la commande
        await window.photoAPI.cart.linkSessionItems(state.sessionId, orderId);

        // Sync avec Supabase
        const syncResult = await window.photoAPI.orders.syncRemote(orderId);
        if (syncResult?.status === 'success' && syncResult.response?.order?.id) {
          state.supabaseOrderId = syncResult.response.order.id;
          console.log('[Cart] ✅ Supabase Order ID:', state.supabaseOrderId);
        }
      }
    }
  } catch (error) {
    console.error('[Cart] ❌ Erreur sync:', error);
  }
}

export const renderCart = (root) => {
 const main = document.createElement('div');
  main.className = 'main';
  const wrap = document.createElement('div');
  wrap.className = 'cart';
  wrap.innerHTML = `<h2>${t('yourCart')}</h2>
    <div class="progress">
      <div style="display:grid;place-items:center"><div class="dot active">1</div><div class="label">${t('yourCart')}</div></div>
      <div class="line"></div>
      <div style="display:grid;place-items:center"><div class="dot">2</div><div class="label">${t('payment')}</div></div>
    </div>`;
  
  
  const lines = document.createElement('div');
  lines.className = 'lines';
  
  // Récupérer les données de l'univers pour les titres
  const universeId = state.universeId || state.universe?.id || 'B';
  const universeData = UNIVERSES[universeId];
  
  // Message si panier vide
  if (state.cart.length === 0) {
    lines.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#6b7280;font-size:16px;">${t('emptyCart')}</div>`;
  } else {
    state.cart.forEach(line => {
      const product = window.PRODUCTS[line.productId];
      const photo = state.photos.find(x => x.id === line.photoId);

      // ⭐ Récupérer le title depuis UNIVERSES si incrustationId existe
      let photoTitle = photo?.title || photo?.id || '';

      if (photo?.incrustationId && universeData?.photos) {
        const incrustationPhoto = universeData.photos.find(up => up.id === photo.incrustationId);
        if (incrustationPhoto?.title) {
          photoTitle = incrustationPhoto.title;
        }
      }

      // Récupérer l'image du produit
      // Priorité 1 : thumbnail_url de l'API
      // Priorité 2 : visuels spécifiques à l'univers
      // Priorité 3 : placeholder
      let imageUrl = null;

      if (product.thumbnail) {
        imageUrl = product.thumbnail;
      } else {
        const visual = getProductVisual(state.universe.id, line.productId);
        if (visual && visual.image) {
          imageUrl = visual.image;
        }
      }

      // Vignette produit
      const productTitle = tProduct(product.id, product.title);
      const productThumbHTML = imageUrl
        ? `<img src="${imageUrl}" alt="${productTitle}" class="cart-product-img">`
        : `<div class="cart-product-placeholder">N/A</div>`;

      // Vignette photo commandée
      const photoThumbHTML = photo?.source
        ? `<img src="${photo.source}" alt="${photoTitle}" class="cart-photo-img">`
        : '';

      const row = document.createElement('div');
      row.className = 'line';
      row.innerHTML = `
        <div class="cart-thumbs">
          <div class="cart-photo-thumb">${photoThumbHTML}</div>
          <div class="cart-product-thumb">${productThumbHTML}</div>
        </div>
        <div class="cart-info">
          <div class="title">${productTitle}</div>
        </div>
        <div class="cart-actions">
          <button class="key" data-a="minus">−</button>
          <div class="title">${line.qty}</div>
          <button class="key" data-a="plus">+</button>
          <button class="key" data-a="del">✕</button>
          <div class="cart-price">${lineTotal(product, line.qty).toFixed(2)}€</div>
        </div>`;

      lines.appendChild(row);
      row.querySelectorAll('.key').forEach(btn => {
        btn.onclick = async () => {
          const act = btn.dataset.a;

          // Afficher le loader sur le bouton et le désactiver
          const originalHTML = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = SPINNER_SVG;

          // Désactiver aussi les autres boutons de cette ligne pour éviter les clics multiples
          const allBtns = row.querySelectorAll('.key');
          allBtns.forEach(b => b.disabled = true);

          try {
            // 🆕 Synchroniser avec la DB lors des modifications de quantité
            if (window.photoAPI?.cart && state.sessionId) {
              try {
                // Récupérer les items actifs de la session pour trouver l'itemId
                const items = await window.photoAPI.cart.getActiveSessionItems(state.sessionId);
                const dbItem = items.find(i => i.photo_id === line.photoId && i.product_id === line.productId);

                if (dbItem) {
                  const product = window.PRODUCTS[line.productId];

                  if (act === 'minus') {
                    // Utiliser cancelItem pour transférer la quantité vers cancelled (comme detail.js)
                    await window.photoAPI.cart.cancelItem(dbItem.id, 1);
                    console.log('✅ Item décrémenté via cancelItem:', dbItem.id);
                  }

                  if (act === 'plus') {
                    // Augmenter la quantité
                    const newQty = line.qty + 1;
                    const unitPrice = newQty === 1 ? product.first : product.next;
                    const totalPrice = lineTotal(product, newQty);
                    await window.photoAPI.cart.updateQuantity(dbItem.id, newQty, totalPrice);
                    console.log('✅ Quantité augmentée dans DB:', dbItem.id, 'qty:', newQty);
                  }

                  if (act === 'del') {
                    // Supprimer complètement l'item (annuler toute la quantité)
                    await window.photoAPI.cart.cancelItem(dbItem.id, dbItem.quantity);
                    console.log('✅ Item supprimé de la DB:', dbItem.id);
                  }
                }
              } catch (error) {
                console.error('❌ Erreur synchronisation DB:', error);
              }
            }

            // Mettre à jour l'état local (comme avant)
            if (act === 'minus') state.cart = removeOne(line.photoId, line.productId, state.cart);
            if (act === 'plus') state.cart = addOne(line.photoId, line.productId, state.cart, window.PRODUCTS);
            if (act === 'del') state.cart = state.cart.filter(l => l.key !== line.key);
            updateCartCount();

            // 🆕 Créer ou mettre à jour la commande + sync Supabase
            await syncOrderAfterChange();
          } finally {
            // Restaurer les boutons (le render va les recréer de toute façon)
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            allBtns.forEach(b => b.disabled = false);
          }

          window.render();
        };
      });
    });
  }
  
  wrap.appendChild(lines);
  
  const nb = state.cart.reduce((n, l) => n + l.qty, 0);
const sub = cartSubtotal(state.cart, window.PRODUCTS);
const nom = cartNominal(state.cart, window.PRODUCTS);
const disc = nom - sub;
const tot = sub;  // c'est le total TTC

const sum = document.createElement('div');
sum.className = 'sum';
sum.innerHTML = `
  <div class="row"><div>${t('products')} (${nb})</div><div>${formatPrice(nom)}€</div></div>
  ${disc > 0 ? `<div class="row"><div>${t('discount')}</div><div>−${formatPrice(disc)}€</div></div>` : ''}
  <div class="row total"><div>${t('total')}</div><div>${formatPrice(tot)}€</div></div>`;
  wrap.appendChild(sum);
  


  // Icône flèche gauche pour le bouton Retour
  const backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>`;

  const footer = createFooterBar({
  cancelLabel: `${backIcon}${t('back')}`,
  cancelClass: 'btn-back',
  continueLabel: t('payBtn'),
  onContinue: () => {
    state.page = 'payment';
    window.render();
  }
});
// Ajouter une classe spécifique pour le footer de la page cart (plus grand)
footer.classList.add('footer-bar-cart');
root.appendChild(footer);
attachFooterListeners({
  onCancel: async () => {
    // Synchroniser avec Supabase avant de retourner (comme le bouton bleu en haut)
    const cancelBtn = document.querySelector('.btn-cancel');

    // Afficher le loader sur le bouton
    if (cancelBtn) {
      cancelBtn.disabled = true;
      const originalHTML = cancelBtn.innerHTML;
      cancelBtn.innerHTML = `<svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg> ${t('back')}`;
    }

    try {
      // Sync avant de naviguer
      await syncOrderOnBack('cart');
    } catch (error) {
      console.error('[Cart] ❌ Erreur sync:', error);
    }

    // Retourner à la page detail (pas listing, pour cohérence avec le bouton bleu)
    state.page = 'detail';
    window.render();
  },
  onContinue: async () => {
    // Désactiver les boutons pour éviter les doubles clics
    const cancelBtn = document.querySelector('.btn-cancel');
    const continueBtn = document.querySelector('.btn-continue');
    if (cancelBtn) cancelBtn.disabled = true;
    if (continueBtn) continueBtn.disabled = true;

    // 🆕 Créer ou mettre à jour la commande locale, puis synchroniser avec Supabase
    if (state.cart.length > 0 && window.photoAPI?.orders) {
      try {
        // Calculer les montants
        const totalAmount = cartNominal(state.cart, window.PRODUCTS);
        const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
        const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

        console.log('[Cart] Montants calculés:');
        console.log('[Cart]   - totalAmount (nominal):', totalAmount);
        console.log('[Cart]   - discountAmount:', discountAmount);
        console.log('[Cart]   - finalAmount (après réduction):', finalAmount);

        // Vérifier si une commande locale existe déjà (peu importe si sync Supabase a réussi)
        if (state.localOrderId) {
          // ✏️ MISE À JOUR de la commande existante
          console.log('[Cart] ✏️ Mise à jour de la commande existante:', state.localOrderId);
          console.log('[Cart] Supabase Order ID existant:', state.supabaseOrderId || 'non défini');

          // Mettre à jour les montants dans la DB locale
          await window.photoAPI.orders.updateDetails(state.localOrderId, {
            totalAmount,
            discountAmount,
            finalAmount,
            lastStep: 'cart'
          });

          // Re-lier les items (au cas où de nouveaux ont été ajoutés/modifiés)
          const linkResult = await window.photoAPI.cart.linkSessionItems(state.sessionId, state.localOrderId);
          console.log('[Cart] ✅ Items re-liés:', linkResult?.changes || 0, 'items mis à jour');

          // Re-synchroniser avec Supabase (PUT si supabaseOrderId existe)
          console.log('[Cart] 🔄 Re-synchronisation avec Supabase...');
          console.log('[Cart] Supabase Order ID pour PUT:', state.supabaseOrderId || 'null (sera POST)');
          const syncResult = await window.photoAPI.orders.syncRemote(state.localOrderId, state.supabaseOrderId);

          if (syncResult?.status === 'success') {
            console.log('[Cart] ✅ Commande mise à jour dans Supabase');
            // Récupérer supabaseOrderId si pas encore défini
            if (!state.supabaseOrderId && syncResult.response?.order?.id) {
              state.supabaseOrderId = syncResult.response.order.id;
              console.log('[Cart] ✅ Supabase Order ID récupéré:', state.supabaseOrderId);
            }
          } else {
            console.warn('[Cart] ⚠️ Erreur re-sync Supabase:', syncResult?.error);
          }
        } else {
          // 📦 CRÉATION d'une nouvelle commande
          console.log('[Cart] 📦 Création de la commande locale...');

          const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          console.log('[Cart] ID de commande local:', orderId);

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
            notes: 'Commande en cours de paiement',
            lastStep: 'cart'
          });

          if (orderResult?.status === 'success') {
            console.log('[Cart] ✅ Commande locale créée:', orderId);
            state.localOrderId = orderId;

            // Lier les order_items existants à la commande
            const linkResult = await window.photoAPI.cart.linkSessionItems(state.sessionId, orderId);
            console.log('[Cart] ✅ Items liés:', linkResult?.changes || 0, 'items');

            // Synchroniser avec Supabase
            console.log('[Cart] 🔄 Synchronisation avec Supabase...');
            const syncResult = await window.photoAPI.orders.syncRemote(orderId);

            if (syncResult?.status === 'success' && syncResult.response?.order?.id) {
              state.supabaseOrderId = syncResult.response.order.id;
              console.log('[Cart] ✅ Supabase Order ID:', state.supabaseOrderId);
            } else {
              console.warn('[Cart] ⚠️ Erreur sync Supabase:', syncResult?.error);
            }
          } else {
            console.error('[Cart] ❌ Erreur création commande:', orderResult?.error);
          }
        }
      } catch (error) {
        console.error('[Cart] ❌ Erreur:', error);
      }
    }

    // Naviguer vers la page de paiement
    state.page = 'payment';
    window.render();
  }
});
  
  wrap.appendChild(footer);
  main.appendChild(wrap);
  root.appendChild(main);
}; 