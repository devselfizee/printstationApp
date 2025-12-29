import { state } from '../state.js';
import { t, tProduct } from '../i18n.js';
import { lineTotal, cartSubtotal, toast } from '../utils.js';
import { getProductVisual } from '../data.js';

export const renderPayment = (root) => {
  const main = document.createElement('div');
  main.className = 'main';
  const wrap = document.createElement('div');

  wrap.className = 'payment';
  wrap.innerHTML = `<h2>${t('payment')}</h2>
    <div class="progress">
      <div style="display:grid;place-items:center"><div class="dot active">1</div><div class="label">${t('yourCart')}</div></div>
      <div class="line active"></div>
      <div style="display:grid;place-items:center"><div class="dot active">2</div><div class="label">${t('payment')}</div></div>
    </div>
    <div class="paybox">
        <div class="title">${t('paymentWait')}</div>
      <div class="help">${t('paymentHint')}</div>
      <img src="./assets/icon-payment.png" alt="Payment" class="payment-icon">

    </div>`;

  const lines = document.createElement('div');
  lines.className = 'lines';

  // Calculer le total de manière synchrone
  const total = cartSubtotal(state.cart, window.PRODUCTS);

  state.cart.forEach(l => {
    const product = window.PRODUCTS[l.productId];
    const row = document.createElement('div');
    row.className = 'line';

    const itemTotal = lineTotal(product, l.qty);

    // Récupérer la photo commandée
    const photo = state.photos?.find(p => p.id === l.photoId);

    // Récupérer l'image du produit
    // Priorité 1 : thumbnail_url de l'API
    // Priorité 2 : visuels spécifiques à l'univers
    // Priorité 3 : placeholder
    let imageUrl = null;

    if (product.thumbnail) {
      imageUrl = product.thumbnail;
    } else {
      const visual = getProductVisual(state.universe.id, l.productId);
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
      ? `<img src="${photo.source}" alt="Photo" class="cart-photo-img">`
      : '';

    row.innerHTML = `
      <div class="cart-thumbs">
        <div class="cart-photo-thumb">${photoThumbHTML}</div>
        <div class="cart-product-thumb">${productThumbHTML}</div>
      </div>
      <div class="cart-info">
        <div class="title">${productTitle} × ${l.qty}</div>
      </div>
      <div class="cart-price">${itemTotal.toFixed(2)}€</div>`;
    lines.appendChild(row);
  });
  wrap.appendChild(lines);
  main.appendChild(wrap);
  root.appendChild(main);

  clearTimeout(state.timer);
  // state.timer = setTimeout(() => { state.page = 'form'; window.render(); }, 5000);

  // DEBUT HEXAPAY TOOLS (INTEGRATION)
  initiatePaymentFlow(total, root);
  // FIN HEXAPAY TOOLS
};

async function initiatePaymentFlow(totalAmount, root) {
  // Log du démarrage du paiement
  if (window.photoAPI?.logger) {
    window.photoAPI.logger.hexapayStart(totalAmount, state.localOrderId);
  }

  try {
    // 1. Vérifier lecteur
    const ready = await window.hexapay.checkReady();
    if (!ready.success) throw new Error('Lecteur indisponible');

    // 2. Vérifier licence
    const licensed = await window.hexapay.checkLicense();
    if (!licensed.success) throw new Error('Licence inactive');

    // 3. Initier paiement
    const payment = await window.hexapay.initiatePayment(totalAmount);
    if (!payment.success) throw new Error(payment.error);

    // 4. Impression (2s simulation)
    await new Promise(r => setTimeout(r, 2000));

    // 5. Confirmer
    const confirm = await window.hexapay.confirmPayment(totalAmount);
    if (!confirm.success) throw new Error(confirm.error);

    // 6. DEBUG: Vérifier l'état actuel
    console.log('[Payment] ═══════════════════════════════════════════════');
    console.log('[Payment] 🔍 DEBUG - État après paiement Hexapay réussi');
    console.log('[Payment] ═══════════════════════════════════════════════');
    console.log('[Payment] state.localOrderId:', state.localOrderId);
    console.log('[Payment] window.photoAPI disponible:', !!window.photoAPI);
    console.log('[Payment] window.photoAPI.orders:', !!window.photoAPI?.orders);
    console.log('[Payment] createCompletedRemote disponible:', !!window.photoAPI?.orders?.createCompletedRemote);
    console.log('[Payment] ═══════════════════════════════════════════════');

    // 5.5. Mettre à jour last_step à 'payment' dans la commande locale
    if (state.localOrderId && window.photoAPI?.orders?.updateDetails) {
      try {
        console.log('[Payment] 📝 Mise à jour last_step=payment dans la commande locale...');
        await window.photoAPI.orders.updateDetails(state.localOrderId, { lastStep: 'payment' });
        console.log('[Payment] ✅ last_step mis à jour: payment');
      } catch (stepError) {
        console.error('[Payment] ❌ Erreur mise à jour last_step:', stepError);
      }
    }

    // 6. Mettre à jour le statut de la commande LOCALE à "completed"
    if (state.localOrderId && window.photoAPI?.orders?.updateStatus) {
      try {
        console.log('[Payment] 📝 Mise à jour du statut LOCAL (status=completed)...');
        console.log('[Payment] Local Order ID:', state.localOrderId);

        await window.photoAPI.orders.updateStatus(state.localOrderId, 'completed', 'Paiement réussi');
        console.log('[Payment] ✅ Statut local mis à jour: completed');
      } catch (localError) {
        console.error('[Payment] ❌ Erreur mise à jour statut local:', localError);
      }
    }

    // 6.5. IMPORTANT: Lier les order_items à la commande AVANT de sync vers Supabase
    if (state.sessionId && state.localOrderId && window.photoAPI?.cart?.validateSession) {
      try {
        console.log('[Payment] 🔗 Liaison des order_items à la commande...');
        console.log('[Payment] Session ID:', state.sessionId);
        console.log('[Payment] Local Order ID:', state.localOrderId);

        await window.photoAPI.cart.validateSession(state.sessionId, state.localOrderId);
        console.log('[Payment] ✅ Order_items liés à la commande');
      } catch (linkError) {
        console.error('[Payment] ❌ Erreur liaison order_items:', linkError);
      }
    } else {
      console.warn('[Payment] ⚠️ Impossible de lier les order_items:');
      console.warn('[Payment]   - sessionId:', state.sessionId);
      console.warn('[Payment]   - localOrderId:', state.localOrderId);
      console.warn('[Payment]   - validateSession disponible:', !!window.photoAPI?.cart?.validateSession);
    }

    // 7. MISE À JOUR de la commande existante sur Supabase (status=completed)
    // NOTE: La commande a déjà été créée dans cart.js avec status=pending
    // On la met juste à jour au lieu d'en créer une nouvelle
    console.log('[Payment] 📝 Mise à jour de la commande sur Supabase (status=completed)...');
    console.log('[Payment] Local Order ID:', state.localOrderId);
    console.log('[Payment] Supabase Order ID existant:', state.supabaseOrderId);

    if (state.supabaseOrderId && window.photoAPI?.orders?.updateRemote) {
      try {
        console.log('[Payment] ✅ Appel de updateRemote pour mettre à jour status=completed...');

        // Mettre à jour la commande existante sur Supabase
        const updateResult = await window.photoAPI.orders.updateRemote(
          state.supabaseOrderId,
          null, // Pas d'email pour l'instant (sera ajouté dans form.js)
          state.localOrderId
        );

        if (updateResult?.status === 'success') {
          console.log('[Payment] ✅ Commande mise à jour sur Supabase (status=completed)');
          console.log('[Payment] Réponse:', updateResult.response);

          // Log du paiement réussi
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, state.supabaseOrderId);
            window.photoAPI.logger.orderComplete(state.localOrderId, state.supabaseOrderId);
          }
        } else if (updateResult?.status === 'skipped') {
          console.log('[Payment] ⏭️  Mise à jour ignorée:', updateResult.message);
          // Log du paiement réussi (sans Supabase)
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, state.supabaseOrderId);
          }
        } else {
          console.warn('[Payment] ⚠️  Erreur mise à jour API:', updateResult?.error);
          // Log du paiement réussi malgré erreur Supabase
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, state.supabaseOrderId);
          }
        }
      } catch (updateError) {
        console.error('[Payment] ❌ Erreur lors de la mise à jour sur Supabase:', updateError);
        // Ne pas bloquer le processus si la mise à jour échoue
        // Log du paiement réussi malgré erreur Supabase
        if (window.photoAPI?.logger) {
          window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, state.supabaseOrderId);
        }
      }
    } else {
      console.warn('[Payment] ⚠️ Pas d\'ID Supabase existant ou API non disponible:');
      console.warn('[Payment]   - supabaseOrderId:', state.supabaseOrderId);
      console.warn('[Payment]   - updateRemote disponible:', !!window.photoAPI?.orders?.updateRemote);
      // Log du paiement réussi sans Supabase
      if (window.photoAPI?.logger) {
        window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, null);
      }
    }

    // Succès -> page form
    state.page = 'form';
    window.render();

  } catch (error) {
    console.error('Payment failed:', error);
    // Log de l'échec du paiement
    if (window.photoAPI?.logger) {
      window.photoAPI.logger.hexapayFailure(totalAmount, state.localOrderId, error.message);
    }
    toast(`Erreur: ${error.message}`);
    state.page = 'cart';
    window.render();
  }
}
