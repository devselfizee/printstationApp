import { navigate } from '../app.js';
import { state, resetState } from '../state.js';
import { t } from '../i18n.js';

export function renderHome(root) {
  console.log('[Home] Rendu de la page d'accueil');
  
  const container = document.createElement('div');
  container.className = 'page home-page';
  
  container.innerHTML = `
    <div class="home-content">
      <div class="logo">
        <img src="./assets/logo.png" alt="PrintStation" onerror="this.style.display='none'">
        <h1>PrintStation</h1>
      </div>
      
      <div class="welcome">
        <h2>Bienvenue !</h2>
        <p>Scannez votre QR code pour retrouver vos photos</p>
      </div>
      
      <button class="btn-primary btn-large" id="btn-start">
        <span class="btn-icon">📸</span>
        ${t('start')}
      </button>
      
      <div class="home-footer">
        <p>Touchez l'écran pour commencer</p>
      </div>
    </div>
  `;
  
  root.appendChild(container);
  
  // Événements
  const btnStart = document.getElementById('btn-start');
  btnStart.addEventListener('click', async () => {
    // Réinitialiser l'état pour une nouvelle session
    resetState();
    
    // Créer la session en base
    await window.api.session.create(state.sessionId);
    
    console.log('[Home] Nouvelle session créée:', state.sessionId);
    
    // Aller au scanner
    navigate('scanner');
  });
}
