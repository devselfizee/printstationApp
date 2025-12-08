/**
 * dev-simulator.js - Simulator de QR code pour développement
 *
 * Affiche la liste des participants depuis la DB SQLite
 */

const $ = (selector) => document.querySelector(selector);

// ============================================
// MODAL "QR CODE INVALIDE"
// ============================================
function showInvalidQRModal() {
  // Supprimer un modal existant si présent
  const existingModal = document.getElementById('invalid-qr-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'invalid-qr-modal';
  modal.className = 'invalid-qr-modal-overlay';
  modal.innerHTML = `
    <div class="invalid-qr-modal">
      <div class="invalid-qr-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3h6v6H3z"></path>
          <path d="M15 3h6v6h-6z"></path>
          <path d="M3 15h6v6H3z"></path>
          <path d="M15 15h6v6h-6z"></path>
          <line x1="9" y1="9" x2="15" y2="15" stroke-width="2.5" stroke="#ef4444"></line>
          <line x1="15" y1="9" x2="9" y2="15" stroke-width="2.5" stroke="#ef4444"></line>
        </svg>
      </div>
      <h2 class="invalid-qr-title">Oups !</h2>
      <p class="invalid-qr-message">Ce QR Code n'est pas valide.</p>
      <p class="invalid-qr-hint">Veuillez scanner un QR Code valide.</p>
      <button class="invalid-qr-btn" id="close-invalid-qr-modal">OK</button>
    </div>
  `;

  // Ajouter les styles inline si pas déjà présents
  if (!document.getElementById('invalid-qr-modal-styles')) {
    const styles = document.createElement('style');
    styles.id = 'invalid-qr-modal-styles';
    styles.textContent = `
      .invalid-qr-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeInInvalid 0.3s ease;
      }
      @keyframes fadeInInvalid {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .invalid-qr-modal {
        background: white;
        border-radius: 20px;
        padding: 40px 50px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUpInvalid 0.3s ease;
      }
      @keyframes slideUpInvalid {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .invalid-qr-icon {
        color: #6b7280;
        margin-bottom: 20px;
      }
      .invalid-qr-icon svg {
        filter: drop-shadow(0 4px 6px rgba(107, 114, 128, 0.3));
      }
      .invalid-qr-title {
        font-size: 28px;
        font-weight: 700;
        color: #ef4444;
        margin: 0 0 15px 0;
      }
      .invalid-qr-message {
        font-size: 18px;
        color: #4b5563;
        margin: 0 0 10px 0;
      }
      .invalid-qr-hint {
        font-size: 14px;
        color: #9ca3af;
        margin: 0 0 25px 0;
      }
      .invalid-qr-btn {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        border: none;
        padding: 14px 50px;
        font-size: 18px;
        font-weight: 600;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .invalid-qr-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
      }
      .invalid-qr-btn:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(modal);

  // Fermer le modal au clic sur le bouton ou l'overlay
  document.getElementById('close-invalid-qr-modal').addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ============================================
// MODAL "PHOTOS NON DISPONIBLES"
// ============================================
function showNoPhotosModal() {
  // Supprimer un modal existant si présent
  const existingModal = document.getElementById('no-photos-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'no-photos-modal';
  modal.className = 'no-photos-modal-overlay';
  modal.innerHTML = `
    <div class="no-photos-modal">
      <div class="no-photos-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
          <line x1="2" y1="2" x2="22" y2="22" stroke-width="2"></line>
        </svg>
      </div>
      <h2 class="no-photos-title">Photos non disponibles</h2>
      <p class="no-photos-message">Les photos ne sont pas encore disponibles.</p>
      <p class="no-photos-hint">Veuillez réessayer dans quelques instants.</p>
      <button class="no-photos-btn" id="close-no-photos-modal">OK</button>
    </div>
  `;

  // Ajouter les styles inline si pas déjà présents
  if (!document.getElementById('no-photos-modal-styles')) {
    const styles = document.createElement('style');
    styles.id = 'no-photos-modal-styles';
    styles.textContent = `
      .no-photos-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .no-photos-modal {
        background: white;
        border-radius: 20px;
        padding: 40px 50px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease;
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .no-photos-icon {
        color: #f59e0b;
        margin-bottom: 20px;
      }
      .no-photos-icon svg {
        filter: drop-shadow(0 4px 6px rgba(245, 158, 11, 0.3));
      }
      .no-photos-title {
        font-size: 24px;
        font-weight: 700;
        color: #1f2937;
        margin: 0 0 15px 0;
      }
      .no-photos-message {
        font-size: 18px;
        color: #4b5563;
        margin: 0 0 10px 0;
      }
      .no-photos-hint {
        font-size: 14px;
        color: #9ca3af;
        margin: 0 0 25px 0;
      }
      .no-photos-btn {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        padding: 14px 50px;
        font-size: 18px;
        font-weight: 600;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .no-photos-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
      }
      .no-photos-btn:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(modal);

  // Fermer le modal au clic sur le bouton ou l'overlay
  document.getElementById('close-no-photos-modal').addEventListener('click', () => {
    modal.remove();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ============================================
// INIT
// ============================================

export function initDevSimulator() {
  // Créer le bouton de dev (discret, masqué par défaut - toggle F5)
  const devBtn = document.createElement('button');
  devBtn.id = 'dev-simulator-btn';
  devBtn.className = 'dev-simulator-btn dev-hidden';
  devBtn.innerHTML = '⚙️';
  devBtn.title = 'Simulator QR (DEV ONLY)';
  devBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(255, 107, 107, 0.2);
    border: 2px solid rgba(255, 107, 107, 0.4);
    color: rgba(255, 107, 107, 0.8);
    font-size: 20px;
    cursor: pointer;
    z-index: 1000;
    transition: all 0.3s ease;
    display: none;
  `;

  devBtn.onmouseover = () => {
    devBtn.style.background = 'rgba(255, 107, 107, 0.3)';
    devBtn.style.transform = 'scale(1.1)';
  };

  devBtn.onmouseout = () => {
    devBtn.style.background = 'rgba(255, 107, 107, 0.2)';
    devBtn.style.transform = 'scale(1)';
  };

  devBtn.onclick = showSimulatorPopup;

  document.body.appendChild(devBtn);
  console.log('[DevSim] Simulator bouton créé (bas droit)');
}

// ============================================
// POPUP SIMULATOR
// ============================================

async function showSimulatorPopup() {
  const modal = document.createElement('div');
  modal.id = 'dev-simulator-modal';
  modal.className = 'dev-simulator-modal';

  // Charger les participants depuis l'API
  let participants = [];
  let universes = [];
  const participantUniverseMap = {}; // 🆕 Map participant → universe

  try {
    // ⭐ CORRECTION: Utiliser la bonne API
    if (window.photoAPI?.admin?.getDashboard) {
      const stats = await window.photoAPI.admin.getDashboard();

      // ⭐ participants.list existe maintenant
      participants = stats?.participants?.list || [];
      universes = stats?.universes?.list || [];

      // 🆕 Créer une map participant → universe pour l'auto-sélection
      participants.forEach(p => {
        participantUniverseMap[p.id] = p.universe_id;
      });

      console.log('[DevSim] Participants chargés:', participants.length);
      console.log('[DevSim] Univers chargés:', universes.length);
      console.log('[DevSim] Participant→Universe map:', participantUniverseMap);
    }
  } catch (error) {
    console.error('[DevSim] Erreur chargement participants:', error);
  }

  // Créer la liste HTML des participants
  const participantsList = participants.length > 0
    ? `<option value="">-- Sélectionner un participant --</option>` +
      participants.map(p => `<option value="${p.id}" data-universe="${p.universe_id}">${p.id} (${p.universe_id || p.status})</option>`).join('')
    : '<option value="">-- Aucun participant en DB --</option>';

  const universesList = universes.length > 0
    ? universes.map(u => `<option value="${u.id}">${u.name}</option>`).join('')
    : '<option value="B">Mondes Disparus (défaut)</option>';

  modal.innerHTML = `
    <div class="dev-simulator-container">
      <div class="dev-simulator-box">
        <h2>🎯 QR Code Simulator</h2>
        
        <div class="dev-simulator-form">
          <div class="dev-form-group">
            <label>Participant (depuis DB)</label>
            <select id="devParticipantSelect">
              ${participantsList}
            </select>
            <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px;">
              ${participants.length} participant(s) en DB
            </div>
          </div>

          <div class="dev-form-group">
            <label>Ou créer un nouveau</label>
            <input type="text" id="devParticipantId" placeholder="participant_custom_001" />
          </div>

          <div class="dev-form-group">
            <label>Universe <span id="universeAutoLabel" style="font-size: 11px; color: #4ade80;"></span></label>
            <select id="devUniverse">
              ${universesList}
            </select>
          </div>

          <div class="dev-info">
            ℹ️ L'univers est automatiquement sélectionné pour les participants existants
          </div>

          <button id="devSimulateBtn" class="dev-btn-simulate">▶️ Simuler Scan</button>
          <button id="devCancelBtn" class="dev-btn-cancel">Annuler</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const participantSelect = $('#devParticipantSelect');
  const participantInput = $('#devParticipantId');
  const universeSelect = $('#devUniverse');
  const universeAutoLabel = $('#universeAutoLabel');
  const simulateBtn = $('#devSimulateBtn');
  const cancelBtn = $('#devCancelBtn');

  // 🆕 Fonction pour auto-sélectionner l'univers
  function autoSelectUniverse() {
    const selectedParticipant = participantSelect.value;
    const customInput = participantInput.value.trim().toUpperCase();

    if (selectedParticipant && participantUniverseMap[selectedParticipant]) {
      // Participant existant → auto-sélectionner l'univers
      const universeId = participantUniverseMap[selectedParticipant];
      universeSelect.value = universeId;
      universeSelect.disabled = true;
      universeSelect.style.opacity = '0.6';
      universeSelect.style.cursor = 'not-allowed';
      universeAutoLabel.textContent = '(auto-sélectionné)';
    } else if (customInput && ['A', 'B', 'C', 'D', 'E'].includes(customInput.charAt(0))) {
      // 🆕 Nouveau participant avec préfixe valide → auto-sélectionner l'univers
      const universeId = customInput.charAt(0);
      universeSelect.value = universeId;
      universeSelect.disabled = true;
      universeSelect.style.opacity = '0.6';
      universeSelect.style.cursor = 'not-allowed';
      universeAutoLabel.textContent = `(univers ${universeId} détecté)`;
    } else {
      // Pas de préfixe valide → activer la sélection manuelle
      universeSelect.disabled = false;
      universeSelect.style.opacity = '1';
      universeSelect.style.cursor = 'pointer';
      universeAutoLabel.textContent = customInput ? '(préfixe A-E requis)' : '';
    }
  }

  // Quand on sélectionne un participant, vider le champ custom ET auto-sélectionner l'univers
  participantSelect.onchange = () => {
    if (participantSelect.value) {
      participantInput.value = '';
    }
    autoSelectUniverse();
  };

  // Quand on tape dans le champ custom, déselectionner ET activer la sélection d'univers
  participantInput.oninput = () => {
    if (participantInput.value) {
      participantSelect.value = '';
    }
    autoSelectUniverse();
  };

  // 🆕 Auto-sélectionner l'univers au chargement si un participant est pré-sélectionné
  autoSelectUniverse();

  simulateBtn.onclick = async () => {
    const selectedFromList = participantSelect.value;
    const customInput = participantInput.value.trim();

    let participantId = '';
    let universe = '';
    let isNewParticipant = false;

    if (selectedFromList) {
      // Participant existant sélectionné depuis la liste
      participantId = selectedFromList;
      universe = participantUniverseMap[participantId] || universeSelect.value;
      isNewParticipant = false;
      console.log('[DevSim] Participant existant sélectionné:', participantId);
    } else if (customInput) {
      // Nouveau participant saisi manuellement
      const upperInput = customInput.toUpperCase();
      const firstLetter = upperInput.charAt(0);

      // ⭐ Validation du QR Code
      // Règles: première lettre doit être A, B, C, D ou E et longueur = 6
      const isValidFirstChar = ['A', 'B', 'C', 'D', 'E'].includes(firstLetter);
      const isValidLength = upperInput.length === 6;

      console.log('[DevSim] 🔍 Validation QR Code:');
      console.log('[DevSim]   - Données:', upperInput);
      console.log('[DevSim]   - Premier caractère:', firstLetter, '→', isValidFirstChar ? '✅' : '❌');
      console.log('[DevSim]   - Longueur:', upperInput.length, '→', isValidLength ? '✅' : '❌');

      if (!isValidFirstChar || !isValidLength) {
        console.log('[DevSim] ❌ QR Code invalide - affichage du modal');
        showInvalidQRModal();
        return;
      }

      // Extraire l'univers et le code_participant
      universe = firstLetter;
      participantId = upperInput.substring(1); // Le reste après la première lettre
      isNewParticipant = true;

      console.log('[DevSim] Nouveau participant détecté:');
      console.log('[DevSim]   - Input complet:', upperInput);
      console.log('[DevSim]   - Universe ID:', universe);
      console.log('[DevSim]   - Code participant:', participantId);
    } else {
      alert('Veuillez sélectionner ou créer un participant');
      return;
    }

    console.log('[DevSim] Simulation scan QR:', { participantId, universe, isNewParticipant });

    try {
      // 🆕 Si nouveau participant, le créer d'abord dans la DB
      if (isNewParticipant && window.photoAPI?.participants?.addOrUpdate) {
        console.log('[DevSim] 📝 Création du participant dans la DB...');

        const createResult = await window.photoAPI.participants.addOrUpdate(participantId, universe, 'active');

        if (createResult?.status === 'success') {
          console.log('[DevSim] ✅ Participant créé:', participantId, '→ univers', universe);
        } else {
          console.warn('[DevSim] ⚠️ Erreur création participant:', createResult?.error);
          // Continuer quand même le scan
        }
      }

      // ⭐ Appeler le scan QR avec les données
      const qrContent = JSON.stringify({
        universe,
        participantId,
      });

      // ⭐ CORRECTION: Utiliser l'API photoAPI.scanQR
      if (window.photoAPI?.scanQR) {
        const result = await window.photoAPI.scanQR(qrContent);
        console.log('[DevSim] Résultat scan:', result);

        if (result.status === 'success') {
          console.log('[DevSim] ✅ Scan réussi!');
          console.log('[DevSim] Participant:', result.participantId);
          console.log('[DevSim] Photos:', result.photos?.length || 0);

          // Vérifier si le participant a des photos
          if (!result.photos || result.photos.length === 0) {
            console.log('[DevSim] ⚠️ Aucune photo disponible pour ce participant');
            showNoPhotosModal();
            return;
          }

          // ⭐ NAVIGATION: Mettre à jour le state et naviguer vers listing
          if (window.state && window.render) {
            // Mettre à jour le state global
            window.state.universe = result.universe;
            window.state.photos = result.photos || [];
            window.state.participantId = result.participantId;
            window.state.universeId = result.universeId || universe;

            // Changer de page
            window.state.page = 'listing';

            // Re-render l'application
            window.render();

            console.log('[DevSim] ✅ Navigation vers listing effectuée');
          } else {
            console.warn('[DevSim] ⚠️  window.state ou window.render non disponible');
          }
        } else {
          console.error('[DevSim] ❌ Erreur scan:', result.error);
          alert(`Erreur lors du scan: ${result.error}`);
        }
      } else {
        console.error('[DevSim] ❌ window.photoAPI.scanQR non disponible');
        alert('API de scan non disponible');
      }
    } catch (error) {
      console.error('[DevSim] ❌ Erreur scan:', error);
      alert(`Erreur: ${error.message}`);
    }

    modal.remove();
  };

  cancelBtn.onclick = () => {
    modal.remove();
  };

  // Focus sur le select
  setTimeout(() => participantSelect.focus(), 100);
}