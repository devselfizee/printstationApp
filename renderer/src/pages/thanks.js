import { state } from '../state.js';
import { t } from '../i18n.js';
import { $ } from '../utils.js';

export const renderThanks = (root) => {
  const thanks = document.createElement('div');
  thanks.className = 'thanks-page';
  thanks.innerHTML = `
    <div class="thanks-content">
      <img src="./assets/logo.png" alt="Eclipso" class="thanks-logo">
      <h2>Eclipso vous remercie</h2>
      <p class="thanks-message">A très bientôt pour de nouvelles expériences immersives.<br>Rendez-vous au comptoir pour récupérer votre commande.</p>
      <p class="thanks-email">${state.email ? t('receipt') + ' ' + state.email : ''}</p>
      <button class="thanks-btn" onclick="window.backToQR()">${t('backHome')}</button>
      <div class="thanks-timer">${t('backHome')} in <span id="counter">${state.thanksCounter}</span>s</div>
    </div>`;
  root.appendChild(thanks);
  
  state.thanksCounter = 5;
  state.timer = setInterval(() => {
    state.thanksCounter--;
    const cnt = $('#counter');
    if (cnt) cnt.textContent = state.thanksCounter;
    if (state.thanksCounter <= 0) {
      clearInterval(state.timer);
      window.backToQR();
    }
  }, 1000);
};
