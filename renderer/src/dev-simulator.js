/**
 * dev-simulator.js - Simulator de QR code pour développement
 * 
 * Affiche la liste des participants depuis la DB SQLite
 */

const $ = (selector) => document.querySelector(selector);

// ============================================
// INIT
// ============================================

export function initDevSimulator() {
  // Créer le bouton de dev (discret)
  const devBtn = document.createElement('button');
  devBtn.id = 'dev-simulator-btn';
  devBtn.className = 'dev-simulator-btn';
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

  try {
    // ⭐ CORRECTION: Utiliser la bonne API
    if (window.photoAPI?.admin?.getDashboard) {
      const stats = await window.photoAPI.admin.getDashboard();
      
      // ⭐ participants.list existe maintenant
      participants = stats?.participants?.list || [];
      universes = stats?.universes?.list || [];
      
      console.log('[DevSim] Participants chargés:', participants.length);
      console.log('[DevSim] Univers chargés:', universes.length);
    }
  } catch (error) {
    console.error('[DevSim] Erreur chargement participants:', error);
  }

  // Créer la liste HTML des participants
  const participantsList = participants.length > 0
    ? participants.map(p => `<option value="${p.id}">${p.id} (${p.universe_id || p.status})</option>`).join('')
    : '<option value="">-- Aucun participant en DB --</option>';

  const universesList = universes.length > 0
    ? universes.map(u => `<option value="${u.id}">${u.name}</option>`).join('')
    : '<option value="universe1">Universe 1 (défaut)</option>';

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
            <label>Universe</label>
            <select id="devUniverse">
              ${universesList}
            </select>
          </div>

          <div class="dev-info">
            ℹ️ Sélectionne un participant existant ou crée-en un nouveau pour simuler un scan QR
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
  const simulateBtn = $('#devSimulateBtn');
  const cancelBtn = $('#devCancelBtn');

  // Quand on sélectionne un participant, vider le champ custom
  participantSelect.onchange = () => {
    if (participantSelect.value) {
      participantInput.value = '';
    }
  };

  // Quand on tape dans le champ custom, déselectionner
  participantInput.onchange = () => {
    if (participantInput.value) {
      participantSelect.value = '';
    }
  };

  simulateBtn.onclick = async () => {
    let participantId = participantSelect.value || participantInput.value.trim();

    if (!participantId) {
      alert('Veuillez sélectionner ou créer un participant');
      return;
    }

    const universe = universeSelect.value;

    console.log('[DevSim] Simulation scan QR:', { participantId, universe });

    // ⭐ Appeler le scan QR avec les données
    const qrContent = JSON.stringify({
      universe,
      participantId,
    });

    try {
      // ⭐ CORRECTION: Utiliser l'API photoAPI.scanQR
      if (window.photoAPI?.scanQR) {
        const result = await window.photoAPI.scanQR(qrContent);
        console.log('[DevSim] Résultat scan:', result);
        
        if (result.status === 'success') {
          console.log('[DevSim] ✅ Scan réussi!');
          console.log('[DevSim] Participant:', result.participantId);
          console.log('[DevSim] Photos:', result.photos?.length || 0);
          
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