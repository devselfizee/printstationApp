import { t } from '../i18n.js';

/**
 * Page de configuration initiale de la machine
 * Affichée au premier lancement pour configurer kiosk_id et sales_point_id
 */
export const renderSetup = (root) => {
  const main = document.createElement('div');
  main.className = 'main';

  const wrap = document.createElement('div');
  wrap.className = 'setup-page';
  wrap.style.cssText = `
    max-width: 600px;
    margin: 50px auto;
    padding: 40px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;

  wrap.innerHTML = `
    <div style="text-align: center; margin-bottom: 40px;">
      <h1 style="color: #1e293b; margin-bottom: 10px;">⚙️ Configuration initiale</h1>
      <p style="color: #64748b; font-size: 16px;">
        Veuillez configurer cette machine avant la première utilisation
      </p>
    </div>

    <div class="setup-form">
      <div class="form-group" style="margin-bottom: 25px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #334155;">
          ID du Kiosque *
        </label>
        <input
          type="text"
          id="kiosk-id"
          placeholder="Ex: kiosk-001 ou UUID"
          required
          style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px;"
        />
        <small style="color: #64748b; font-size: 14px; margin-top: 5px; display: block;">
          Identifiant unique de ce kiosque
        </small>
      </div>

      <div class="form-group" style="margin-bottom: 25px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #334155;">
          ID du Point de Vente *
        </label>
        <input
          type="text"
          id="sales-point-id"
          placeholder="Ex: store-001 ou UUID"
          required
          style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px;"
        />
        <small style="color: #64748b; font-size: 14px; margin-top: 5px; display: block;">
          Identifiant du point de vente / magasin
        </small>
      </div>

      <div class="form-group" style="margin-bottom: 30px;">
        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #334155;">
          Nom de la Machine (optionnel)
        </label>
        <input
          type="text"
          id="machine-name"
          placeholder="Ex: Kiosque Principal - Entrée"
          style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px;"
        />
        <small style="color: #64748b; font-size: 14px; margin-top: 5px; display: block;">
          Nom descriptif pour identifier cette machine
        </small>
      </div>

      <div id="error-message" style="display: none; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; margin-bottom: 20px;">
      </div>

      <button
        id="save-config"
        style="width: 100%; padding: 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s;"
        onmouseover="this.style.background='#2563eb'"
        onmouseout="this.style.background='#3b82f6'"
      >
        💾 Enregistrer la configuration
      </button>

      <p style="text-align: center; color: #94a3b8; font-size: 14px; margin-top: 20px;">
        * Champs obligatoires
      </p>
    </div>
  `;

  main.appendChild(wrap);
  root.appendChild(main);

  // Gestion de la sauvegarde
  const saveButton = document.getElementById('save-config');
  const kioskIdInput = document.getElementById('kiosk-id');
  const salesPointIdInput = document.getElementById('sales-point-id');
  const machineNameInput = document.getElementById('machine-name');
  const errorMessage = document.getElementById('error-message');

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

      // Sauvegarder la configuration
      await window.photoAPI.machine.saveConfig(kioskId, salesPointId, machineName);

      console.log('[Setup] ✅ Configuration enregistrée:', { kioskId, salesPointId, machineName });

      // Recharger l'application pour appliquer la config
      saveButton.textContent = '✅ Configuration enregistrée ! Redémarrage...';
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('[Setup] ❌ Erreur sauvegarde config:', error);
      errorMessage.textContent = `❌ Erreur: ${error.message}`;
      errorMessage.style.display = 'block';
      saveButton.disabled = false;
      saveButton.textContent = '💾 Enregistrer la configuration';
    }
  };
};
