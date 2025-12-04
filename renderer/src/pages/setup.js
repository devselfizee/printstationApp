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
            <div class="setup-input-with-button">
              <input
                type="text"
                id="modal-kiosk-id"
                placeholder="Ex: 38d0f5e0-25ab-4d9c-be61-7e42a2be1a6c"
                required
              />
              <button id="modal-verify-kiosk" class="setup-btn-verify" type="button">
                🔍 Vérifier
              </button>
            </div>
            <div id="modal-kiosk-status" class="setup-status"></div>
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
    <style>
      .setup-input-with-button {
        display: flex;
        gap: 10px;
      }
      .setup-input-with-button input {
        flex: 1;
      }
      .setup-btn-verify {
        background: rgba(59, 130, 246, 0.3);
        border: 1px solid rgba(59, 130, 246, 0.5);
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        padding: 10px 15px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .setup-btn-verify:hover {
        background: rgba(59, 130, 246, 0.5);
      }
      .setup-btn-verify:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .setup-status {
        margin-top: 8px;
        font-size: 13px;
        min-height: 20px;
      }
      .setup-status.success {
        color: #10b981;
      }
      .setup-status.error {
        color: #f87171;
      }
      .setup-status.loading {
        color: #fbbf24;
      }
    </style>
  `;

  document.body.appendChild(modal);

  // Gestion de la sauvegarde
  const saveButton = document.getElementById('modal-save-config');
  const verifyButton = document.getElementById('modal-verify-kiosk');
  const kioskIdInput = document.getElementById('modal-kiosk-id');
  const salesPointIdInput = document.getElementById('modal-sales-point-id');
  const machineNameInput = document.getElementById('modal-machine-name');
  const errorMessage = document.getElementById('modal-error-message');
  const kioskStatus = document.getElementById('modal-kiosk-status');

  // Fonction pour vérifier le kiosk via l'API
  async function verifyKiosk() {
    const kioskId = kioskIdInput.value.trim();

    if (!kioskId) {
      kioskStatus.textContent = '⚠️ Veuillez entrer un ID de kiosque';
      kioskStatus.className = 'setup-status error';
      return;
    }

    try {
      verifyButton.disabled = true;
      verifyButton.textContent = '⏳ ...';
      kioskStatus.textContent = '🔄 Vérification en cours...';
      kioskStatus.className = 'setup-status loading';

      const result = await window.photoAPI.machine.fetchKiosk(kioskId);

      console.log('[Setup Modal] Résultat API kiosk:', result);

      if (result.status === 'success' && result.kiosk) {
        const kiosk = result.kiosk;

        // Auto-remplir les champs
        if (kiosk.sales_point_id) {
          salesPointIdInput.value = kiosk.sales_point_id;
        }
        if (kiosk.name) {
          machineNameInput.value = kiosk.name;
        }

        kioskStatus.textContent = '✅ Kiosque trouvé ! Champs auto-remplis.';
        kioskStatus.className = 'setup-status success';

      } else if (result.status === 'not_found') {
        kioskStatus.textContent = '⚠️ Kiosque non trouvé dans la base de données';
        kioskStatus.className = 'setup-status error';

      } else {
        kioskStatus.textContent = `❌ Erreur: ${result.error || 'Erreur inconnue'}`;
        kioskStatus.className = 'setup-status error';
      }

    } catch (error) {
      console.error('[Setup Modal] Erreur vérification kiosk:', error);
      kioskStatus.textContent = `❌ Erreur: ${error.message}`;
      kioskStatus.className = 'setup-status error';

    } finally {
      verifyButton.disabled = false;
      verifyButton.textContent = '🔍 Vérifier';
    }
  }

  // Événement clic sur le bouton vérifier
  verifyButton.onclick = verifyKiosk;

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
