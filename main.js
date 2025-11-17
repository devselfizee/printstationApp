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
  url: (process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1') + '/manage-orders',
  authUrl: process.env.API_AUTH_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/auth/v1/token?grant_type=password',
  authEmail: process.env.API_AUTH_EMAIL || 'dev@selfizee.fr',
  authPassword: process.env.API_AUTH_PASSWORD || 'admin123',
  supabaseAnonKey: process.env.API_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZXR4dXZxcmtuYmdncGx6bXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MzIxODQsImV4cCI6MjA1MDEwODE4NH0.ZRggq8dGNI0QjxP8QOqOaZs73MVGMUyX5xJZfF5X2q8',
  salesPointId: process.env.SALES_POINT_ID || 'default-sales-point-uuid',
  kioskId: process.env.KIOSK_ID || 'default-kiosk-uuid',
  enabled: process.env.ENABLE_API_SYNC !== 'false', // Activé par défaut
  retryIntervalMs: parseInt(process.env.SYNC_RETRY_INTERVAL_MS) || 60000, // 1 minute par défaut
  maxAttempts: parseInt(process.env.SYNC_MAX_ATTEMPTS) || 5 // 5 tentatives max
};

// Cache pour le token JWT avec expiration
let authTokenCache = {
  token: null,
  expiresAt: 0
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

        // Charger la configuration machine depuis la DB
        await loadMachineConfig();

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
 * Récupérer un token d'authentification JWT depuis l'API Supabase
 * Le token est mis en cache et réutilisé tant qu'il n'est pas expiré
 */
async function getAuthToken() {
  const now = Date.now();

  // Vérifier si le token en cache est encore valide (avec marge de 5 minutes)
  if (authTokenCache.token && authTokenCache.expiresAt > now + (5 * 60 * 1000)) {
    console.log('[Auth] Utilisation du token en cache');
    return authTokenCache.token;
  }

  console.log('[Auth] Récupération d\'un nouveau token...');

  try {
    const authPayload = {
      email: API_SYNC_CONFIG.authEmail,
      password: API_SYNC_CONFIG.authPassword
    };

    // Pour Supabase, on a besoin du header apikey ET du header Authorization
    const response = await makeHttpsRequest(
      API_SYNC_CONFIG.authUrl,
      authPayload,
      'POST',
      {
        'Content-Type': 'application/json',
        'apikey': API_SYNC_CONFIG.supabaseAnonKey,
        'Authorization': `Bearer ${API_SYNC_CONFIG.supabaseAnonKey}`
      }
    );

    if (!response || !response.access_token) {
      throw new Error('Réponse d\'authentification invalide');
    }

    // Extraire les informations du token
    const token = response.access_token;
    const expiresIn = response.expires_in || 3600; // Par défaut 1 heure

    // Mettre en cache le token
    authTokenCache.token = token;
    authTokenCache.expiresAt = now + (expiresIn * 1000);

    console.log('[Auth] ✅ Nouveau token obtenu (expire dans', expiresIn, 'secondes)');
    return token;

  } catch (error) {
    console.error('[Auth] ❌ Erreur récupération token:', error);
    throw new Error(`Échec authentification: ${error.message}`);
  }
}

/**
 * Récupérer la liste des produits actifs depuis l'API Supabase
 */
async function fetchProductsFromAPI() {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[Products] API désactivée - utilisation des produits par défaut');
    return { status: 'skipped', message: 'API désactivée' };
  }

  try {
    const productsUrl = (process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1') + '/manage-products?status=active';

    console.log('[Products] 📦 Récupération des produits depuis l\'API...');
    console.log('[Products] URL:', productsUrl);

    // Récupérer un token d'authentification
    const authToken = await getAuthToken();

    // Faire l'appel HTTP GET avec les headers nécessaires pour Supabase
    const response = await makeHttpsRequest(
      productsUrl,
      null,
      'GET',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[Products] ═══════════════════════════════════════════════');
    console.log('[Products] 📦 RÉPONSE BRUTE DE L\'API');
    console.log('[Products] ═══════════════════════════════════════════════');
    console.log('[Products] Type de réponse:', typeof response);
    console.log('[Products] Est un tableau:', Array.isArray(response));
    console.log('[Products] Clés disponibles:', Object.keys(response || {}));
    console.log('[Products] Réponse complète:');
    console.log(JSON.stringify(response, null, 2));
    console.log('[Products] ═══════════════════════════════════════════════');

    // Extraire le tableau de produits (peut être dans response.products ou directement response)
    let productsArray = null;

    if (Array.isArray(response)) {
      productsArray = response;
      console.log('[Products] ✅ Réponse directe est un tableau de', response.length, 'produit(s)');
    } else if (response && Array.isArray(response.products)) {
      productsArray = response.products;
      console.log('[Products] ✅ Réponse contient une clé "products" avec', response.products.length, 'produit(s)');
    } else {
      console.error('[Products] ❌ Format de réponse non reconnu');
      throw new Error('Format de réponse API invalide - pas de tableau de produits trouvé');
    }

    // Transformer les produits de l'API au format attendu par l'application
    const products = {};
    productsArray.forEach(product => {
      console.log('[Products] ─────────────────────────────────────────────');
      console.log('[Products] 🔍 Traitement du produit:', product.id, '-', product.name);
      console.log('[Products] Champs disponibles:', Object.keys(product));
      console.log('[Products] Données brutes:', JSON.stringify(product, null, 2));

      // Les prix sont déjà en euros dans l'API
      // unit_price = prix initial (first)
      // bulk_price = prix en lot (next)
      const firstPrice = product.unit_price || 0;
      const nextPrice = product.bulk_price || firstPrice;

      console.log('[Products] Prix unitaire (unit_price):', product.unit_price, '€');
      console.log('[Products] Prix en lot (bulk_price):', product.bulk_price, '€');
      console.log('[Products] Prix formatés - first:', firstPrice, '€, next:', nextPrice, '€');
      console.log('[Products] Thumbnail URL:', product.thumbnail_url);

      products[product.id] = {
        id: product.id,
        title: product.name || 'Produit sans nom',
        first: firstPrice,
        next: nextPrice,
        description: product.description || '',
        status: product.status || 'active',
        thumbnail: product.thumbnail_url || null
      };
    });

    console.log('[Products] ═══════════════════════════════════════════════');
    console.log('[Products] 🎯 PRODUITS FORMATÉS POUR L\'APPLICATION');
    console.log('[Products] ═══════════════════════════════════════════════');
    console.log('[Products] Nombre de produits:', Object.keys(products).length);
    console.log('[Products] IDs des produits:', Object.keys(products));
    console.log('[Products] Détails complets:');
    console.log(JSON.stringify(products, null, 2));
    console.log('[Products] ═══════════════════════════════════════════════');

    return { status: 'success', products };

  } catch (error) {
    console.error('[Products] ❌ Erreur récupération produits:', error);
    return { status: 'error', error: error.message };
  }
}

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

    console.log('[Sync] ═══════════════════════════════════════════════════');
    console.log('[Sync] 📦 DONNÉES RÉCUPÉRÉES DE LA BASE DE DONNÉES LOCALE');
    console.log('[Sync] ═══════════════════════════════════════════════════');
    console.log('[Sync] Order ID:', orderWithItems.id);
    console.log('[Sync] Participant ID:', orderWithItems.participant_id);
    console.log('[Sync] Email:', orderWithItems.email);
    console.log('[Sync] Status:', orderWithItems.status);
    console.log('[Sync] Total Amount:', orderWithItems.total_amount);
    console.log('[Sync] Final Amount:', orderWithItems.final_amount);
    console.log('[Sync] Nombre d\'items:', orderWithItems.items?.length || 0);
    console.log('[Sync] Items détaillés:', JSON.stringify(orderWithItems.items, null, 2));

    // Mapper le statut de la DB au format API
    // 'processing' → 'pending', 'cancelled' → 'cancelled', etc.
    const apiStatus = orderWithItems.status === 'cancelled' ? 'cancelled' : 'pending';

    // S'assurer que total_amount est toujours un nombre valide
    const totalAmount = orderWithItems.final_amount || orderWithItems.total_amount || 0;

    // Transformer les données au format attendu par l'API
    const payload = {
      customer_name: orderWithItems.participant_id || 'Anonymous',
      customer_email: orderWithItems.email || 'no-email@cancelled.order', // Email par défaut pour commandes annulées
      customer_address: null,
      total_amount: Math.round(totalAmount * 100), // Convertir en centimes
      sales_point_id: API_SYNC_CONFIG.salesPointId,
      kiosk_id: API_SYNC_CONFIG.kioskId,
      memory_session_id: null, // null car le participant_id local n'existe pas dans Supabase
      status: apiStatus,
      order_items: (orderWithItems.items || []).map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: Math.round((item.unit_price || 0) * 100), // Convertir en centimes
        total_price: Math.round((item.total_price || 0) * 100) // Convertir en centimes
      }))
    };

    console.log('[Sync] ═══════════════════════════════════════════════════');
    console.log('[Sync] 🚀 PAYLOAD QUI SERA ENVOYÉ À L\'API SUPABASE');
    console.log('[Sync] ═══════════════════════════════════════════════════');
    console.log('[Sync] URL:', API_SYNC_CONFIG.url);
    console.log('[Sync] Payload complet:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('[Sync] ───────────────────────────────────────────────────');
    console.log('[Sync] Nombre d\'order_items dans le payload:', payload.order_items.length);
    console.log('[Sync] Order items détaillés:');
    payload.order_items.forEach((item, index) => {
      console.log(`[Sync]   Item ${index + 1}:`, {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: `${item.unit_price / 100}€`,
        total_price: `${item.total_price / 100}€`
      });
    });
    console.log('[Sync] ═══════════════════════════════════════════════════');

    // Récupérer un token d'authentification frais
    const authToken = await getAuthToken();
    console.log('[Sync] Token d\'authentification récupéré');

    // 🔥 AFFICHER LES DÉTAILS COMPLETS AVANT L'ENVOI
    console.log('\n\n');
    console.log('═'.repeat(80));
    console.log('🚀 POST VERS API SUPABASE - DÉTAILS COMPLETS');
    console.log('═'.repeat(80));
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('🔗 URL destination:', API_SYNC_CONFIG.url);
    console.log('📦 Order ID local:', orderId);
    console.log('🔐 Authentification: Token JWT présent');
    console.log('─'.repeat(80));
    console.log('📋 HEADERS HTTP:');
    console.log('  - Content-Type: application/json');
    console.log('  - Authorization: Bearer [TOKEN]');
    console.log('  - apikey: [ANON_KEY]');
    console.log('─'.repeat(80));
    console.log('📦 PAYLOAD JSON (ce qui sera posté):');
    console.log(JSON.stringify(payload, null, 2));
    console.log('─'.repeat(80));
    console.log('📊 RÉSUMÉ DU PAYLOAD:');
    console.log('  • Customer:', payload.customer_name);
    console.log('  • Email:', payload.customer_email);
    console.log('  • Montant total:', (payload.total_amount / 100).toFixed(2), '€');
    console.log('  • Status:', payload.status);
    console.log('  • Kiosk ID:', payload.kiosk_id);
    console.log('  • Sales Point ID:', payload.sales_point_id);
    console.log('  • Nombre d\'articles:', payload.order_items.length);
    console.log('─'.repeat(80));
    console.log('🛒 DÉTAILS DES ARTICLES (order_items):');
    payload.order_items.forEach((item, idx) => {
      console.log(`  Article ${idx + 1}:`);
      console.log(`    - Product ID: ${item.product_id}`);
      console.log(`    - Quantité: ${item.quantity}`);
      console.log(`    - Prix unitaire: ${(item.unit_price / 100).toFixed(2)} €`);
      console.log(`    - Prix total: ${(item.total_price / 100).toFixed(2)} €`);
    });
    console.log('═'.repeat(80));
    console.log('⏳ Envoi en cours vers Supabase...');
    console.log('═'.repeat(80));
    console.log('\n');

    // Faire l'appel HTTP POST avec le token
    const response = await makeHttpsRequest(API_SYNC_CONFIG.url, payload, 'POST', {}, authToken);

    // ✅ Marquer la commande comme synchronisée
    await photoSystem.db.markOrderAsSynced(orderId);

    // 🔥 AFFICHER LA RÉPONSE DE SUPABASE
    console.log('\n\n');
    console.log('═'.repeat(80));
    console.log('✅ RÉPONSE DE L\'API SUPABASE - SUCCÈS');
    console.log('═'.repeat(80));
    console.log('📅 Timestamp réponse:', new Date().toISOString());
    console.log('📦 Order ID local:', orderId, '→ ✅ SYNCHRONISÉE!');
    console.log('─'.repeat(80));
    console.log('📋 RÉPONSE COMPLÈTE (JSON):');
    console.log(JSON.stringify(response, null, 2));
    console.log('─'.repeat(80));
    if (response.order_id) {
      console.log('📌 INFORMATIONS CLÉS DE LA RÉPONSE:');
      console.log('  • Order ID Supabase:', response.order_id);
      console.log('  • Statut:', response.status || 'N/A');
      if (response.order_items_count) {
        console.log('  • Nombre d\'items créés:', response.order_items_count);
      }
    }
    console.log('═'.repeat(80));
    console.log('🎉 Synchronisation terminée avec succès!');
    console.log('═'.repeat(80));
    console.log('\n\n');

    return { status: 'success', response };

  } catch (error) {
    // 🔥 AFFICHER L'ERREUR EN DÉTAIL
    console.log('\n\n');
    console.log('═'.repeat(80));
    console.log('❌ ERREUR LORS DE LA SYNCHRONISATION AVEC SUPABASE');
    console.log('═'.repeat(80));
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('📦 Order ID local:', orderId);
    console.log('🔗 URL tentée:', API_SYNC_CONFIG.url);
    console.log('─'.repeat(80));
    console.log('⚠️  MESSAGE D\'ERREUR:');
    console.log(error.message);
    console.log('─'.repeat(80));
    console.log('📚 STACK TRACE:');
    console.log(error.stack);
    console.log('═'.repeat(80));
    console.log('💡 La commande reste en attente de synchronisation');
    console.log('═'.repeat(80));
    console.log('\n\n');

    return { status: 'error', error: error.message };
  }
}

