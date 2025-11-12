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
        btn.onclick = () => {
          const act = btn.dataset.a;
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
  onContinue: () => {
    state.page = 'payment';
    window.render();
  }
});
  
  wrap.appendChild(footer);
  main.appendChild(wrap);
  root.appendChild(main);
}; 