/**
 * main.js - Electron main process
 * Version corrigée avec gestion gracieuse du photosystem
 */

import { app, BrowserWindow, ipcMain, Menu, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[Main] Variables d\'env chargées');
}

let mainWindow;
let photoSystemReady = false;
let photoSystem = null;

// Essayer charger le photosystem, mais continuer si erreur
try {
  photoSystem = await import('./renderer/src/photosystem/photosystem.js').then(m => m.default).catch(err => {
    console.warn('[Main] PhotoSystem non disponible:', err.message);
    return null;
  });
} catch (error) {
  console.warn('[Main] Impossible de charger photosystem:', error.message);
  photoSystem = null;
}

/**
 * ===== WINDOW MANAGEMENT =====
 */

function createWindow() {
  // console.log('[Main] preload pathddddddddddddddd:', path.join(__dirname, 'preload.js'));

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: process.env.NODE_ENV === 'production',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * ===== CUSTOM PROTOCOL FOR LOCAL IMAGES =====
 * Permet d'afficher les images locales via printstation://
 */
app.whenReady().then(() => {
  protocol.registerFileProtocol('printstation', (request, callback) => {
    // Extraire le chemin depuis l'URL
    // Format: printstation://local/home/user/Documents/PrintStationApp/Medias/participant_123/photo_001.jpg
    const url = request.url.replace('printstation://local', '');
    
    // Décoder l'URL (au cas où il y a des espaces ou caractères spéciaux)
    const filePath = decodeURIComponent(url);
    
    console.log('[Protocol] Demande fichier:', filePath);
    
    // Vérifier que le fichier existe
    if (fs.existsSync(filePath)) {
      callback({ path: filePath });
    } else {
      console.error('[Protocol] Fichier non trouvé:', filePath);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
  
  console.log('[Protocol] ✓ Protocole printstation:// enregistré');
});

/**
 * ===== APP LIFECYCLE =====
 */

app.on('ready', async () => {
  console.log('[Main] Démarrage PrintStation...');

  // Initialiser le système de photos SI disponible
  if (photoSystem && photoSystem.initialize) {
    try {
      const photoResult = await photoSystem.initialize();
      if (photoResult.status === 'error') {
        console.warn('[Main] PhotoSystem en mode dégradé:', photoResult.error);
        photoSystemReady = false;
      } else {
        console.log('[Main] ✓ Système de photos prêt');
        photoSystemReady = true;
      }
    } catch (error) {
      console.warn('[Main] Erreur initialisation photos:', error.message);
      photoSystemReady = false;
    }
  } else {
    console.log('[Main] ⚠️  PhotoSystem non disponible - Mode local uniquement');
    photoSystemReady = false;
  }

  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('[Main] Arrêt de PrintStation...');
  if (photoSystem && photoSystem.shutdown) {
    try {
      photoSystem.shutdown();
    } catch (error) {
      console.warn('[Main] Erreur arrêt photosystem:', error.message);
    }
  }
});

app.on('browser-window-created', (_, window) => {
  window.webContents.on('console-message', (event, level, message) => {
    if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
      event.preventDefault(); // masque ces messages
    }
  });
});

/**
 * ===== MENU =====
 */

function createMenu() {
  const isDev = process.env.NODE_ENV === 'development';

  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Quitter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    ...(isDev ? [{
      label: 'Développement',
      submenu: [
        {
          label: 'DevTools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.openDevTools(),
        },
        {
          label: 'Recharger',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        { type: 'separator' },
        {
          label: 'Status PhotoSystem',
          click: () => {
            console.log('[DevTools] PhotoSystem Ready:', photoSystemReady);
            mainWindow?.webContents.send('dev:console', {
              message: 'PhotoSystem Status',
              ready: photoSystemReady,
            });
          },
        },
      ],
    }] : []),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * ===== IPC HANDLERS - PHOTOS =====
 */

// Scan QR code
ipcMain.handle('photos:scan-qr', async (event, qrContent) => {
  console.log('[IPC] Scan QR reçu');
  
  if (!photoSystemReady || !photoSystem) {
    console.warn('[IPC] PhotoSystem non disponible, retour dummy data');
    return {
      status: 'success',
      message: 'Mode local - données dummy',
      photos: [],
    };
  }

  try {
    return await photoSystem.onQRCodeScanned(qrContent);
  } catch (error) {
    console.error('[IPC] Erreur scan QR:', error);
    return {
      status: 'error',
      error: error.message,
    };
  }
});

// Parser QR code
ipcMain.handle('photos:parse-qr', (event, qrContent) => {
  if (!photoSystemReady || !photoSystem) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  return photoSystem.parseQRCode(qrContent);
});

// Charger photos d'un participant
ipcMain.handle('photos:get-photos', async (event, participantId) => {
  console.log('[IPC] Chargement photos:', participantId);
  
  if (!photoSystemReady || !photoSystem) {
    console.warn('[IPC] PhotoSystem non disponible');
    return {
      status: 'success',
      photos: [],
      participantId,
    };
  }

  try {
    return await photoSystem.getPhotos(participantId);
  } catch (error) {
    console.error('[IPC] Erreur get photos:', error);
    return { status: 'error', error: error.message };
  }
});

// Obtenir la progression
ipcMain.handle('photos:get-progress', (event, participantId) => {
  if (!photoSystemReady || !photoSystem) {
    return { status: 'success', progress: 0 };
  }
  return photoSystem.getProgress(participantId);
});

// Sélectionner photos pour impression
ipcMain.handle('photos:select-for-printing', (event, participantId, photoIds) => {
  if (!photoSystemReady || !photoSystem) {
    return { status: 'success' };
  }
  return photoSystem.selectPhotosForPrinting(participantId, photoIds);
});

// Confirmer achat
ipcMain.handle('photos:confirm-purchase', (event, photoIds) => {
  if (!photoSystemReady || !photoSystem) {
    return { status: 'success' };
  }
  return photoSystem.confirmPhotoPurchase(photoIds);
});

// Historique
ipcMain.handle('photos:get-history', (event, limit) => {
  if (!photoSystemReady || !photoSystem) {
    return [];
  }
  return photoSystem.getHistory(limit);
});

// System status
ipcMain.handle('photos:system-status', () => {
  return {
    ready: photoSystemReady,
    message: photoSystemReady ? 'Système prêt' : 'Mode dégradé (données locales)',
  };
});

/**
 * ===== IPC HANDLERS - ADMIN (OPTIONNEL) =====
 */

/**
 * CORRECTIF CAR LE RETOUR eST ENCORE UNE PROMESSE PAS UN ARRAY
 *
ipcMain.handle('admin:dashboard', async () => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  return photoSystem.admin.getDashboardStats();
});
*/
ipcMain.handle('admin:dashboard', async () => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  try {
    // ✅ On attend la promesse avant de renvoyer
    const result = await photoSystem.admin.getDashboardStats();
    return result;
  } catch (error) {
    console.error('[Main] Erreur admin:dashboard →', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('admin:search-photos', (event, filters) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return [];
  }
  return photoSystem.admin.searchPhotos(filters);
});

ipcMain.handle('admin:participant-photos', (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return [];
  }
  return photoSystem.admin.getParticipantPhotos(participantId);
});

ipcMain.handle('admin:force-resync', async (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  return photoSystem.admin.forceResync(participantId);
});

ipcMain.handle('admin:delete-errors', async (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'success' };
  }
  return photoSystem.admin.deleteErrorPhotos(participantId);
});

ipcMain.handle('admin:clear-cache', async (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'success' };
  }
  return photoSystem.admin.clearCache(participantId);
});

ipcMain.handle('admin:delete-participant', async (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'success' };
  }
  return photoSystem.admin.deleteParticipant(participantId);
});

