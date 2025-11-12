import { state } from '../state.js';
import { t } from '../i18n.js';
import { lineTotal, cartSubtotal, cartNominal, updateCartCount, addOne, removeOne, createFooterBar, attachFooterListeners, updateFooterBar, formatPrice } from '../utils.js';
import { getProductVisual, UNIVERSES } from '../data.js';

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
  const universeId = state.universeId || state.universe?.id || 'universe1';
  const universeData = UNIVERSES[universeId];
  
  // Message si panier vide
  if (state.cart.length === 0) {
    lines.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#6b7280;font-size:16px;">Aucun produit dans le panier</div>`;
  } else {
    state.cart.forEach(line => {
      const product = window.PRODUCTS[line.productId];
      const photo = state.photos.find(x => x.id === line.photoId);
      const visual = getProductVisual(state.universe.id, line.productId);
      
      // ⭐ Récupérer le title depuis UNIVERSES si incrustationId existe
      let photoTitle = photo?.title || photo?.id || '';
      
      if (photo?.incrustationId && universeData?.photos) {
        const incrustationPhoto = universeData.photos.find(up => up.id === photo.incrustationId);
        if (incrustationPhoto?.title) {
          photoTitle = incrustationPhoto.title;
        }
      }
      
      const thumbHTML = visual && visual.image 
        ? `<img src="${visual.image}" alt="${photoTitle}" style="width:150px;height:150px;object-fit:contain;">`
        : `<div style="width:150px;height:150px;background:#f0f0f0;display:grid;place-items:center;color:#999;font-size:12px;">N/A</div>`;
      
      const row = document.createElement('div');
      row.className = 'line';
      row.innerHTML = `<div class="thumb" style="display:grid;place-items:center;">${thumbHTML}</div>
        <div><div class="title">${product.title}</div><div class="meta">${photoTitle}</div></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="key" data-a="minus">−</button><div class="title">${line.qty}</div><button class="key" data-a="plus">+</button><button class="key" data-a="del">✕</button><div style="width:70px;text-align:right;font-weight:800;">${lineTotal(product, line.qty).toFixed(2)}€</div>
        </div>`;

      lines.appendChild(row);
      row.querySelectorAll('.key').forEach(btn => {
        btn.onclick = async () => {
          const act = btn.dataset.a;

          // 🆕 Synchroniser avec la DB lors des modifications de quantité
          if (window.photoAPI?.cart && state.sessionId) {
            try {
              // Récupérer les items actifs de la session pour trouver l'itemId
              const items = await window.photoAPI.cart.getActiveSessionItems(state.sessionId);
              const dbItem = items.find(i => i.photo_id === line.photoId && i.product_id === line.productId);

              if (dbItem) {
                const product = window.PRODUCTS[line.productId];

                if (act === 'minus') {
                  const newQty = line.qty - 1;
                  if (newQty > 0) {
                    // Diminuer la quantité
                    const unitPrice = newQty === 1 ? product.first : product.next;
                    const totalPrice = lineTotal(product, newQty);
                    await window.photoAPI.cart.updateQuantity(dbItem.id, newQty, totalPrice);
                    console.log('✅ Quantité diminuée dans DB:', dbItem.id, 'qty:', newQty);
                  } else {
                    // Supprimer l'item (quantité = 0)
                    await window.photoAPI.cart.cancelItem(dbItem.id);
                    console.log('✅ Item supprimé de la DB:', dbItem.id);
                  }
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
                  // Supprimer complètement l'item
                  await window.photoAPI.cart.cancelItem(dbItem.id);
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
  <div class="row"><div>${t('discount')}</div><div>−${formatPrice(disc)}€</div></div>
  <div class="row total"><div>${t('total')}</div><div>${formatPrice(tot)}€</div></div>`;
  wrap.appendChild(sum);
  


  const footer = createFooterBar({
  continueLabel: 'Procéder au paiement',
  onContinue: () => {
    state.page = 'payment';
    window.render();
  }
});
root.appendChild(footer);
attachFooterListeners({
  onCancel: async () => {
    // 🆕 Enregistrer la commande annulée dans la DB
    if (state.cart.length > 0 && window.photoAPI?.orders && window.photoAPI?.cart && state.sessionId) {
      try {
        console.log('[Cart] Enregistrement de la commande annulée...');

        // 1. Créer l'ID de commande
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 2. Calculer les montants
        const totalAmount = cartNominal(state.cart, window.PRODUCTS);
        const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
        const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

        // 3. Créer la commande avec statut "pending" (sera changé à cancelled après)
        const orderResult = await window.photoAPI.orders.create({
          orderId: orderId,
          participantId: state.participantId || state.sessionId,
          universeId: state.universe?.id || state.universeId || 'universe1',
          totalAmount: totalAmount,
          discountAmount: discountAmount,
          finalAmount: finalAmount,
          email: null,
          optin: 0,
          paymentMethod: null,
          notes: 'Commande annulée par l\'utilisateur depuis le panier'
        });

        if (orderResult?.status === 'success') {
          console.log('[Cart] ✅ Commande créée:', orderId);

          // 4. ⭐ Associer tous les items de la session à cette commande et les marquer comme annulés
          // Cela met order_id ET status = 'annulé' en même temps
          await window.photoAPI.cart.cancelSession(state.sessionId, orderId);

          console.log('[Cart] ✅ Items annulés et liés à la commande:', orderId);

          // 5. Mettre à jour le statut de la commande à "cancelled"
          await window.photoAPI.orders.updateStatus(orderId, 'cancelled', 'Annulée par l\'utilisateur');

          console.log('[Cart] ✅ Commande marquée comme annulée');
        } else {
          console.error('[Cart] ❌ Erreur création commande annulée:', orderResult?.error);
        }
      } catch (error) {
        console.error('[Cart] ❌ Erreur enregistrement commande annulée:', error);
      }
    }

    // Réinitialiser l'état et retourner au QR code
    state.page = 'qr';
    state.universe = null;
    state.photos = [];
    state.cart = [];
    updateCartCount();
    window.render();
  },
  onContinue: () => {
    state.page = 'payment';
    window.render();
  }
});
  
  wrap.appendChild(footer);
  main.appendChild(wrap);
  root.appendChild(main);
}; 