import { state } from './state.js';

// SVG original du bouton retour
const BACK_ARROW_SVG = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

export const goBack = async () => {
  if (state.page === 'qr') return;

  if (state.page === 'listing') {
    // Retour à l'accueil depuis listing - utiliser backToQR pour reset langue
    if (window.backToQR) {
      await window.backToQR();
      return;
    }
    state.page = 'qr';
    state.universe = null;
    state.photos = [];
  }
  else if (state.page === 'detail') {
    state.page = 'listing';
    state.currentPhoto = null;
  }
  else if (state.page === 'cart') {
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
    // Retour à l'accueil depuis thanks - utiliser backToQR pour reset langue
    if (window.backToQR) {
      await window.backToQR();
      return;
    }
    state.page = 'qr';
  }

  window.render();
};
