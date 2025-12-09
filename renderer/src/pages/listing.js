import { state } from '../state.js';
import { t } from '../i18n.js';
import { formatPrice, cartSubtotal } from '../utils.js';
import { UNIVERSES } from '../data.js';

// Helper pour générer les labels du footer
const getAbandonLabel = () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>${t('abandon')}`;

const getPayLabel = () => {
  if (state.cart.length === 0) {
    return `${t('noProduct')} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;vertical-align:middle;margin-left:6px;"><path d="M9 18l6-6-6-6"></path></svg>`;
  }
  const total = cartSubtotal(state.cart, window.PRODUCTS);
  return `${t('pay')} ${formatPrice(total)}€ <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;vertical-align:middle;margin-left:6px;"><path d="M9 18l6-6-6-6"></path></svg>`;
};

const isCartEmpty = () => state.cart.length === 0;

const getArticleLabel = () => {
  const count = state.cart.reduce((n, l) => n + l.qty, 0);
  return `${count} ${count > 1 ? t('articles') : t('article')}`;
};

const getCartDetailHTML = () => {
  return `
    <div class="cart-detail">
      <div class="cart-detail-top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
        <span>${t('viewDetail')}</span>
      </div>
      <div class="cart-detail-bottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span class="cart-detail-count" id="cartDetailCount">${getArticleLabel()}</span>
      </div>
    </div>`;
};

export const renderListing = (root) => {
  const main = document.createElement('div');
  main.className = 'main listing-enter';
  
  // ⭐ CORRECTION: Récupérer la bannière depuis UNIVERSES[universeId]
  const universeId = state.universeId || state.universe?.id || 'B';
  const universeData = UNIVERSES[universeId];
  const banner = universeData?.banner || '';
  
  main.innerHTML = `
    <div class="hero">
      <div class="hero-text">${t('bannerText')}</div>
      <img src="${banner}" alt="">
    </div>
    <div class="section"><h2>${t('photos')}</h2></div>
    <div class="grid" id="grid"></div>`;
  
  const grid = main.querySelector('#grid');
  state.photos.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.photoId = p.id; // 👈 Stocker l'ID dans data-attribute
    card.style.animation = `riseIn .46s ease ${i * 160}ms both`;
    
    // ⭐ CORRECTION: Récupérer le title depuis UNIVERSES en fonction de incrustationId
    let photoTitle = p.title || p.id;
    
    if (p.incrustationId && universeData?.photos) {
      const incrustationPhoto = universeData.photos.find(up => up.id === p.incrustationId);
      if (incrustationPhoto?.title) {
        photoTitle = incrustationPhoto.title;
      }
    }
    
    // ⭐ CORRECTION: Utiliser p.source au lieu de p.src
    card.innerHTML = `<div class="landscape"><img src="${p.source}" alt=""></div>
      <div class="body"><div class="title">${photoTitle}</div><button class="choose">${t('choose')}</button></div>`;
    grid.appendChild(card);
  });
  
  // 👇 Event delegation - un seul listener sur le grid
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) {
      const photoId = card.dataset.photoId;
      const photo = state.photos.find(p => p.id === photoId);
      if (photo) {
        state.currentPhoto = photo;
        state.page = 'detail';
        state.photoIndex = 0;
        window.render();
      }
    }
  });

  // === FOOTER (même style que detail.js) ===
  const footer = document.createElement('div');
  footer.className = 'footer-bar';
  const empty = isCartEmpty();
  footer.innerHTML = `
    <div class="buttons">
      <button class="btn btn-cancel">${getAbandonLabel()}</button>
      ${getCartDetailHTML()}
      <button class="btn btn-continue${empty ? ' disabled' : ''}" ${empty ? 'disabled' : ''}>${getPayLabel()}</button>
    </div>`;

  // Event listeners pour le footer
  footer.querySelector('.btn-cancel').onclick = () => {
    state.page = 'qr';
    state.universe = null;
    state.photos = [];
    state.cart = [];
    window.render();
  };

  footer.querySelector('.btn-continue').onclick = () => {
    if (!isCartEmpty()) {
      state.page = 'cart';
      window.render();
    }
  };

  // Click sur cart-detail pour aller au panier
  footer.querySelector('.cart-detail').onclick = () => {
    // alert("Ce bouton n'est pas encore fonctionnel pour le moment.");
    state.page = 'detail';
    window.render();
  };

  main.appendChild(footer);
  root.appendChild(main);
};