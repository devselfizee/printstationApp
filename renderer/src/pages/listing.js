import { state } from '../state.js';
import { t } from '../i18n.js';
import { createFooterBar, attachFooterListeners, updateFooterBar, formatPrice } from '../utils.js';
import { UNIVERSES } from '../data.js';

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


  const footer = createFooterBar({
     showPrice: false,
  });
  attachFooterListeners();


  main.appendChild(footer);
  //attachFooterListeners();  



  
  root.appendChild(main);
};