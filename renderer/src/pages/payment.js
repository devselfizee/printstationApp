import { state } from '../state.js';
import { t } from '../i18n.js';
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

    const thumbHTML = imageUrl
      ? `<img src="${imageUrl}" alt="${product.title}" style="width:150px;height:150px;object-fit:contain;">`
      : `<div style="width:150px;height:150px;background:#f0f0f0;display:grid;place-items:center;color:#999;font-size:12px;">N/A</div>`;

    row.innerHTML = `<div class="thumb" style="display:grid;place-items:center;font-size:24px;">${thumbHTML}</div><div class="title">${product.title} × ${l.qty}</div><div>${itemTotal.toFixed(2)}€</div>`;
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

    // 7. Créer la commande sur Supabase avec status=completed
    console.log('[Payment] 📝 Création de la commande COMPLETED sur Supabase...');
    console.log('[Payment] Local Order ID:', state.localOrderId);
    console.log('[Payment] createCompletedRemote disponible:', !!window.photoAPI?.orders?.createCompletedRemote);

    if (state.localOrderId && window.photoAPI?.orders?.createCompletedRemote) {
      try {
        console.log('[Payment] ✅ Appel de createCompletedRemote...');

        const createResult = await window.photoAPI.orders.createCompletedRemote(state.localOrderId);

        if (createResult?.status === 'success') {
          console.log('[Payment] ✅ Commande COMPLETED créée sur Supabase');
          console.log('[Payment] Supabase Order ID:', createResult.supabaseOrderId);
          // Stocker l'ID Supabase pour référence future
          state.supabaseOrderId = createResult.supabaseOrderId;

          // Log du paiement réussi
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, createResult.supabaseOrderId);
            window.photoAPI.logger.orderComplete(state.localOrderId, createResult.supabaseOrderId);
          }
        } else if (createResult?.status === 'skipped') {
          console.log('[Payment] ⏭️  Création ignorée:', createResult.message);
          // Log du paiement réussi (sans Supabase)
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, null);
          }
        } else {
          console.warn('[Payment] ⚠️  Erreur création API:', createResult?.error);
          // Log du paiement réussi malgré erreur Supabase
          if (window.photoAPI?.logger) {
            window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, null);
          }
        }
      } catch (createError) {
        console.error('[Payment] ❌ Erreur lors de la création sur Supabase:', createError);
        // Ne pas bloquer le processus si la création échoue
        // Log du paiement réussi malgré erreur Supabase
        if (window.photoAPI?.logger) {
          window.photoAPI.logger.hexapaySuccess(totalAmount, state.localOrderId, null);
        }
      }
    } else {
      console.error('[Payment] ❌ CONDITIONS NON REMPLIES pour création Supabase:');
      if (!state.localOrderId) {
        console.error('[Payment]   → state.localOrderId est NULL ou UNDEFINED');
      }
      if (!window.photoAPI?.orders?.createCompletedRemote) {
        console.error('[Payment]   → window.photoAPI.orders.createCompletedRemote n\'est pas disponible');
      }
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
