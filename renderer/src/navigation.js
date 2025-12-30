import { state } from './state.js';
import { cartNominal, cartSubtotal } from './utils.js';

/**
 * Synchroniser la commande avec Supabase (créer ou mettre à jour)
 * Appelé lors du retour en arrière pour ne pas perdre les données
 */
async function syncOrderOnBack(currentPage) {
  // Ne sync que si le panier n'est pas vide
  if (!state.cart || state.cart.length === 0) {
    return;
  }

  // Ne sync que si on a les APIs nécessaires
  if (!window.photoAPI?.orders || !window.PRODUCTS) {
    return;
  }

  try {
    console.log(`[Navigation] 🔄 Sync Supabase depuis page ${currentPage}...`);

    // Calculer les montants
    const totalAmount = cartNominal(state.cart, window.PRODUCTS);
    const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
    const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

    if (state.localOrderId) {
      // MISE À JOUR d'une commande existante
      console.log('[Navigation] ✏️ Mise à jour commande existante:', state.localOrderId);

      await window.photoAPI.orders.updateDetails(state.localOrderId, {
        totalAmount,
        discountAmount,
        finalAmount,
        lastStep: state.furthestStep || currentPage
      });

      // Re-lier les items
      if (state.sessionId) {
        await window.photoAPI.cart.linkSessionItems(state.sessionId, state.localOrderId);
      }

      // Sync avec Supabase
      const syncResult = await window.photoAPI.orders.syncRemote(state.localOrderId, state.supabaseOrderId);
      if (syncResult?.status === 'success' && syncResult.response?.order?.id) {
        if (!state.supabaseOrderId) {
          state.supabaseOrderId = syncResult.response.order.id;
          console.log('[Navigation] ✅ Supabase Order ID:', state.supabaseOrderId);
        }
      }
    } else {
      // CRÉATION d'une nouvelle commande
      console.log('[Navigation] 📦 Création nouvelle commande...');

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
        notes: `Commande créée via bouton retour (${currentPage})`,
        lastStep: state.furthestStep || currentPage
      });

      if (orderResult?.status === 'success') {
        state.localOrderId = orderId;
        console.log('[Navigation] ✅ Commande créée:', orderId);

        // Lier les items à la commande
        if (state.sessionId) {
          await window.photoAPI.cart.linkSessionItems(state.sessionId, orderId);
        }

        // Sync avec Supabase
        const syncResult = await window.photoAPI.orders.syncRemote(orderId);
        if (syncResult?.status === 'success' && syncResult.response?.order?.id) {
          state.supabaseOrderId = syncResult.response.order.id;
          console.log('[Navigation] ✅ Supabase Order ID:', state.supabaseOrderId);
        }
      }
    }
  } catch (error) {
    console.error('[Navigation] ❌ Erreur sync:', error);
  }
}

export const goBack = async () => {
  if (state.page === 'qr') return;

  const currentPage = state.page;

  if (state.page === 'listing') {
    state.page = 'qr';
    state.universe = null;
    state.photos = [];
  }
  else if (state.page === 'detail') {
    // Sync avant de quitter la page detail
    await syncOrderOnBack(currentPage);
    state.page = 'listing';
    state.currentPhoto = null;
  }
  else if (state.page === 'cart') {
    // Sync avant de quitter la page cart
    await syncOrderOnBack(currentPage);
    state.page = 'detail';
  }
  else if (state.page === 'payment') {
    state.page = 'cart';
    clearTimeout(state.timer);
  }
  else if (state.page === 'form') {
    state.page = 'cart';
  }
  else if (state.page === 'thanks') {
    state.page = 'qr';
  }
  window.render();
};
