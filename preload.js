/**
 * preload.js - Préload script Electron (sécurisé)
 * Expose les IPC channels de manière sécurisée au renderer
 * 
 * IMPORTANT: Ne pas utiliser d'import statements ici, utiliser require
 */

const { contextBridge, ipcRenderer } = require('electron');

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
    getWithItems: (orderId) => ipcRenderer.invoke('order:get-with-items', orderId),
    getByParticipant: (participantId) => ipcRenderer.invoke('order:get-by-participant', participantId),
    getByStatus: (status) => ipcRenderer.invoke('order:get-by-status', status),
    getStatusHistory: (orderId) => ipcRenderer.invoke('order:get-status-history', orderId),
    getStats: (startDate, endDate) => ipcRenderer.invoke('order:get-stats', startDate, endDate),
    getTopProducts: (limit) => ipcRenderer.invoke('order:get-top-products', limit),
    cancel: (orderId, reason) => ipcRenderer.invoke('order:cancel', orderId, reason),
    search: (searchTerm) => ipcRenderer.invoke('order:search', searchTerm),
    delete: (orderId) => ipcRenderer.invoke('order:delete', orderId),
    syncRemote: (orderId) => ipcRenderer.invoke('order:sync-remote', orderId),
  },

  // Cart (Panier temps réel)
  cart: {
    addItemImmediate: (itemData) => ipcRenderer.invoke('cart:add-item-immediate', itemData),
    cancelItem: (itemId) => ipcRenderer.invoke('cart:cancel-item', itemId),
    reactivateItem: (photoId, productId, sessionId) => ipcRenderer.invoke('cart:reactivate-item', photoId, productId, sessionId),
    getSessionItems: (sessionId) => ipcRenderer.invoke('cart:get-session-items', sessionId),
    getAllSessionItems: (sessionId) => ipcRenderer.invoke('cart:get-all-session-items', sessionId),
    getActiveSessionItems: (sessionId) => ipcRenderer.invoke('cart:get-active-session-items', sessionId),
    getSessionStats: (sessionId) => ipcRenderer.invoke('cart:get-session-stats', sessionId),
    validateSession: (sessionId, orderId) => ipcRenderer.invoke('cart:validate-session', sessionId, orderId),
    cancelSession: (sessionId, orderId) => ipcRenderer.invoke('cart:cancel-session', sessionId, orderId),
    updateQuantity: (itemId, quantity, totalPrice) => ipcRenderer.invoke('cart:update-quantity', itemId, quantity, totalPrice),
  },

  // Machine Configuration
  machine: {
    getConfig: () => ipcRenderer.invoke('machine:get-config'),
    isSetupCompleted: () => ipcRenderer.invoke('machine:is-setup-completed'),
    saveConfig: (kioskId, salesPointId, machineName) => ipcRenderer.invoke('machine:save-config', kioskId, salesPointId, machineName),
  },

  // Listeners
  onPhotoProgress: (callback) => ipcRenderer.on('photos:progress', (event, data) => callback(data)),
  onPhotoComplete: (callback) => ipcRenderer.on('photos:complete', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('app:error', (event, error) => callback(error)),
};

// Exposer à window
contextBridge.exposeInMainWorld('photoAPI', photoAPI);