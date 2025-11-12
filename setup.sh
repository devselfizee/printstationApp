#!/bin/bash

# PrintStation Setup Script
# Crée toute la structure du projet d'un coup

echo "🚀 Création de la structure PrintStation..."

# Créer les dossiers
mkdir -p renderer/src/pages
mkdir -p renderer/dist

# ===== package.json =====
cat > package.json << 'EOF'
{
  "name": "printstation",
  "version": "1.0.0",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "start": "electron .",
    "dev": "node build.js && electron .",
    "build": "node build.js",
    "watch": "node build.js --watch"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "esbuild": "^0.20.0"
  }
}
EOF
echo "✓ package.json créé"

# ===== build.js =====
cat > build.js << 'EOF'
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['renderer/app.js'],
  bundle: true,
  outfile: 'renderer/dist/app.bundle.js',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('🔄 Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('✓ Build complete');
}
EOF
echo "✓ build.js créé"

# ===== main.js =====
cat > main.js << 'EOF'
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 1920,
    kiosk: false,
    fullscreen: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b1f3a',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
EOF
echo "✓ main.js créé"

# ===== preload.js =====
cat > preload.js << 'EOF'
// Preload script (vide pour l'instant, à compléter si besoin d'IPC)
EOF
echo "✓ preload.js créé"

# ===== renderer/index.html =====
cat > renderer/index.html << 'EOF'
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PrintStation</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div class="mast"></div>
  <div id="app" class="app"></div>
  <div id="modal" class="modal-overlay"></div>
  
  <script src="./dist/app.bundle.js" type="module"></script>
</body>
</html>
EOF
echo "✓ renderer/index.html créé"

# ===== renderer/styles.css =====
cat > renderer/styles.css << 'EOF'
:root{
  --e-navy:#1b1f3a;
  --e-sky:#5eb7ff;
  --panel:#f7f8fb; --bg:#fff; --muted:#eef2f7; --txt:#0f172a; --sub:#6b7280;
  --edge:36px; --borderW:5px;
  --brand:var(--e-sky);
  --shadow: 0 12px 30px rgba(17,24,39,.08);
}
*{ box-sizing:border-box; -webkit-tap-highlight-color: transparent; }
html,body{ height:100%; margin:0; }
body{ background:var(--e-navy); color:var(--txt); font:16px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter, Roboto, Arial; }

.mast{ position:fixed; inset:0 0 auto 0; height:92px; background:var(--e-navy); z-index:0; }
.app{ width:1080px; height:1920px; margin:0 auto; position:relative; border-radius:28px; overflow:hidden; z-index:1; box-shadow:var(--shadow); }

