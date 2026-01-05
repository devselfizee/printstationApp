import { state } from '../state.js';
import { t } from '../i18n.js';
import { $ } from '../utils.js';

export const renderThanks = async (root) => {
  // Charger les messages personnalisés depuis la base de données
  let customTitle = null;
  let customSubtitle = null;

  try {
    if (window.photoAPI?.admin?.getThanksMessage) {
      const result = await window.photoAPI.admin.getThanksMessage(state.lang || 'fr');
      if (result.status === 'success' && result.message) {
        customTitle = result.message.title;
        customSubtitle = result.message.subtitle;
        console.log('[Thanks] Messages personnalisés chargés:', { customTitle, customSubtitle });
      }
    }
  } catch (error) {
    console.error('[Thanks] Erreur chargement messages personnalisés:', error);
  }

  // Utiliser les messages personnalisés ou les valeurs par défaut i18n
  const line1 = customTitle || t('thanksLine1');
  const line2 = customSubtitle || t('thanksLine2');

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
        <p class="thanks-line1">${line1}</p>
        <p class="thanks-line2">${line2}</p>
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
