import { state } from './src/state.js';
import { renderHome } from './src/pages/home.js';
import { renderScanner } from './src/pages/scanner.js';
import { renderListing } from './src/pages/listing.js';
import { renderCart } from './src/pages/cart.js';
import { renderForm } from './src/pages/form.js';
import { renderThanks } from './src/pages/thanks.js';
import { renderSetup } from './src/pages/setup.js';

console.log('[App] 🚀 Démarrage de l\'application');

// Router simple
const routes = {
  'home': renderHome,
  'scanner': renderScanner,
  'listing': renderListing,
  'cart': renderCart,
  'form': renderForm,
  'thanks': renderThanks,
  'setup': renderSetup
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

// Vérifier la configuration au démarrage
async function checkSetup() {
  try {
    const result = await window.photoAPI.machine.isSetupCompleted();

    if (!result.completed) {
      console.log('[App] ⚙️  Configuration initiale requise');
      navigate('setup');
    } else {
      console.log('[App] ✅ Configuration machine OK');
      navigate('home');
    }
  } catch (error) {
    console.error('[App] ❌ Erreur vérification setup:', error);
    // En cas d'erreur, démarrer sur home
    navigate('home');
  }
}

// Démarrer avec la vérification de configuration
checkSetup();

console.log('[App] ✅ Application initialisée');