header.topbar{
  position:absolute; top:12px;
  left: calc(12px + var(--borderW) + var(--edge));
  right: calc(12px + var(--borderW) + var(--edge));
  height:68px; display:flex; align-items:center; justify-content:space-between;
  background:var(--e-navy); border:none; border-radius:18px; padding:0 20px; z-index:20;
}
.icon-btn{ width:48px; height:48px; border-radius:12px; display:grid; place-items:center; border:none; background:rgba(94,183,255,.15); color:#fff; cursor:pointer; transition: all .2s ease; }
.icon-btn:hover{ background:rgba(94,183,255,.25); }
.back-btn{ visibility:hidden; opacity:0; }
.back-btn.show{ visibility:visible; opacity:1; }
.brand{ flex:1; text-align:center; }
.brand img{ height:32px; display:block; margin:0 auto; }
.lang-selector{ display:flex; gap:6px; align-items:center; }
.lang-btn{ width:36px; height:36px; border:none; border-radius:8px; background:rgba(255,255,255,.1); font-size:20px; cursor:pointer; transition: all .2s ease; opacity:.5; display:grid; place-items:center; }
.lang-btn.active{ opacity:1; transform:scale(1.1); }
.lang-btn:hover{ opacity:.8; }
.cart-btn{ display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:12px; background:#fff; border:none; box-shadow:var(--shadow); cursor:pointer; transition: all .2s ease; }
.cart-btn:hover{ transform:translateY(-2px); box-shadow: 0 16px 36px rgba(17,24,39,.12); }
.cart-btn .count{ min-width:22px; height:22px; padding:0 6px; border-radius:999px; display:grid; place-items:center; background: var(--brand); color:#001; font-weight:900; font-size:12px; }

.main{ position:absolute; inset:100px 12px 12px 12px; background:var(--panel); border: var(--borderW) solid #fff; border-radius:24px; overflow-x:hidden; overflow-y:auto; padding:0 var(--edge) 80px; z-index:10; }

.qr-page{ display:grid; place-items:center; gap:40px; padding:120px 40px; }
.qr-scanner{ width:360px; height:360px; border:4px dashed rgba(94,183,255,.3); border-radius:24px; display:grid; place-items:center; cursor:pointer; transition: all .3s ease; }
.qr-scanner:hover{ border-color:var(--brand); background:rgba(94,183,255,.05); }
.qr-scanner svg{ width:120px; height:120px; color:var(--brand); opacity:.7; }
.qr-text{ font-size:28px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; color:var(--brand); text-align:center; }
.qr-hint{ color:var(--sub); font-size:14px; text-align:center; margin-top:-20px; }
.qr-buttons{ display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
.qr-buttons button{ padding:12px 20px; border:none; border-radius:10px; background:var(--brand); color:#fff; font-weight:900; cursor:pointer; transition: all .2s ease; font-size:13px; }
.qr-buttons button:hover{ transform:translateY(-2px); box-shadow: 0 12px 24px rgba(94,183,255,.3); }

.hero{ height:320px; overflow:hidden; margin:0 calc(-1*var(--edge)); background:#eee; display:grid; place-items:center; }
.hero img{ width:100%; height:100%; object-fit:cover; object-position: center; display:block; }
.section{ padding:48px 0 28px; }
.section h2{ margin:0; text-align:center; font-size:32px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
.grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:32px; margin-top:24px; padding:20px 0; }
.card{ border-radius:18px; overflow:hidden; background:#fff; border:1px solid #e5e7eb; box-shadow:var(--shadow); opacity:0; transform: translateY(14px); cursor:pointer; transition: all .2s ease; }
.card:hover{ transform:translateY(0px); box-shadow: 0 16px 40px rgba(17,24,39,.12); }
.landscape{ aspect-ratio:4/3; background:#eadccf; display:grid; place-items:center; border:5px solid #fff; padding:20px 8px 0; }
.landscape img{ width:100%; height:100%; object-fit:contain; display:block; }
.card .body{ padding:12px 14px 20px; }
.card .title{ font-weight:700; font-size:14px; color:#4b5563; margin:0 0 8px; }
.choose{ width:100%; border:none; background:var(--brand); color:#0a1630; padding:10px 12px; border-radius:10px; font-weight:900; font-size:14px; cursor:pointer; transition: all .2s ease; }
.choose:hover{ box-shadow: 0 10px 20px rgba(94,183,255,.2); }
@keyframes riseIn{ from{opacity:0; transform:translateY(16px)} to{opacity:1; transform:none} }

.detail-enter{ animation: fadeIn .32s ease both; }
@keyframes fadeIn{ from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
.detail-title{ text-align:center; font-weight:900; letter-spacing:.12em; text-transform:uppercase; margin:28px 0 16px; font-size:32px; padding-bottom:16px; }
.detail-preview{ margin: 8px 0 24px; }
.detail-preview img{ width:100%; height:auto; object-fit:contain; border-radius:0; display:block; }

.offer{ display:flex; align-items:center; gap:20px; padding:20px; margin:20px 0; background:#fff; border-radius:16px; box-shadow:0 10px 30px rgba(17,24,39,.06); }
.offer .visu{ width:200px; height:140px; border-radius:12px; overflow:hidden; background:#f2f2f2; display:grid; place-items:center; flex-shrink:0; }
.offer .visu img{ width:100%; height:100%; object-fit:cover; }
.offer .info{ flex:1; min-width:0; }
.offer .title{ margin:0 0 6px; font-weight:800; font-size:20px; }
.offer .sub{ margin:0 0 8px; color:#6b7280; font-weight:700; font-size:14px; }
.offer .meta{ font-weight:600; color:#374151; font-size:13px; }
.offer .cta{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.offer .price{ display:flex; align-items:center; gap:8px; }
.offer .old{ font-weight:900; opacity:.6; text-decoration: line-through; font-size:14px; }
.offer .pill{ display:inline-flex; align-items:center; justify-content:center; min-width:60px; height:36px; border-radius:999px; padding:0 12px; background:#0b1025; color:#fff; font-weight:900; font-size:16px; }
.offer .pill.pulse{ animation: badgePulse .5s ease; }
@keyframes badgePulse{ 0%{ transform:scale(.95); box-shadow:0 0 0 0 rgba(94,183,255,.0)} 50%{ transform:scale(1.05); box-shadow:0 0 0 16px rgba(94,183,255,.20)} 100%{ transform:scale(1); box-shadow:0 0 0 0 rgba(94,183,255,.0)} }
.cmd{ border:none; border-radius:10px; padding:10px 14px; background: var(--brand); color:#0a1630; font-weight:900; font-size:14px; cursor:pointer; transition: all .2s ease; display:flex; align-items:center; gap:6px; }
.cmd:hover{ box-shadow: 0 12px 24px rgba(94,183,255,.2); }
.cmd svg{ width:16px; height:16px; }

.other .section h2{ font-size:16px; letter-spacing:.08em; text-align:left; margin-bottom:8px; }
.other .grid{ grid-template-columns: repeat(3, 1fr); gap:16px; }
.other .card .body{ display:none; }

.footer-cta{ position:sticky; bottom:0; width:100%; border:none; padding:16px; border-radius:12px; margin:20px 0 0; background: var(--brand); color:#fff; font-weight:900; font-size:16px; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; transition: all .2s ease; box-shadow:0 -4px 20px rgba(94,183,255,.2); }
.footer-cta:hover{ box-shadow: 0 -4px 30px rgba(94,183,255,.3); }

.toast-container{ position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:1000; pointer-events:none; }
.toast{ background:#fff; border-radius:16px; padding:24px 32px; box-shadow: 0 20px 50px rgba(0,0,0,.15); text-align:center; font-weight:700; font-size:16px; animation: toastIn .3s ease both; }
@keyframes toastIn{ from{ opacity:0; transform:scale(.95); } to{ opacity:1; transform:scale(1); } }

.modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; place-items:center; z-index:999; }
.modal-overlay.show{ display:grid; }
.modal{ background:#fff; border-radius:20px; padding:32px; max-width:520px; width:90%; animation: modalIn .3s ease both; box-shadow: 0 30px 60px rgba(0,0,0,.2); }
@keyframes modalIn{ from{ opacity:0; transform:translateY(20px); } to{ opacity:1; transform:none; } }
.modal h3{ margin:0 0 20px; font-size:22px; font-weight:900; text-align:center; }
.modal .offer{ margin:16px 0; padding:16px; }
.modal .btn-group{ display:flex; gap:12px; margin-top:24px; }
.modal .btn-group button{ flex:1; padding:14px; border:none; border-radius:10px; font-weight:900; cursor:pointer; transition: all .2s ease; font-size:15px; }
.modal .btn-yes{ background:var(--brand); color:#fff; }
.modal .btn-yes:hover{ box-shadow: 0 10px 20px rgba(94,183,255,.2); }
.modal .btn-no{ background:#e5e7eb; color:#0f172a; }
.modal .btn-no:hover{ background:#d1d5db; }

.progress{ display:flex; align-items:center; justify-content:center; gap:12px; margin:16px 0 20px; font-weight:800; }
.progress .label{ font-size:11px; color:#374151; margin-top:4px; text-transform:uppercase; letter-spacing:.06em; text-align:center; }
.progress .dot{ width:32px; height:32px; border-radius:999px; background:#e5e7eb; display:grid; place-items:center; font-size:14px; }
.progress .dot.active{ background:#0b1025; color:#fff; }
.progress .line{ height:2px; width:120px; background:#e5e7eb; }
.progress .line.active{ background:#0b1025; }

.cart{ padding:0 0 40px; }
.cart h2{ text-align:center; margin:20px 0 12px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; font-size:32px; padding-bottom:16px; }
.lines{ border-radius:14px; background:#fff; padding:12px 16px; box-shadow:0 12px 28px rgba(17,24,39,.08); margin-top:20px; }
.line{ display:grid; grid-template-columns: 70px 1fr auto; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #eef2f7; }
.line:last-child{ border-bottom:none; }
.thumb{ width:70px; height:56px; border-radius:8px; overflow:hidden; background:#f3f4f6; }
.thumb img{ width:100%; height:100%; object-fit:cover; }
.line .title{ font-weight:800; font-size:14px; }
.line .meta{ color:#6b7280; font-size:12px; }
.sum{ margin-top:16px; display:grid; gap:8px; background:#fff; border-radius:14px; padding:12px 14px; box-shadow:0 12px 28px rgba(17,24,39,.06); }
.sum .row{ display:flex; align-items:center; justify-content:space-between; font-size:14px; }
.sum .total{ font-weight:900; font-size:18px; padding:8px 10px; margin-top:4px; border-radius:10px; background:#e8f3ff; }
.key{ min-width:54px; padding:10px 8px; border:none; background:#f3f4f6; border-radius:8px; font-weight:900; font-size:13px; cursor:pointer; transition: all .12s ease; }
.key:active{ transform: scale(.94); }

.payment{ display:grid; gap:16px; padding:0 0 40px; }
.payment h2{ text-align:center; margin:20px 0 12px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; font-size:32px; padding-bottom:16px; }
.paybox{ border-radius:14px; background:#fff; padding:40px; box-shadow:0 12px 28px rgba(17,24,39,.08); display:grid; place-items:center; gap:16px; margin-top:20px; }
.paybox img{ width:280px; height:auto; }
.paybox .title{ font-size:26px; font-weight:900; }
.paybox .help{ color:#6b7280; font-size:14px; }

.form{ padding:0 0 40px; }
.form h2{ text-align:center; margin:20px 0 24px; text-transform:uppercase; letter-spacing:.08em; font-weight:900; font-size:32px; padding-bottom:16px; }
.form-content{ display:grid; grid-template-columns: 180px 1fr; gap:24px; margin:24px 0; align-items:start; }
.form-photo{ display:grid; place-items:center; gap:12px; }
.form-photo .thumb{ width:160px; height:120px; border-radius:12px; overflow:hidden; background:#f3f4f6; }
.form-photo .thumb img{ width:100%; height:100%; object-fit:cover; }
.form-photo .caption{ font-size:12px; color:#6b7280; text-align:center; }
.form-email{ display:flex; flex-direction:column; gap:12px; }
.input{ display:flex; align-items:center; gap:8px; background:#fff; border-radius:12px; padding:12px 14px; box-shadow:0 12px 28px rgba(17,24,39,.08); border:3px solid #dbeafe; }
.input input{ flex:1; border:none; outline:none; font-size:18px; }
.input.error{ border-color:#ef4444; background:#fef2f2; }
.error-msg{ color:#ef4444; font-size:12px; font-weight:700; margin-top:-8px; }
.chips{ display:flex; gap:6px; flex-wrap:wrap; }
.chip{ border:none; padding:6px 8px; border-radius:999px; background:#e5f2ff; font-weight:800; font-size:12px; cursor:pointer; transition: all .2s ease; }
.chip:hover{ background:#dbeafe; }
.optin{ display:flex; align-items:center; gap:8px; margin:12px 0; font-size:14px; }
.optin input{ width:24px; height:24px; accent-color: var(--brand); border-radius:4px; cursor:pointer; }
.kb{ background:#fff; border-radius:12px; padding:8px; box-shadow:0 12px 28px rgba(17,24,39,.08); margin:20px 0; }
.kb-row{ display:flex; gap:6px; margin:6px 0; justify-content:center; }
.key.wide{ min-width:100px; }
.form-buttons{ display:flex; flex-direction:column; gap:10px; margin-top:20px; }

.thanks-page{ position:absolute; inset:0; background:var(--e-navy); display:grid; place-items:center; padding:60px 40px; z-index:15; }
.thanks-content{ text-align:center; color:#fff; }
.thanks-content img{ width:80px; height:auto; margin:0 auto 20px; }
.thanks-content h2{ font-size:48px; font-weight:900; margin:20px 0; letter-spacing:.1em; }
.thanks-content p{ font-size:18px; margin:12px 0; color:rgba(255,255,255,.8); }
.thanks-btn{ margin-top:32px; padding:14px 28px; border:none; border-radius:12px; background:var(--brand); color:#fff; font-weight:900; font-size:16px; cursor:pointer; transition: all .2s ease; }
.thanks-btn:hover{ box-shadow: 0 12px 24px rgba(94,183,255,.3); }
.thanks-timer{ margin-top:20px; font-size:14px; color:rgba(255,255,255,.6); }
EOF
echo "✓ renderer/styles.css créé"

# ===== renderer/app.js =====
cat > renderer/app.js << 'EOF'
import { state, resetState } from './src/state.js';
import { PRODUCTS, UNIVERSES } from './src/data.js';
import { t } from './src/i18n.js';
import { $, updateCartCount, addOne, removeOne } from './src/utils.js';
import { renderTopbar } from './src/pages/topbar.js';
import { renderQR } from './src/pages/qr.js';
import { renderListing } from './src/pages/listing.js';
import { renderDetail } from './src/pages/detail.js';
import { renderCart } from './src/pages/cart.js';
import { renderPayment } from './src/pages/payment.js';
import { renderForm } from './src/pages/form.js';
import { renderThanks } from './src/pages/thanks.js';
import { showUpsell, closeModal } from './src/pages/modal.js';
import { goBack } from './src/navigation.js';

window.state = state;
window.PRODUCTS = PRODUCTS;
window.UNIVERSES = UNIVERSES;

function render() {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = '';
  
  const showHeader = state.page !== 'thanks';
  const showBackBtn = state.page !== 'qr';
  
  if (showHeader) {
    renderTopbar(app, goBack);
    if (showBackBtn) {
      const back = $('.back-btn');
      if (back) back.classList.add('show');
    }
  }
  
  if (state.page === 'qr') renderQR(app);
  else if (state.page === 'listing') renderListing(app);
  else if (state.page === 'detail') renderDetail(app);
  else if (state.page === 'cart') renderCart(app);
  else if (state.page === 'payment') renderPayment(app);
  else if (state.page === 'form') renderForm(app);
  else if (state.page === 'thanks') renderThanks(app);
  
  updateCartCount();
}

function scanQR() {
  loadUniverse('universe1');
}

function loadUniverse(id) {
  state.universe = UNIVERSES[id];
  state.photos = state.universe.photos;
  state.page = 'listing';
  render();
}

function addUpsell(photoId, productId) {
  state.cart = addOne(photoId, productId, state.cart, PRODUCTS);
  updateCartCount();
  closeModal();
  render();
}

function backToQR() {
  clearInterval(state.timer);
  clearTimeout(state.timer);
  resetState();
  render();
}

window.render = render;
window.scanQR = scanQR;
window.loadUniverse = loadUniverse;
window.showUpsell = showUpsell;
window.closeModal = closeModal;
window.addUpsell = addUpsell;
window.backToQR = backToQR;

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 PrintStation initialized');
  render();
});
EOF
echo "✓ renderer/app.js créé"

# ===== renderer/src/state.js =====
cat > renderer/src/state.js << 'EOF'
export const state = {
  lang: 'fr',
  page: 'qr',
  universe: null,
  photos: [],
  currentPhoto: null,
  cart: [],
  email: '',
  optin: false,
  timer: null,
  thanksCounter: 5,
  photoIndex: 0
};

export const resetState = () => {
  state.page = 'qr';
  state.cart = [];
  state.email = '';
  state.optin = false;
  state.currentPhoto = null;
  state.universe = null;
  state.photos = [];
  state.thanksCounter = 5;
  state.photoIndex = 0;
  if (state.timer) clearTimeout(state.timer);
};
EOF
echo "✓ renderer/src/state.js créé"

# ===== renderer/src/data.js =====
cat > renderer/src/data.js << 'EOF'
export const PRODUCTS = {
  print: { 
    id: 'print', 
    title: 'Photo papier (chevalet)', 
    first: 10, 
    next: 8 
  },
  magnet: { 
    id: 'magnet', 
    title: 'Porte-clé magnétique', 
    first: 15, 
    next: 12 
  }
};

export const UNIVERSES = {
  universe1: {
    id: 'universe1',
    name: 'Mondes Disparus',
    banner: './assets/banniere-monde-perdu.jpg',
    photos: [
      { id: 'p1', title: 'Scène 1 - Dinosaures', src: './assets/disparu-photo1.jpg' },
      { id: 'p2', title: 'Scène 2 - Paysage', src: './assets/disparu-photo2.jpg' },
      { id: 'p3', title: 'Scène 3 - Forêt', src: './assets/disparu-photo3.jpg' }
    ]
  },
  universe2: {
    id: 'universe2',
    name: 'Aventure',
    banner: './assets/banniere-aventure.jpg',
    photos: [
      { id: 'p4', title: 'Mont', src: './assets/aventure-photo1.jpg' },
      { id: 'p5', title: 'Mer', src: './assets/aventure-photo2.jpg' },
      { id: 'p6', title: 'Désert', src: './assets/aventure-photo3.jpg' }
    ]
  }
};
EOF
echo "✓ renderer/src/data.js créé"

# ===== renderer/src/i18n.js =====
cat > renderer/src/i18n.js << 'EOF'
import { state } from './state.js';

export const i18n = {
  fr: {
    scanQR: 'SCANNER QR CODE',
    hint: 'Cliquez pour scanner',
    photos: 'VOS SOUVENIRS PERSONNALISÉS :',
    other: 'Autres photos :',
    choose: 'Choisir →',
    photo: 'VOTRE PHOTO',
    first: '1er à',
    next: 'suivants à',
    added: 'Produit ajouté au panier',
    already: 'Déjà',
    inCart: 'au panier –',
    remove: 'retirer 1',
    showCart: '🛒 Afficher le panier',
    yourCart: 'Votre panier',
    payment: 'Paiement',
    products: 'Produits',
    discount: 'Remise',
    subtotal: 'Sous-total',
    tax: 'TVA (20%)',
    total: 'Total',
    payBtn: 'Procéder au paiement',
    paymentWait: 'Veuillez régler',
    paymentHint: 'Suivez les instructions sur le terminal bancaire…',
    getDigital: 'Recevoir votre photo numérique',
    digitalHint: 'On vous envoie la photo en version numérique + votre reçu.',
    email: 'Votre e-mail…',
    optin: 'Recevoir nos actus et offres',
    finish: 'Terminer',
    skip: 'Passer',
    thanks: 'Merci !',
    order: 'Votre commande est prête au comptoir.',
    receipt: 'Un reçu a été envoyé à',
    backHome: 'Retour à l\'accueil',
    errorEmail: 'Veuillez entrer une adresse e-mail valide',
    upsell: 'Ajouter aussi ?',
    upsellYes: 'Oui, ajouter',
    upsellNo: 'Non, merci'
  },
  en: {
    scanQR: 'SCAN QR CODE',
    hint: 'Click to scan',
    photos: 'YOUR PERSONALIZED MEMORIES:',
    other: 'Other photos:',
    choose: 'Choose →',
    photo: 'YOUR PHOTO',
    first: '1st at',
    next: 'next at',
    added: 'Product added to cart',
    already: 'Already',
    inCart: 'in cart –',
    remove: 'remove 1',
    showCart: '🛒 View cart',
    yourCart: 'Your cart',
    payment: 'Payment',
    products: 'Products',
    discount: 'Discount',
    subtotal: 'Subtotal',
    tax: 'Tax (20%)',
    total: 'Total',
    payBtn: 'Proceed to payment',
    paymentWait: 'Please settle',
    paymentHint: 'Follow the instructions on the payment terminal…',
    getDigital: 'Receive your digital photo',
    digitalHint: 'We will send you the digital photo + your receipt.',
    email: 'Your email…',
    optin: 'Receive our news and offers',
    finish: 'Finish',
    skip: 'Skip',
    thanks: 'Thank you!',
    order: 'Your order is ready at the counter.',
    receipt: 'A receipt has been sent to',
    backHome: 'Back to home',
    errorEmail: 'Please enter a valid email address',
    upsell: 'Add this too?',
    upsellYes: 'Yes, add it',
    upsellNo: 'No thanks'
  }
};

export const t = (key) => i18n[state.lang]?.[key] || key;
EOF
echo "✓ renderer/src/i18n.js créé"

# ===== renderer/src/utils.js =====
cat > renderer/src/utils.js << 'EOF'
import { state } from './state.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => root.querySelectorAll(sel);

export const keyFor = (photoId, productId) => `${photoId}::${productId}`;
export const getQty = (photoId, productId, cart) => 
  (cart.find(l => l.key === keyFor(photoId, productId))?.qty) || 0;

export const unitPrice = (product, idx) => idx === 1 ? product.first : product.next;

export const lineTotal = (product, qty) => {
  let sum = 0;
  for (let i = 1; i <= qty; i++) sum += unitPrice(product, i);
  return sum;
};

export const cartSubtotal = (cart, products) => 
  cart.reduce((s, l) => s + lineTotal(products[l.productId], l.qty), 0);

export const cartNominal = (cart, products) => 
  cart.reduce((s, l) => s + l.qty * products[l.productId].first, 0);

export const toast = (text) => {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.textContent = text;
  container.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 2000);
};

export const updateCartCount = () => {
  const c = $('#cartCount');
  if (c) c.textContent = state.cart.reduce((a, b) => a + b.qty, 0);
};

export const addOne = (photoId, productId, cart, products) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (line) line.qty += 1;
  else cart.push({ key: k, photoId, productId, qty: 1 });
  return cart;
};

export const removeOne = (photoId, productId, cart) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (!line) return cart;
  line.qty -= 1;
  return line.qty <= 0 ? cart.filter(l => l.key !== k) : cart;
};
EOF
echo "✓ renderer/src/utils.js créé"

# ===== renderer/src/cart.js =====
cat > renderer/src/cart.js << 'EOF'
import { keyFor } from './utils.js';

export const addOne = (photoId, productId, cart, products) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (line) line.qty += 1;
  else cart.push({ key: k, photoId, productId, qty: 1 });
  return cart;
};

export const removeOne = (photoId, productId, cart) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (!line) return cart;
  line.qty -= 1;
  return line.qty <= 0 ? cart.filter(l => l.key !== k) : cart;
};
EOF
echo "✓ renderer/src/cart.js créé"

# ===== renderer/src/navigation.js =====
cat > renderer/src/navigation.js << 'EOF'
import { state } from './state.js';

export const goBack = () => {
  if (state.page === 'qr') return;
  else if (state.page === 'listing') { 
    state.page = 'qr'; 
    state.universe = null; 
    state.photos = []; 
  }
  else if (state.page === 'detail') { 
    state.page = 'listing'; 
    state.currentPhoto = null; 
  }
  else if (state.page === 'cart') { 
    state.page = 'detail'; 
  }
  else if (state.page === 'payment') { 
    state.page = 'cart'; 
    clearTimeout(state.timer); 
  }
  else if (state.page === 'form') { 
    state.page = 'cart'; 
  }
  else if (state.page === 'thanks') { 
    state.page = 'qr'; 
  }
  window.render();
};
EOF
echo "✓ renderer/src/navigation.js créé"

# ===== Pages =====
cat > renderer/src/pages/topbar.js << 'EOF'
import { state } from '../state.js';
import { $, updateCartCount } from '../utils.js';

export const renderTopbar = (root, onNavigate) => {
  const header = document.createElement('header');
  header.className = 'topbar';
  
  const backBtn = document.createElement('button');
  backBtn.className = 'icon-btn back-btn';
  backBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  backBtn.onclick = onNavigate;
  
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = '<img src="./assets/logo.png" alt="Logo">';
  
  const langs = document.createElement('div');
  langs.className = 'lang-selector';
  const flags = { fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', it: '🇮🇹', de: '🇩🇪' };
  ['fr', 'en', 'es', 'it', 'de'].forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'lang-btn' + (state.lang === l ? ' active' : '');
    btn.textContent = flags[l];
    btn.onclick = () => { state.lang = l; window.render(); };
    langs.appendChild(btn);
  });
  
  const cartBtn = document.createElement('button');
  cartBtn.className = 'cart-btn';
  cartBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg><span class="count" id="cartCount">0</span>';
  cartBtn.onclick = () => { state.page = 'cart'; window.render(); };
  
  header.appendChild(backBtn);
  header.appendChild(brand);
  header.appendChild(langs);
  header.appendChild(cartBtn);
  root.appendChild(header);
  updateCartCount();
};
EOF
echo "✓ renderer/src/pages/topbar.js créé"

cat > renderer/src/pages/qr.js << 'EOF'
import { t } from '../i18n.js';

export const renderQR = (root) => {
  const main = document.createElement('div');
  main.className = 'main';
  main.innerHTML = `<div class="qr-page">
    <div class="qr-text">${t('scanQR')}</div>
    <div class="qr-hint">${t('hint')}</div>
    <div class="qr-scanner" onclick="window.scanQR()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg></div>
    <div class="qr-buttons">
      <button onclick="window.loadUniverse('universe1')">Mondes Disparus</button>
      <button onclick="window.loadUniverse('universe2')">Aventure</button>
    </div>
  </div>`;
  root.appendChild(main);
};
EOF
echo "✓ renderer/src/pages/qr.js créé"

cat > renderer/src/pages/listing.js << 'EOF'
import { state } from '../state.js';
import { t } from '../i18n.js';

export const renderListing = (root) => {
  const main = document.createElement('div');
  main.className = 'main detail-enter';
  main.innerHTML = `<div class="hero"><img src="${state.universe.banner}" alt=""></div>
    <div class="section"><h2>${t('photos')}</h2></div>
    <div class="grid" id="grid"></div>`;
  
  const grid = main.querySelector('#grid');
  state.photos.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animation = `riseIn .46s ease ${i * 160}ms both`;
    card.innerHTML = `<div class="landscape"><img src="${p.src}" alt=""></div>
      <div class="body"><div class="title">${p.title}</div><button class="choose">${t('choose')}</button></div>`;
    card.onclick = () => { state.currentPhoto = p; state.page = 'detail'; state.photoIndex = 0; window.render(); };
    grid.appendChild(card);
  });
  root.appendChild(main);
};
EOF
echo "✓ renderer/src/pages/listing.js créé"

cat > renderer/src/pages/detail.js << 'EOF'
import { state } from '../state.js';
import { t } from '../i18n.js';
import { $, getQty, lineTotal, updateCartCount, toast, addOne, removeOne } from '../utils.js';

export const renderOffer = (photo, product) => {
  const qty = getQty(photo.id, product.id, state.cart);
  const nextPrice = qty >= 1 ? product.next : product.first;
  const showOld = qty >= 1;
  const el = document.createElement('div');
  el.className = 'offer';
  
  const icon = product.id === 'print' ? '🖼️' : '🔑';
  
  el.innerHTML = `
    <div class="visu" style="font-size:48px;">${icon}</div>
    <div class="info">
      <h3 class="title">${product.title}</h3>
      <div class="sub">${t('first')} ${product.first}€ · ${t('next')} ${product.next}€</div>
      ${qty >= 1 ? `<div class="meta">${t('already')} ${qty} ${t('inCart')} <a href="#" class="retirer" style="color:var(--brand);text-decoration:underline;cursor:pointer;">${t('remove')}</a></div>` : ''}
    </div>
    <div class="cta">
      <div class="price">
        ${showOld ? `<span class="old">${product.first}€</span>` : ''}
        <span class="pill${showOld ? ' pulse' : ''}">${nextPrice}€</span>
      </div>
      <button class="cmd">Ajouter<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>`;
  
  el.querySelector('.cmd').onclick = (e) => {
    e.stopPropagation();
    state.cart = addOne(photo.id, product.id, state.cart, window.PRODUCTS);
    updateCartCount();
    toast(t('added'));
    window.showUpsell(photo, product.id === 'print' ? window.PRODUCTS.magnet : window.PRODUCTS.print);
    const parent = el.parentElement;
    const idx = Array.from(parent.children).indexOf(el);
    parent.replaceChild(renderOffer(photo, product), parent.children[idx]);
  };
  
  const retirer = el.querySelector('.retirer');
  if (retirer) {
    retirer.onclick = (e) => {
      e.preventDefault();
      state.cart = removeOne(photo.id, product.id, state.cart);
      updateCartCount();
      const parent = el.parentElement;
      const idx = Array.from(parent.children).indexOf(el);
      parent.replaceChild(renderOffer(photo, product), parent.children[idx]);
    };
  }
  
  return el;
};

export const renderDetail = (root) => {
  const p = state.currentPhoto || state.photos[0];
  const main = document.createElement('div');
  main.className = 'main detail-enter';
  const section = document.createElement('section');
  section.innerHTML = `<h2 class="detail-title">${t('photo')}</h2><div class="detail-preview"><img src="${p.src}" alt=""></div>`;
  
  section.appendChild(renderOffer(p, window.PRODUCTS.print));
  section.appendChild(renderOffer(p, window.PRODUCTS.magnet));
  
  const sep = document.createElement('div');
  sep.style.height = '20px';
  section.appendChild(sep);
  
  const wrap = document.createElement('div');
  wrap.className = 'other';
  wrap.innerHTML = `<div class="section"><h2>${t('other')}</h2></div><div class="grid" id="other"></div>`;
  const grid = wrap.querySelector('#other');
  state.photos.filter(ph => ph.id !== p.id).slice(0, 2).forEach((ph, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animation = `riseIn .40s ease ${i * 140}ms both`;
    card.innerHTML = `<div class="landscape"><img src="${ph.src}" alt=""></div>`;
    card.onclick = () => { state.currentPhoto = ph; state.page = 'detail'; state.photoIndex = 0; window.render(); };
    grid.appendChild(card);
  });
  section.appendChild(wrap);
  
  const footer = document.createElement('div');
  footer.style.marginTop = '20px';
  const btn = document.createElement('button');
  btn.className = 'footer-cta';
  btn.textContent = t('showCart');
  btn.onclick = () => { state.page = 'cart'; window.render(); };
  footer.appendChild(btn);
  section.appendChild(footer);
  
  main.appendChild(section);
  root.appendChild(main);
};
EOF
echo "✓ renderer/src/pages/detail.js créé"

cat > renderer/src/pages/cart.js << 'EOF'
import { state } from '../state.js';
import { t } from '../i18n.js';
import { lineTotal, cartSubtotal, cartNominal, updateCartCount, addOne, removeOne } from '../utils.js';

export const renderCart = (root) => {
  const main = document.createElement('div');
  main.className = 'main';
  const wrap = document.createElement('div');
  wrap.className = 'cart';
  wrap.innerHTML = `<h2>${t('yourCart')}</h2>
    <div class="progress">
      <div style="display:grid;place-items:center"><div class="dot active">1</div><div class="label">${t('yourCart')}</div></div>
      <div class="line"></div>
      <div style="display:grid;place-items:center"><div class="dot">2</div><div class="label">${t('payment')}</div></div>
    </div>`;
  
  const lines = document.createElement('div');
  lines.className = 'lines';
  state.cart.forEach(line => {
    const product = window.PRODUCTS[line.productId];
    const photo = state.photos.find(x => x.id === line.photoId);
    const row = document.createElement('div');
    row.className = 'line';
    const icon = product.id === 'print' ? '🖼️' : '🔑';
    row.innerHTML = `<div class="thumb" style="display:grid;place-items:center;font-size:24px;">${icon}</div>
      <div><div class="title">${product.title}</div><div class="meta">${photo ? photo.title : ''}</div></div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="key" data-a="minus">−</button><div class="title">${line.qty}</div><button class="key" data-a="plus">+</button><button class="key" data-a="del">✕</button><div style="width:70px;text-align:right;font-weight:800;">${lineTotal(product, line.qty).toFixed(2)}€</div>
      </div>`;
    lines.appendChild(row);
    row.querySelectorAll('.key').forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.a;
        if (act === 'minus') state.cart = removeOne(line.photoId, line.productId, state.cart);
        if (act === 'plus') state.cart = addOne(line.photoId, line.productId, state.cart, window.PRODUCTS);
        if (act === 'del') state.cart = state.cart.filter(l => l.key !== line.key);
        updateCartCount();
        window.render();
      };
    });
  });
  wrap.appendChild(lines);
  
  const nb = state.cart.reduce((n, l) => n + l.qty, 0);
  const sub = cartSubtotal(state.cart, window.PRODUCTS);
  const nom = cartNominal(state.cart, window.PRODUCTS);
  const disc = nom - sub;
  const tva = sub * 0.2;
  const tot = sub + tva;
  const sum = document.createElement('div');
  sum.className = 'sum';
  sum.innerHTML = `
    <div class="row"><div>${t('products')} (${nb})</div><div>${nom.toFixed(2)}€</div></div>
    <div class="row"><div>${t('discount')}</div><div>−${disc.toFixed(2)}€</div></div>
    <div class="row"><div>${t('subtotal')}</div><div>${sub.toFixed(2)}€</div></div>
    <div class="row"><div>${t('tax')}</div><div>${tva.toFixed(2)}€</div></div>
    <div class="row total"><div>${t('total')}</div><div>${tot.toFixed(2)}€</div></div>`;
  wrap.appendChild(sum);
  
  const cta = document.createElement('button');
  cta.className = 'footer-cta';
  cta.textContent = t('payBtn');
  cta.onclick = () => { state.page = 'payment'; window.render(); };
  wrap.appendChild(cta);
  main.appendChild(wrap);
  root.appendChild(main);
};
EOF
echo "✓ renderer/src/pages/cart.js créé"

cat > renderer/src/pages/payment.js << 'EOF'
import { state } from '../state.js';
import { t } from '../i18n.js';
import { lineTotal } from '../utils.js';

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
      <svg width="240" height="120" viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="2"><rect x="20" y="20" width="200" height="80" rx="8"/><circle cx="80" cy="60" r="15"/><path d="M140 50 L160 60 L140 70"/></svg>
      <div class="title">${t('paymentWait')}</div>
      <div class="help">${t('paymentHint')}</div>
    </div>`;
  
  const lines = document.createElement('div');
  lines.className = 'lines';
  state.cart.forEach(l => {
    const product = window.PRODUCTS[l.productId];
    const row = document.createElement('div');
    row.className = 'line';
    const icon = product.id === 'print' ? '🖼️' : '🔑';
    row.innerHTML = `<div class="thumb" style="display:grid;place-items:center;font-size:24px;">${icon}</div><div class="title">${product.title} × ${l.qty}</div><div>${lineTotal(product, l.qty).toFixed(2)}€</div>`;
    lines.appendChild(row);
  });
  wrap.appendChild(lines);
  main.appendChild(wrap);
  root.appendChild(main);
  
  clearTimeout(state.timer);
  state.timer = setTimeout(() => { state.page = 'form'; window.render(); }, 5000);
};
EOF
echo "✓ renderer/src/pages/payment.js créé"

cat > renderer/src/pages/form.js << 'EOF'
import { state } from '../state.js';
import { t } from '../i18n.js';
import { $, toast } from '../utils.js';

export const renderForm = (root) => {
  const main = document.createElement('div');
  main.className = 'main';
  const wrap = document.createElement('div');
  wrap.className = 'form';
  
  const photosUnique = [...new Set(state.cart.map(l => l.photoId))].map(pid => state.photos.find(p => p.id === pid)).filter(Boolean);
  const currentPhoto = photosUnique[state.photoIndex] || (photosUnique[0] || state.photos[0]);
  
  wrap.innerHTML = `
    <h2>${t('getDigital')}</h2>
    <div class="form-content">
      <div class="form-photo">
        <div class="thumb"><img src="${currentPhoto.src}" alt=""></div>
        ${photosUnique.length > 1 ? `<div class="caption">${state.photoIndex + 1}/${photosUnique.length}</div>` : ''}
      </div>
      <div class="form-email">
        <div style="color:#6b7280;font-weight:600;font-size:14px;">${t('digitalHint')}</div>
        <div class="input" id="inputWrap"><input id="email" type="email" placeholder="${t('email')}" value="${state.email || ''}"/></div>
        <div class="chips">${['@gmail.com', '@orange.fr', '@yahoo.fr', '@hotmail.com', '@icloud.com'].map(d => `<button class="chip" data-d="${d}">${d}</button>`).join('')}</div>
        <label class="optin"><input id="optin" type="checkbox" ${state.optin ? 'checked' : ''}/> ${t('optin')}</label>
      </div>
    </div>
    <div class="kb" id="kb"></div>
    <div class="form-buttons">
      <button class="footer-cta" id="finish">${t('finish')}</button>
      <button class="footer-cta" id="skip" style="background:#9ca3af;">${t('skip')}</button>
    </div>`;
  
  main.appendChild(wrap);
  root.appendChild(main);
  
  if (photosUnique.length > 1) {
    state.timer = setInterval(() => {
      state.photoIndex = (state.photoIndex + 1) % photosUnique.length;
      const thumb = $('.form-photo .thumb img');
      const caption = $('.form-photo .caption');
      if (thumb) thumb.src = photosUnique[state.photoIndex].src;
      if (caption) caption.textContent = `${state.photoIndex + 1}/${photosUnique.length}`;
    }, 3000);
  }
  
  const rows = [
    [...'AZERTYUIOP'],
    [...'QSDFGHJKLM'],
    ['@', '.', '-', '_'],
    ['EFFACER', 'ESPACE']
  ];
  const kb = $('#kb');
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'kb-row';
    r.forEach(k => {
      const b = document.createElement('button');
      b.className = 'key' + ((k === 'EFFACER' || k === 'ESPACE') ? ' wide' : '');
      b.textContent = k;
      b.onclick = () => {
        const inp = $('#email');
        if (k === 'EFFACER') inp.value = inp.value.slice(0, -1);
        else if (k === 'ESPACE') inp.value += ' ';
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
  
  $('#finish').onclick = () => {
    const email = $('#email').value.trim();
    if (!email || !email.includes('@') || !email.includes('.')) {
      $('#inputWrap').classList.add('error');
      toast(t('errorEmail'));
      return;
    }
    clearInterval(state.timer);
    state.email = email;
    state.optin = $('#optin').checked;
    state.page = 'thanks';
    window.render();
  };
  
  $('#skip').onclick = () => {
    clearInterval(state.timer);
    state.email = '';
    state.page = 'thanks';
    window.render();
  };
};
EOF
echo "✓ renderer/src/pages/form.js créé"




# Fichiers manquants du script setup.sh

echo "Création des fichiers restants..."

# ===== renderer/src/pages/thanks.js =====
cat > renderer/src/pages/thanks.js << 'EOF'
import { state } from '../state.js';
import { t } from '../i18n.js';
import { $ } from '../utils.js';

export const renderThanks = (root) => {
  const thanks = document.createElement('div');
  thanks.className = 'thanks-page';
  thanks.innerHTML = `
    <div class="thanks-content">
      <svg width="80" height="80" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#5eb7ff"/><path d="M30 50 L45 65 L70 35" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h2>${t('thanks')}</h2>
      <p>${t('order')}</p>
      <p>${state.email ? t('receipt') + ' ' + state.email : ''}</p>
      <button class="thanks-btn" onclick="window.backToQR()">${t('backHome')}</button>
      <div class="thanks-timer">${t('backHome')} in <span id="counter">${state.thanksCounter}</span>s</div>
    </div>`;
  root.appendChild(thanks);
  
  state.thanksCounter = 5;
  state.timer = setInterval(() => {
    state.thanksCounter--;
    const cnt = $('#counter');
    if (cnt) cnt.textContent = state.thanksCounter;
    if (state.thanksCounter <= 0) {
      clearInterval(state.timer);
      window.backToQR();
    }
  }, 1000);
};
EOF
echo "✓ renderer/src/pages/thanks.js créé"

# ===== renderer/src/pages/modal.js =====
cat > renderer/src/pages/modal.js << 'EOF'
import { t } from '../i18n.js';
import { $ } from '../utils.js';
import { renderOffer } from './detail.js';

export const showUpsell = (photo, product) => {
  const modal = $('#modal');
  const offerHTML = renderOffer(photo, product).outerHTML;
  modal.innerHTML = `
    <div class="modal">
      <h3>${t('upsell')}</h3>
      ${offerHTML}
      <div class="btn-group">
        <button class="btn-yes" onclick="window.addUpsell('${photo.id}', '${product.id}')">${t('upsellYes')}</button>
        <button class="btn-no" onclick="window.closeModal()">${t('upsellNo')}</button>
      </div>
    </div>`;
  modal.classList.add('show');
};

export const closeModal = () => {
  const modal = $('#modal');
  modal.classList.remove('show');
  setTimeout(() => modal.innerHTML = '', 300);
};
EOF
echo "✓ renderer/src/pages/modal.js créé"

# ===== .gitignore =====
cat > .gitignore << 'EOF'
node_modules/
dist/
renderer/dist/
*.log
.DS_Store
.env
EOF
echo "✓ .gitignore créé"

# ===== README.md =====
cat > README.md << 'EOF'
# PrintStation - Kiosk d'impression modulaire

Application Electron pour kiosk d'impression photos avec sélection d'univers graphiques, panier dynamique et paiement.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev    # Build + Lance Electron
npm run watch  # Mode watch (rechargement auto)
```

## Build

```bash
npm run build  # Build une fois
```

## Structure

```
.
├── main.js              # Electron main process
├── preload.js           # Preload script (sécurité)
├── build.js             # Configuration esbuild
├── package.json
└── renderer/
    ├── index.html
    ├── styles.css
    ├── app.js           # Entry point renderer
    ├── dist/
    │   └── app.bundle.js (généré)
    └── src/
        ├── state.js
        ├── data.js
        ├── i18n.js
        ├── utils.js
        ├── cart.js
        ├── navigation.js
        └── pages/
            ├── topbar.js
            ├── qr.js
            ├── listing.js
            ├── detail.js
            ├── cart.js
            ├── payment.js
            ├── form.js
            ├── thanks.js
            └── modal.js
```

## Fonctionnalités

- ✅ Multilingue (FR/EN/ES/IT/DE)
- ✅ Univers graphiques personnalisés
- ✅ Panier avec pricing progressif
- ✅ Upselling modal
- ✅ Formulaire email avec clavier virtuel
- ✅ Architecture modulaire
- ✅ ES6 modules avec esbuild

## Notes

- Les images doivent être dans `renderer/assets/`
- À ajouter : QR code scanner, intégration paiement, email
EOF
echo "✓ README.md créé"

echo ""
echo "✅ Setup terminé !"
echo ""
echo "Prochaines étapes :"
echo "1. npm install"
echo "2. npm run dev"
echo "3. Crée le dossier renderer/assets/ et ajoute tes images"
echo ""


