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
  const universeId = state.universeId || state.universe?.id || 'B';
  const universeData = UNIVERSES[universeId];
  
  // Message si panier vide
  if (state.cart.length === 0) {
    lines.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#6b7280;font-size:16px;">Aucun produit dans le panier</div>`;
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

      const thumbHTML = imageUrl
        ? `<img src="${imageUrl}" alt="${photoTitle}" style="width:150px;height:150px;object-fit:contain;">`
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
          universeId: state.universe?.id || state.universeId || 'B',
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

          // 6. 🆕 Synchroniser la commande annulée avec l'API distante
          try {
            console.log('[Cart] 🔄 Synchronisation de la commande annulée avec l\'API distante...');
            const syncResult = await window.photoAPI.orders.syncRemote(orderId);

            if (syncResult?.status === 'success') {
              console.log('[Cart] ✅ Commande annulée synchronisée avec l\'API distante');
              console.log('[Cart] Détails de la réponse:', syncResult.response);
            } else if (syncResult?.status === 'skipped') {
              console.log('[Cart] ⏭️  Synchronisation ignorée:', syncResult.message);
            } else {
              console.warn('[Cart] ⚠️  Erreur synchronisation API:', syncResult?.error);
              // Ne pas bloquer le processus si la synchronisation échoue
            }
          } catch (syncError) {
            console.error('[Cart] ❌ Erreur lors de la synchronisation:', syncError);
            // Continuer même si la synchronisation échoue
          }
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
  onContinue: async () => {
    // 🆕 ÉTAPE 1 : Créer la commande locale d'abord, puis synchroniser avec Supabase
    if (state.cart.length > 0 && window.photoAPI?.orders) {
      try {
        console.log('[Cart] 📦 Création de la commande locale puis synchronisation avec Supabase...');

        // Calculer les montants
        const totalAmount = cartNominal(state.cart, window.PRODUCTS);
        const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
        const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

        console.log('[Cart] Montants calculés:');
        console.log('[Cart]   - totalAmount (nominal):', totalAmount);
        console.log('[Cart]   - discountAmount:', discountAmount);
        console.log('[Cart]   - finalAmount (après réduction):', finalAmount);

        // 1. Créer l'ID de commande local
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('[Cart] ID de commande local:', orderId);

        // 2. Créer la commande locale dans la DB
        const orderResult = await window.photoAPI.orders.create({
          orderId: orderId,
          participantId: state.participantId || state.sessionId,
          universeId: state.universe?.id || state.universeId || 'B',
          totalAmount: totalAmount,
          discountAmount: discountAmount,
          finalAmount: finalAmount,
          email: null,  // Pas d'email à cette étape
          optin: 0,
          paymentMethod: 'pending',
          notes: 'Commande en cours de paiement'
        });

        if (orderResult?.status === 'success') {
          console.log('[Cart] ✅ Commande locale créée:', orderId);

          // 3. Créer les order_items dans la DB locale
          for (const cartItem of state.cart) {
            const product = window.PRODUCTS[cartItem.productId];
            const unitPrice = cartItem.qty === 1 ? product.first : product.next;
            const totalPrice = lineTotal(product, cartItem.qty);

            await window.photoAPI.orders.addItem({
              orderId: orderId,
              photoId: cartItem.photoId,
              productId: cartItem.productId,
              quantity: cartItem.qty,
              unitPrice: unitPrice,
              totalPrice: totalPrice
            });
          }

          // 4. Synchroniser avec Supabase (status=pending)
          console.log('[Cart] 🔄 Synchronisation avec Supabase...');
          const syncResult = await window.photoAPI.orders.syncRemote(orderId);

          console.log('[Cart] 📋 Résultat de syncRemote:');
          console.log('[Cart]   - status:', syncResult?.status);
          console.log('[Cart] Résultat complet:', JSON.stringify(syncResult, null, 2));

          if (syncResult?.status === 'success') {
            console.log('[Cart] ✅ Commande synchronisée avec Supabase');
            console.log('[Cart] Réponse API:', JSON.stringify(syncResult.response, null, 2));

            // Extraire l'ID Supabase de la réponse (l'API retourne "id" et non "order_id")
            if (syncResult.response?.id) {
              state.supabaseOrderId = syncResult.response.id;
              console.log('[Cart] ✅ Order ID Supabase stocké dans state:', state.supabaseOrderId);
            } else {
              console.warn('[Cart] ⚠️  id non trouvé dans response');
              console.warn('[Cart] Clés disponibles:', Object.keys(syncResult.response || {}));
            }
          } else {
            console.warn('[Cart] ⚠️  Erreur synchronisation Supabase:', syncResult?.error);
            // Continuer quand même vers la page de paiement
          }

          // Sauvegarder l'orderId local pour référence
          state.localOrderId = orderId;
        } else {
          console.error('[Cart] ❌ Erreur création commande locale:', orderResult?.error);
        }
      } catch (error) {
        console.error('[Cart] ❌ Erreur lors de la création de la commande:', error);
        // Continuer quand même vers la page de paiement
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