ipcMain.handle('admin:disk-usage', () => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { used: 0, available: 0 };
  }
  return photoSystem.admin.getDiskUsage();
});

ipcMain.handle('admin:free-space', (event, minSpaceGB) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'success' };
  }
  return photoSystem.admin.freeUpSpace(minSpaceGB);
});

ipcMain.handle('admin:generate-report', () => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  return photoSystem.admin.generateReport();
});

ipcMain.handle('admin:export-participant', (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  return photoSystem.admin.exportParticipant(participantId);
});

ipcMain.handle('admin:purchase-report', () => {
  if (!photoSystemReady || !photoSystem?.admin) {
    return [];
  }
  return photoSystem.admin.getPurchaseReport();
});

/**
 * ===== IPC HANDLERS - PAYMENT (OPTIONNEL) =====
 */

ipcMain.handle('payment:initiate', (event, amount) => {
  console.log('[IPC] Paiement initié:', amount);
  return { status: 'success', paymentId: 'dummy_' + Date.now() };
});

ipcMain.handle('payment:confirm', (event, paymentId) => {
  console.log('[IPC] Paiement confirmé:', paymentId);
  return { status: 'success' };
});

/**
 * ===== IPC HANDLERS - ORDERS (COMMANDES) =====
 */

ipcMain.handle('order:create', async (event, orderData) => {
  if (!photoSystemReady || !photoSystem?.db) {
    console.error('[IPC] PhotoSystem.db non disponible');
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.createOrder(orderData);
    console.log('[IPC] Commande créée:', orderData.orderId);
    return { status: 'success', orderId: orderData.orderId };
  } catch (error) {
    console.error('[IPC] Erreur création commande:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('order:add-item', async (event, itemData) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.addOrderItem(itemData);
    console.log('[IPC] Produit ajouté à commande:', itemData.orderId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur ajout produit:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('order:update-status', async (event, orderId, status, notes) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    const result = await photoSystem.db.updateOrderStatus(orderId, status, notes);
    console.log('[IPC] Statut commande mis à jour:', orderId, '->', status);
    return { status: 'success', ...result };
  } catch (error) {
    console.error('[IPC] Erreur mise à jour statut:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('order:update-item-status', async (event, itemId, status) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.updateOrderItemStatus(itemId, status);
    console.log('[IPC] Statut produit mis à jour:', itemId, '->', status);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur mise à jour statut produit:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('order:get-with-items', async (event, orderId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return null;
  }
  try {
    return await photoSystem.db.getOrderWithItems(orderId);
  } catch (error) {
    console.error('[IPC] Erreur récupération commande:', error);
    return null;
  }
});

ipcMain.handle('order:get-by-participant', async (event, participantId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getOrdersByParticipant(participantId);
  } catch (error) {
    console.error('[IPC] Erreur récupération commandes participant:', error);
    return [];
  }
});

ipcMain.handle('order:get-by-status', async (event, status) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getOrdersByStatus(status);
  } catch (error) {
    console.error('[IPC] Erreur récupération commandes par statut:', error);
    return [];
  }
});

ipcMain.handle('order:get-status-history', async (event, orderId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getOrderStatusHistory(orderId);
  } catch (error) {
    console.error('[IPC] Erreur récupération historique:', error);
    return [];
  }
});

ipcMain.handle('order:get-stats', async (event, startDate, endDate) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return {
      total_orders: 0,
      unique_customers: 0,
      total_revenue: 0,
      average_order_value: 0,
      pending: 0,
      processing: 0,
      printing: 0,
      completed: 0,
      cancelled: 0
    };
  }
  try {
    return await photoSystem.db.getOrderStats(startDate, endDate);
  } catch (error) {
    console.error('[IPC] Erreur récupération stats:', error);
    return null;
  }
});

