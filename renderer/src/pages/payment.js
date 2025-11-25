import { state } from '../state.js';
import { t } from '../i18n.js';
import { lineTotal, toast } from '../utils.js';
import { getProductVisual } from '../data.js';

export const renderPayment = (root) => {
  const main = document.createElement('div');
  main.className = 'main';
  const wrap = document.createElement('div');

  wrap.className = 'payment';
  wrap.innerHTML = `<h2>${t('payment')}</h2>
    <div class="progress">
      <div style="display:grid;place-items:center"><div class="dot active">1</div><div class="label">${t('yourCart')}</div></div>
      <div class="line active"></div>
      <div style="display:grid;place-items:center"><div class="dot active">2</div><div class="label">${t('payment')}</div></div>
    </div>
    <div class="paybox">
        <div class="title">${t('paymentWait')}</div>
      <div class="help">${t('paymentHint')}</div>
      <img src="./assets/icon-payment.png" alt="Payment" class="payment-icon">

    </div>`;
  
  const lines = document.createElement('div');
  lines.className = 'lines';
  let total = 0;
  state.cart.forEach(async l => {
    const product = window.PRODUCTS[l.productId];
    const row = document.createElement('div');
    row.className = 'line';

    total = await lineTotal(product, l.qty);
    // Récupérer l'image du produit
    // Priorité 1 : thumbnail_url de l'API
    // Priorité 2 : visuels spécifiques à l'univers
    // Priorité 3 : placeholder
    let imageUrl = null;

    if (product.thumbnail) {
      imageUrl = product.thumbnail;
    } else {
      const visual = getProductVisual(state.universe.id, l.productId);
      if (visual && visual.image) {
        imageUrl = visual.image;
      }
    }

    const thumbHTML = imageUrl
      ? `<img src="${imageUrl}" alt="${product.title}" style="width:150px;height:150px;object-fit:contain;">`
      : `<div style="width:150px;height:150px;background:#f0f0f0;display:grid;place-items:center;color:#999;font-size:12px;">N/A</div>`;

    row.innerHTML = `<div class="thumb" style="display:grid;place-items:center;font-size:24px;">${thumbHTML}</div><div class="title">${product.title} × ${l.qty}</div><div>${total.toFixed(2)}€</div>`;
    lines.appendChild(row);
  });
  wrap.appendChild(lines);
  main.appendChild(wrap);
  root.appendChild(main);
  
  clearTimeout(state.timer);
  // state.timer = setTimeout(() => { state.page = 'form'; window.render(); }, 5000);

  // DEBUT HEXAPAY TOOLS (INTEGRATION)
  initiatePaymentFlow(total, root);
  // FIN HEXAPAY TOOLS
};

async function initiatePaymentFlow(totalAmount, root) {
  try {
    // 1. Vérifier lecteur
    const ready = await window.hexapay.checkReady();
    if (!ready.success) throw new Error('Lecteur indisponible');
    
    // 2. Vérifier licence
    const licensed = await window.hexapay.checkLicense();
    if (!licensed.success) throw new Error('Licence inactive');
    
    // 3. Initier paiement
    const payment = await window.hexapay.initiatePayment(totalAmount);
    if (!payment.success) throw new Error(payment.error);
    
    // 4. Impression (2s simulation)
    await new Promise(r => setTimeout(r, 2000));
    
    // 5. Confirmer
    const confirm = await window.hexapay.confirmPayment(totalAmount);
    if (!confirm.success) throw new Error(confirm.error);
    
    // Succès -> page form
    state.page = 'form';
    window.render();
    
  } catch (error) {
    console.error('Payment failed:', error);
    toast(`Erreur: ${error.message}`);
    state.page = 'cart';
    window.render();
  }
}
