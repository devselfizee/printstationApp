import { t } from '../i18n.js';

/**
 * Modal de configuration initiale de la machine
 * Affichée au premier lancement pour configurer kiosk_id et sales_point_id
 */
export const showSetupModal = () => {
  // Créer le backdrop (fond noir semi-transparent)
  const backdrop = document.createElement('div');
  backdrop.id = 'setup-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  // Créer le modal
  const modal = document.createElement('div');
  modal.className = 'setup-modal';
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 40px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
  `;

  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h2 style="color: #1e293b; margin-bottom: 10px; font-size: 24px;">⚙️ Configuration Machine</h2>
      <p style="color: #64748b; font-size: 15px;">
        Configuration requise pour le premier lancement
      </p>
    </div>

    <div class="setup-form">
      <div class="form-group" style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #334155; font-size: 14px;">
          ID du Kiosque *
        </label>
        <input
          type="text"
          id="modal-kiosk-id"
          placeholder="Ex: kiosk-001"
          required
          style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 15px; box-sizing: border-box;"
        />
      </div>

      <div class="form-group" style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #334155; font-size: 14px;">
          ID du Point de Vente *
        </label>
        <input
          type="text"
          id="modal-sales-point-id"
          placeholder="Ex: store-001"
          required
          style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 15px; box-sizing: border-box;"
        />
      </div>

      <div class="form-group" style="margin-bottom: 25px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #334155; font-size: 14px;">
          Nom de la Machine (optionnel)
        </label>
        <input
          type="text"
          id="modal-machine-name"
          placeholder="Ex: Kiosque Principal"
          style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 15px; box-sizing: border-box;"
        />
      </div>

      <div id="modal-error-message" style="display: none; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; margin-bottom: 20px; font-size: 14px;">
      </div>

      <button
        id="modal-save-config"
        style="width: 100%; padding: 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s;"
      >
        💾 Enregistrer la configuration
      </button>

      <p style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 15px; margin-bottom: 0;">
        * Champs obligatoires
      </p>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Gestion de la sauvegarde
  const saveButton = document.getElementById('modal-save-config');
  const kioskIdInput = document.getElementById('modal-kiosk-id');
  const salesPointIdInput = document.getElementById('modal-sales-point-id');
  const machineNameInput = document.getElementById('modal-machine-name');
  const errorMessage = document.getElementById('modal-error-message');

  // Effet hover pour le bouton
  saveButton.onmouseover = () => saveButton.style.background = '#2563eb';
  saveButton.onmouseout = () => saveButton.style.background = '#3b82f6';

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
      saveButton.style.background = '#10b981';

      setTimeout(() => {
        backdrop.remove();
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
};

