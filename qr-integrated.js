/**
 * preload.js - Préload script Electron (sécurisé)
 * Expose les IPC channels de manière sécurisée au renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

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

  // Listeners
  onPhotoProgress: (callback) => ipcRenderer.on('photos:progress', (event, data) => callback(data)),
  onPhotoComplete: (callback) => ipcRenderer.on('photos:complete', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('app:error', (event, error) => callback(error)),
};

// Exposer à window
contextBridge.exposeInMainWorld('photoAPI', photoAPI);

export { photoAPI };