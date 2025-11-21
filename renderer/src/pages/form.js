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
        <label class="optin"><input id="optin" type="checkbox" ${state.optin ? 'checked' : ''}/> <span>${t('optin')}</span></label>
      </div>
    </div>
    <div class="kb" id="kb"></div>`;


// REMPLACER les boutons par le footer
const footer = createFooterBar({
  showPrice: false,  // ← Masque le prix
  cancelLabel: `${t('skip')}`,
  continueLabel: 'Terminer',
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
  onCancel: async () => {
    clearInterval(state.timer);
    state.email = '';

    // ========================================
    // 🆕 METTRE À JOUR LA COMMANDE (même processus que "Terminer" mais sans email)
    // ========================================

    if (state.cart.length > 0 && window.photoAPI?.cart && state.sessionId) {
      try {
        let orderId = state.localOrderId;

        // Valider tous les produits de la session
        const validateResult = await window.photoAPI.cart.validateSession(
          state.sessionId,
          orderId
        );

        if (validateResult?.status === 'success') {
          console.log('[Form/Passer] ✅ Session validée');
        }

        // Mettre à jour le statut de la commande locale
        await window.photoAPI.orders.updateStatus(
          orderId,
          'processing',
          'Paiement accepté - Email passé'
        );

        console.log('[Form/Passer] ✅ Commande locale mise à jour:', orderId);

        // ÉTAPE 2 : Mettre à jour la commande sur Supabase (status=completed, SANS email)
        try {
          if (state.supabaseOrderId) {
            console.log('[Form/Passer] 📝 Mise à jour de la commande sur Supabase (status=completed, sans email)...');
            console.log('[Form/Passer] Supabase Order ID:', state.supabaseOrderId);

            const updateResult = await window.photoAPI.orders.updateRemote(state.supabaseOrderId, '', orderId);

            if (updateResult?.status === 'success') {
              console.log('[Form/Passer] ✅ Commande mise à jour sur Supabase');
            } else if (updateResult?.status === 'skipped') {
              console.log('[Form/Passer] ⏭️  Mise à jour ignorée:', updateResult.message);
            } else {
              console.warn('[Form/Passer] ⚠️  Erreur mise à jour API:', updateResult?.error);
            }
          } else {
            console.warn('[Form/Passer] ⚠️  Pas d\'ID de commande Supabase');
          }
        } catch (updateError) {
          console.error('[Form/Passer] ❌ Erreur lors de la mise à jour:', updateError);
        }

        // Sauvegarder l'ID de commande dans le state
        state.lastOrderId = orderId;

        console.log('[Form/Passer] ✅ Commande complète enregistrée:', orderId);
        toast('Commande enregistrée! ✅', false);

      } catch (error) {
        console.error('[Form/Passer] ❌ Erreur système:', error);
      }
    }

    state.page = 'thanks';
    window.render();
  },
  onContinue: async () => {
    const email = $('#email').value.trim();
    if (email && (!email.includes('@') || !email.includes('.'))) {
      $('#inputWrap').classList.add('error');
      toast(t('errorEmail'),true);
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
            console.log('[Form] 📝 Mise à jour de la commande sur Supabase (status=completed + email)...');
            console.log('[Form] Supabase Order ID:', state.supabaseOrderId);
            console.log('[Form] Email:', email || '(pas d\'email)');

            const updateResult = await window.photoAPI.orders.updateRemote(state.supabaseOrderId, email, orderId);

            if (updateResult?.status === 'success') {
              console.log('[Form] ✅ Commande mise à jour sur Supabase');
              console.log('[Form] Réponse:', updateResult.response);
            } else if (updateResult?.status === 'skipped') {
              console.log('[Form] ⏭️  Mise à jour ignorée:', updateResult.message);
            } else {
              console.warn('[Form] ⚠️  Erreur mise à jour API:', updateResult?.error);
              // Ne pas bloquer le processus si la mise à jour échoue
            }
          } else {
            console.warn('[Form] ⚠️  Pas d\'ID de commande Supabase - création locale uniquement');
            console.warn('[Form] state.supabaseOrderId est:', state.supabaseOrderId);
            console.warn('[Form] state.localOrderId est:', state.localOrderId);
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
  layout.forEach((r, rowIdx) => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    r.forEach(k => {
      const b = document.createElement('button');
      b.className = 'key' + (k === 'EFFACER' ? ' delete-key' : '');
      b.textContent = k;
      b.onclick = () => {
        const inp = $('#email');
        if (k === 'EFFACER') inp.value = inp.value.slice(0, -1);
        else inp.value += k.toLowerCase();
      };
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


};