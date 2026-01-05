import { state } from '../state.js';
import { t } from '../i18n.js';
import { $ } from '../utils.js';

export const renderThanks = (root) => {
  const thanks = document.createElement('div');
  thanks.className = 'thanks-page';
  thanks.innerHTML = `
    <div class="thanks-content">
      <div class="thanks-checkmark">
        <svg viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
          <circle cx="26" cy="26" r="25" fill="#10b981"/>
          <path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M14 27l7 7 16-16"/>
        </svg>
      </div>
      <h1 class="thanks-title">${t('thanksTitle')}</h1>
      <p class="thanks-subtitle">${t('thanksSubtitle')}</p>
      <div class="thanks-instructions">
        <p class="thanks-line1">${t('thanksLine1')}</p>
        <p class="thanks-line2">${t('thanksLine2')}</p>
      </div>
      <button class="thanks-btn" onclick="window.backToQR()">${t('thanksBtn')}</button>
      <img src="./assets/logo.png" alt="Eclipso" class="thanks-logo-bottom">
    </div>`;
  root.appendChild(thanks);

  state.thanksCounter = 10;
  state.timer = setInterval(() => {
    state.thanksCounter--;
    if (state.thanksCounter <= 0) {
      clearInterval(state.timer);
      window.backToQR();
    }
  }, 1000);
};
