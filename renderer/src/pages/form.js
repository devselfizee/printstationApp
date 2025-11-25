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
  onCancel: () => {
    // Aller vers la page de remerciement sans aucune mise à jour API
    clearInterval(state.timer);
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
    // 🆕 VALIDER LA SESSION ET CRÉER LA COMMANDE
    // ========================================
    
    if (state.cart.length > 0 && window.photoAPI?.cart && state.sessionId) {
      try {
        // 1. Créer l'ID de commande
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 2. Importer les fonctions de calcul
        const { cartSubtotal, cartNominal } = await import('../utils.js');
        
        // 3. Calculer les montants
        const totalAmount = cartNominal(state.cart, window.PRODUCTS);
        const discountAmount = totalAmount - cartSubtotal(state.cart, window.PRODUCTS);
        const finalAmount = cartSubtotal(state.cart, window.PRODUCTS);
        
        // 4. Créer la commande principale
        const orderResult = await window.photoAPI.orders.create({
          orderId: orderId,
          participantId: state.currentParticipant,
          universeId: state.universe?.id || state.universeId || 'universe1',
          totalAmount: totalAmount,
          discountAmount: discountAmount,
          finalAmount: finalAmount,
          email: email || null,
          optin: state.optin ? 1 : 0,
          paymentMethod: 'card',
          notes: null
        });
        
        if (orderResult?.status === 'success') {
          console.log('✅ Commande créée:', orderId);
          
          // 5. 🆕 VALIDER TOUS LES PRODUITS DE LA SESSION
          // Change le statut de "en_cours"/"en_attente" → "validé"
          // Et associe l'orderId à tous les produits
          const validateResult = await window.photoAPI.cart.validateSession(
            state.sessionId,
            orderId
          );
          
          if (validateResult?.status === 'success') {
            console.log('✅ Session validée - Tous les produits ont statut "validé"');
          }
          
          // 6. Mettre à jour le statut de la commande
          await window.photoAPI.orders.updateStatus(
            orderId, 
            'processing', 
            'Paiement accepté - Commande validée'
          );
          
          // 7. Sauvegarder l'ID de commande dans le state
          state.lastOrderId = orderId;
          
          console.log('✅ Commande complète enregistrée:', orderId);
          toast('Commande enregistrée! ✅', false);
        } else {
          console.error('❌ Erreur création commande:', orderResult?.error);
          toast('Erreur lors de l\'enregistrement', true);
        }
        
      } catch (error) {
        console.error('❌ Erreur système lors de la création de commande:', error);
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