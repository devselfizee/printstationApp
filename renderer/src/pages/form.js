import { state } from '../state.js';
import { t } from '../i18n.js';
import { $, toast, createFooterBar, attachFooterListeners  } from '../utils.js';


// Emails suggérés par langue
const EMAIL_SUGGESTIONS = {
  fr: ['@gmail.com', '@orange.fr', '@yahoo.fr', '@hotmail.com', '@icloud.com'],
  en: ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', '@icloud.com'],
  es: ['@gmail.com', '@yahoo.es', '@hotmail.com', '@outlook.es', '@icloud.com'],
  it: ['@gmail.com', '@yahoo.it', '@hotmail.com', '@outlook.it', '@icloud.com'],
  de: ['@gmail.com', '@gmx.de', '@web.de', '@hotmail.com', '@icloud.com']
};

// Layouts de claviers par langue
const KEYBOARD_LAYOUTS = {
  fr: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'AZERTYUIOP'],
    [...'QSDFGHJKLM'],
    [...'WXCVBN', '@', '.', '-', '_']
  ],
  en: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'QWERTYUIOP'],
    [...'ASDFGHJKL'],
    [...'ZXCVBNM', '@', '.', '-', '_']
  ],
  es: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'QWERTYUIOP'],
    [...'ASDFGHJKL'],
    [...'ZXCVBNM', '@', '.', '-', '_']
  ],
  it: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'QWERTYUIOP'],
    [...'ASDFGHJKL'],
    [...'ZXCVBNM', '@', '.', '-', '_']
  ],
  de: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'EFFACER'],
    [...'QWERTZUIOP'],
    [...'ASDFGHJKL'],
    [...'YXCVBNM', '@', '.', '-', '_']
  ]
};

// Variantes accentuées par langue (pour appui long)
const ACCENT_VARIANTS = {
  es: {
    'A': ['A', 'Á'],
    'E': ['E', 'É'],
    'I': ['I', 'Í'],
    'O': ['O', 'Ó'],
    'U': ['U', 'Ú', 'Ü'],
    'N': ['N', 'Ñ']
  }
};

