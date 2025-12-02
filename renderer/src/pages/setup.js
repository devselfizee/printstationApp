import { t } from '../i18n.js';

/**
 * Modal de configuration initiale de la machine
 * Affichée au premier lancement pour configurer kiosk_id et sales_point_id
 */
export const showSetupModal = () => {
  const modal = document.createElement('div');
  modal.id = 'setup-modal';
  modal.className = 'setup-modal';

  modal.innerHTML = `
    <div class="setup-container">
      <div class="setup-box">
        <h2>⚙️ Configuration Machine</h2>

        <div class="setup-description">
          Configuration requise pour le premier lancement
        </div>

        <div class="setup-form">
          <div class="setup-form-group">
            <label>ID du Kiosque *</label>
            <input
              type="text"
              id="modal-kiosk-id"
              placeholder="Ex: kiosk-001"
              required
            />
          </div>

          <div class="setup-form-group">
            <label>ID du Point de Vente *</label>
            <input
              type="text"
              id="modal-sales-point-id"
              placeholder="Ex: store-001"
              required
            />
          </div>

          <div class="setup-form-group">
            <label>Nom de la Machine (optionnel)</label>
            <input
              type="text"
              id="modal-machine-name"
              placeholder="Ex: Kiosque Principal"
            />
          </div>

          <div id="modal-error-message" class="setup-error"></div>

          <div class="setup-info">
            ℹ️ Ces informations seront utilisées pour identifier cette machine lors des synchronisations avec l'API
          </div>

          <button id="modal-save-config" class="setup-btn-save">
            💾 Enregistrer la configuration
          </button>

          <div class="setup-required-note">
            * Champs obligatoires
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Gestion de la sauvegarde
  const saveButton = document.getElementById('modal-save-config');
  const kioskIdInput = document.getElementById('modal-kiosk-id');
  const salesPointIdInput = document.getElementById('modal-sales-point-id');
  const machineNameInput = document.getElementById('modal-machine-name');
  const errorMessage = document.getElementById('modal-error-message');

  saveButton.onclick = async () => {
    const kioskId = kioskIdInput.value.trim();
    const salesPointId = salesPointIdInput.value.trim();
    const machineName = machineNameInput.value.trim() || null;

    // Validation
    if (!kioskId || !salesPointId) {
      errorMessage.textContent = '⚠️ Veuillez remplir tous les champs obligatoires';
      errorMessage.style.display = 'block';
      return;
    }

    try {
      saveButton.disabled = true;
      saveButton.textContent = '⏳ Enregistrement...';
      saveButton.style.opacity = '0.6';

      // Sauvegarder la configuration
      await window.photoAPI.machine.saveConfig(kioskId, salesPointId, machineName);

      console.log('[Setup Modal] ✅ Configuration enregistrée:', { kioskId, salesPointId, machineName });

      // Fermer le modal
      saveButton.textContent = '✅ Configuration enregistrée !';

      setTimeout(() => {
        modal.remove();
        // Recharger la page pour appliquer la config
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('[Setup Modal] ❌ Erreur sauvegarde config:', error);
      errorMessage.textContent = `❌ Erreur: ${error.message}`;
      errorMessage.style.display = 'block';
      saveButton.disabled = false;
      saveButton.textContent = '💾 Enregistrer la configuration';
      saveButton.style.opacity = '1';
    }
  };

  // Focus sur le premier input
  setTimeout(() => kioskIdInput.focus(), 100);
};

