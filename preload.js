/**
 * preload.js - Préload script Electron (sécurisé)
 * Expose les IPC channels de manière sécurisée au renderer
 * 
 * IMPORTANT: Ne pas utiliser d'import statements ici, utiliser require
 */

const { contextBridge, ipcRenderer } = require('electron');

// DEBUT HEXAPAY TOOLS
console.log('[Preload] Loading Hexapay API...');
try {
  contextBridge.exposeInMainWorld('hexapay', {
    checkReady: async () => {
      console.log('[Preload] checkReady called');
      return await ipcRenderer.invoke('hexapay:check-ready');
    },
    checkLicense: async () => {
      console.log('[Preload] checkLicense called');
      return await ipcRenderer.invoke('hexapay:check-license');
    },
    initiatePayment: async (amount) => {
      console.log('[Preload] initiatePayment called with', amount);
      return await ipcRenderer.invoke('hexapay:initiate-payment', amount);
    },
    confirmPayment: async (amount) => {
      console.log('[Preload] confirmPayment called with', amount);
      return await ipcRenderer.invoke('hexapay:confirm-payment', amount);
    },
    cancelPayment: async () => {
      console.log('[Preload] cancelPayment called');
      return await ipcRenderer.invoke('hexapay:cancel-payment');
    }
  });

  console.log('[Preload] Hexapay API exposed successfully');
} catch (err) {
  console.error('[Preload] Error exposing API:', err);
}
// FIN HEXAPAY TOOLS

