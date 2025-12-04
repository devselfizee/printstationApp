import { t } from '../i18n.js';

/**
 * Modal de configuration initiale de la machine
 * Affichée au premier lancement pour configurer kiosk_id
 * Les autres champs (sales_point_id, machine_name) sont récupérés automatiquement depuis l'API
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
              placeholder="Ex: 38d0f5e0-25ab-4d9c-be61-7e42a2be1a6c"
              required
            />
          </div>

          <div id="modal-error-message" class="setup-error"></div>

          <div class="setup-info">
            ℹ️ Entrez l'ID du kiosque fourni par l'administrateur
          </div>

          <button id="modal-save-config" class="setup-btn-save">
            💾 Enregistrer la configuration
          </button>

          <div class="setup-required-note">
            * Champ obligatoire
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Gestion de la sauvegarde
  const saveButton = document.getElementById('modal-save-config');
  const kioskIdInput = document.getElementById('modal-kiosk-id');
  const errorMessage = document.getElementById('modal-error-message');

  saveButton.onclick = async () => {
    const kioskId = kioskIdInput.value.trim();

    // Validation
    if (!kioskId) {
      errorMessage.textContent = '⚠️ Veuillez entrer l\'ID du kiosque';
      errorMessage.style.display = 'block';
      return;
    }

    try {
      saveButton.disabled = true;
      saveButton.textContent = '⏳ Vérification...';
      saveButton.style.opacity = '0.6';
      errorMessage.style.display = 'none';

      // Vérifier si le kiosk existe via l'API
      console.log('[Setup Modal] Vérification du kiosk:', kioskId);
      const result = await window.photoAPI.machine.fetchKiosk(kioskId);

      console.log('[Setup Modal] Résultat API:', result);

      if (result.status === 'success' && result.kiosk) {
        const kiosk = result.kiosk;
        const salesPointId = kiosk.sales_point_id || '';
        const machineName = kiosk.name || null;
        const tva = kiosk.vat_rate || 20;

        console.log('[Setup Modal] Kiosk trouvé - sales_point_id:', salesPointId, ', name:', machineName, ', tva:', tva);

        // Sauvegarder la configuration
        saveButton.textContent = '⏳ Enregistrement...';
        await window.photoAPI.machine.saveConfig(kioskId, salesPointId, machineName, tva);

        console.log('[Setup Modal] ✅ Configuration enregistrée:', { kioskId, salesPointId, machineName, tva });

        // Succès
        saveButton.textContent = '✅ Configuration enregistrée !';

        setTimeout(() => {
          modal.remove();
          // Recharger la page pour afficher le dashboard
          window.location.reload();
        }, 1000);

      } else if (result.status === 'not_found') {
        errorMessage.textContent = '⚠️ Ce kiosque n\'existe pas dans la base de données';
        errorMessage.style.display = 'block';
        saveButton.disabled = false;
        saveButton.textContent = '💾 Enregistrer la configuration';
        saveButton.style.opacity = '1';

      } else {
        errorMessage.textContent = `❌ Erreur: ${result.error || 'Erreur inconnue'}`;
        errorMessage.style.display = 'block';
        saveButton.disabled = false;
        saveButton.textContent = '💾 Enregistrer la configuration';
        saveButton.style.opacity = '1';
      }

    } catch (error) {
      console.error('[Setup Modal] ❌ Erreur:', error);
      errorMessage.textContent = `❌ Erreur: ${error.message}`;
      errorMessage.style.display = 'block';
      saveButton.disabled = false;
      saveButton.textContent = '💾 Enregistrer la configuration';
      saveButton.style.opacity = '1';
    }
  };

  // Cacher l'erreur quand l'utilisateur tape
  kioskIdInput.addEventListener('input', () => {
    errorMessage.style.display = 'none';
  });

  // Focus sur l'input
  setTimeout(() => kioskIdInput.focus(), 100);
};
