import { navigate } from '../app.js';
import { state } from '../state.js';
import { t } from '../i18n.js';
import { showLoading, showError } from '../utils.js';

export function renderScanner(root) {
  console.log('[Scanner] Rendu de la page scanner');
  
  const container = document.createElement('div');
  container.className = 'page scanner-page';
  
  container.innerHTML = `
    <div class="scanner-content">
      <h2>${t('scanQR')}</h2>
      
      <div class="scanner-frame">
        <div class="scanner-overlay">
          <div class="scan-line"></div>
          <p>Placez le QR code dans le cadre</p>
        </div>
      </div>
      
      <button class="btn-secondary" id="btn-simulate-scan">
        🎯 Simuler un scan (dev)
      </button>
      
      <button class="btn-text" id="btn-back-home">
        ← ${t('back')}
      </button>
    </div>
  `;
  
  root.appendChild(container);
  
  // Événements
  const btnSimulate = document.getElementById('btn-simulate-scan');
  btnSimulate.addEventListener('click', async () => {
    await simulateScan(container);
  });
  
  const btnBack = document.getElementById('btn-back-home');
  btnBack.addEventListener('click', () => {
    navigate('home');
  });
}

/**
 * Simuler un scan de QR code (pour le développement)
 */
async function simulateScan(container) {
  console.log('[Scanner] Simulation de scan...');
  
  // Afficher le chargement
  showLoading(container, 'Récupération des photos...');
  
  try {
    // Simuler un délai
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Appeler l'API pour récupérer les photos
    const result = await window.api.photos.check(state.sessionId);
    
    if (result.status === 'success' && result.photos) {
      state.photos = result.photos;
      state.universeId = 'B'; // Univers par défaut (Mondes Disparus)

      console.log('[Scanner] ✅ Photos récupérées:', state.photos.length);
      
      // Naviguer vers la liste des photos
      navigate('listing');
    } else {
      throw new Error(result.error || 'Erreur lors de la récupération des photos');
    }
  } catch (error) {
    console.error('[Scanner] ❌ Erreur:', error);
    showError(container, 'Impossible de récupérer les photos. Veuillez réessayer.');
    
    // Bouton pour réessayer
    setTimeout(() => {
      const btnRetry = document.createElement('button');
      btnRetry.className = 'btn-primary';
      btnRetry.textContent = 'Réessayer';
      btnRetry.onclick = () => simulateScan(container);
      container.querySelector('.error-message').appendChild(btnRetry);
    }, 100);
  }
}