// API sécurisée exposée au renderer
const photoAPI = {
  // Photos
  scanQR: (qrContent) => ipcRenderer.invoke('photos:scan-qr', qrContent),
  parseQR: (qrContent) => ipcRenderer.invoke('photos:parse-qr', qrContent),
  getPhotos: (participantId) => ipcRenderer.invoke('photos:get-photos', participantId),
  getProgress: (participantId) => ipcRenderer.invoke('photos:get-progress', participantId),
  selectForPrinting: (participantId, photoIds) =>
    ipcRenderer.invoke('photos:select-for-printing', participantId, photoIds),
  confirmPurchase: (photoIds) => ipcRenderer.invoke('photos:confirm-purchase', photoIds),
  getHistory: (limit = 20) => ipcRenderer.invoke('photos:get-history', limit),
  getSystemStatus: () => ipcRenderer.invoke('photos:system-status'),

  // Admin
  admin: {
    getDashboard: () => ipcRenderer.invoke('admin:dashboard'),
    searchPhotos: (filters) => ipcRenderer.invoke('admin:search-photos', filters),
    getParticipantPhotos: (participantId) =>
      ipcRenderer.invoke('admin:participant-photos', participantId),
    forceResync: (participantId) => ipcRenderer.invoke('admin:force-resync', participantId),
    deleteErrorPhotos: (participantId) =>
      ipcRenderer.invoke('admin:delete-errors', participantId),
    clearCache: (participantId) => ipcRenderer.invoke('admin:clear-cache', participantId),
    deleteParticipant: (participantId) =>
      ipcRenderer.invoke('admin:delete-participant', participantId),
    getDiskUsage: () => ipcRenderer.invoke('admin:disk-usage'),
    freeUpSpace: (minSpaceGB) => ipcRenderer.invoke('admin:free-space', minSpaceGB),
    generateReport: () => ipcRenderer.invoke('admin:generate-report'),
    exportParticipant: (participantId) =>
      ipcRenderer.invoke('admin:export-participant', participantId),
    getPurchaseReport: () => ipcRenderer.invoke('admin:purchase-report'),
    // Purge photos
    countPhotosToPurge: (startDate, endDate) => ipcRenderer.invoke('admin:count-photos-to-purge', { startDate, endDate }),
    purgePhotos: (startDate, endDate) => ipcRenderer.invoke('admin:purge-photos', { startDate, endDate }),
    // Retry photos (stratégie 4 phases)
    forceRetryPhoto: (photoId) => ipcRenderer.invoke('admin:force-retry-photo', photoId),
    forceRetryAll: () => ipcRenderer.invoke('admin:force-retry-all'),
    getFailedPhotos: () => ipcRenderer.invoke('admin:get-failed-photos'),
    // Configuration machine
    getMachineConfig: () => ipcRenderer.invoke('admin:get-machine-config'),
    updateDefaultLang: (lang) => ipcRenderer.invoke('admin:update-default-lang', lang),
    // Variante écran d'accueil (legacy)
    updateHomeVariant: (variant) => ipcRenderer.invoke('admin:update-home-variant', variant),
    getHomeVariants: () => ipcRenderer.invoke('admin:get-home-variants'),
    getHomeVisuals: () => ipcRenderer.invoke('admin:get-home-visuals'),
    // Univers écran d'accueil
    getHomeUniverses: () => ipcRenderer.invoke('admin:get-home-universes'),
    updateHomeUniverse: (universeKey, enabled) => ipcRenderer.invoke('admin:update-home-universe', { universeKey, enabled }),
    // Messages de remerciement
    getThanksMessages: () => ipcRenderer.invoke('admin:get-thanks-messages'),
    getThanksMessage: (lang) => ipcRenderer.invoke('admin:get-thanks-message', lang),
    updateThanksMessage: (lang, title, subtitle) => ipcRenderer.invoke('admin:update-thanks-message', { lang, title, subtitle }),
    deleteThanksMessage: (lang) => ipcRenderer.invoke('admin:delete-thanks-message', lang),
  },

  // Payment
  payment: {
    initiate: (amount) => ipcRenderer.invoke('payment:initiate', amount),
    confirm: (paymentId) => ipcRenderer.invoke('payment:confirm', paymentId),
  },

  // Orders (Commandes)
  orders: {
    create: (orderData) => ipcRenderer.invoke('order:create', orderData),
    addItem: (itemData) => ipcRenderer.invoke('order:add-item', itemData),
    updateStatus: (orderId, status, notes) => ipcRenderer.invoke('order:update-status', orderId, status, notes),
    updateItemStatus: (itemId, status) => ipcRenderer.invoke('order:update-item-status', itemId, status),
    updateDetails: (orderId, details) => ipcRenderer.invoke('order:update-details', orderId, details),
    getWithItems: (orderId) => ipcRenderer.invoke('order:get-with-items', orderId),
    getByParticipant: (participantId) => ipcRenderer.invoke('order:get-by-participant', participantId),
    getByStatus: (status) => ipcRenderer.invoke('order:get-by-status', status),
    getStatusHistory: (orderId) => ipcRenderer.invoke('order:get-status-history', orderId),
    getStats: (startDate, endDate) => ipcRenderer.invoke('order:get-stats', startDate, endDate),
    getTopProducts: (limit) => ipcRenderer.invoke('order:get-top-products', limit),
    cancel: (orderId, reason) => ipcRenderer.invoke('order:cancel', orderId, reason),
    search: (searchTerm) => ipcRenderer.invoke('order:search', searchTerm),
    delete: (orderId) => ipcRenderer.invoke('order:delete', orderId),
    syncRemote: (orderId, supabaseOrderId = null) => ipcRenderer.invoke('order:sync-remote', orderId, supabaseOrderId),
    createRemote: (orderData) => ipcRenderer.invoke('order:create-remote', orderData),
    updateRemote: (supabaseOrderId, email, localOrderId, optin) => ipcRenderer.invoke('order:update-remote', supabaseOrderId, email, localOrderId, optin),
    createCompletedRemote: (localOrderId) => ipcRenderer.invoke('order:create-completed-remote', localOrderId),
    cancelRemote: (supabaseOrderId, lastStep = null) => ipcRenderer.invoke('order:cancel-remote', supabaseOrderId, lastStep),
  },

  // Cart (Panier temps réel)
  cart: {
    addItemImmediate: (itemData) => ipcRenderer.invoke('cart:add-item-immediate', itemData),
    cancelItem: (itemId, quantityToCancel = 1) => ipcRenderer.invoke('cart:cancel-item', itemId, quantityToCancel),
    reactivateItem: (photoId, productId, sessionId) => ipcRenderer.invoke('cart:reactivate-item', photoId, productId, sessionId),
    getSessionItems: (sessionId) => ipcRenderer.invoke('cart:get-session-items', sessionId),
    getAllSessionItems: (sessionId) => ipcRenderer.invoke('cart:get-all-session-items', sessionId),
    getActiveSessionItems: (sessionId) => ipcRenderer.invoke('cart:get-active-session-items', sessionId),
    getSessionStats: (sessionId) => ipcRenderer.invoke('cart:get-session-stats', sessionId),
    validateSession: (sessionId, orderId) => ipcRenderer.invoke('cart:validate-session', sessionId, orderId),
    cancelSession: (sessionId, orderId) => ipcRenderer.invoke('cart:cancel-session', sessionId, orderId),
    updateQuantity: (itemId, quantity, totalPrice) => ipcRenderer.invoke('cart:update-quantity', itemId, quantity, totalPrice),
    linkSessionItems: (sessionId, orderId) => ipcRenderer.invoke('cart:link-session-items', sessionId, orderId),
  },

  // Payment Logs
  paymentLogs: {
    create: (logData) => ipcRenderer.invoke('payment-log:create', logData),
    update: (logId, updateData) => ipcRenderer.invoke('payment-log:update', logId, updateData),
    get: (logId) => ipcRenderer.invoke('payment-log:get', logId),
    getByOrder: (orderId) => ipcRenderer.invoke('payment-log:get-by-order', orderId),
    getAll: (limit, offset) => ipcRenderer.invoke('payment-log:get-all', limit, offset),
    getStats: () => ipcRenderer.invoke('payment-log:get-stats'),
    syncRemote: (logId) => ipcRenderer.invoke('payment-log:sync-remote', logId),
  },

  // Machine Configuration
  machine: {
    getConfig: () => ipcRenderer.invoke('machine:get-config'),
    isSetupCompleted: () => ipcRenderer.invoke('machine:is-setup-completed'),
    saveConfig: (kioskId, salesPointId, machineName, tva) => ipcRenderer.invoke('machine:save-config', kioskId, salesPointId, machineName, tva),
    fetchKiosk: (kioskId) => ipcRenderer.invoke('machine:fetch-kiosk', kioskId),
  },

  // Products
  products: {
    fetch: () => ipcRenderer.invoke('products:fetch'),
  },

  // Participants
  participants: {
    addOrUpdate: (participantId, universeId, status) => ipcRenderer.invoke('participant:add-or-update', participantId, universeId, status),
    syncRemote: (participantId, universeId) => ipcRenderer.invoke('participant:sync-remote', { participantId, universeId }),
  },

  // Scan Stories
  scanStory: {
    syncRemote: (participantId, universeId, createdAt, timezone, timezoneOffset) => ipcRenderer.invoke('scan-story:sync-remote', { participantId, universeId, createdAt, timezone, timezoneOffset }),
  },

  // Network
  network: {
    checkConnection: () => ipcRenderer.invoke('network:check-connection'),
  },

  // Window controls
  window: {
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  },

  // Simulator
  simulator: {
    runHexapay: () => ipcRenderer.invoke('simulator:run-hexapay'),
    stopHexapay: () => ipcRenderer.invoke('simulator:stop-hexapay'),
    isRunning: () => ipcRenderer.invoke('simulator:is-running'),
  },

  // Logger - Système de logging centralisé
  logger: {
    // Log générique
    log: (level, category, message, data) =>
      ipcRenderer.invoke('logger:log', { level, category, message, data }),

    // Raccourcis par niveau
    info: (category, message, data) =>
      ipcRenderer.invoke('logger:log', { level: 'info', category, message, data }),
    warn: (category, message, data) =>
      ipcRenderer.invoke('logger:log', { level: 'warn', category, message, data }),
    error: (category, message, data) =>
      ipcRenderer.invoke('logger:log', { level: 'error', category, message, data }),
    debug: (category, message, data) =>
      ipcRenderer.invoke('logger:log', { level: 'debug', category, message, data }),

    // Logs spécifiques
    pageChange: (fromPage, toPage, data) =>
      ipcRenderer.invoke('logger:page-change', { fromPage, toPage, data }),
    qrScan: (scanData) =>
      ipcRenderer.invoke('logger:qr-scan', scanData),
    qrScanInvalid: (rawData, reason) =>
      ipcRenderer.invoke('logger:qr-scan-invalid', { rawData, reason }),
    cartAdd: (photoId, productId, productName, quantity, price) =>
      ipcRenderer.invoke('logger:cart-add', { photoId, productId, productName, quantity, price }),
    cartRemove: (photoId, productId) =>
      ipcRenderer.invoke('logger:cart-remove', { photoId, productId }),
    cartClear: (reason) =>
      ipcRenderer.invoke('logger:cart-clear', reason),
    orderCreate: (orderId, items, total) =>
      ipcRenderer.invoke('logger:order-create', { orderId, items, total }),
    orderComplete: (orderId, supabaseId) =>
      ipcRenderer.invoke('logger:order-complete', { orderId, supabaseId }),
    orderCancel: (orderId, reason) =>
      ipcRenderer.invoke('logger:order-cancel', { orderId, reason }),
    hexapayStart: (amount, orderId) =>
      ipcRenderer.invoke('logger:hexapay-start', { amount, orderId }),
    hexapaySuccess: (amount, orderId, transactionId) =>
      ipcRenderer.invoke('logger:hexapay-success', { amount, orderId, transactionId }),
    hexapayFailure: (amount, orderId, error) =>
      ipcRenderer.invoke('logger:hexapay-failure', { amount, orderId, error }),
    hexapayCancel: (amount, orderId) =>
      ipcRenderer.invoke('logger:hexapay-cancel', { amount, orderId }),
    adminAccess: (action) =>
      ipcRenderer.invoke('logger:admin-access', action),
    event: (category, eventName, data) =>
      ipcRenderer.invoke('logger:event', { category, eventName, data }),

    // Utilitaires
    getLogPath: () => ipcRenderer.invoke('logger:get-log-path'),
  },

  // App controls (dev tools toggle + quit)
  app: {
    toggleDevMenu: () => ipcRenderer.invoke('app:toggle-dev-menu'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },

  // Listeners
  onPhotoProgress: (callback) => ipcRenderer.on('photos:progress', (event, data) => callback(data)),
  onPhotoComplete: (callback) => ipcRenderer.on('photos:complete', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('app:error', (event, error) => callback(error)),
};

// Exposer à window
contextBridge.exposeInMainWorld('photoAPI', photoAPI);

// Configuration de l'application (avec valeurs par défaut)
// Ces valeurs peuvent être récupérées depuis le processus main
const defaultConfig = {
  // Timeout d'inactivité global pour le kiosk (60s par défaut)
  inactivityTimeout: 60000,
  // Timeout d'inactivité pour l'admin (20s par défaut)
  adminInactivityTimeout: 20000,
  version: null,
};

// Cache pour la config chargée
let loadedConfig = null;

// Exposer l'API de configuration
contextBridge.exposeInMainWorld('appConfig', {
  // Valeurs par défaut accessibles immédiatement
  inactivityTimeout: defaultConfig.inactivityTimeout,
  adminInactivityTimeout: defaultConfig.adminInactivityTimeout,

  // Fonction pour récupérer la config complète (avec version)
  getConfig: async () => {
    if (loadedConfig) return loadedConfig;
    try {
      const config = await ipcRenderer.invoke('app:get-config');
      loadedConfig = { ...defaultConfig, ...config };
      console.log('[Preload] Config chargée:', loadedConfig);
      return loadedConfig;
    } catch (err) {
      console.warn('[Preload] Config non disponible, utilisation des valeurs par défaut');
      return defaultConfig;
    }
  }
});