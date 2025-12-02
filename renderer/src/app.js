import { state } from './src/state.js';
import { renderHome } from './src/pages/home.js';
import { renderScanner } from './src/pages/scanner.js';
import { renderListing } from './src/pages/listing.js';
import { renderCart } from './src/pages/cart.js';
import { renderForm } from './src/pages/form.js';
import { renderThanks } from './src/pages/thanks.js';
import { showSetupModal } from './src/pages/setup.js';

console.log('[App] 🚀 Démarrage de l\'application');

// Router simple
const routes = {
  'home': renderHome,
  'scanner': renderScanner,
  'listing': renderListing,
  'cart': renderCart,
  'form': renderForm,
  'thanks': renderThanks
};

// Navigation
export function navigate(page, params = {}) {
  console.log('[App] 📍 Navigation vers:', page, params);

  state.currentPage = page;
  Object.assign(state, params);

  const root = document.getElementById('root');
  if (!root) {
    console.error('[App] ❌ Element #root non trouvé');
    return;
  }

  root.innerHTML = '';

  const renderFn = routes[page];
  if (renderFn) {
    renderFn(root);
  } else {
    console.error('[App] ❌ Page non trouvée:', page);
    root.innerHTML = `<div class="error">Page non trouvée: ${page}</div>`;
  }
}

// Attendre que photoAPI soit disponible
function waitForPhotoAPI(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkAPI = () => {
      if (window.photoAPI && window.photoAPI.machine) {
        console.log('[App] ✅ photoAPI disponible');
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout: photoAPI non disponible'));
      } else {
        setTimeout(checkAPI, 100);
      }
    };

    checkAPI();
  });
}

// Vérifier la configuration au démarrage
async function checkSetup() {
  try {
    // Attendre que photoAPI soit disponible
    await waitForPhotoAPI();

    console.log('[App] 🔍 Vérification de la configuration...');
    const result = await window.photoAPI.machine.isSetupCompleted();
    console.log('[App] Résultat isSetupCompleted:', result);

    // Toujours démarrer sur home
    navigate('home');

    // Si pas de config, afficher le modal par-dessus
    if (!result.completed) {
      console.log('[App] ⚙️  Configuration initiale requise - Affichage du modal');
      setTimeout(() => showSetupModal(), 500); // Petit délai pour que la page home soit chargée
    } else {
      console.log('[App] ✅ Configuration machine OK');
    }
  } catch (error) {
    console.error('[App] ❌ Erreur vérification setup:', error);
    // En cas d'erreur, démarrer sur home
    console.log('[App] Démarrage sur home par défaut');
    navigate('home');
  }
}

// Démarrer avec la vérification de configuration
checkSetup();

console.log('[App] ✅ Application initialisée');
