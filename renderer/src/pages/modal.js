import { state } from '../state.js';
import { t } from '../i18n.js';
import { $, updateCartCount, addOne, toast } from '../utils.js';
import { renderOffer } from './detail.js';

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
  $('#addUpsellBtn').onclick = () => {
    state.cart = addOne(photo.id, product.id, state.cart, window.PRODUCTS);
    updateCartCount();
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

export const closeModal = () => {
  const modal = $('#modal');
  modal.classList.remove('show');
  setTimeout(() => modal.innerHTML = '', 300);
};