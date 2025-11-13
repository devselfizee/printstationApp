/**
 * main.js - Electron main process
 * Version corrigée avec gestion gracieuse du photosystem
 */

import { app, BrowserWindow, ipcMain, Menu, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import https from 'https';

// Charger les variables d'environnement
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[Main] Variables d\'env chargées');
}

// Configuration de synchronisation API distante
const API_SYNC_CONFIG = {
  url: 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1/manage-orders',
  authToken: process.env.API_AUTH_TOKEN || null, // Token d'authentification
  salesPointId: process.env.SALES_POINT_ID || 'default-sales-point-uuid',
  kioskId: process.env.KIOSK_ID || 'default-kiosk-uuid',
  enabled: process.env.ENABLE_API_SYNC !== 'false', // Activé par défaut
  retryIntervalMs: parseInt(process.env.SYNC_RETRY_INTERVAL_MS) || 60000, // 1 minute par défaut
  maxAttempts: parseInt(process.env.SYNC_MAX_ATTEMPTS) || 5 // 5 tentatives max
};

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
  console.log('[Main] preload path:', path.join(__dirname, 'preload.js'));

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: process.env.NODE_ENV === 'production',
    icon: path.join(__dirname, 'renderer', 'assets', 'favicon.png'), // Icône de la fenêtre
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
  // mainWindow.webContents.openDevTools();

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

        // Démarrer le système de retry pour les commandes non synchronisées
        startSyncRetrySystem();
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

ipcMain.handle('cart:cancel-session', async (event, sessionId, orderId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.cancelSessionItems(sessionId, orderId);
    console.log('[IPC] Session annulée et liée à la commande:', orderId);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur annulation session:', error);
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

/**
 * Synchroniser une commande validée avec l'API distante
 */
async function syncOrderToRemoteAPI(orderId) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[Sync] Synchronisation désactivée');
    return { status: 'skipped', message: 'Synchronisation désactivée' };
  }

  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  try {
    // Incrémenter le compteur de tentatives
    await photoSystem.db.incrementSyncAttempts(orderId);

    // Récupérer la commande complète avec ses items
    const orderWithItems = await photoSystem.db.getOrderWithItems(orderId);

    if (!orderWithItems) {
      throw new Error(`Commande ${orderId} non trouvée`);
    }

    // Mapper le statut de la DB au format API
    // 'processing' → 'pending', 'cancelled' → 'cancelled', etc.
    const apiStatus = orderWithItems.status === 'cancelled' ? 'cancelled' : 'pending';

    // S'assurer que total_amount est toujours un nombre valide
    const totalAmount = orderWithItems.final_amount || orderWithItems.total_amount || 0;

    // Transformer les données au format attendu par l'API
    const payload = {
      customer_name: orderWithItems.participant_id || 'Anonymous',
      customer_email: orderWithItems.email || '', // Chaîne vide au lieu de null
      customer_address: null,
      total_amount: Math.round(totalAmount * 100), // Convertir en centimes
      sales_point_id: API_SYNC_CONFIG.salesPointId,
      kiosk_id: API_SYNC_CONFIG.kioskId,
      memory_session_id: orderWithItems.participant_id || 'unknown',
      status: apiStatus,
      order_items: (orderWithItems.items || []).map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: Math.round((item.unit_price || 0) * 100), // Convertir en centimes
        total_price: Math.round((item.total_price || 0) * 100) // Convertir en centimes
      }))
    };

    console.log('[Sync] Envoi commande à l\'API distante:', orderId);
    console.log('[Sync] Payload:', JSON.stringify(payload, null, 2));

    // Faire l'appel HTTP POST
    const response = await makeHttpsRequest(API_SYNC_CONFIG.url, payload);

    // ✅ Marquer la commande comme synchronisée
    await photoSystem.db.markOrderAsSynced(orderId);

    console.log('[Sync] ✅ Commande synchronisée avec succès:', orderId);
    console.log('[Sync] Réponse de l\'API:', JSON.stringify(response, null, 2));
    return { status: 'success', response };

  } catch (error) {
    console.error('[Sync] ❌ Erreur synchronisation commande:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Utilitaire pour faire une requête HTTPS POST
 */
function makeHttpsRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };

    // Ajouter le token d'authentification si disponible
    if (API_SYNC_CONFIG.authToken) {
      headers['Authorization'] = `Bearer ${API_SYNC_CONFIG.authToken}`;
    }

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: headers
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        console.log(`[Sync] HTTP Status: ${res.statusCode}`);
        console.log(`[Sync] Réponse brute:`, responseData);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (e) {
            console.warn('[Sync] Réponse non-JSON, retour du texte brut');
            resolve(responseData);
          }
        } else {
          console.error(`[Sync] ❌ Erreur HTTP ${res.statusCode}:`, responseData);
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('[Sync] ❌ Erreur réseau:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Réessayer la synchronisation des commandes en attente
 */
async function retrySyncPendingOrders() {
  if (!API_SYNC_CONFIG.enabled) {
    return;
  }

  if (!photoSystemReady || !photoSystem?.db) {
    return;
  }

  try {
    // Récupérer toutes les commandes non synchronisées
    const unsyncedOrders = await photoSystem.db.getUnsyncedOrders(API_SYNC_CONFIG.maxAttempts);

    if (unsyncedOrders.length === 0) {
      return;
    }

    console.log(`[Sync Retry] ${unsyncedOrders.length} commande(s) en attente de synchronisation`);

    // Tenter de synchroniser chaque commande
    for (const order of unsyncedOrders) {
      try {
        console.log(`[Sync Retry] Tentative ${order.sync_attempts + 1}/${API_SYNC_CONFIG.maxAttempts} pour ${order.id}`);
        const result = await syncOrderToRemoteAPI(order.id);

        if (result.status === 'success') {
          console.log(`[Sync Retry] ✅ Commande ${order.id} synchronisée avec succès`);
        } else {
          console.warn(`[Sync Retry] ⚠️  Échec synchronisation ${order.id}:`, result.error);
        }
      } catch (error) {
        console.error(`[Sync Retry] ❌ Erreur lors du retry ${order.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Sync Retry] ❌ Erreur lors du retry global:', error);
  }
}

// Démarrer le système de retry automatique quand le photoSystem est prêt
let syncRetryInterval = null;

function startSyncRetrySystem() {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[Sync Retry] Système de retry désactivé (ENABLE_API_SYNC=false)');
    return;
  }

  if (syncRetryInterval) {
    clearInterval(syncRetryInterval);
  }

  console.log(`[Sync Retry] Système de retry activé (intervalle: ${API_SYNC_CONFIG.retryIntervalMs}ms)`);

  // Premier essai immédiat
  setTimeout(() => retrySyncPendingOrders(), 5000); // Attendre 5s après le démarrage

  // Puis réessayer à intervalle régulier
  syncRetryInterval = setInterval(() => {
    retrySyncPendingOrders();
  }, API_SYNC_CONFIG.retryIntervalMs);
}

// Handler IPC pour synchroniser une commande
ipcMain.handle('order:sync-remote', async (event, orderId) => {
  return await syncOrderToRemoteAPI(orderId);
});

console.log('[Main] Tous les handlers IPC sont enregistrés');



// Handler dupliqué supprimé - utiliser uniquement 'admin:dashboard' (ligne 288-301)