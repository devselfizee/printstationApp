import { state } from '../state.js';
import { t } from '../i18n.js';
import { $ } from '../utils.js';

export const renderThanks = (root) => {
  const thanks = document.createElement('div');
  thanks.className = 'thanks-page';
  thanks.innerHTML = `
    <div class="thanks-content">
      <svg width="80" height="80" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#5eb7ff"/><path d="M30 50 L45 65 L70 35" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h2>${t('thanks')}</h2>
      <p>${t('order')}</p>
      <p>${state.email ? t('receipt') + ' ' + state.email : ''}</p>
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