/**
 * Utilitaire pour faire une requête HTTPS
 * @param {string} url - URL complète
 * @param {object} data - Données à envoyer (sera converti en JSON)
 * @param {string} method - Méthode HTTP (GET, POST, etc.) - par défaut POST
 * @param {object} customHeaders - Headers personnalisés supplémentaires
 * @param {string} authToken - Token d'authentification (optionnel)
 */
function makeHttpsRequest(url, data, method = 'POST', customHeaders = {}, authToken = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders
    };

    // Ajouter le token d'authentification si fourni
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Préparer les données pour POST/PUT/PATCH
    let postData = null;
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      postData = JSON.stringify(data);
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        console.log(`[HTTP] ${method} ${url} - Status: ${res.statusCode}`);
        console.log(`[HTTP] Réponse brute:`, responseData);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (e) {
            console.warn('[HTTP] Réponse non-JSON, retour du texte brut');
            resolve(responseData);
          }
        } else {
          console.error(`[HTTP] ❌ Erreur HTTP ${res.statusCode}:`, responseData);
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('[HTTP] ❌ Erreur réseau:', error.message);
      reject(error);
    });

    // Écrire le body seulement si on a des données
    if (postData) {
      req.write(postData);
    }
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

/**
 * Charger la configuration machine depuis la base de données
 */
