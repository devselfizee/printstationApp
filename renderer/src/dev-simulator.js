/**
 * dev-simulator.js - Simulator de QR code pour développement
 *
 * Affiche la liste des participants depuis la DB SQLite
 */

import { isValidUniverseCode } from './universes.js';

const $ = (selector) => document.querySelector(selector);

// Modals partagés depuis qr.js (exposés sur window)
function showInvalidQRModal() { window.showInvalidQRModal(); }
function showNoPhotosModal() { window.showNoPhotosModal(); }
function showPhotosPurgedModal() { window.showPhotosPurgedModal(); }

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
    } else if (customInput && isValidUniverseCode(customInput.charAt(0))) {
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
      universeAutoLabel.textContent = customInput ? '(préfixe univers valide requis)' : '';
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
      // Règles: première lettre = univers valide du registre admin, et longueur = 6
      const isValidFirstChar = isValidUniverseCode(firstLetter);
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
            if (result.purgedCount && result.purgedCount > 0) {
              console.log('[DevSim] 🗑️ Toutes les photos ont été purgées pour ce participant');
              showPhotosPurgedModal();
              return;
            }
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