export const renderForm = (root) => {
  const main = document.createElement('div');
  main.className = 'main';
  const wrap = document.createElement('div');
  wrap.className = 'form';
  
  const photosUnique = [...new Set(state.cart.map(l => l.photoId))].map(pid => state.photos.find(p => p.id === pid)).filter(Boolean);
  const currentPhoto = photosUnique[state.photoIndex] || (photosUnique[0] || state.photos[0]);
  
  wrap.innerHTML = `
    <h2>${t('getDigital')}</h2>
    <div style="text-align:center; color:#6b7280; font-weight:600; font-size:15px; margin-bottom:32px;">${t('digitalHint')}</div>
    
    <div class="form-content">
      <div class="form-photo">
        <div class="thumb"><img src="${currentPhoto.source}" alt=""></div>
        ${photosUnique.length > 1 ? `<div class="caption">${state.photoIndex + 1}/${photosUnique.length}</div>` : ''}
      </div>
      <div class="form-email">
        <div class="input" id="inputWrap"><input id="email" type="email" placeholder="${t('email')}" value="${state.email || ''}"/></div>
        <div class="chips">${(EMAIL_SUGGESTIONS[state.lang] || EMAIL_SUGGESTIONS.fr).map(d => `<button class="chip" data-d="${d}">${d}</button>`).join('')}</div>

        <div class="optin-card" id="optinCard">
          <label class="optin-toggle">
            <input id="optin" type="checkbox" ${state.optin ? 'checked' : ''}/>
            <span class="optin-slider"></span>
          </label>
          <div class="optin-content">
            <div class="optin-icon">🎁</div>
            <div class="optin-text">
              <div class="optin-title">${t('optin')}</div>
              <div class="optin-subtitle">${t('optinSubtitle')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="kb" id="kb"></div>`;


// REMPLACER les boutons par le footer
const footer = createFooterBar({
  showPrice: false,
  showBadge: false,
  cancelLabel: t('skip'),
  continueLabel: t('finish'),
  onCancel: () => {
    clearInterval(state.timer);
    state.email = '';
    state.page = 'thanks';
    window.render();
  },
  onContinue: () => {
    
    clearInterval(state.timer);
    state.email = email;
    state.optin = $('#optin').checked;
    state.page = 'thanks';
    window.render();
  }
});
root.appendChild(footer);
attachFooterListeners({
  onCancel: () => {
    // Désactiver les boutons pour éviter les doubles clics
    const cancelBtn = document.querySelector('.btn-cancel');
    const continueBtn = document.querySelector('.btn-continue');
    if (cancelBtn) cancelBtn.disabled = true;
    if (continueBtn) continueBtn.disabled = true;

    // Aller vers la page de remerciement sans aucune mise à jour API
    clearInterval(state.timer);
    state.email = '';
    state.page = 'thanks';
    window.render();
  },
  onContinue: async () => {
    // Désactiver les boutons pour éviter les doubles clics
    const cancelBtn = document.querySelector('.btn-cancel');
    const continueBtn = document.querySelector('.btn-continue');
    if (cancelBtn) cancelBtn.disabled = true;
    if (continueBtn) continueBtn.disabled = true;

    const email = $('#email').value.trim();
    if (email && (!email.includes('@') || !email.includes('.'))) {
      $('#inputWrap').classList.add('error');
      toast(t('errorEmail'),true);
      // Réactiver les boutons en cas d'erreur de validation
      if (cancelBtn) cancelBtn.disabled = false;
      if (continueBtn) continueBtn.disabled = false;
      return;
    }
    
    clearInterval(state.timer);
    state.email = email;
    state.optin = $('#optin').checked;
    
    // ========================================
    // 🆕 METTRE À JOUR LA COMMANDE EXISTANTE
    // ========================================

    if (state.cart.length > 0 && window.photoAPI?.cart && state.sessionId) {
      try {
        let orderId = state.localOrderId;

        // Si pas de commande locale existante (cas de fallback), en créer une
        if (!orderId) {
          console.log('[Form] ⚠️  Pas de commande locale existante - création d\'une nouvelle commande');
          orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const { cartSubtotal, cartNominal } = await import('../utils.js');
          const totalAmount = cartNominal(state.cart, window.PRODUCTS);
          const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
          const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);

          const orderResult = await window.photoAPI.orders.create({
            orderId: orderId,
            participantId: state.participantId || state.sessionId,
            universeId: state.universe?.id || state.universeId || 'B',
            totalAmount: totalAmount,
            discountAmount: discountAmount,
            finalAmount: finalAmount,
            lang: state.lang || 'fr',  // Langue choisie par le client
            email: email || null,
            optin: state.optin ? 1 : 0,
            paymentMethod: 'card',
            notes: null
          });

          if (orderResult?.status !== 'success') {
            console.error('❌ Erreur création commande:', orderResult?.error);
            toast('Erreur lors de l\'enregistrement', true);
            return;
          }
        } else {
          console.log('[Form] ✅ Commande locale existante trouvée:', orderId);
        }

        // Mettre à jour la commande locale avec l'email
        // Note: On ne peut pas mettre à jour directement l'email dans la table orders
        // mais on peut mettre à jour le statut
        console.log('[Form] 📝 Mise à jour du statut de la commande locale...');

        // Valider tous les produits de la session
        const validateResult = await window.photoAPI.cart.validateSession(
          state.sessionId,
          orderId
        );

        if (validateResult?.status === 'success') {
          console.log('✅ Session validée - Tous les produits ont statut "validé"');
        }

        // Mettre à jour le statut de la commande
        await window.photoAPI.orders.updateStatus(
          orderId,
          'processing',
          'Paiement accepté - Commande validée'
        );

        console.log('✅ Commande locale mise à jour:', orderId);

        // ÉTAPE 2 : Mettre à jour la commande sur Supabase (status=completed + email)
        console.log('[Form] 📋 Vérification de state.supabaseOrderId:', state.supabaseOrderId);
        console.log('[Form] 📋 Email à enregistrer:', email || '(vide)');

        try {
          if (state.supabaseOrderId) {
            console.log('[Form] 📝 Mise à jour de la commande sur Supabase (status=completed + email + optin)...');
            console.log('[Form] Supabase Order ID:', state.supabaseOrderId);
            console.log('[Form] Email:', email || '(pas d\'email)');
            console.log('[Form] Optin:', state.optin);

            const updateResult = await window.photoAPI.orders.updateRemote(state.supabaseOrderId, email, orderId, state.optin);

            if (updateResult?.status === 'success') {
              console.log('[Form] ✅ Commande mise à jour sur Supabase');
              console.log('[Form] Réponse:', updateResult.response);

              // Mettre à jour le statut LOCAL à "completed"
              try {
                await window.photoAPI.orders.updateStatus(orderId, 'completed', 'Commande finalisée');
                console.log('[Form] ✅ Statut local mis à jour: completed');
              } catch (localError) {
                console.error('[Form] ❌ Erreur mise à jour statut local:', localError);
              }

              // Mettre à jour l'email, l'optin et last_step dans la commande locale
              try {
                await window.photoAPI.orders.updateDetails(orderId, {
                  email: email || null,
                  optin: state.optin || false,
                  lastStep: 'form'  // Étape finale atteinte
                });
                console.log('[Form] ✅ Email, optin et last_step mis à jour:', email, 'optin:', state.optin, 'last_step: form');
              } catch (detailsError) {
                console.error('[Form] ❌ Erreur mise à jour email/optin/last_step:', detailsError);
              }
            } else if (updateResult?.status === 'skipped') {
              console.log('[Form] ⏭️  Mise à jour ignorée:', updateResult.message);
            } else {
              console.warn('[Form] ⚠️  Erreur mise à jour API:', updateResult?.error);
              // Ne pas bloquer le processus si la mise à jour échoue
            }
          } else {
            console.warn('[Form] ⚠️  Pas d\'ID de commande Supabase - mise à jour locale uniquement');
            console.warn('[Form] state.supabaseOrderId est:', state.supabaseOrderId);
            console.warn('[Form] state.localOrderId est:', state.localOrderId);

            // Mettre à jour le statut LOCAL à "completed" même sans Supabase
            try {
              await window.photoAPI.orders.updateStatus(orderId, 'completed', 'Commande finalisée (local)');
              console.log('[Form] ✅ Statut local mis à jour: completed');
            } catch (localError) {
              console.error('[Form] ❌ Erreur mise à jour statut local:', localError);
            }

            // Mettre à jour l'email, l'optin et last_step dans la commande locale
            try {
              await window.photoAPI.orders.updateDetails(orderId, {
                email: email || null,
                optin: state.optin || false,
                lastStep: 'form'  // Étape finale atteinte
              });
              console.log('[Form] ✅ Email, optin et last_step mis à jour (local):', email, 'optin:', state.optin, 'last_step: form');
            } catch (detailsError) {
              console.error('[Form] ❌ Erreur mise à jour email/optin/last_step:', detailsError);
            }
          }
        } catch (updateError) {
          console.error('[Form] ❌ Erreur lors de la mise à jour:', updateError);
          // Continuer même si la mise à jour échoue
        }

        // Sauvegarder l'ID de commande dans le state
        state.lastOrderId = orderId;

        console.log('✅ Commande complète enregistrée:', orderId);
        toast('Commande enregistrée! ✅', false);

      } catch (error) {
        console.error('❌ Erreur système lors de la création/mise à jour de commande:', error);
        // On continue quand même vers la page de remerciement
      }
    }
    
    // ========================================
    // Continuer vers la page de remerciement
    // ========================================
    
    state.page = 'thanks';
    window.render();
  }
});

    
  
  main.appendChild(wrap);
  main.appendChild(footer);
  root.appendChild(main);
  
  if (photosUnique.length > 1) {
    state.timer = setInterval(() => {
      state.photoIndex = (state.photoIndex + 1) % photosUnique.length;
      const thumb = $('.form-photo .thumb img');
      const caption = $('.form-photo .caption');
      if (thumb) thumb.src = photosUnique[state.photoIndex].source;
      if (caption) caption.textContent = `${state.photoIndex + 1}/${photosUnique.length}`;
    }, 3000);
  }
  
  // Récupère le layout en fonction de la langue
  const layout = KEYBOARD_LAYOUTS[state.lang] || KEYBOARD_LAYOUTS.fr;
  
  const kb = $('#kb');

  // Créer le popup pour les variantes accentuées
  const accentPopup = document.createElement('div');
  accentPopup.className = 'accent-popup';
  accentPopup.style.display = 'none';
  document.body.appendChild(accentPopup);

  // Variables pour gérer l'appui long
  let longPressTimer = null;
  let isLongPress = false;
  const LONG_PRESS_DELAY = 400; // ms

  // Fonction pour fermer le popup
  const closeAccentPopup = () => {
    accentPopup.style.display = 'none';
    accentPopup.innerHTML = '';
  };

  // Fermer le popup si on clique ailleurs
  document.addEventListener('click', (e) => {
    if (!accentPopup.contains(e.target)) {
      closeAccentPopup();
    }
  });

  layout.forEach((r, rowIdx) => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    r.forEach(k => {
      const b = document.createElement('button');
      b.className = 'key' + (k === 'EFFACER' ? ' delete-key' : '');
      b.textContent = k;

      // Vérifier si cette touche a des variantes accentuées
      const variants = ACCENT_VARIANTS[state.lang]?.[k];

      if (variants && variants.length > 1) {
        // Touche avec variantes - gérer appui long
        const startLongPress = (e) => {
          e.preventDefault();
          isLongPress = false;

          longPressTimer = setTimeout(() => {
            isLongPress = true;

            // Afficher le popup
            const rect = b.getBoundingClientRect();
            accentPopup.innerHTML = variants.map(v =>
              `<button class="accent-option">${v}</button>`
            ).join('');
            accentPopup.style.display = 'flex';
            accentPopup.style.left = `${rect.left + rect.width / 2}px`;
            accentPopup.style.top = `${rect.top - 50}px`;

            // Gérer le clic sur les options
            accentPopup.querySelectorAll('.accent-option').forEach(opt => {
              opt.onclick = (ev) => {
                ev.stopPropagation();
                const inp = $('#email');
                inp.value += opt.textContent.toLowerCase();
                closeAccentPopup();
              };
            });
          }, LONG_PRESS_DELAY);
        };

        const endLongPress = (e) => {
          clearTimeout(longPressTimer);
          if (!isLongPress) {
            // Appui court - insérer le caractère normal
            const inp = $('#email');
            inp.value += k.toLowerCase();
          }
        };

        const cancelLongPress = () => {
          clearTimeout(longPressTimer);
        };

        // Support tactile et souris
        b.addEventListener('touchstart', startLongPress, { passive: false });
        b.addEventListener('touchend', endLongPress);
        b.addEventListener('touchcancel', cancelLongPress);
        b.addEventListener('mousedown', startLongPress);
        b.addEventListener('mouseup', endLongPress);
        b.addEventListener('mouseleave', cancelLongPress);

        // Empêcher le onclick par défaut
        b.onclick = (e) => e.preventDefault();

      } else {
        // Touche normale sans variantes
        b.onclick = () => {
          const inp = $('#email');
          if (k === 'EFFACER') inp.value = inp.value.slice(0, -1);
          else inp.value += k.toLowerCase();
        };
      }

      row.appendChild(b);
    });
    kb.appendChild(row);
  });
  
  wrap.querySelectorAll('.chip').forEach(c => {
    c.onclick = () => {
      const e = $('#email');
      if (!e.value.includes('@')) e.value += c.dataset.d;
      else e.value += c.dataset.d.replace('@', '');
    };
  });

  // Optin card - rendre cliquable et gérer l'état actif
  const optinCard = $('#optinCard');
  const optinCheckbox = $('#optin');

  const updateOptinState = () => {
    if (optinCheckbox.checked) {
      optinCard.classList.add('active');
    } else {
      optinCard.classList.remove('active');
    }
  };

  // Initialiser l'état
  updateOptinState();

  // Clic sur la carte toggle le checkbox
  optinCard.onclick = (e) => {
    // Ne pas toggle si on clique directement sur le toggle
    if (e.target.closest('.optin-toggle')) return;
    optinCheckbox.checked = !optinCheckbox.checked;
    updateOptinState();
  };

  // Changement du checkbox met à jour la carte
  optinCheckbox.onchange = updateOptinState;
};