async function loadMachineConfig() {
  if (!photoSystemReady || !photoSystem?.db) {
    console.log('[Config] PhotoSystem non disponible - Utilisation du .env');
    return;
  }

  try {
    const config = await photoSystem.db.getMachineConfig();

    if (config) {
      // Charger la config depuis la DB
      API_SYNC_CONFIG.kioskId = config.kiosk_id;
      API_SYNC_CONFIG.salesPointId = config.sales_point_id;

      console.log('[Config] ✅ Configuration chargée depuis la DB:', {
        kioskId: config.kiosk_id,
        salesPointId: config.sales_point_id,
        machineName: config.machine_name || 'Non défini'
      });
    } else {
      console.log('[Config] ⚠️  Aucune configuration trouvée - Utilisation du .env (fallback)');
      // Utiliser les valeurs du .env comme fallback
    }
  } catch (error) {
    console.error('[Config] ❌ Erreur chargement config:', error);
    console.log('[Config] Utilisation du .env comme fallback');
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

/**
 * ===== HANDLERS IPC CONFIGURATION MACHINE =====
 */
ipcMain.handle('machine:get-config', async (event) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    const config = await photoSystem.db.getMachineConfig();
    return { status: 'success', config };
  } catch (error) {
    console.error('[IPC] Erreur récupération config machine:', error);
    return { status: 'error', error: error.message };
  }
});

