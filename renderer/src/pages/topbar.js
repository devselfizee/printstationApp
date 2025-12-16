import { state } from '../state.js';
import { $, updateCartCount } from '../utils.js';

export const renderTopbar = (root, onNavigate) => {
  const header = document.createElement('header');
  header.className = 'topbar';
  
  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'icon-btn back-btn';
  backBtn.innerHTML = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  backBtn.onclick = onNavigate;
  
  // Brand logo
  //const brand = document.createElement('div');
  //brand.className = 'brand';
//  brand.innerHTML = '<img src="./assets/logo.png" alt="Logo">';
  
  // Language selector
  const langs = document.createElement('div');
  langs.className = 'lang-selector';
const flags = {
  fr: '<img src="./assets/flags/fr.svg" alt="FR" style="width:20px;height:auto;">',
  en: '<img src="./assets/flags/en.svg" alt="EN" style="width:20px;height:auto;">',
  es: '<img src="./assets/flags/es.svg" alt="ES" style="width:20px;height:auto;">',
  it: '<img src="./assets/flags/it.svg" alt="IT" style="width:20px;height:auto;">',
  de: '<img src="./assets/flags/de.svg" alt="DE" style="width:20px;height:auto;">',
  zh: '<img src="./assets/flags/zh.svg" alt="ZH" style="width:20px;height:auto;">'
};

['fr', 'en', 'es', 'it', 'de', 'zh'].forEach(l => {
  const btn = document.createElement('button');
  btn.className = 'lang-btn' + (state.lang === l ? ' active' : '');
  btn.innerHTML = flags[l];  // ← innerHTML pour afficher le SVG
  btn.onclick = () => {
    const previousLang = state.lang;
    state.lang = l;
    // Logger le changement de langue
    if (window.photoAPI?.logger?.event) {
      window.photoAPI.logger.event('USER', 'LANG_CHANGE', {
        from: previousLang,
        to: l
      });
    }
    window.render();
  };
  langs.appendChild(btn);
});
  
  // Cart button - Affiche modal upselling sauf si déjà sur le panier
  const cartBtn = document.createElement('button');
  cartBtn.className = 'cart-btn';
  cartBtn.innerHTML = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg><span class="count" id="cartCount">0</span>';
  cartBtn.onclick = () => {
    // Si déjà sur le panier, ne rien faire
    if (state.page === 'cart') return;
    
    // Si panier pas vide, afficher modal upselling
    if (state.cart.length > 0) {
      const firstItem = state.cart[0];
      const product = window.PRODUCTS[firstItem.productId];
      const photo = state.photos.find(p => p.id === firstItem.photoId);
      const otherProduct = product.id === 'print' ? window.PRODUCTS.magnet : window.PRODUCTS.print;
      window.showUpsell(photo, otherProduct);
    } else {
      // Si panier vide, aller directement au panier
      state.page = 'cart';
      window.render();
    }
  };
  
  header.appendChild(backBtn);
  //header.appendChild(brand);
  header.appendChild(langs);
  header.appendChild(cartBtn);
  root.appendChild(header);
  
  updateCartCount();
};