ipcMain.handle('order:get-top-products', async (event, limit) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getTopProducts(limit || 10);
  } catch (error) {
    console.error('[IPC] Erreur récupération top produits:', error);
    return [];
  }
});

ipcMain.handle('order:cancel', async (event, orderId, reason) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.cancelOrder(orderId, reason);
    console.log('[IPC] Commande annulée:', orderId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur annulation commande:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('order:search', async (event, searchTerm) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.searchOrders(searchTerm);
  } catch (error) {
    console.error('[IPC] Erreur recherche commandes:', error);
    return [];
  }
});

ipcMain.handle('order:delete', async (event, orderId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.deleteOrder(orderId);
    console.log('[IPC] Commande supprimée:', orderId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur suppression commande:', error);
    return { status: 'error', error: error.message };
  }
});

// Nouveaux handlers pour la gestion temps réel du panier
ipcMain.handle('cart:add-item-immediate', async (event, itemData) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    const result = await photoSystem.db.addCartItemImmediate(itemData);
    console.log('[IPC] Produit ajouté immédiatement:', result.itemId);
    return { status: 'success', itemId: result.itemId };
  } catch (error) {
    console.error('[IPC] Erreur ajout immédiat:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('cart:cancel-item', async (event, itemId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.cancelCartItem(itemId);
    console.log('[IPC] Produit annulé:', itemId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur annulation:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('cart:reactivate-item', async (event, photoId, productId, sessionId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    const result = await photoSystem.db.reactivateCartItem(photoId, productId, sessionId);
    console.log('[IPC] Produit réactivé:', result.itemId);
    return { status: 'success', itemId: result.itemId };
  } catch (error) {
    console.error('[IPC] Erreur réactivation:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('cart:get-session-items', async (event, sessionId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getSessionCartItems(sessionId);
  } catch (error) {
    console.error('[IPC] Erreur récupération items session:', error);
    return [];
  }
});

ipcMain.handle('cart:get-all-session-items', async (event, sessionId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getAllSessionItems(sessionId);
  } catch (error) {
    console.error('[IPC] Erreur récupération tous items:', error);
    return [];
  }
});

ipcMain.handle('cart:get-active-session-items', async (event, sessionId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getActiveSessionItems(sessionId);
  } catch (error) {
    console.error('[IPC] Erreur récupération items actifs:', error);
    return [];
  }
});

ipcMain.handle('cart:get-session-stats', async (event, sessionId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return {
      total_items: 0,
      en_cours: 0,
      en_attente: 0,
      annulé: 0,
      validé: 0,
      total_amount: 0
    };
  }
  try {
    return await photoSystem.db.getSessionStats(sessionId);
  } catch (error) {
    console.error('[IPC] Erreur stats session:', error);
    return null;
  }
});

ipcMain.handle('cart:validate-session', async (event, sessionId, orderId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.validateSessionItems(sessionId, orderId);
    console.log('[IPC] Session validée:', sessionId, '→', orderId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur validation session:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('cart:update-quantity', async (event, itemId, quantity, totalPrice) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.updateCartItemQuantity(itemId, quantity, totalPrice);
    console.log('[IPC] Quantité mise à jour:', itemId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur mise à jour quantité:', error);
    return { status: 'error', error: error.message };
  }
});

console.log('[Main] Tous les handlers IPC sont enregistrés');



// Handler dupliqué supprimé - utiliser uniquement 'admin:dashboard' (ligne 288-301)