ipcMain.handle('machine:is-setup-completed', async (event) => {
  console.log('[IPC] machine:is-setup-completed appelé, photoSystemReady:', photoSystemReady);

  if (!photoSystemReady || !photoSystem?.db) {
    console.warn('[IPC] PhotoSystem pas encore prêt, retour completed=false');
    return { status: 'error', error: 'PhotoSystem non disponible', completed: false };
  }
  try {
    const completed = await photoSystem.db.isSetupCompleted();
    console.log('[IPC] machine:is-setup-completed - completed:', completed);
    return { status: 'success', completed };
  } catch (error) {
    console.error('[IPC] Erreur vérification setup:', error);
    return { status: 'error', error: error.message, completed: false };
  }
});

ipcMain.handle('machine:save-config', async (event, kioskId, salesPointId, machineName) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.saveMachineConfig(kioskId, salesPointId, machineName);

    // Mettre à jour la configuration globale
    API_SYNC_CONFIG.kioskId = kioskId;
    API_SYNC_CONFIG.salesPointId = salesPointId;

    console.log('[IPC] ✅ Configuration machine enregistrée:', { kioskId, salesPointId, machineName });
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur sauvegarde config machine:', error);
    return { status: 'error', error: error.message };
  }
});

/**
 * ===== HANDLERS IPC PRODUITS =====
 */
ipcMain.handle('products:fetch', async (event) => {
  console.log('[IPC] products:fetch appelé');
  return await fetchProductsFromAPI();
});

console.log('[Main] Tous les handlers IPC sont enregistrés');



// Handler dupliqué supprimé - utiliser uniquement 'admin:dashboard' (ligne 288-301)