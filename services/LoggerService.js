/**
 * LoggerService.js - Système de logging ultra complet
 *
 * Enregistre tous les événements de l'application dans un fichier log
 * Dossier: C:\PrintStationApp (Windows) ou ~/PrintStationApp (Linux/Mac)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

class LoggerService {
  constructor() {
    this.logDir = null;
    this.logFile = null;
    this.appVersion = null;
    this.sessionId = null;
    this.initialized = false;
    this.currentLogDate = null; // Date du fichier log actuel
  }

  /**
   * Initialise le service de logging
   */
  init(appVersion) {
    if (this.initialized) return;

    this.appVersion = appVersion || 'unknown';
    this.sessionId = this.generateSessionId();

    // Déterminer le dossier de log selon l'OS
    if (process.platform === 'win32') {
      this.logDir = 'C:\\PrintStationApp';
    } else {
      this.logDir = path.join(os.homedir(), 'PrintStationApp');
    }

    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Créer le nom du fichier log avec la date du jour
    this.updateLogFile();

    this.initialized = true;

    // Log initial
    this.logAppStart();
  }

  /**
   * Met à jour le fichier log si la date a changé
   */
  updateLogFile() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Si la date a changé, créer un nouveau fichier log
    if (this.currentLogDate !== today) {
      const previousDate = this.currentLogDate;
      this.currentLogDate = today;
      this.logFile = path.join(this.logDir, `eclipso_${today}.log`);

      // Si ce n'est pas la première initialisation, logger le changement de jour
      if (previousDate) {
        this.write('INFO', 'APP', '═══════════════════════════════════════════════════════════════');
        this.write('INFO', 'APP', `NOUVEAU JOUR - Rotation du fichier log`);
        this.write('INFO', 'APP', `Ancien fichier: eclipso_${previousDate}.log`);
        this.write('INFO', 'APP', `Nouveau fichier: eclipso_${today}.log`);
        this.write('INFO', 'APP', '═══════════════════════════════════════════════════════════════');
      }
    }
  }

  /**
   * Génère un ID de session unique
   */
  generateSessionId() {
    return `SESSION_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  /**
   * Formate la date/heure actuelle
   */
  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Écrit une ligne dans le fichier log
   */
  write(level, category, message, data = null) {
    if (!this.initialized) return;

    // Vérifier si on doit changer de fichier log (nouveau jour)
    this.updateLogFile();

    const timestamp = this.getTimestamp();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      sessionId: this.sessionId,
      ...(data && { data })
    };

    // Format lisible pour le fichier
    let logLine = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${category.padEnd(15)}] ${message}`;
    if (data) {
      logLine += ` | ${JSON.stringify(data)}`;
    }
    logLine += '\n';

    // Écriture asynchrone dans le fichier
    fs.appendFile(this.logFile, logLine, (err) => {
      if (err) {
        console.error('[LoggerService] Erreur écriture log:', err.message);
      }
    });

    // Aussi afficher dans la console
    console.log(`[LOG] ${logLine.trim()}`);
  }

  // ============================================
  // MÉTHODES DE LOG PAR NIVEAU
  // ============================================

  info(category, message, data = null) {
    this.write('INFO', category, message, data);
  }

  warn(category, message, data = null) {
    this.write('WARN', category, message, data);
  }

  error(category, message, data = null) {
    this.write('ERROR', category, message, data);
  }

  debug(category, message, data = null) {
    this.write('DEBUG', category, message, data);
  }

  // ============================================
  // ÉVÉNEMENTS SPÉCIFIQUES
  // ============================================

  /**
   * Log du démarrage de l'application
   */
  logAppStart() {
    this.write('INFO', 'APP', '═══════════════════════════════════════════════════════════════');
    this.write('INFO', 'APP', `DÉMARRAGE DE L'APPLICATION ECLIPSO v${this.appVersion}`);
    this.write('INFO', 'APP', '═══════════════════════════════════════════════════════════════');
    this.write('INFO', 'APP', 'Session démarrée', {
      sessionId: this.sessionId,
      version: this.appVersion,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      logFile: this.logFile
    });
  }

  /**
   * Log de la fermeture de l'application
   */
  logAppClose(reason = 'normal') {
    this.write('INFO', 'APP', '───────────────────────────────────────────────────────────────');
    this.write('INFO', 'APP', `FERMETURE DE L'APPLICATION`, { reason });
    this.write('INFO', 'APP', '═══════════════════════════════════════════════════════════════\n');
  }

  /**
   * Log d'un scan QR
   */
  logQRScan(scanData) {
    this.write('INFO', 'QR_SCAN', 'Scan QR effectué', scanData);
  }

  /**
   * Log d'un scan QR invalide
   */
  logQRScanInvalid(rawData, reason) {
    this.write('WARN', 'QR_SCAN', 'Scan QR invalide', { rawData, reason });
  }

  /**
   * Log de changement de page
   */
  logPageChange(fromPage, toPage, data = null) {
    this.write('INFO', 'NAVIGATION', `Navigation: ${fromPage || 'init'} → ${toPage}`, data);
  }

  /**
   * Log de paiement Hexapay
   */
  logHexapayStart(amount, orderId) {
    this.write('INFO', 'HEXAPAY', 'Démarrage paiement Hexapay', { amount, orderId });
  }

  logHexapaySuccess(amount, orderId, transactionId) {
    this.write('INFO', 'HEXAPAY', 'Paiement Hexapay RÉUSSI', { amount, orderId, transactionId });
  }

  logHexapayFailure(amount, orderId, error) {
    this.write('ERROR', 'HEXAPAY', 'Paiement Hexapay ÉCHOUÉ', { amount, orderId, error });
  }

  logHexapayCancel(amount, orderId) {
    this.write('WARN', 'HEXAPAY', 'Paiement Hexapay ANNULÉ', { amount, orderId });
  }

  /**
   * Log de téléchargement de photo
   */
  logPhotoDownloadStart(photoId, url) {
    this.write('DEBUG', 'PHOTO_DL', `Début téléchargement photo ${photoId}`, { url });
  }

  logPhotoDownloadSuccess(photoId, filePath, size) {
    this.write('INFO', 'PHOTO_DL', `Photo téléchargée: ${photoId}`, { filePath, size });
  }

  logPhotoDownloadError(photoId, error) {
    this.write('ERROR', 'PHOTO_DL', `Erreur téléchargement photo ${photoId}`, { error });
  }

  /**
   * Log de synchronisation photos (batch)
   */
  logPhotoSyncStart(universeId, count) {
    this.write('INFO', 'PHOTO_SYNC', `Début sync photos univers ${universeId}`, { count });
  }

  logPhotoSyncComplete(universeId, downloaded, errors) {
    this.write('INFO', 'PHOTO_SYNC', `Sync terminée univers ${universeId}`, { downloaded, errors });
  }

  /**
   * Log d'ajout au panier
   */
  logCartAdd(photoId, productId, productName, quantity, price) {
    this.write('INFO', 'CART', 'Produit ajouté au panier', { photoId, productId, productName, quantity, price });
  }

  /**
   * Log de retrait du panier
   */
  logCartRemove(photoId, productId) {
    this.write('INFO', 'CART', 'Produit retiré du panier', { photoId, productId });
  }

  /**
   * Log de vidage du panier
   */
  logCartClear(reason) {
    this.write('INFO', 'CART', 'Panier vidé', { reason });
  }

  /**
   * Log de création de commande
   */
  logOrderCreate(orderId, items, total) {
    this.write('INFO', 'ORDER', 'Commande créée', { orderId, itemCount: items, total });
  }

  /**
   * Log de commande complétée
   */
  logOrderComplete(orderId, supabaseId) {
    this.write('INFO', 'ORDER', 'Commande complétée', { orderId, supabaseId });
  }

  /**
   * Log d'annulation de commande
   */
  logOrderCancel(orderId, reason) {
    this.write('WARN', 'ORDER', 'Commande annulée', { orderId, reason });
  }

  /**
   * Log d'accès à la page admin
   */
  logAdminAccess(action) {
    this.write('INFO', 'ADMIN', `Accès admin: ${action}`);
  }

  /**
   * Log de synchronisation Supabase
   */
  logSupabaseSync(action, data) {
    this.write('INFO', 'SUPABASE', action, data);
  }

  logSupabaseError(action, error) {
    this.write('ERROR', 'SUPABASE', `Erreur Supabase: ${action}`, { error });
  }

  /**
   * Log d'impression
   */
  logPrintStart(orderId, photoId, productId) {
    this.write('INFO', 'PRINT', 'Démarrage impression', { orderId, photoId, productId });
  }

  logPrintSuccess(orderId, photoId) {
    this.write('INFO', 'PRINT', 'Impression réussie', { orderId, photoId });
  }

  logPrintError(orderId, photoId, error) {
    this.write('ERROR', 'PRINT', 'Erreur impression', { orderId, photoId, error });
  }

  /**
   * Log d'erreur générale
   */
  logError(category, message, error) {
    this.write('ERROR', category, message, {
      error: error?.message || error,
      stack: error?.stack
    });
  }

  /**
   * Log de configuration
   */
  logConfig(config) {
    this.write('INFO', 'CONFIG', 'Configuration chargée', config);
  }

  /**
   * Log de connexion/déconnexion réseau
   */
  logNetworkStatus(online) {
    this.write('INFO', 'NETWORK', online ? 'Connexion réseau établie' : 'Connexion réseau perdue');
  }

  /**
   * Log d'événement personnalisé
   */
  logEvent(category, event, data = null) {
    this.write('INFO', category, event, data);
  }

  /**
   * Retourne le chemin du fichier log actuel
   */
  getLogFilePath() {
    return this.logFile;
  }

  /**
   * Retourne le dossier des logs
   */
  getLogDir() {
    return this.logDir;
  }
}

// Instance singleton
const logger = new LoggerService();

export default logger;
