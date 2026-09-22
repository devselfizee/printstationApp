import { state } from '../state.js';
import { t } from '../i18n.js';
import { $, updateCartCount, addOne, toast, getQty, lineTotal, getTotalCartQty } from '../utils.js';
import { renderOffer } from './detail.js';
import { NEXT_ITEMS_DISCOUNT_PCT } from '../data.js';

export const showUpsell = (photo, product) => {
  const modal = $('#modal');
  const offer = renderOffer(photo, product);
  const offerHTML = offer.outerHTML;
  
  modal.innerHTML = `
    <div class="modal modal-upsell">
      <h3>${t('upsell')}</h3>
      ${offerHTML}
      <div class="btn-group">
        <button class="btn-yes" id="addUpsellBtn">${t('upsellYes')}</button>
        <button class="btn-no" id="skipUpsellBtn">${t('upsellNo')}</button>
      </div>
    </div>`;
  
  modal.classList.add('show');
  
  // Bouton "Ajouter" dans la modal
  $('#addUpsellBtn').onclick = async () => {
    // Ajouter au panier local
    state.cart = addOne(photo.id, product.id, state.cart, window.PRODUCTS);
    updateCartCount();

    // 🆕 Enregistrer dans la DB
    if (window.photoAPI?.cart && state.sessionId) {
      try {
        // Prix dégressif GLOBAL: 1er article du panier = first, tous les autres = next
        const totalCartQty = getTotalCartQty(state.cart); // Quantité totale après ajout
        const unitPrice = totalCartQty === 1 ? product.first : product.next;
        const qty = getQty(photo.id, product.id, state.cart);
        const totalPrice = lineTotal(product, qty);

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
          console.log('✅ Upsell enregistré en DB:', result.itemId);
        }
      } catch (error) {
        console.error('❌ Erreur enregistrement upsell:', error);
      }
    }

    toast(t('added'));
    closeModal();
    // Afficher le panier
    state.page = 'cart';
    window.render();
  };
  
  // Bouton "Non, merci"
  $('#skipUpsellBtn').onclick = () => {
    closeModal();
    // Afficher le panier quand même
    state.page = 'cart';
    window.render();
  };
};


/**
 * Popup affichée après l'ajout d'un produit au panier (interrupteur admin : state.cartBonusPopup).
 * Elle annonce la remise acquise sur les articles suivants et ramène le bouton de validation
 * sous les yeux du client, qui devait sinon faire défiler la page produit.
 * Rien à voir avec la remise au bar de la bannière pub : ce sont deux offres séparées.
 */
export const showCartBonus = () => {
  const modal = $('#modal');
  if (!modal) return;

  // Le 1er article débloque la remise, les articles suivants en bénéficient déjà
  const key = getTotalCartQty(state.cart) <= 1 ? 'bonusUnlocked' : 'bonusActive';
  // La pastille porte le chiffre : dans la phrase il reste en texte simple, pour ne pas
  // concurrencer visuellement le bandeau.
  const message = t(key).replace('{pct}', `${NEXT_ITEMS_DISCOUNT_PCT}%`);

  modal.innerHTML = `
    <div class="modal modal-bonus">
      <div class="bonus-head">
        <div class="bonus-stamp">
          <span class="bonus-stamp-pct">${NEXT_ITEMS_DISCOUNT_PCT}<small>%</small></span>
        </div>
      </div>
      <div class="bonus-body">
        <h3>${t('bonusTitle')}</h3>
        <p class="bonus-message">${message}</p>
        <div class="bonus-actions">
          <button class="btn-no" id="bonusContinueBtn">${t('bonusContinue')}</button>
          <button class="btn-yes" id="bonusCheckoutBtn">${t('bonusCheckout')}</button>
        </div>
        <label class="bonus-dismiss">
          <input type="checkbox" id="bonusDismissChk">
          <span>${t('bonusDontShow')}</span>
        </label>
      </div>
    </div>`;

  modal.classList.add('show');

  // « Ne plus afficher » : vaut pour la commande en cours, oublié au prochain scan (resetState)
  $('#bonusDismissChk').onchange = (e) => {
    state.cartBonusPopupDismissed = e.target.checked;
  };

  // Continuer : on ferme et on laisse le client sur la page produit
  $('#bonusContinueBtn').onclick = () => closeModal();

  // Valider : même destination que le bouton du pied de page
  $('#bonusCheckoutBtn').onclick = () => {
    closeModal();
    state.page = 'cart';
    window.render();
  };
};

export const closeModal = () => {
  const modal = $('#modal');
  modal.classList.remove('show');
  setTimeout(() => modal.innerHTML = '', 300);
};