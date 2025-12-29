import { app, BrowserWindow, ipcMain, Menu, protocol, globalShortcut } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import https from 'https';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// SYSTÈME DE LOGGING CENTRALISÉ
// ============================================
import logger from './services/LoggerService.js';

// Récupérer la version depuis package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const APP_VERSION = packageJson.version;

// Initialiser le logger avec la version de l'app
logger.init(APP_VERSION);

// Log immédiat au lancement de l'application
console.log(`[${new Date().toISOString()}] 🚀 PrintStation démarrage - Version: ${app.getVersion()} - Env: ${app.isPackaged ? 'production' : 'development'}`);

// DEBUT HEXAPAY TOOLS
import dgram from 'dgram';
import os from 'os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
const HEXAPAY_CONFIG = {
  host: 'localhost',
  serverPort: 50001,
  clientPort: 50000
};
// Chemin vers hexapay.exe (configurable via .env)
const HEXAPAY_EXE_PATH = process.env.HEXAPAY_EXE_PATH || 'C:\\Hexapay\\hexapay.exe';
// Timeouts optimisés pour production (en ms)
const TIMEOUTS = {
  ACK: 1000,              // ACK_TIMEOUT_VALUE = 1s
  COMMAND: 5000,          // TIMEOUT_VALUE = 5s (CBready, CBinfos)
  CANCEL: 3000,           // CANCEL_TIMEOUT_VALUE = 3s
  PAYMENT: 150000,        // 150s - timeout paiement (augmenté pour connexions lentes)
  VALIDATION: 30000,      // 30s au lieu de 20s
  PAYMENT_SLOW: 180000,   // 180s - mode lent pour cartes/connexions très lentes
  VALIDATION_SLOW: 45000  // Mode "slow" pour validation
};
const LOG_FILE_PATH = app.isPackaged
  ? path.join(os.homedir(), 'Desktop', 'hexapay.log')
  : path.join(__dirname, 'hexapay.log');
const TRANSACTION_LOG_PATH = LOG_FILE_PATH.replace('.log', '-transactions.log');
const QRSCAN_LOG_PATH = app.isPackaged
  ? path.join(os.homedir(), 'Desktop', 'qrscan.log')
  : path.join(__dirname, 'qrscan.log');
// Créer/Vider les fichiers log au démarrage
try {
  const logDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.writeFileSync(LOG_FILE_PATH, `=== HEXAPAY LOG - ${new Date().toISOString()} ===\n`, 'utf8');
  fs.writeFileSync(TRANSACTION_LOG_PATH, `=== TRANSACTIONS LOG - ${new Date().toISOString()} ===\n`, 'utf8');
  fs.writeFileSync(QRSCAN_LOG_PATH, `=== QR SCAN LOG - ${new Date().toISOString()} ===\n`, 'utf8');
  console.log(`📝 Fichiers log créés:\n   - ${LOG_FILE_PATH}\n   - ${TRANSACTION_LOG_PATH}\n   - ${QRSCAN_LOG_PATH}`);
} catch (err) {
  console.error('❌ Impossible de créer les fichiers log:', err.message);
}

const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const levelColors = {
    debug: '\x1b[36m',
    info: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m'
  };
  const reset = '\x1b[0m';
  const color = levelColors[level] || '';
  const dataStr = Object.keys(data).length > 0 ? '\n  ' + JSON.stringify(data, null, 2).split('\n').join('\n  ') : '';

  console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}${dataStr}`);
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`;

  try {
    fs.appendFileSync(LOG_FILE_PATH, logLine, 'utf8');
  } catch (err) {
    console.error('❌ Erreur écriture log:', err.message);
  }
};

// ============================================================================
// QR SCAN LOGGER - Logs des scans QR
// ============================================================================

const logQRScan = (type, rawData, parsedData = null, result = null) => {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    type,
    rawData: rawData,
    rawDataLength: rawData ? rawData.length : 0,
    rawDataHex: rawData ? Buffer.from(rawData).toString('hex') : null,
    parsedData: parsedData,
    result: result
  };

  const logLine = `[${timestamp}] [${type.toUpperCase()}] Raw: "${rawData}" | Length: ${entry.rawDataLength}\n`;
  const jsonLine = JSON.stringify(entry) + '\n';

  console.log(`\x1b[35m[${timestamp}] [QR-SCAN]\x1b[0m ${type} - Raw: "${rawData}"`);

  try {
    fs.appendFileSync(QRSCAN_LOG_PATH, logLine, 'utf8');
    fs.appendFileSync(QRSCAN_LOG_PATH, jsonLine, 'utf8');
    fs.appendFileSync(QRSCAN_LOG_PATH, '---\n', 'utf8');
  } catch (err) {
    console.error('❌ Erreur écriture QR scan log:', err.message);
  }
};

// ============================================================================
// TRANSACTION LOGGER - Logs structurés avec IDs uniques
// ============================================================================

class TransactionLogger {
  constructor(logFilePath) {
    this.logFilePath = logFilePath;
  }

  logTransaction(type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      transactionId: data.transactionId || this.generateTransactionId(),
      ...data
    };

    const line = JSON.stringify(entry) + '\n';
    
    try {
      fs.appendFileSync(this.logFilePath, line, 'utf8');
    } catch (err) {
      log('error', '❌ Could not write transaction log', { error: err.message });
    }
    
    return entry.transactionId;
  }

  generateTransactionId() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TRX-${date}-${time}-${random}`;
  }
}

const txLogger = new TransactionLogger(TRANSACTION_LOG_PATH);

// ============================================================================
// TIMEOUT TRACKER - Détection des timeouts fréquents
// ============================================================================

class TimeoutTracker {
  constructor() {
    this.timeouts = [];
    this.slowModeThreshold = 2; // 2 timeouts = mode slow
  }

  recordTimeout(command) {
    this.timeouts.push({ command, timestamp: Date.now() });
    
    if (this.timeouts.length > 10) {
      this.timeouts.shift();
    }
    
    log('warn', '⚠️ Timeout recorded', { 
      command, 
      totalTimeouts: this.timeouts.length,
      slowMode: this.shouldUseSlowMode()
    });
  }

  shouldUseSlowMode() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentTimeouts = this.timeouts.filter(t => t.timestamp > fiveMinutesAgo);
    return recentTimeouts.length >= this.slowModeThreshold;
  }

  getStats() {
    return {
      total: this.timeouts.length,
      recent: this.timeouts.filter(t => t.timestamp > Date.now() - 5 * 60 * 1000).length,
      slowMode: this.shouldUseSlowMode()
    };
  }
}

const timeoutTracker = new TimeoutTracker();

// ============================================================================
// CRASH RECOVERY - Persistence et récupération d'état
// ============================================================================

class CrashRecovery {
  constructor() {
    this.stateFile = path.join(os.homedir(), 'Desktop', 'hexapay-state.json');
  }

  saveState(state) {
    try {
      const stateWithTimestamp = {
        ...state,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(stateWithTimestamp, null, 2));
      log('debug', '💾 State saved', stateWithTimestamp);
    } catch (err) {
      log('error', '❌ Could not save state', { error: err.message });
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const content = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(content);
      }
    } catch (err) {
      log('error', '❌ Could not load state', { error: err.message });
    }
    return null;
  }

  clearState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile);
        log('debug', '🗑️ State cleared');
      }
    } catch (err) {
      log('error', '❌ Could not clear state', { error: err.message });
    }
  }

  async recover(hexapayClient) {
    const state = this.loadState();
    
    if (!state) {
      log('info', 'ℹ️ No previous state to recover');
      return;
    }

    const stateAge = Date.now() - new Date(state.savedAt).getTime();
    log('warn', '⚠️ Found previous incomplete transaction', { 
      ...state, 
      stateAgeSeconds: Math.floor(stateAge / 1000) 
    });

    if (state.paymentInProgress) {
      log('warn', '🔧 Attempting to recover payment state...');
      
      try {
        await hexapayClient.forceUnblockTPA();
        log('info', '✅ Recovery completed');
      } catch (err) {
        log('error', '❌ Could not complete recovery', { error: err.message });
      }
    }

    this.clearState();
  }
}

const recovery = new CrashRecovery();

// ============================================================================
// HEXAPAY WATCHDOG - Surveillance Hexapay.exe
// ============================================================================

class HexapayWatchdog {
  constructor() {
    this.checkInterval = 30000; // 30s
    this.isRunning = false;
    this.consecutiveFailures = 0;
    this.maxFailures = 3;
  }

  async start() {
    this.isRunning = true;
    log('info', '👁️ Watchdog started');

    // Vérifier et lancer hexapay.exe au démarrage si nécessaire
    await this.ensureHexapayRunning();

    this.check();
  }

  async ensureHexapayRunning() {
    const running = await this.isHexapayRunning();
    if (!running) {
      log('warn', '⚠️ Hexapay.exe non détecté au démarrage, tentative de lancement...');
      logger.info('HEXAPAY', 'Hexapay.exe non détecté, tentative de lancement...');
      await this.startHexapay();
    } else {
      log('info', '✅ Hexapay.exe déjà en cours d\'exécution');
      logger.info('HEXAPAY', 'Hexapay.exe déjà en cours d\'exécution');
    }
  }

  async startHexapay() {
    if (process.platform !== 'win32') {
      log('warn', '⚠️ Lancement automatique de hexapay.exe uniquement sur Windows');
      logger.warn('HEXAPAY', 'Lancement automatique uniquement sur Windows', { platform: process.platform });
      return false;
    }

    try {
      // Vérifier si le fichier existe
      if (!fs.existsSync(HEXAPAY_EXE_PATH)) {
        log('error', '❌ Hexapay.exe non trouvé', { path: HEXAPAY_EXE_PATH });
        logger.error('HEXAPAY', 'Hexapay.exe non trouvé', { path: HEXAPAY_EXE_PATH });
        return false;
      }

      log('info', '🚀 Lancement de hexapay.exe...', { path: HEXAPAY_EXE_PATH });
      logger.info('HEXAPAY', 'Lancement de hexapay.exe...', { path: HEXAPAY_EXE_PATH });

      // Lancer hexapay.exe en arrière-plan (détaché)
      const hexapayProcess = spawn(HEXAPAY_EXE_PATH, [], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(HEXAPAY_EXE_PATH)
      });

      hexapayProcess.unref();

      // Attendre un peu pour que le processus démarre
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Vérifier si le lancement a réussi
      const nowRunning = await this.isHexapayRunning();
      if (nowRunning) {
        log('info', '✅ Hexapay.exe lancé avec succès');
        logger.info('HEXAPAY', 'Hexapay.exe lancé avec succès');

        // Envoyer CBinfos pour fermer la popup de licence
        await this.sendCBInfosToCloseLicensePopup();

        return true;
      } else {
        log('error', '❌ Hexapay.exe n\'a pas pu démarrer');
        logger.error('HEXAPAY', 'Hexapay.exe n\'a pas pu démarrer');
        return false;
      }
    } catch (err) {
      log('error', '❌ Erreur lors du lancement de hexapay.exe', { error: err.message });
      logger.error('HEXAPAY', 'Erreur lors du lancement de hexapay.exe', { error: err.message });
      return false;
    }
  }

  async sendCBInfosToCloseLicensePopup() {
    try {
      log('info', '📤 Envoi de CBinfos pour fermer la popup de licence...');

      // Attendre un peu que hexapay soit prêt à recevoir des commandes
      await new Promise(resolve => setTimeout(resolve, 1000));

      const client = getHexapayClient();
      if (client && client.activated) {
        const result = await client.CBInfos();
        if (result.success) {
          log('info', '✅ CBinfos envoyé - popup licence fermée', { registered: result.registered });
        } else {
          log('warn', '⚠️ CBinfos échoué', { error: result.error });
        }
      } else {
        log('warn', '⚠️ Client Hexapay non initialisé, CBinfos sera envoyé après initialisation');
      }
    } catch (err) {
      log('warn', '⚠️ Erreur lors de l\'envoi de CBinfos', { error: err.message });
    }
  }

  async check() {
    if (!this.isRunning) return;

    const running = await this.isHexapayRunning();

    if (!running) {
      this.consecutiveFailures++;
      log('error', '❌ Hexapay.exe not running!', {
        consecutiveFailures: this.consecutiveFailures,
        maxFailures: this.maxFailures
      });

      if (this.consecutiveFailures >= this.maxFailures) {
        log('error', '🚨 CRITICAL: Hexapay.exe down for too long, tentative de redémarrage...');
        await this.startHexapay();
        this.consecutiveFailures = 0;
      }
    } else {
      if (this.consecutiveFailures > 0) {
        log('info', '✅ Hexapay.exe is running again');
      }
      this.consecutiveFailures = 0;
    }

    setTimeout(() => this.check(), this.checkInterval);
  }

  async isHexapayRunning() {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq hexapay.exe"');
        return stdout.toLowerCase().includes('hexapay.exe');
      } else {
        const { stdout } = await execAsync('ps aux | grep -i hexapay | grep -v grep');
        return stdout.trim().length > 0;
      }
    } catch (err) {
      // ps/tasklist peut retourner code 1 si pas de résultat
      return false;
    }
  }

  stop() {
    this.isRunning = false;
    log('info', '👁️ Watchdog stopped');
  }
}

const watchdog = new HexapayWatchdog();

// ============================================================================
// VALIDATION UTILS - Validation stricte des entrées
// ============================================================================

function validateAmount(amount) {
  // Vérifier que c'est un nombre
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Amount must be a valid number');
  }

  // Vérifier que c'est positif
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  // Vérifier les limites (max 999.99€)
  if (amount > 999.99) {
    throw new Error('Amount exceeds maximum (999.99€)');
  }

  // Vérifier minimum (0.01€)
  if (amount < 0.01) {
    throw new Error('Amount below minimum (0.01€)');
  }

  // Vérifier la précision (max 2 décimales)
  const cents = Math.round(amount * 100);
  const reconstructed = cents / 100;
  if (Math.abs(amount - reconstructed) > 0.001) {
    throw new Error('Amount has too many decimal places');
  }

  return reconstructed; // Retourner le montant normalisé
}

// ============================================================================
// HEXAPAY CLIENT - Version production avec tous les correctifs
// ============================================================================

class HexapayClient {
  constructor() {
    this.socket = null;
    this.activated = false;
    this.sendRxAck = false;
    this.lastMessage = '';
    this.lastResponse = '';
    
    this.paymentRequested = false;
    this.validationRequested = false;
    
    // Rate limiting
    this.lastCommandTime = 0;
    this.minCommandInterval = 500; // 500ms minimum entre commandes
    
    // Statistiques
    this.stats = {
      commandsSent: 0,
      responsesReceived: 0,
      timeouts: 0,
      errors: 0
    };
  }

  async init() {
    log('info', '🚀 Initializing HexapayClient...');
    
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      // Nettoyer la réponse: trim + supprimer les caractères nuls et autres caractères invisibles
      const response = msg.toString('utf-8').trim().replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '');
      this.lastResponse = response;
      this.stats.responsesReceived++;
      
      log('debug', '📥 UDP response received', { 
        response, 
        from: `${rinfo.address}:${rinfo.port}`,
        isAck: response.startsWith('rx'),
        stats: this.stats
      });
      
      if (response.startsWith('rx')) {
        this.socket.emit('ack-received', response);
      } else {
        this.socket.emit('data-received', response);
      }
    });

    this.socket.on('error', (err) => {
      this.stats.errors++;
      log('error', '❌ UDP socket error', { 
        message: err.message, 
        code: err.code,
        stats: this.stats
      });
      
      if (err.code === 'EADDRINUSE') {
        log('error', `🚨 Port ${HEXAPAY_CONFIG.clientPort} déjà utilisé`, {
          solution: 'Fermer les autres instances ou changer le port dans HEXAPAY_CONFIG'
        });
      }
    });

    try {
      await new Promise((resolve, reject) => {
        this.socket.bind(HEXAPAY_CONFIG.clientPort, '127.0.0.1', () => {
          log('info', '✅ UDP socket bound', { 
            port: HEXAPAY_CONFIG.clientPort,
            host: '127.0.0.1'
          });
          this.activated = true;
          resolve();
        });
        
        this.socket.on('error', reject);
        
        // Timeout si bind prend trop de temps
        setTimeout(() => reject(new Error('Bind timeout')), 5000);
      });
      
      // Tenter de débloquer le TPA au démarrage
      await this.forceUnblockTPA();
      
    } catch (err) {
      log('error', '❌ Failed to initialize socket', { error: err.message });
      this.activated = false;
      throw err;
    }
  }

  /**
   * Forcer le déblocage du TPA
   * Appelé au démarrage pour nettoyer tout état bloqué
   */
  async forceUnblockTPA() {
    log('info', '🔧 Attempting to force unblock TPA...');
    
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await this.CBCancel();
        
        if (result.success) {
          log('info', '✅ TPA unblocked successfully', { attempt: attempts + 1 });
          return true;
        }
        
        // Si timeout, c'est probablement normal (pas de paiement en cours)
        if (result.error && result.error.includes('Timeout')) {
          log('info', '✅ TPA appears clean (timeout on cancel is normal)');
          return true;
        }
        
      } catch (err) {
        log('warn', '⚠️ Unblock attempt failed', { 
          attempt: attempts + 1, 
          error: err.message 
        });
      }
      
      attempts++;
      
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    log('warn', '⚠️ Could not confirm TPA unblock, continuing anyway');
    return false;
  }

  /**
   * sendAndPoll avec rate limiting et gestion d'erreur améliorée
   */
  async sendAndPoll(message, timeoutSeconds) {
    if (!this.activated) {
      const error = new Error('HEXA_WRAPPER_NOT_READY');
      log('error', '❌ Socket not ready', { message });
      throw error;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastCommand = now - this.lastCommandTime;
    
    if (timeSinceLastCommand < this.minCommandInterval) {
      const waitTime = this.minCommandInterval - timeSinceLastCommand;
      log('debug', '⏸️ Rate limit, waiting...', { waitMs: waitTime });
      await new Promise(r => setTimeout(r, waitTime));
    }
    
    this.lastCommandTime = Date.now();
    this.stats.commandsSent++;

    return new Promise((resolve, reject) => {
      let ackReceived = false;
      let dataReceived = false;
      let ackTimer = null;
      let dataTimer = null;

      const commandParts = message.split(':');
      const baseCommand = commandParts[0];
      this.lastMessage = baseCommand;

      log('info', '📡 Sending command', {
        command: message,
        baseCommand,
        timeout: `${timeoutSeconds}s`,
        expectAck: this.sendRxAck,
        stats: this.stats
      });

      const ackHandler = (ack) => {
        const expectedAck = 'rx' + baseCommand;
        log('debug', '📨 ACK received', { ack, expected: expectedAck });
        
        if (ack === expectedAck) {
          ackReceived = true;
          if (ackTimer) clearTimeout(ackTimer);
          log('debug', '✅ ACK matched');
        }
      };

      const dataHandler = (data) => {
        log('debug', '📦 Data received', { data });
        
        if (data.startsWith('rx')) {
          return;
        }
        
        dataReceived = true;
        if (dataTimer) clearTimeout(dataTimer);
        
        this.socket.removeListener('ack-received', ackHandler);
        this.socket.removeListener('data-received', dataHandler);
        
        if (data === 'rxCmderr' || data === '') {
          const error = new Error('HEXA_CMD_UNKNOWN');
          log('error', '❌ Command unknown or empty response', { data });
          reject(error);
        } else {
          log('info', '✅ Command successful', { command: message, response: data });
          resolve(data);
        }
      };

      this.socket.on('ack-received', ackHandler);
      this.socket.on('data-received', dataHandler);

      if (this.sendRxAck) {
        ackTimer = setTimeout(() => {
          if (!ackReceived) {
            this.stats.errors++;
            log('error', '⏱️ ACK timeout', { 
              command: message,
              timeout: `${TIMEOUTS.ACK}ms`
            });
            this.socket.removeListener('ack-received', ackHandler);
            this.socket.removeListener('data-received', dataHandler);
            if (dataTimer) clearTimeout(dataTimer);
            reject(new Error('HEXA_NOACK'));
          }
        }, TIMEOUTS.ACK);
      }

      dataTimer = setTimeout(() => {
        if (!dataReceived) {
          this.stats.timeouts++;
          timeoutTracker.recordTimeout(baseCommand);
          log('error', '⏱️ Command timeout', { 
            command: message,
            timeout: `${timeoutSeconds}s`,
            stats: this.stats
          });
          this.socket.removeListener('ack-received', ackHandler);
          this.socket.removeListener('data-received', dataHandler);
          if (ackTimer) clearTimeout(ackTimer);
          reject(new Error('HEXA_TIMEOUT'));
        }
      }, timeoutSeconds * 1000);

      const buffer = Buffer.from(message, 'utf-8');
      this.socket.send(
        buffer, 
        0, 
        buffer.length, 
        HEXAPAY_CONFIG.serverPort, 
        HEXAPAY_CONFIG.host, 
        (err) => {
          if (err) {
            this.stats.errors++;
            log('error', '❌ Failed to send UDP packet', { 
              command: message, 
              error: err.message 
            });
            if (ackTimer) clearTimeout(ackTimer);
            if (dataTimer) clearTimeout(dataTimer);
            this.socket.removeListener('ack-received', ackHandler);
            this.socket.removeListener('data-received', dataHandler);
            reject(err);
          } else {
            log('debug', '📤 UDP packet sent', { 
              command: message,
              bytes: buffer.length 
            });
          }
        }
      );
    });
  }

  /**
   * CBReady - Vérifie si le lecteur est prêt
   */
  async CBReady() {
    log('info', '🔍 Checking if card reader is ready...');
    
    if (this.paymentRequested) {
      log('warn', '⚠️ Payment in progress, resetting flag');
      this.paymentRequested = false;
    }

    try {
      const response = await this.sendAndPoll('CBready', TIMEOUTS.COMMAND / 1000);
      
      if (response === 'CBreadyOk') {
        log('info', '✅ Card reader is ready');
        return { success: true, ready: true };
      } else if (response === 'CBreaderbusy') {
        log('warn', '⚠️ Card reader is busy');
        return { success: true, ready: false, busy: true };
      } else {
        log('error', '❌ Unknown ready response', { response });
        return { success: false, error: 'Unknown response: ' + response };
      }
    } catch (err) {
      log('error', '❌ Communication error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * CBInfos - Vérifie l'activation de la licence
   */
  async CBInfos() {
    log('info', '🔍 Checking license activation...');
    
    if (this.paymentRequested) {
      log('error', '❌ Payment in progress');
      return { success: false, error: 'Payment in progress' };
    }

    try {
      const response = await this.sendAndPoll('CBinfos', TIMEOUTS.COMMAND / 1000);
      
      if (response === 'CBregistered') {
        log('info', '✅ License is active');
        return { success: true, registered: true };
      } else if (response === 'CBnotRegistered') {
        log('warn', '⚠️ License not registered');
        return { success: true, registered: false };
      } else {
        log('error', '❌ Unknown license response', { response });
        return { success: false, error: 'Unknown response: ' + response };
      }
    } catch (err) {
      log('error', '❌ Communication error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * CBCancel - Annule un paiement en cours
   */
  async CBCancel() {
    log('info', '🚫 Cancelling payment...');
    this.paymentRequested = false;

    try {
      const response = await this.sendAndPoll('CBcancel', TIMEOUTS.CANCEL / 1000);
      
      if (response === 'CBcancelled') {
        log('info', '✅ Payment cancelled');
        return { success: true };
      } else {
        log('warn', '⚠️ Unexpected cancel response', { response });
        return { success: false, error: 'Cancel error: ' + response };
      }
    } catch (err) {
      if (err.message === 'HEXA_TIMEOUT') {
        log('debug', 'ℹ️ Cancel timeout (normal if no payment in progress)');
        return { success: true };
      }
      log('error', '❌ Cancel communication error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * readyToProceed - Vérifie que le système est prêt avec retry intelligent
   */
  async readyToProceed() {
    log('info', '🔄 Checking if system is ready to proceed...');
    
    // Vérifier d'abord que le socket est activé
    if (!this.activated) {
      log('error', '❌ Socket not initialized, cannot proceed');
      return false;
    }

    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        const readyResult = await this.CBReady();
        
        // Succès
        if (readyResult.success && readyResult.ready) {
          log('info', '✅ System ready to proceed');
          return true;
        }
        
        // TPA occupé → essayer de débloquer
        if (readyResult.busy) {
          log('warn', '⚠️ TPA busy, attempting to cancel...', { retriesLeft: retries });
          await this.CBCancel();
          lastError = 'TPA was busy';
        } 
        // Erreur socket → ne pas retry
        else if (readyResult.error && readyResult.error.includes('HEXA_WRAPPER_NOT_READY')) {
          log('error', '❌ Socket not ready, aborting retries');
          return false;
        }
        // Timeout répété → peut-être Hexapay.exe down
        else if (readyResult.error && readyResult.error.includes('HEXA_TIMEOUT')) {
          lastError = 'Communication timeout';
          log('warn', '⚠️ CBReady timeout', { 
            error: lastError, 
            retriesLeft: retries,
            hint: 'Check if Hexapay.exe is running'
          });
        }
        // Autre erreur
        else {
          lastError = readyResult.error || 'Unknown error';
          log('warn', '⚠️ CBReady failed', { error: lastError, retriesLeft: retries });
        }
        
      } catch (err) {
        lastError = err.message;
        log('error', '❌ Exception in readyToProceed', { 
          error: err.message, 
          retriesLeft: retries 
        });
      }
      
      retries--;
      
      // Attendre avant retry (sauf si socket HS)
      if (retries > 0 && !lastError.includes('HEXA_WRAPPER_NOT_READY')) {
        log('info', '⏳ Waiting 5s before retry...', { retriesLeft: retries });
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else if (lastError.includes('HEXA_WRAPPER_NOT_READY')) {
        break; // Sortir immédiatement si socket HS
      }
    }
    
    log('error', '❌ System not ready after all retries', { lastError });
    return false;
  }

  /**
   * requestPayment - Demande un paiement avec timeout adaptatif
   */
  async requestPayment(amount) {
    log('info', '💳 Requesting payment...', { amount });
    
    // Validation stricte du montant
    let validAmount;
    try {
      validAmount = validateAmount(amount);
    } catch (err) {
      log('error', '❌ Invalid amount', { amount, error: err.message });
      return { success: false, error: err.message };
    }

    // Générer ID transaction
    const txId = txLogger.logTransaction('payment_initiated', {
      amount: validAmount,
      status: 'initiated'
    });

    // Sauvegarder état (crash recovery)
    recovery.saveState({
      paymentInProgress: true,
      amount: validAmount,
      transactionId: txId
    });

    // Vérifier que le système est prêt
    const isReady = await this.readyToProceed();
    if (!isReady) {
      log('error', '❌ System not ready, payment aborted');
      txLogger.logTransaction('payment_aborted', {
        transactionId: txId,
        amount: validAmount,
        status: 'aborted',
        reason: 'System not ready'
      });
      recovery.clearState();
      return { success: false, error: 'Device not ready' };
    }

    // Formater le montant
    const amountStr = validAmount.toFixed(2).replace('.', ',');
    const command = `CBpay:${amountStr}`;
    
    // Choisir le timeout adapté
    const slowMode = timeoutTracker.shouldUseSlowMode();
    const timeout = slowMode ? TIMEOUTS.PAYMENT_SLOW : TIMEOUTS.PAYMENT;
    
    this.paymentRequested = true;
    
    try {
      log('info', '💳 Initiating payment', { 
        amount: validAmount, 
        formatted: amountStr,
        timeout: `${timeout}ms`,
        slowMode,
        transactionId: txId
      });
      
      const response = await this.sendAndPoll(command, timeout / 1000);
      
      this.paymentRequested = false;
      
      if (response === 'CBaccepted') {
        log('info', '✅ Payment accepted', { amount: amountStr, transactionId: txId });
        txLogger.logTransaction('payment_accepted', {
          transactionId: txId,
          amount: validAmount,
          status: 'accepted'
        });
        return { success: true, accepted: true, transactionId: txId };
        
      } else if (response === 'CBcancelled') {
        log('warn', '⚠️ Payment cancelled', { amount: amountStr, transactionId: txId });
        txLogger.logTransaction('payment_cancelled', {
          transactionId: txId,
          amount: validAmount,
          status: 'cancelled'
        });
        recovery.clearState();
        return { success: false, error: 'Payment cancelled or timeout' };
        
      } else if (response === 'CBrefused') {
        log('warn', '⚠️ Card refused', { amount: amountStr, transactionId: txId });
        txLogger.logTransaction('payment_refused', {
          transactionId: txId,
          amount: validAmount,
          status: 'refused'
        });
        recovery.clearState();
        return { success: false, error: 'Card refused by bank' };
        
      } else if (response === 'CBnotRegistered') {
        log('error', '❌ Terminal not registered', { amount: amountStr, transactionId: txId });
        txLogger.logTransaction('payment_error', {
          transactionId: txId,
          amount: validAmount,
          status: 'error',
          error: 'Terminal not registered'
        });
        recovery.clearState();
        setTimeout(() => this.CBInfos(), 2000);
        return { success: false, error: 'Terminal not registered' };
        
      } else {
        log('error', '❌ Unknown payment response', { response, transactionId: txId });
        txLogger.logTransaction('payment_error', {
          transactionId: txId,
          amount: validAmount,
          status: 'error',
          error: 'Unknown response: ' + response
        });
        recovery.clearState();
        return { success: false, error: 'Unknown response: ' + response };
      }
      
    } catch (err) {
      this.paymentRequested = false;
      
      if (err.message === 'HEXA_TIMEOUT') {
        log('error', '⏱️ Payment timeout', { amount: amountStr, transactionId: txId });
        txLogger.logTransaction('payment_timeout', {
          transactionId: txId,
          amount: validAmount,
          status: 'timeout'
        });
        
        // Essayer d'annuler
        await this.CBCancel();
        recovery.clearState();
        
        return { success: false, error: 'Payment timeout' };
      }
      
      log('error', '❌ Payment error', { error: err.message, transactionId: txId });
      txLogger.logTransaction('payment_error', {
        transactionId: txId,
        amount: validAmount,
        status: 'error',
        error: err.message
      });
      recovery.clearState();
      
      return { success: false, error: err.message };
    }
  }

  /**
   * requestValidation - Valide un paiement avec timeout adaptatif
   */
  async requestValidation(amount, transactionId) {
    log('info', '✔️ Requesting payment validation...', { amount, transactionId });
    
    // Validation stricte du montant
    let validAmount;
    try {
      validAmount = validateAmount(amount);
    } catch (err) {
      log('error', '❌ Invalid amount', { amount, error: err.message });
      return { success: false, error: err.message };
    }

    const amountStr = validAmount.toFixed(2).replace('.', ',');
    const command = `CBpayrec:${amountStr}`;
    
    // Choisir le timeout adapté
    const slowMode = timeoutTracker.shouldUseSlowMode();
    const timeout = slowMode ? TIMEOUTS.VALIDATION_SLOW : TIMEOUTS.VALIDATION;
    
    this.validationRequested = true;
    
    try {
      log('info', '✔️ Validating payment', { 
        amount: validAmount, 
        formatted: amountStr,
        timeout: `${timeout}ms`,
        slowMode,
        transactionId
      });
      
      const response = await this.sendAndPoll(command, timeout / 1000);
      
      this.validationRequested = false;
      
      if (response === 'CBpaydone') {
        log('info', '✅ Payment validation successful', { amount: amountStr, transactionId });
        txLogger.logTransaction('payment_validated', {
          transactionId,
          amount: validAmount,
          status: 'validated'
        });
        
        // Nettoyer l'état sauvegardé
        recovery.clearState();
        
        return { success: true, validated: true, transactionId };
        
      } else if (response === 'CBaborted') {
        log('error', '❌ Payment validation failed', { amount: amountStr, transactionId });
        txLogger.logTransaction('validation_failed', {
          transactionId,
          amount: validAmount,
          status: 'validation_failed'
        });
        recovery.clearState();
        return { success: false, error: 'Validation failed' };
        
      } else {
        log('error', '❌ Unknown validation response', { response, transactionId });
        txLogger.logTransaction('validation_error', {
          transactionId,
          amount: validAmount,
          status: 'error',
          error: 'Unknown response: ' + response
        });
        recovery.clearState();
        return { success: false, error: 'Unknown response: ' + response };
      }
      
    } catch (err) {
      this.validationRequested = false;
      
      if (err.message === 'HEXA_TIMEOUT') {
        log('error', '⏱️ Validation timeout', { amount: amountStr, transactionId });
        txLogger.logTransaction('validation_timeout', {
          transactionId,
          amount: validAmount,
          status: 'timeout'
        });
        recovery.clearState();
        return { success: false, error: 'Validation timeout' };
      }
      
      log('error', '❌ Validation error', { error: err.message, transactionId });
      txLogger.logTransaction('validation_error', {
        transactionId,
        amount: validAmount,
        status: 'error',
        error: err.message
      });
      recovery.clearState();
      
      return { success: false, error: err.message };
    }
  }

  getStats() {
    return {
      ...this.stats,
      timeoutTracker: timeoutTracker.getStats()
    };
  }

  close() {
    if (this.socket) {
      this.socket.close();
      log('info', '🔌 UDP socket closed', { stats: this.stats });
    }
    this.activated = false;
  }
}

// ============================================================================
// INSTANCE GLOBALE
// ============================================================================
let hexapayClient = null;
function getHexapayClient() {
  if (!hexapayClient) {
    hexapayClient = new HexapayClient();
  }
  return hexapayClient;
}

ipcMain.handle('hexapay:check-ready', async () => {
  log('debug', '🔌 IPC: check-ready called');
  try {
    const client = getHexapayClient();
    const result = await client.CBReady();
    return result;
  } catch (error) {
    log('error', '❌ IPC: check-ready failed', { error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hexapay:check-license', async () => {
  log('debug', '🔌 IPC: check-license called');
  try {
    const client = getHexapayClient();
    const result = await client.CBInfos();
    return result;
  } catch (error) {
    log('error', '❌ IPC: check-license failed', { error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hexapay:initiate-payment', async (event, amount) => {
  log('debug', '🔌 IPC: initiate-payment called', { amount });
  try {
    const client = getHexapayClient();
    const result = await client.requestPayment(amount);
    return result;
  } catch (error) {
    log('error', '❌ IPC: initiate-payment failed', { error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hexapay:confirm-payment', async (event, amount, transactionId) => {
  log('debug', '🔌 IPC: confirm-payment called', { amount, transactionId });
  try {
    const client = getHexapayClient();
    const result = await client.requestValidation(amount, transactionId);
    return result;
  } catch (error) {
    log('error', '❌ IPC: confirm-payment failed', { error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hexapay:cancel-payment', async () => {
  log('debug', '🔌 IPC: cancel-payment called');
  try {
    const client = getHexapayClient();
    const result = await client.CBCancel();
    return result;
  } catch (error) {
    log('error', '❌ IPC: cancel-payment failed', { error: error.message });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('hexapay:get-stats', async () => {
  log('debug', '🔌 IPC: get-stats called');
  try {
    const client = getHexapayClient();
    return { success: true, stats: client.getStats() };
  } catch (error) {
    log('error', '❌ IPC: get-stats failed', { error: error.message });
    return { success: false, error: error.message };
  }
});
// FIN HEXAPAY TOOLS

// Charger les variables d'environnement
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  // console.log('[Main] Variables d\'env chargées');
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
  tva: 20, // Taux de TVA par défaut (en %)
  enabled: process.env.ENABLE_API_SYNC !== 'false', // Activé par défaut
  retryIntervalMs: parseInt(process.env.SYNC_RETRY_INTERVAL_MS) || 60000, // 1 minute par défaut
  maxAttempts: parseInt(process.env.SYNC_MAX_ATTEMPTS) || 3, // 3 tentatives max
  machineStateSyncIntervalMs: parseInt(process.env.MACHINE_STATE_SYNC_INTERVAL_MS) || 180000 // 3 minutes par défaut
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
    // console.warn('[Main] PhotoSystem non disponible:', err.message);
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
    fullscreen: true, // Fullscreen par défaut (F10 pour toggle)
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
app.whenReady().then(async () => {
  // DEBUT HEXAPAY TOOLS
  log('info', '🚀 Electron app ready', {
    version: app.getVersion(),
    hexapayConfig: HEXAPAY_CONFIG,
    timeouts: TIMEOUTS,
    platform: process.platform,
    nodeVersion: process.version
  });

  // Enregistrer le raccourci global Ctrl+Q pour quitter l'app
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });

  try {
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
    // Initialiser le client Hexapay
    const client = getHexapayClient();
    await client.init();

    // Récupération après crash
    await recovery.recover(client);

    // Démarrer le watchdog (vérifie et lance hexapay.exe si nécessaire)
    await watchdog.start();

    // Envoyer CBinfos plusieurs fois pour fermer les popups (licence, COM port, etc.)
    const sendCBInfosToClosePopup = async (attempt) => {
      try {
        log('info', `📤 Envoi de CBinfos (tentative ${attempt}) pour fermer les popups...`);
        const result = await client.CBInfos();
        if (result.success) {
          log('info', `✅ CBinfos #${attempt} envoyé`, { registered: result.registered });
        } else {
          log('warn', `⚠️ CBinfos #${attempt} échoué`, { error: result.error });
        }
      } catch (err) {
        log('warn', `⚠️ Erreur CBinfos #${attempt}:`, { error: err.message });
      }
    };

    // Envoyer CBinfos à 3s, 6s, 10s et 15s pour attraper tous les popups
    setTimeout(() => sendCBInfosToClosePopup(1), 3000);
    setTimeout(() => sendCBInfosToClosePopup(2), 6000);
    setTimeout(() => sendCBInfosToClosePopup(3), 10000);
    setTimeout(() => sendCBInfosToClosePopup(4), 15000);

    // Créer la fenêtre
    // createWindow();

    
  } catch (err) {
    log('error', '❌ Failed to initialize application', { error: err.message });
    app.quit();
  }
  // FIN HEXAPAY TOOLS
  // console.log('[Protocol] ✓ Protocole printstation:// enregistré');
});

/**
 * ===== APP LIFECYCLE =====
 */

app.on('ready', async () => {
  // console.log('[Main] Démarrage PrintStation...');

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
        const configComplete = await loadMachineConfig();

        // Configurer le callback de sync participant APRÈS le chargement de la config
        if (photoSystem.setParticipantSyncCallback) {
          photoSystem.setParticipantSyncCallback((participantId, universeId) => {
            console.log('[Main] Callback sync participant appelé:', { participantId, universeId });
            syncParticipantToRemote(participantId, universeId)
              .then(result => {
                if (result.status === 'success') {
                  console.log(`[Main] ✅ Participant ${participantId} synchronisé vers Supabase`);
                } else {
                  console.warn(`[Main] ⚠️  Échec sync participant:`, result.error);
                }
              })
              .catch(err => {
                console.error(`[Main] ❌ Erreur sync participant:`, err.message);
              });
          });
        }

        // Démarrer les services de sync UNIQUEMENT si la config est complète
        if (configComplete) {
          console.log('[Main] → Démarrage des services de synchronisation');
          if (photoSystem.startSyncServices) {
            photoSystem.startSyncServices();
          }
          // Démarrer le système de retry pour les commandes non synchronisées
          startSyncRetrySystem();
          // Démarrer la synchronisation périodique de l'état de la machine
          startMachineStateSync();
        } else {
          console.log('[Main] ⚠️  Services de sync en attente - Configuration requise');
        }
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

// Désenregistrer les raccourcis globaux avant la fermeture
app.on('will-quit', async (event) => {
  globalShortcut.unregisterAll();

  // Éviter la boucle infinie lors du second appel à app.quit()
  if (isQuitting) {
    return;
  }

  // Empêcher la fermeture immédiate pour attendre l'envoi du statut offline
  event.preventDefault();
  isQuitting = true;

  console.log('[Main] Envoi du statut offline avant fermeture...');

  // Envoyer statut offline avant de quitter
  await stopMachineStateSync();

  console.log('[Main] Statut offline envoyé, fermeture de l\'application');

  // Maintenant on peut vraiment quitter
  app.quit();
});

app.on('window-all-closed', () => {
  // DEBUT HEXAPAY TOOLS
  log('info', '🪟 All windows closed');
  if (hexapayClient) {
    hexapayClient.close();
  }
  watchdog.stop();
  // FIN HEXAPAY TOOLS

  // Log de fermeture de l'application
  logger.logAppClose('window-all-closed');

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// DEBUT HEXAPAY TOOLS
// Gestion des erreurs non capturées
process.on('uncaughtException', (err) => {
  log('error', '🚨 UNCAUGHT EXCEPTION', { 
    error: err.message, 
    stack: err.stack 
  });
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', '🚨 UNHANDLED REJECTION', { 
    reason: reason instanceof Error ? reason.message : reason,
    promise 
  });
});

log('info', '🎬 Electron app starting...', {
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
  platform: process.platform,
  arch: process.arch
});
// FIN HEXAPAY TOOLS

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

let devMenuVisible = false;

function createMenu() {
  const isDev = process.env.NODE_ENV === 'development';

  // Par défaut, masquer le menu
  if (!devMenuVisible) {
    Menu.setApplicationMenu(null);
    return;
  }

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
 * ===== IPC HANDLERS - APP CONFIG =====
 */

// Toggle dev menu visibility (F5)
ipcMain.handle('app:toggle-dev-menu', () => {
  devMenuVisible = !devMenuVisible;
  createMenu();
  console.log(`[Menu] Dev menu ${devMenuVisible ? 'visible' : 'masqué'}`);
  return devMenuVisible;
});

// Retourner la configuration de l'application
ipcMain.handle('app:get-config', () => {
  return {
    inactivityTimeout: parseInt(process.env.INACTIVITY_TIMEOUT_MS) || 60000,
    adminInactivityTimeout: parseInt(process.env.ADMIN_INACTIVITY_TIMEOUT_MS) || 20000,
  };
});

/**
 * ===== IPC HANDLERS - PHOTOS =====
 */

// Scan QR code
ipcMain.handle('photos:scan-qr', async (event, qrContent) => {
  console.log('[IPC] Scan QR reçu');

  // Logger les données brutes du scan
  logQRScan('SCAN_RECEIVED', qrContent);

  if (!photoSystemReady || !photoSystem) {
    console.warn('[IPC] PhotoSystem non disponible, retour dummy data');
    const result = {
      status: 'success',
      message: 'Mode local - données dummy',
      photos: [],
    };
    logQRScan('SCAN_RESULT', qrContent, null, result);
    return result;
  }

  try {
    const result = await photoSystem.onQRCodeScanned(qrContent);
    logQRScan('SCAN_SUCCESS', qrContent, null, result);

    // Synchroniser vers Supabase si succès
    if (result.status === 'success' && result.participantId && result.universeId) {
      // Générer la date actuelle en format local
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const createdAt = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      // Sync scan story vers Supabase (non bloquant)
      syncScanStoryToRemote(result.participantId, result.universeId, createdAt)
        .then(syncResult => {
          if (syncResult.status === 'success') {
            console.log('[IPC] Scan story synchronisé vers Supabase');
          } else {
            console.warn('[IPC] Échec sync scan story:', syncResult.error);
          }
        })
        .catch(err => {
          console.error('[IPC] Erreur sync scan story:', err.message);
        });

      // Sync participant vers Supabase (non bloquant)
      syncParticipantToRemote(result.participantId, result.universeId)
        .then(syncResult => {
          if (syncResult.status === 'success') {
            console.log('[IPC] Participant synchronisé vers Supabase');
          } else {
            console.warn('[IPC] Échec sync participant:', syncResult.error);
          }
        })
        .catch(err => {
          console.error('[IPC] Erreur sync participant:', err.message);
        });
    }

    return result;
  } catch (error) {
    console.error('[IPC] Erreur scan QR:', error);
    const errorResult = {
      status: 'error',
      error: error.message,
    };
    logQRScan('SCAN_ERROR', qrContent, null, errorResult);
    return errorResult;
  }
});

// Parser QR code
ipcMain.handle('photos:parse-qr', (event, qrContent) => {
  logQRScan('PARSE_REQUEST', qrContent);

  if (!photoSystemReady || !photoSystem) {
    const result = { status: 'error', error: 'PhotoSystem non disponible' };
    logQRScan('PARSE_ERROR', qrContent, null, result);
    return result;
  }

  const parsed = photoSystem.parseQRCode(qrContent);
  logQRScan('PARSE_RESULT', qrContent, parsed, null);
  return parsed;
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
 * ===== IPC HANDLERS - LOGGER =====
 */

// Log générique depuis le renderer
ipcMain.handle('logger:log', (event, { level, category, message, data }) => {
  switch (level) {
    case 'info':
      logger.info(category, message, data);
      break;
    case 'warn':
      logger.warn(category, message, data);
      break;
    case 'error':
      logger.error(category, message, data);
      break;
    case 'debug':
      logger.debug(category, message, data);
      break;
    default:
      logger.info(category, message, data);
  }
  return { status: 'success' };
});

// Logs spécifiques
ipcMain.handle('logger:page-change', (event, { fromPage, toPage, data }) => {
  logger.logPageChange(fromPage, toPage, data);
  return { status: 'success' };
});

ipcMain.handle('logger:qr-scan', (event, scanData) => {
  logger.logQRScan(scanData);
  return { status: 'success' };
});

ipcMain.handle('logger:qr-scan-invalid', (event, { rawData, reason }) => {
  logger.logQRScanInvalid(rawData, reason);
  return { status: 'success' };
});

ipcMain.handle('logger:cart-add', (event, { photoId, productId, productName, quantity, price }) => {
  logger.logCartAdd(photoId, productId, productName, quantity, price);
  return { status: 'success' };
});

ipcMain.handle('logger:cart-remove', (event, { photoId, productId }) => {
  logger.logCartRemove(photoId, productId);
  return { status: 'success' };
});

ipcMain.handle('logger:cart-clear', (event, reason) => {
  logger.logCartClear(reason);
  return { status: 'success' };
});

ipcMain.handle('logger:order-create', (event, { orderId, items, total }) => {
  logger.logOrderCreate(orderId, items, total);
  return { status: 'success' };
});

ipcMain.handle('logger:order-complete', (event, { orderId, supabaseId }) => {
  logger.logOrderComplete(orderId, supabaseId);
  return { status: 'success' };
});

ipcMain.handle('logger:order-cancel', (event, { orderId, reason }) => {
  logger.logOrderCancel(orderId, reason);
  return { status: 'success' };
});

ipcMain.handle('logger:hexapay-start', (event, { amount, orderId }) => {
  logger.logHexapayStart(amount, orderId);
  return { status: 'success' };
});

ipcMain.handle('logger:hexapay-success', (event, { amount, orderId, transactionId }) => {
  logger.logHexapaySuccess(amount, orderId, transactionId);
  return { status: 'success' };
});

ipcMain.handle('logger:hexapay-failure', (event, { amount, orderId, error }) => {
  logger.logHexapayFailure(amount, orderId, error);
  return { status: 'success' };
});

ipcMain.handle('logger:hexapay-cancel', (event, { amount, orderId }) => {
  logger.logHexapayCancel(amount, orderId);
  return { status: 'success' };
});

ipcMain.handle('logger:admin-access', (event, action) => {
  logger.logAdminAccess(action);
  return { status: 'success' };
});

ipcMain.handle('logger:event', (event, { category, eventName, data }) => {
  logger.logEvent(category, eventName, data);
  return { status: 'success' };
});

ipcMain.handle('logger:get-log-path', () => {
  return {
    logFile: logger.getLogFilePath(),
    logDir: logger.getLogDir()
  };
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
    console.log('[IPC] 🌍 Création commande avec lang:', orderData.lang);
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

ipcMain.handle('order:update-details', async (event, orderId, details) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.updateOrderDetails(orderId, details);
    console.log('[IPC] Détails commande mis à jour:', orderId, details);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur mise à jour détails commande:', error);
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
      pending: 0,
      cancelled: 0,
      completed: 0,
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
 * ===== HANDLERS IPC PAYMENT LOGS =====
 */

// Créer un log de paiement
ipcMain.handle('payment-log:create', async (event, logData) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    const result = await photoSystem.db.createPaymentLog(logData);
    console.log('[IPC] Payment log créé:', result.id);
    return { status: 'success', logId: result.id, log: result };
  } catch (error) {
    console.error('[IPC] Erreur création payment log:', error);
    return { status: 'error', error: error.message };
  }
});

// Mettre à jour un log de paiement
ipcMain.handle('payment-log:update', async (event, logId, updateData) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.updatePaymentLog(logId, updateData);
    console.log('[IPC] Payment log mis à jour:', logId, updateData.status);
    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur mise à jour payment log:', error);
    return { status: 'error', error: error.message };
  }
});

// Récupérer un log de paiement
ipcMain.handle('payment-log:get', async (event, logId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return null;
  }
  try {
    return await photoSystem.db.getPaymentLog(logId);
  } catch (error) {
    console.error('[IPC] Erreur récupération payment log:', error);
    return null;
  }
});

// Récupérer les logs de paiement d'une commande
ipcMain.handle('payment-log:get-by-order', async (event, orderId) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getPaymentLogsByOrder(orderId);
  } catch (error) {
    console.error('[IPC] Erreur récupération payment logs:', error);
    return [];
  }
});

// Récupérer tous les logs de paiement
ipcMain.handle('payment-log:get-all', async (event, limit = 100, offset = 0) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return [];
  }
  try {
    return await photoSystem.db.getAllPaymentLogs(limit, offset);
  } catch (error) {
    console.error('[IPC] Erreur récupération payment logs:', error);
    return [];
  }
});

// Récupérer les statistiques de paiement
ipcMain.handle('payment-log:get-stats', async (event) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return null;
  }
  try {
    return await photoSystem.db.getPaymentStats();
  } catch (error) {
    console.error('[IPC] Erreur récupération stats paiement:', error);
    return null;
  }
});

// Synchroniser un log de paiement vers Supabase
ipcMain.handle('payment-log:sync-remote', async (event, logId) => {
  return await syncPaymentLogToRemote(logId);
});

/**
 * ===== SYNCHRONISATION PAYMENT LOGS VERS SUPABASE =====
 */

const PAYMENT_LOGS_API_URL = (process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1') + '/manage-payment-logs';

/**
 * Synchroniser un log de paiement vers l'API Supabase
 */
async function syncPaymentLogToRemote(logId) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[PaymentLogSync] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  try {
    // Récupérer le log depuis la DB locale
    const log = await photoSystem.db.getPaymentLog(logId);

    if (!log) {
      return { status: 'error', error: `Log ${logId} non trouvé` };
    }

    // Ne pas synchroniser les logs en pending
    if (log.status === 'pending') {
      return { status: 'skipped', message: 'Log en cours de traitement' };
    }

    console.log('[PaymentLogSync] ═══════════════════════════════════════════════');
    console.log('[PaymentLogSync] 📤 SYNCHRONISATION PAYMENT LOG VERS SUPABASE');
    console.log('[PaymentLogSync] ═══════════════════════════════════════════════');
    console.log('[PaymentLogSync] Log ID:', logId);
    console.log('[PaymentLogSync] Order ID:', log.order_id);
    console.log('[PaymentLogSync] Status:', log.status);

    // Récupérer kiosk_id et sales_point_id depuis la config
    let kioskId = log.kiosk_id;
    let salesPointId = log.sales_point_id;

    if (!kioskId || !salesPointId) {
      try {
        const dbConfig = await photoSystem.db.getMachineConfig();
        if (dbConfig) {
          kioskId = kioskId || dbConfig.kiosk_id;
          salesPointId = salesPointId || dbConfig.sales_point_id;
        }
      } catch (err) {
        console.warn('[PaymentLogSync] Erreur récupération config:', err.message);
      }
    }

    // Construire le payload
    const payload = {
      order_id: log.order_id || null,
      supabase_order_id: log.supabase_order_id || null,
      participant_id: log.participant_id || null,
      universe_id: log.universe_id || null,
      amount: log.amount || 0,
      status: log.status,
      payment_method: log.payment_method || 'card',
      hexapay_transaction_id: log.hexapay_transaction_id || null,
      error_code: log.error_code || null,
      error_message: log.error_message || null,
      started_at: log.started_at ? new Date(log.started_at).toISOString() : null,
      completed_at: log.completed_at ? new Date(log.completed_at).toISOString() : null,
      duration_ms: log.duration_ms || null,
      kiosk_id: kioskId || null,
      sales_point_id: salesPointId || null
    };

    console.log('[PaymentLogSync] Payload:', JSON.stringify(payload, null, 2));

    // Récupérer le token d'authentification
    const authToken = await getAuthToken();

    // Envoyer vers l'API
    const response = await makeHttpsRequest(
      PAYMENT_LOGS_API_URL,
      payload,
      'POST',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[PaymentLogSync] ✅ Log synchronisé avec succès');
    console.log('[PaymentLogSync] Réponse:', JSON.stringify(response, null, 2));

    // Marquer le log comme synchronisé
    await photoSystem.db.markPaymentLogSynced(logId);

    return { status: 'success', response };

  } catch (error) {
    console.error('[PaymentLogSync] ❌ Erreur synchronisation:', error.message);
    return { status: 'error', error: error.message };
  }
}

/**
 * Synchroniser tous les logs de paiement non synchronisés
 */
async function syncPendingPaymentLogs() {
  if (!API_SYNC_CONFIG.enabled || !photoSystemReady || !photoSystem?.db) {
    return;
  }

  try {
    const unsyncedLogs = await photoSystem.db.getUnsyncedPaymentLogs();

    if (unsyncedLogs.length === 0) {
      return;
    }

    console.log(`[PaymentLogSync] 🔄 ${unsyncedLogs.length} log(s) à synchroniser`);

    for (const log of unsyncedLogs) {
      try {
        await syncPaymentLogToRemote(log.id);
      } catch (err) {
        console.error(`[PaymentLogSync] Erreur sync log ${log.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[PaymentLogSync] Erreur récupération logs non sync:', error.message);
  }
}

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
  logger.info('AUTH', 'Récupération d\'un nouveau token...');

  try {
    const authPayload = {
      email: API_SYNC_CONFIG.authEmail,
      password: API_SYNC_CONFIG.authPassword
    };

    console.log('[Auth] Email:', API_SYNC_CONFIG.authEmail);

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
      logger.error('AUTH', 'Réponse d\'authentification invalide', { response });
      throw new Error('Réponse d\'authentification invalide');
    }

    // Extraire les informations du token
    const token = response.access_token;
    const expiresIn = response.expires_in || 3600; // Par défaut 1 heure

    // Mettre en cache le token
    authTokenCache.token = token;
    authTokenCache.expiresAt = now + (expiresIn * 1000);

    console.log('[Auth] ✅ Nouveau token obtenu (expire dans', expiresIn, 'secondes)');
    logger.info('AUTH', 'Nouveau token obtenu', { expiresIn });
    return token;

  } catch (error) {
    console.error('[Auth] ❌ Erreur récupération token:', error);
    logger.error('AUTH', 'Erreur récupération token', { error: error.message });
    throw new Error(`Échec authentification: ${error.message}`);
  }
}

/**
 * Invalider le cache du token (appelé après une erreur 401)
 */
function invalidateAuthToken() {
  console.log('[Auth] Invalidation du token en cache');
  logger.warn('AUTH', 'Invalidation du token en cache (401 reçu)');
  authTokenCache.token = null;
  authTokenCache.expiresAt = 0;
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
        thumbnail: product.thumbnail_url || null,
        universe_id: product.universe_id || null
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
    console.log('[Sync] Universe ID:', orderWithItems.universe_id);
    console.log('[Sync] Lang:', orderWithItems.lang);
    console.log('[Sync] Email:', orderWithItems.email);
    console.log('[Sync] Optin:', orderWithItems.optin);
    console.log('[Sync] Status:', orderWithItems.status);
    console.log('[Sync] Total Amount:', orderWithItems.total_amount);
    console.log('[Sync] Final Amount:', orderWithItems.final_amount);
    console.log('[Sync] Nombre d\'items:', orderWithItems.items?.length || 0);
    console.log('[Sync] Items détaillés:', JSON.stringify(orderWithItems.items, null, 2));
    console.log('[Sync] Toutes les clés de orderWithItems:', Object.keys(orderWithItems));

    // Mapper le statut de la DB au format API
    // 'processing' → 'pending', 'completed' → 'completed', 'cancelled' → 'cancelled'
    let apiStatus = 'pending';
    if (orderWithItems.status === 'completed') {
      apiStatus = 'completed';
    } else if (orderWithItems.status === 'cancelled') {
      apiStatus = 'cancelled';
    }

    // S'assurer que total_amount est toujours un nombre valide (TTC)
    const totalAmount = orderWithItems.final_amount || orderWithItems.total_amount || 0;

    // Calcul des montants HT et TVA
    const tvaRate = API_SYNC_CONFIG.tva || 20;
    const subtotal_ht_raw = totalAmount / (1 + tvaRate / 100);
    const vat_amount_raw = totalAmount - subtotal_ht_raw;

    console.log('[Sync] Calcul TVA:');
    console.log('[Sync]   - TVA rate:', tvaRate, '%');
    console.log('[Sync]   - subtotal_ht (HT):', subtotal_ht_raw.toFixed(2), '€');
    console.log('[Sync]   - vat_amount (TVA):', vat_amount_raw.toFixed(2), '€');
    console.log('[Sync]   - total_amount (TTC):', totalAmount.toFixed(2), '€');

    // Récupérer les informations des photos pour chaque item
    console.log('[Sync] 📸 Récupération des URLs des photos...');
    const itemsWithPhotoUrls = await Promise.all(
      (orderWithItems.items || []).map(async (item) => {
        let photoUrl = null;
        let datePhoto = null;

        if (item.photo_id) {
          try {
            // Récupérer la photo depuis la base de données
            console.log('[Sync]   🔍 Recherche photo_id:', item.photo_id);
            const photo = await photoSystem.db.getPhoto(item.photo_id);
            console.log('[Sync]   📸 Photo trouvée:', photo ? 'OUI' : 'NON');
            if (photo) {
              console.log('[Sync]   📋 Champs disponibles:', Object.keys(photo));
              console.log('[Sync]   📦 Photo complète:', JSON.stringify(photo, null, 2));
              if (photo.remote_url) {
                photoUrl = photo.remote_url;
                console.log('[Sync]   ✅ Photo ID:', item.photo_id, '→ URL:', photoUrl);
              } else {
                console.log('[Sync]   ⚠️  Photo ID:', item.photo_id, '→ remote_url est vide ou null');
              }
              if (photo.date_photo) {
                datePhoto = photo.date_photo;
                console.log('[Sync]   📅 Date photo:', datePhoto);
              }
            } else {
              console.log('[Sync]   ❌ Photo ID:', item.photo_id, '→ Photo non trouvée dans la DB');
            }
          } catch (err) {
            console.error('[Sync]   ❌ Erreur récupération photo:', item.photo_id, err);
          }
        } else {
          console.log('[Sync]   ⚠️  Item sans photo_id');
        }

        return {
          ...item,
          photo_url: photoUrl,
          date_photo: datePhoto
        };
      })
    );

    // Transformer les données au format attendu par l'API
    const participantId = orderWithItems.participant_id || 'Anonymous';
    const universeId = orderWithItems.universe_id || null;
    const payload = {
      participant_id: participantId,
      qrcode: universeId && participantId ? `${universeId}${participantId}` : null,
      customer_email: orderWithItems.email || null, // Email peut être null
      customer_address: null,
      subtotal_ht: Math.round(subtotal_ht_raw * 100), // Prix HT en centimes
      vat_amount: Math.round(vat_amount_raw * 100), // Montant TVA en centimes
      total_amount: Math.round(totalAmount * 100), // Prix TTC en centimes
      sales_point_id: API_SYNC_CONFIG.salesPointId,
      kiosk_id: API_SYNC_CONFIG.kioskId,
      memory_session_id: null, // null car le participant_id local n'existe pas dans Supabase
      universe_id: universeId,
      lang: orderWithItems.lang || 'fr', // Langue choisie par le client
      status: apiStatus,
      optin_email: orderWithItems.optin ? true : false,
      last_step: orderWithItems.last_step || null, // Étape la plus avancée atteinte
      order_items: itemsWithPhotoUrls.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: Math.round((item.unit_price || 0) * 100), // Convertir en centimes
        total_price: Math.round((item.total_price || 0) * 100), // Convertir en centimes
        photo_id: item.photo_id || null, // ID de la photo
        photo_url: item.photo_url || null, // URL distante de la photo depuis la table photos
        date_photo: item.date_photo || null // Date de la photo
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
        total_price: `${item.total_price / 100}€`,
        photo_id: item.photo_id,
        photo_url: item.photo_url,
        date_photo: item.date_photo
      });
    });
    console.log('[Sync] ═══════════════════════════════════════════════════');

    // Récupérer un token d'authentification frais
    const authToken = await getAuthToken();
    console.log('[Sync] Token d\'authentification récupéré');

    // 🔥🔥 CONFIRMATION FINALE DES DONNÉES AVANT POST 🔥🔥
    console.log('\n\n');
    console.log('🔥'.repeat(40));
    console.log('📤 CONFIRMATION FINALE - DONNÉES QUI SERONT POSTÉES');
    console.log('🔥'.repeat(40));
    console.log('\n📍 URL de destination:');
    console.log('   ', API_SYNC_CONFIG.url);
    console.log('\n📦 Payload JSON complet qui sera envoyé:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n🔍 VÉRIFICATION DES PHOTO_URL:');
    payload.order_items.forEach((item, idx) => {
      console.log(`\n   Article ${idx + 1}:`);
      console.log(`   ├─ Product ID: ${item.product_id}`);
      console.log(`   ├─ Photo ID: ${item.photo_id || '❌ MANQUANT'}`);
      console.log(`   └─ Photo URL: ${item.photo_url || '❌ MANQUANT'}`);
      if (item.photo_url) {
        console.log('      ✅ Photo URL est présent!');
      } else {
        console.log('      ⚠️  ATTENTION: Photo URL est vide!');
      }
    });
    console.log('\n' + '🔥'.repeat(40));
    console.log('🚀 ENVOI EN COURS VERS SUPABASE...');
    console.log('🔥'.repeat(40) + '\n\n');

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
      console.log(`    - Photo ID: ${item.photo_id || 'N/A'}`);
      console.log(`    - Photo URL: ${item.photo_url || 'N/A'}`);
    });
    console.log('═'.repeat(80));
    console.log('⏳ Envoi en cours vers Supabase...');
    console.log('═'.repeat(80));
    console.log('\n');

    // Faire l'appel HTTP POST avec le token et l'apikey header
    const response = await makeHttpsRequest(
      API_SYNC_CONFIG.url,
      payload,
      'POST',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

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
    if (response.order?.id) {
      console.log('📌 INFORMATIONS CLÉS DE LA RÉPONSE:');
      console.log('  • Order ID Supabase:', response.order.id);
      console.log('  • Statut:', response.order.status || 'N/A');
      if (response.order.order_items_count) {
        console.log('  • Nombre d\'items créés:', response.order.order_items_count);
      }
    }
    console.log('═'.repeat(80));
    console.log('🎉 Synchronisation terminée avec succès!');
    console.log('═'.repeat(80));
    console.log('\n\n');

    // Logger dans eclipso log
    logger.logSupabaseSync('ORDER_SYNC_SUCCESS', {
      orderId,
      supabaseOrderId: response.order?.id,
      status: response.order?.status,
      totalAmount: payload.total_amount / 100,
      itemsCount: payload.order_items?.length
    });

    // Mettre à jour le statut de sync dans la DB locale
    if (photoSystem?.db) {
      await photoSystem.db.updateOrderSyncStatus(
        orderId,
        'synced',
        'sync',
        response.order?.id,
        null
      );
    }

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

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('ORDER_SYNC_FAILED', {
      orderId,
      error: error.message,
      url: API_SYNC_CONFIG.url
    });

    // Marquer l'erreur de sync dans la DB locale
    if (photoSystem?.db && orderId) {
      await photoSystem.db.markOrderSyncError(
        orderId,
        'sync',
        error.message
      );
    }

    return { status: 'error', error: error.message };
  }
}

/**
 * Créer une commande directement sur l'API Supabase (status=pending)
 * Appelé depuis cart.js lors du clic sur "Procéder au paiement"
 */
async function createOrderRemote(orderData) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[CreateOrder] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  let payload = null;  // Déclarer payload ici pour qu'il soit accessible dans le catch

  try {
    console.log('[CreateOrder] ═══════════════════════════════════════════════');
    console.log('[CreateOrder] 📦 CRÉATION DE COMMANDE SUR SUPABASE (status=pending)');
    console.log('[CreateOrder] ═══════════════════════════════════════════════');
    console.log('[CreateOrder] Données reçues (orderData):');
    console.log(JSON.stringify(orderData, null, 2));
    console.log('[CreateOrder]   - participantId:', orderData.participantId);
    console.log('[CreateOrder]   - universeId:', orderData.universeId);
    console.log('[CreateOrder]   - totalAmount:', orderData.totalAmount);
    console.log('[CreateOrder]   - items:', orderData.items?.length, 'item(s)');

    // Récupérer les informations des photos pour chaque item
    const itemsWithPhotoUrls = await Promise.all(
      (orderData.items || []).map(async (item) => {
        let photoUrl = null;
        if (item.photoId) {
          try {
            const photo = await photoSystem.db.getPhoto(item.photoId);
            if (photo && photo.remote_url) {
              photoUrl = photo.remote_url;
            }
          } catch (err) {
            console.error('[CreateOrder] Erreur récupération photo:', item.photoId, err);
          }
        }
        return {
          ...item,
          photo_url: photoUrl
        };
      })
    );

    // Transformer les données au format attendu par l'API
    const participantId = orderData.participantId || 'Anonymous';
    const universeId = orderData.universeId || null;
    const total_amount_raw = orderData.totalAmount; // Prix TTC

    // Calcul des montants HT et TVA
    const tvaRate = API_SYNC_CONFIG.tva || 20;
    const subtotal_ht_raw = total_amount_raw / (1 + tvaRate / 100);
    const vat_amount_raw = total_amount_raw - subtotal_ht_raw;

    // Convertir en centimes
    const subtotal_ht = Math.round(subtotal_ht_raw * 100);
    const vat_amount = Math.round(vat_amount_raw * 100);
    const total_amount = Math.round(total_amount_raw * 100);

    console.log('[CreateOrder] Préparation du payload:');
    console.log('[CreateOrder]   - participant_id:', participantId);
    console.log('[CreateOrder]   - universe_id:', universeId);
    console.log('[CreateOrder]   - qrcode:', universeId && participantId ? `${universeId}${participantId}` : null);
    console.log('[CreateOrder]   - TVA rate:', tvaRate, '%');
    console.log('[CreateOrder]   - subtotal_ht (HT en centimes):', subtotal_ht);
    console.log('[CreateOrder]   - vat_amount (TVA en centimes):', vat_amount);
    console.log('[CreateOrder]   - total_amount (TTC en centimes):', total_amount);

    const payload = {
      participant_id: participantId,
      qrcode: universeId && participantId ? `${universeId}${participantId}` : null,
      customer_email: '', // Chaîne vide pour cette étape (pas encore d'email)
      customer_address: null,
      subtotal_ht: subtotal_ht, // Prix HT en centimes
      vat_amount: vat_amount, // Montant TVA en centimes
      total_amount: total_amount, // Prix TTC en centimes
      sales_point_id: API_SYNC_CONFIG.salesPointId,
      kiosk_id: API_SYNC_CONFIG.kioskId,
      memory_session_id: null,
      universe_id: universeId,
      lang: orderData.lang || 'fr', // Langue choisie par le client
      status: 'pending', // Status en attente
      last_step: orderData.lastStep || 'cart', // Étape actuelle (cart pour les commandes en cours)
      order_items: itemsWithPhotoUrls.map(item => ({
        product_id: item.productId,
        quantity: item.qty,
        unit_price: Math.round((item.unitPrice || 0) * 100),
        total_price: Math.round((item.totalPrice || 0) * 100),
        photo_id: item.photoId || null,
        photo_url: item.photo_url || null
      }))
    };

    console.log('[CreateOrder] ═══════════════════════════════════════════════');
    console.log('[CreateOrder] 📤 PAYLOAD FINAL À ENVOYER:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('[CreateOrder] ═══════════════════════════════════════════════');

    // Récupérer un token d'authentification
    const authToken = await getAuthToken();

    // Créer la commande sur Supabase avec retry automatique (avec apikey header)
    const response = await makeHttpsRequestWithRetry(
      API_SYNC_CONFIG.url,
      payload,
      'POST',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[CreateOrder] ✅ Commande créée sur Supabase');
    console.log('[CreateOrder] Réponse:', JSON.stringify(response, null, 2));
    console.log('[CreateOrder] Order ID Supabase:', response.order?.id);

    // Logger dans eclipso log
    logger.logSupabaseSync('ORDER_CREATE_SUCCESS', {
      localOrderId: orderData.orderId,
      supabaseOrderId: response.order?.id,
      participantId: orderData.participantId,
      universeId: orderData.universeId,
      totalAmount: orderData.totalAmount,
      lang: orderData.lang,
      status: 'pending'
    });

    // Mettre à jour le statut de sync dans la DB locale
    if (photoSystem?.db) {
      await photoSystem.db.updateOrderSyncStatus(
        orderData.orderId,
        'synced',
        'create',
        response.order?.id,
        null
      );
    }

    return {
      status: 'success',
      response,
      supabaseOrderId: response.order?.id,
      debugPayload: payload  // Pour debug dans le renderer
    };

  } catch (error) {
    console.error('[CreateOrder] ❌ Erreur création commande:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('ORDER_CREATE_FAILED', {
      localOrderId: orderData?.orderId,
      error: error.message,
      url: API_SYNC_CONFIG.url
    });

    // Marquer l'erreur de sync dans la DB locale
    if (photoSystem?.db && orderData?.orderId) {
      await photoSystem.db.markOrderSyncError(
        orderData.orderId,
        'create',
        error.message
      );
    }

    return {
      status: 'error',
      error: error.message,
      debugPayload: payload || null,  // Pour debug dans le renderer
      debugOrderData: orderData  // Pour debug dans le renderer
    };
  }
}

/**
 * Créer une commande COMPLETED directement sur l'API Supabase
 * Appelé depuis payment.js après un paiement Hexapay réussi
 * @param {string} localOrderId - ID de la commande locale
 */
async function createCompletedOrderRemote(localOrderId) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[CreateCompletedOrder] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  try {
    console.log('[CreateCompletedOrder] ═══════════════════════════════════════════════');
    console.log('[CreateCompletedOrder] 📦 CRÉATION DE COMMANDE COMPLETED SUR SUPABASE');
    console.log('[CreateCompletedOrder] ═══════════════════════════════════════════════');
    console.log('[CreateCompletedOrder] Local Order ID:', localOrderId);

    // Récupérer la commande locale avec ses items
    const orderWithItems = await photoSystem.db.getOrderWithItems(localOrderId);

    if (!orderWithItems) {
      throw new Error(`Commande locale ${localOrderId} non trouvée`);
    }

    console.log('[CreateCompletedOrder] Commande locale récupérée:');
    console.log('[CreateCompletedOrder]   - participant_id:', orderWithItems.participant_id);
    console.log('[CreateCompletedOrder]   - universe_id:', orderWithItems.universe_id);
    console.log('[CreateCompletedOrder]   - lang:', orderWithItems.lang);
    console.log('[CreateCompletedOrder]   - total_amount:', orderWithItems.total_amount);
    console.log('[CreateCompletedOrder]   - items:', orderWithItems.items?.length, 'item(s)');
    console.log('[CreateCompletedOrder]   - Toutes les clés:', Object.keys(orderWithItems));

    // Récupérer les informations des photos pour chaque item
    const itemsWithPhotoUrls = await Promise.all(
      (orderWithItems.items || []).map(async (item) => {
        let photoUrl = null;
        let datePhoto = null;

        if (item.photo_id) {
          try {
            const photo = await photoSystem.db.getPhoto(item.photo_id);
            if (photo) {
              if (photo.remote_url) {
                photoUrl = photo.remote_url;
              }
              if (photo.date_photo) {
                datePhoto = photo.date_photo;
              }
            }
          } catch (err) {
            console.error('[CreateCompletedOrder] Erreur récupération photo:', item.photo_id, err);
          }
        }
        return {
          ...item,
          photo_url: photoUrl,
          date_photo: datePhoto
        };
      })
    );

    // S'assurer que total_amount est toujours un nombre valide (TTC)
    const totalAmount = orderWithItems.final_amount || orderWithItems.total_amount || 0;

    // Calcul des montants HT et TVA
    const tvaRate = API_SYNC_CONFIG.tva || 20;
    const subtotal_ht_raw = totalAmount / (1 + tvaRate / 100);
    const vat_amount_raw = totalAmount - subtotal_ht_raw;

    // Convertir en centimes
    const subtotal_ht = Math.round(subtotal_ht_raw * 100);
    const vat_amount = Math.round(vat_amount_raw * 100);
    const total_amount = Math.round(totalAmount * 100);

    const participantId = orderWithItems.participant_id || 'Anonymous';
    const universeId = orderWithItems.universe_id || null;

    console.log('[CreateCompletedOrder] Calcul TVA:');
    console.log('[CreateCompletedOrder]   - TVA rate:', tvaRate, '%');
    console.log('[CreateCompletedOrder]   - subtotal_ht (HT en centimes):', subtotal_ht);
    console.log('[CreateCompletedOrder]   - vat_amount (TVA en centimes):', vat_amount);
    console.log('[CreateCompletedOrder]   - total_amount (TTC en centimes):', total_amount);

    // Construire le payload pour l'API
    const payload = {
      participant_id: participantId,
      qrcode: universeId && participantId ? `${universeId}${participantId}` : null,
      customer_email: orderWithItems.email || null,
      customer_address: null,
      subtotal_ht: subtotal_ht, // Prix HT en centimes
      vat_amount: vat_amount, // Montant TVA en centimes
      total_amount: total_amount, // Prix TTC en centimes
      sales_point_id: API_SYNC_CONFIG.salesPointId,
      kiosk_id: API_SYNC_CONFIG.kioskId,
      memory_session_id: null,
      universe_id: universeId,
      lang: orderWithItems.lang || 'fr', // Langue choisie par le client
      status: 'completed', // ← STATUS COMPLETED
      last_step: orderWithItems.last_step || 'payment', // Étape finale (payment pour les commandes complétées)
      order_items: itemsWithPhotoUrls.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: Math.round((item.unit_price || 0) * 100),
        total_price: Math.round((item.total_price || 0) * 100),
        photo_id: item.photo_id || null,
        photo_url: item.photo_url || null,
        date_photo: item.date_photo || null
      }))
    };

    console.log('[CreateCompletedOrder] ═══════════════════════════════════════════════');
    console.log('[CreateCompletedOrder] 📤 PAYLOAD FINAL À ENVOYER (status=completed):');
    console.log(JSON.stringify(payload, null, 2));
    console.log('[CreateCompletedOrder] ═══════════════════════════════════════════════');

    // Récupérer un token d'authentification
    const authToken = await getAuthToken();

    // Créer la commande sur Supabase
    const response = await makeHttpsRequestWithRetry(
      API_SYNC_CONFIG.url,
      payload,
      'POST',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[CreateCompletedOrder] ✅ Commande COMPLETED créée sur Supabase');
    console.log('[CreateCompletedOrder] Réponse:', JSON.stringify(response, null, 2));
    console.log('[CreateCompletedOrder] Order ID Supabase:', response.order?.id);

    // Marquer la commande locale comme synchronisée
    await photoSystem.db.markOrderAsSynced(localOrderId);

    // Logger dans eclipso log
    logger.logSupabaseSync('ORDER_CREATE_COMPLETED_SUCCESS', {
      localOrderId,
      supabaseOrderId: response.order?.id,
      participantId: payload.participant_id,
      universeId: payload.universe_id,
      totalAmount: payload.total_amount / 100,
      lang: payload.lang,
      status: 'completed'
    });

    // Mettre à jour le statut de sync dans la DB locale
    if (photoSystem?.db) {
      await photoSystem.db.updateOrderSyncStatus(
        localOrderId,
        'synced',
        'create_completed',
        response.order?.id,
        null
      );
    }

    return {
      status: 'success',
      response,
      supabaseOrderId: response.order?.id
    };

  } catch (error) {
    console.error('[CreateCompletedOrder] ❌ Erreur création commande completed:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('ORDER_CREATE_COMPLETED_FAILED', {
      localOrderId,
      error: error.message,
      url: API_SYNC_CONFIG.url
    });

    // Marquer l'erreur de sync dans la DB locale
    if (photoSystem?.db && localOrderId) {
      await photoSystem.db.markOrderSyncError(
        localOrderId,
        'create_completed',
        error.message
      );
    }

    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Mettre à jour une commande sur l'API Supabase (status=completed + email)
 * Appelé depuis form.js lors du clic sur "Terminer"
 *
 * NOUVELLE APPROCHE:
 * 1. GET la commande existante depuis Supabase
 * 2. Réutiliser toutes ses données
 * 3. Mettre à jour customer_email, optin_email et status
 */
async function updateOrderRemote(supabaseOrderId, email, localOrderId, optin = false) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[UpdateOrder] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  try {
    console.log('[UpdateOrder] ═══════════════════════════════════════════════');
    console.log('[UpdateOrder] 📝 MISE À JOUR DE COMMANDE SUR SUPABASE');
    console.log('[UpdateOrder] ═══════════════════════════════════════════════');
    console.log('[UpdateOrder] Order ID Supabase:', supabaseOrderId);
    console.log('[UpdateOrder] Order ID Local:', localOrderId);
    console.log('[UpdateOrder] Email fourni:', email || '(vide)');
    console.log('[UpdateOrder] Optin fourni:', optin);

    // ÉTAPE 1: GET la commande existante depuis Supabase
    console.log('[UpdateOrder] ÉTAPE 1: Récupération de la commande existante depuis Supabase...');

    const authToken = await getAuthToken();
    const getUrl = `${API_SYNC_CONFIG.url}?id=${supabaseOrderId}`;

    console.log('[UpdateOrder] GET URL:', getUrl);

    const existingOrderResponse = await makeHttpsRequestWithRetry(
      getUrl,
      null,
      'GET',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[UpdateOrder] Réponse GET brute:', JSON.stringify(existingOrderResponse, null, 2));

    // Extraire les données de la commande (peut être dans response.order ou directement response)
    const existingOrder = existingOrderResponse.order || existingOrderResponse;

    if (!existingOrder) {
      throw new Error('Commande non trouvée sur Supabase');
    }

    console.log('[UpdateOrder] ✅ Commande existante récupérée:');
    console.log('[UpdateOrder]   - participant_id:', existingOrder.participant_id);
    console.log('[UpdateOrder]   - qrcode:', existingOrder.qrcode);
    console.log('[UpdateOrder]   - customer_email:', existingOrder.customer_email);
    console.log('[UpdateOrder]   - universe_id:', existingOrder.universe_id);
    console.log('[UpdateOrder]   - total_amount:', existingOrder.total_amount);
    console.log('[UpdateOrder]   - status actuel:', existingOrder.status);

    // ÉTAPE 2: Construire le payload de mise à jour
    console.log('[UpdateOrder] ÉTAPE 2: Construction du payload de mise à jour...');

    // Déterminer l'email à utiliser: formulaire > existant > null
    const finalEmail = email || existingOrder.customer_email || null;
    console.log('[UpdateOrder] Email final à utiliser:', finalEmail);

    // Récupérer last_step depuis la commande locale
    let lastStep = existingOrder.last_step || null;
    if (localOrderId) {
      try {
        const localOrder = await photoSystem.db.getOrderWithItems(localOrderId);
        if (localOrder && localOrder.last_step) {
          lastStep = localOrder.last_step;
          console.log('[UpdateOrder] last_step depuis commande locale:', lastStep);
        }
      } catch (err) {
        console.warn('[UpdateOrder] Impossible de récupérer last_step local:', err.message);
      }
    }

    // Payload minimal - uniquement les champs à mettre à jour
    const payload = {
      customer_email: finalEmail,
      status: 'completed',
      optin_email: optin ? true : false,
      last_step: lastStep || 'form'  // Défaut: form car on vient du formulaire
    };

    console.log('[UpdateOrder] ═══════════════════════════════════════════════');
    console.log('[UpdateOrder] 📤 PAYLOAD MINIMAL À ENVOYER:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('[UpdateOrder] ═══════════════════════════════════════════════');

    // ÉTAPE 3: PUT le payload mis à jour
    console.log('[UpdateOrder] ÉTAPE 3: Envoi de la mise à jour...');

    const updateUrl = `${API_SYNC_CONFIG.url}?id=${supabaseOrderId}`;
    console.log('[UpdateOrder] PUT URL:', updateUrl);

    const response = await makeHttpsRequestWithRetry(
      updateUrl,
      payload,
      'PUT',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[UpdateOrder] ═══════════════════════════════════════════════');
    console.log('[UpdateOrder] ✅ COMMANDE MISE À JOUR AVEC SUCCÈS');
    console.log('[UpdateOrder] ═══════════════════════════════════════════════');
    console.log('[UpdateOrder] Réponse:', JSON.stringify(response, null, 2));

    // Logger dans eclipso log
    logger.logSupabaseSync('ORDER_UPDATE_SUCCESS', {
      supabaseOrderId,
      localOrderId,
      email: finalEmail,
      optin,
      status: 'completed'
    });

    // Mettre à jour le statut de sync dans la DB locale
    if (photoSystem?.db && localOrderId) {
      await photoSystem.db.updateOrderSyncStatus(
        localOrderId,
        'synced',
        'update',
        supabaseOrderId,
        null
      );
    }

    return { status: 'success', response };

  } catch (error) {
    console.error('[UpdateOrder] ❌ Erreur mise à jour commande:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('ORDER_UPDATE_FAILED', {
      supabaseOrderId,
      localOrderId,
      error: error.message,
      url: API_SYNC_CONFIG.url
    });

    // Marquer l'erreur de sync dans la DB locale
    if (photoSystem?.db && localOrderId) {
      await photoSystem.db.markOrderSyncError(
        localOrderId,
        'update',
        error.message
      );
    }

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

          // Gestion des erreurs HTTP spécifiques
          switch (res.statusCode) {
            case 401:
              // Unauthorized - Token invalide ou expiré
              console.warn('[HTTP] ⚠️ Erreur 401 Unauthorized - Invalidation du token');
              logger.error('HTTP', 'Erreur 401 Unauthorized', { url, method });
              invalidateAuthToken();
              break;

            case 403:
              // Forbidden - Permission refusée (peut aussi être un problème de token)
              console.warn('[HTTP] ⚠️ Erreur 403 Forbidden - Invalidation du token');
              logger.error('HTTP', 'Erreur 403 Forbidden - Permission refusée', { url, method });
              invalidateAuthToken();
              break;

            case 429:
              // Too Many Requests - Rate limiting
              console.warn('[HTTP] ⚠️ Erreur 429 Too Many Requests - Rate limiting');
              logger.warn('HTTP', 'Erreur 429 Rate Limiting - Trop de requêtes', { url, method });
              break;

            case 400:
              // Bad Request - Données invalides
              console.error('[HTTP] ❌ Erreur 400 Bad Request - Données invalides');
              logger.error('HTTP', 'Erreur 400 Bad Request', { url, method, response: responseData });
              break;

            case 404:
              // Not Found - Ressource introuvable
              console.error('[HTTP] ❌ Erreur 404 Not Found');
              logger.error('HTTP', 'Erreur 404 Not Found', { url, method });
              break;

            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              console.error(`[HTTP] ❌ Erreur serveur ${res.statusCode}`);
              logger.error('HTTP', `Erreur serveur ${res.statusCode}`, { url, method, response: responseData });
              break;

            default:
              // Autres erreurs
              logger.error('HTTP', `Erreur HTTP ${res.statusCode}`, { url, method, response: responseData });
              break;
          }

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
 * Fonction wrapper pour makeHttpsRequest avec retry et backoff exponentiel
 * @param {string} url - URL complète
 * @param {object} data - Données à envoyer
 * @param {string} method - Méthode HTTP
 * @param {object} customHeaders - Headers personnalisés
 * @param {string} authToken - Token d'authentification
 * @param {number} maxRetries - Nombre maximum de tentatives (défaut: 4)
 * @returns {Promise} - Promesse résolue avec la réponse ou rejetée après toutes les tentatives
 */
async function makeHttpsRequestWithRetry(url, data, method = 'POST', customHeaders = {}, authToken = null, maxRetries = 3) {
  const delays = [2000, 4000, 8000]; // Backoff exponentiel: 2s, 4s, 8s
  let currentAuthToken = authToken;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[HTTP Retry] Tentative ${attempt + 1}/${maxRetries + 1} pour ${method} ${url}`);
      const response = await makeHttpsRequest(url, data, method, customHeaders, currentAuthToken);
      console.log(`[HTTP Retry] ✅ Succès à la tentative ${attempt + 1}`);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      // Erreurs réseau (retry automatique)
      const isNetworkError = error.code === 'ECONNRESET' ||
                            error.code === 'ETIMEDOUT' ||
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ENOTFOUND';

      // Erreurs HTTP qui méritent un retry
      const isHttp401 = error.message && error.message.includes('HTTP 401');
      const isHttp403 = error.message && error.message.includes('HTTP 403');
      const isHttp5xx = error.message && (
        error.message.includes('HTTP 500') ||
        error.message.includes('HTTP 502') ||
        error.message.includes('HTTP 503') ||
        error.message.includes('HTTP 504')
      );

      const shouldRetry = isNetworkError || isHttp401 || isHttp403 || isHttp5xx;

      console.error(`[HTTP Retry] ❌ Tentative ${attempt + 1} échouée:`, error.message);

      // Si erreur 401/403, récupérer un nouveau token pour le prochain essai
      if ((isHttp401 || isHttp403) && !isLastAttempt) {
        console.log('[HTTP Retry] 🔄 Erreur d\'authentification - récupération d\'un nouveau token...');
        try {
          currentAuthToken = await getAuthToken();
          console.log('[HTTP Retry] ✅ Nouveau token obtenu');
        } catch (authError) {
          console.error('[HTTP Retry] ❌ Impossible de récupérer un nouveau token:', authError.message);
        }
      }

      // Si c'est la dernière tentative ou erreur non-retryable, on rejette
      if (isLastAttempt || !shouldRetry) {
        console.error(`[HTTP Retry] ❌ Échec définitif après ${attempt + 1} tentative(s)`);
        throw error;
      }

      // Sinon, on attend avant de réessayer
      const delay = delays[attempt] || delays[delays.length - 1];
      console.log(`[HTTP Retry] ⏳ Attente de ${delay}ms avant la prochaine tentative...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
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
    logger.info('SYNC_RETRY', `Démarrage retry pour ${unsyncedOrders.length} commande(s)`, {
      orderIds: unsyncedOrders.map(o => o.id)
    });

    // Tenter de synchroniser chaque commande
    for (const order of unsyncedOrders) {
      try {
        const attemptNumber = (order.sync_attempts || 0) + 1;
        console.log(`[Sync Retry] Tentative ${attemptNumber}/${API_SYNC_CONFIG.maxAttempts} pour ${order.id}`);
        console.log(`[Sync Retry]   - sync_status: ${order.sync_status || 'N/A'}`);
        console.log(`[Sync Retry]   - sync_action: ${order.sync_action || 'N/A'}`);
        console.log(`[Sync Retry]   - sync_error: ${order.sync_error || 'N/A'}`);

        const result = await syncOrderToRemoteAPI(order.id);

        if (result.status === 'success') {
          console.log(`[Sync Retry] ✅ Commande ${order.id} synchronisée avec succès`);
          logger.info('SYNC_RETRY', `Commande ${order.id} synchronisée avec succès`, {
            orderId: order.id,
            attempt: attemptNumber,
            supabaseOrderId: result.response?.order?.id
          });
        } else {
          console.warn(`[Sync Retry] ⚠️  Échec synchronisation ${order.id}:`, result.error);
          logger.warn('SYNC_RETRY', `Échec synchronisation ${order.id}`, {
            orderId: order.id,
            attempt: attemptNumber,
            error: result.error
          });
        }
      } catch (error) {
        console.error(`[Sync Retry] ❌ Erreur lors du retry ${order.id}:`, error);
        logger.error('SYNC_RETRY', `Erreur lors du retry ${order.id}`, {
          orderId: order.id,
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('[Sync Retry] ❌ Erreur lors du retry global:', error);
    logger.error('SYNC_RETRY', 'Erreur lors du retry global', {
      error: error.message
    });
  }
}

/**
 * Charger la configuration machine depuis la base de données
 */
async function loadMachineConfig() {
  if (!photoSystemReady || !photoSystem?.db) {
    console.log('[Config] PhotoSystem non disponible - Utilisation du .env');
    return false;
  }

  try {
    const config = await photoSystem.db.getMachineConfig();

    if (config && config.kiosk_id && config.sales_point_id) {
      // Charger la config depuis la DB
      API_SYNC_CONFIG.kioskId = config.kiosk_id;
      API_SYNC_CONFIG.salesPointId = config.sales_point_id;
      API_SYNC_CONFIG.tva = config.tva || 20;

      console.log('[Config] ✅ Configuration chargée depuis la DB:', {
        kioskId: config.kiosk_id,
        salesPointId: config.sales_point_id,
        machineName: config.machine_name || 'Non défini',
        tva: API_SYNC_CONFIG.tva
      });
      return true; // Config complète
    } else {
      console.log('[Config] ⚠️  Configuration incomplète - En attente de setup');
      return false; // Config incomplète
    }
  } catch (error) {
    console.error('[Config] ❌ Erreur chargement config:', error);
    console.log('[Config] Utilisation du .env comme fallback');
    return false;
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
  setTimeout(() => {
    retrySyncPendingOrders();
    syncPendingPaymentLogs();
  }, 5000); // Attendre 5s après le démarrage

  // Puis réessayer à intervalle régulier
  syncRetryInterval = setInterval(() => {
    retrySyncPendingOrders();
    syncPendingPaymentLogs();
  }, API_SYNC_CONFIG.retryIntervalMs);
}

// Handler IPC pour synchroniser une commande
ipcMain.handle('order:sync-remote', async (event, orderId) => {
  return await syncOrderToRemoteAPI(orderId);
});

// Handler IPC pour créer une commande sur Supabase (status=pending)
ipcMain.handle('order:create-remote', async (event, orderData) => {
  console.log('[IPC] ═══════════════════════════════════════════════');
  console.log('[IPC] order:create-remote appelé');
  console.log('[IPC] orderData reçu:', JSON.stringify(orderData, null, 2));
  const result = await createOrderRemote(orderData);
  console.log('[IPC] Résultat de createOrderRemote:', JSON.stringify(result, null, 2));
  console.log('[IPC] ═══════════════════════════════════════════════');
  return result;
});

// Handler IPC pour mettre à jour une commande sur Supabase (status=completed + email + optin)
ipcMain.handle('order:update-remote', async (event, supabaseOrderId, email, localOrderId, optin) => {
  return await updateOrderRemote(supabaseOrderId, email, localOrderId, optin);
});

// Handler IPC pour créer une commande COMPLETED sur Supabase (après paiement Hexapay)
ipcMain.handle('order:create-completed-remote', async (event, localOrderId) => {
  console.log('[IPC] ═══════════════════════════════════════════════');
  console.log('[IPC] order:create-completed-remote appelé');
  console.log('[IPC] localOrderId:', localOrderId);

  // Mettre à jour le status local en 'completed' avec les détails du paiement
  if (photoSystem?.db && localOrderId) {
    try {
      // Mettre à jour status = completed avec note
      await photoSystem.db.updateOrderStatus(localOrderId, 'completed', 'Commande payée');
      // Mettre à jour payment_method = card
      await photoSystem.db.updateOrderDetails(localOrderId, { paymentMethod: 'card' });
      console.log('[IPC] ✅ Status local mis à jour: completed, payment_method: card');
    } catch (err) {
      console.error('[IPC] ⚠️ Erreur mise à jour status local:', err.message);
    }
  }

  const result = await createCompletedOrderRemote(localOrderId);
  console.log('[IPC] Résultat:', JSON.stringify(result, null, 2));
  console.log('[IPC] ═══════════════════════════════════════════════');
  return result;
});

/**
 * Annule une commande existante sur Supabase (status=cancelled)
 * Appelé depuis cart.js ou payment.js lors du clic sur "Annuler la commande"
 *
 * APPROCHE:
 * 1. GET la commande existante depuis Supabase
 * 2. Réutiliser toutes ses données
 * 3. Mettre à jour uniquement status=cancelled
 */
async function cancelOrderRemote(supabaseOrderId) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[CancelOrder] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  if (!supabaseOrderId) {
    console.log('[CancelOrder] Pas d\'ID Supabase fourni');
    return { status: 'error', error: 'ID Supabase manquant' };
  }

  try {
    console.log('[CancelOrder] ═══════════════════════════════════════════════');
    console.log('[CancelOrder] ❌ ANNULATION DE COMMANDE SUR SUPABASE');
    console.log('[CancelOrder] ═══════════════════════════════════════════════');
    console.log('[CancelOrder] Order ID Supabase:', supabaseOrderId);

    // ÉTAPE 1: GET la commande existante depuis Supabase
    console.log('[CancelOrder] ÉTAPE 1: Récupération de la commande existante depuis Supabase...');

    const authToken = await getAuthToken();
    const getUrl = `${API_SYNC_CONFIG.url}?id=${supabaseOrderId}`;

    console.log('[CancelOrder] GET URL:', getUrl);

    const existingOrderResponse = await makeHttpsRequestWithRetry(
      getUrl,
      null,
      'GET',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[CancelOrder] Réponse GET brute:', JSON.stringify(existingOrderResponse, null, 2));

    // Extraire les données de la commande (peut être dans response.order ou directement response)
    const existingOrder = existingOrderResponse.order || existingOrderResponse;

    if (!existingOrder) {
      throw new Error('Commande non trouvée sur Supabase');
    }

    console.log('[CancelOrder] ✅ Commande existante récupérée:');
    console.log('[CancelOrder]   - participant_id:', existingOrder.participant_id);
    console.log('[CancelOrder]   - qrcode:', existingOrder.qrcode);
    console.log('[CancelOrder]   - status actuel:', existingOrder.status);
    console.log('[CancelOrder]   - total_amount:', existingOrder.total_amount);

    // ÉTAPE 2: Construire le payload en réutilisant TOUTES les données existantes
    console.log('[CancelOrder] ÉTAPE 2: Construction du payload d\'annulation...');

    const payload = {
      participant_id: existingOrder.participant_id,
      qrcode: existingOrder.qrcode,
      customer_email: existingOrder.customer_email || null,
      customer_address: existingOrder.customer_address,
      total_amount: existingOrder.total_amount,
      sales_point_id: existingOrder.sales_point_id,
      kiosk_id: existingOrder.kiosk_id,
      memory_session_id: existingOrder.memory_session_id,
      universe_id: existingOrder.universe_id || null,
      lang: existingOrder.lang || 'fr', // Préserver la langue du client
      status: 'cancelled', // ← SEUL CHANGEMENT: status=cancelled
      last_step: existingOrder.last_step || null, // Préserver l'étape la plus avancée
      order_items: existingOrder.order_items || []
    };

    console.log('[CancelOrder] ═══════════════════════════════════════════════');
    console.log('[CancelOrder] 📤 PAYLOAD FINAL À ENVOYER:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('[CancelOrder] ═══════════════════════════════════════════════');
    console.log('[CancelOrder] Champs modifiés:');
    console.log('[CancelOrder]   - status:', existingOrder.status, '→', 'cancelled');
    console.log('[CancelOrder] ═══════════════════════════════════════════════');

    // ÉTAPE 3: PUT le payload mis à jour
    console.log('[CancelOrder] ÉTAPE 3: Envoi de l\'annulation...');

    const updateUrl = `${API_SYNC_CONFIG.url}?id=${supabaseOrderId}`;
    console.log('[CancelOrder] PUT URL:', updateUrl);

    const response = await makeHttpsRequestWithRetry(
      updateUrl,
      payload,
      'PUT',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[CancelOrder] ═══════════════════════════════════════════════');
    console.log('[CancelOrder] ✅ COMMANDE ANNULÉE AVEC SUCCÈS');
    console.log('[CancelOrder] ═══════════════════════════════════════════════');
    console.log('[CancelOrder] Réponse:', JSON.stringify(response, null, 2));

    // Logger dans eclipso log
    logger.logSupabaseSync('ORDER_CANCEL_SUCCESS', {
      supabaseOrderId,
      status: 'cancelled'
    });

    // Mettre à jour le statut de sync dans la DB locale (rechercher par supabase_order_id)
    if (photoSystem?.db) {
      try {
        const localOrder = await photoSystem.db.getOrderBySupabaseId(supabaseOrderId);
        if (localOrder) {
          await photoSystem.db.updateOrderSyncStatus(
            localOrder.id,
            'synced',
            'cancel',
            supabaseOrderId,
            null
          );
        }
      } catch (syncErr) {
        console.warn('[CancelOrder] Erreur mise à jour sync status (non bloquant):', syncErr.message);
      }
    }

    return { status: 'success', response };

  } catch (error) {
    console.error('[CancelOrder] ❌ Erreur annulation commande:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('ORDER_CANCEL_FAILED', {
      supabaseOrderId,
      error: error.message,
      url: API_SYNC_CONFIG.url
    });

    // Marquer l'erreur de sync dans la DB locale (rechercher par supabase_order_id)
    if (photoSystem?.db) {
      try {
        const localOrder = await photoSystem.db.getOrderBySupabaseId(supabaseOrderId);
        if (localOrder) {
          await photoSystem.db.markOrderSyncError(
            localOrder.id,
            'cancel',
            error.message
          );
        }
      } catch (syncErr) {
        console.warn('[CancelOrder] Erreur mise à jour sync error (non bloquant):', syncErr.message);
      }
    }

    return { status: 'error', error: error.message };
  }
}

// Handler IPC pour annuler une commande sur Supabase
ipcMain.handle('order:cancel-remote', async (event, supabaseOrderId) => {
  console.log('[IPC] ═══════════════════════════════════════════════');
  console.log('[IPC] order:cancel-remote appelé');
  console.log('[IPC] supabaseOrderId:', supabaseOrderId);
  const result = await cancelOrderRemote(supabaseOrderId);
  console.log('[IPC] Résultat:', JSON.stringify(result, null, 2));
  console.log('[IPC] ═══════════════════════════════════════════════');
  return result;
});

/**
 * ===== SYNCHRONISATION SCAN STORIES =====
 */

/**
 * Synchroniser un scan_story vers Supabase
 * @param {string} participantId - ID du participant
 * @param {string} universeId - ID de l'univers
 * @param {string} createdAt - Date de création locale (format: YYYY-MM-DD HH:MM:SS)
 */
async function syncScanStoryToRemote(participantId, universeId, createdAt) {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[ScanStory] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  try {
    console.log('[ScanStory] ═══════════════════════════════════════════════');
    console.log('[ScanStory] 📤 SYNCHRONISATION SCAN STORY VERS SUPABASE');
    console.log('[ScanStory] ═══════════════════════════════════════════════');
    console.log('[ScanStory] participant_id:', participantId);
    console.log('[ScanStory] universe_id:', universeId);
    console.log('[ScanStory] created_at:', createdAt);

    // Récupérer le kiosk_id depuis la config
    const kioskId = API_SYNC_CONFIG.kioskId;
    console.log('[ScanStory] kiosk_id:', kioskId);

    // Construire le qrcode = universe_id + participant_id
    const qrcode = universeId && participantId ? `${universeId}${participantId}` : null;
    console.log('[ScanStory] qrcode:', qrcode);

    // Convertir la date locale en format ISO pour Supabase
    // createdAt est au format "YYYY-MM-DD HH:MM:SS" en heure locale
    let dateScan = createdAt;
    if (createdAt && !createdAt.includes('T')) {
      // Convertir "YYYY-MM-DD HH:MM:SS" en "YYYY-MM-DDTHH:MM:SSZ"
      dateScan = createdAt.replace(' ', 'T') + 'Z';
    }
    console.log('[ScanStory] date_scan:', dateScan);

    // Construire le payload
    const payload = {
      participant_id: participantId,
      universe_id: universeId,
      qrcode: qrcode,
      kiosk_id: kioskId,
      date_scan: dateScan
    };

    console.log('[ScanStory] Payload:', JSON.stringify(payload, null, 2));

    // URL de l'API scan stories
    const scanStoriesUrl = (process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1') + '/manage-scan-stories';
    console.log('[ScanStory] URL:', scanStoriesUrl);

    // Récupérer un token d'authentification
    const authToken = await getAuthToken();

    // Faire l'appel HTTP POST
    const response = await makeHttpsRequestWithRetry(
      scanStoriesUrl,
      payload,
      'POST',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[ScanStory] ✅ Scan story synchronisé avec succès');
    console.log('[ScanStory] Réponse:', JSON.stringify(response, null, 2));

    // Logger dans eclipso log
    logger.logSupabaseSync('SCAN_STORY_SYNC_SUCCESS', {
      participantId,
      universeId,
      qrcode,
      kioskId,
      dateScan
    });

    return { status: 'success', response };

  } catch (error) {
    console.error('[ScanStory] ❌ Erreur synchronisation scan story:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('SCAN_STORY_SYNC_FAILED', {
      participantId,
      universeId,
      error: error.message
    });

    return { status: 'error', error: error.message };
  }
}

// Handler IPC pour synchroniser un scan story
ipcMain.handle('scan-story:sync-remote', async (event, { participantId, universeId, createdAt }) => {
  console.log('[IPC] scan-story:sync-remote appelé');
  return await syncScanStoryToRemote(participantId, universeId, createdAt);
});

/**
 * ===== SYNCHRONISATION PARTICIPANTS VERS SUPABASE =====
 * Synchronise un participant vers l'API Supabase /manage-participants
 */
async function syncParticipantToRemote(participantId, universeId) {
  console.log('[Participant] syncParticipantToRemote appelé:', { participantId, universeId });

  if (!API_SYNC_CONFIG.enabled) {
    console.log('[Participant] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  try {
    console.log('[Participant] ═══════════════════════════════════════════════');
    console.log('[Participant] 📤 SYNCHRONISATION PARTICIPANT VERS SUPABASE');
    console.log('[Participant] ═══════════════════════════════════════════════');
    console.log('[Participant] participant_id:', participantId);
    console.log('[Participant] universe_id:', universeId);

    // Toujours récupérer la config depuis la DB pour avoir les valeurs à jour
    let kioskId = null;
    let salesPointId = null;

    if (photoSystemReady && photoSystem?.db) {
      try {
        const dbConfig = await photoSystem.db.getMachineConfig();
        console.log('[Participant] Config DB brute:', dbConfig);
        if (dbConfig) {
          kioskId = dbConfig.kiosk_id || null;
          salesPointId = dbConfig.sales_point_id || null;
        }
      } catch (dbError) {
        console.warn('[Participant] Erreur chargement config DB:', dbError.message);
      }
    }

    // Fallback sur API_SYNC_CONFIG si DB non disponible
    if (!kioskId) kioskId = API_SYNC_CONFIG.kioskId;
    if (!salesPointId) salesPointId = API_SYNC_CONFIG.salesPointId;

    // Nettoyer les valeurs par défaut
    if (kioskId === 'default-kiosk-uuid') kioskId = null;
    if (salesPointId === 'default-sales-point-uuid') salesPointId = null;

    console.log('[Participant] kiosk_id:', kioskId);
    console.log('[Participant] sales_point_id:', salesPointId);

    // Construire le qrcode = universe_id + participant_id
    const qrcode = (universeId && participantId) ? `${universeId}${participantId}` : null;
    console.log('[Participant] qrcode:', qrcode);

    // Construire le payload
    const payload = {
      universe_id: universeId || null,
      kiosk_id: kioskId,
      participant_id: participantId || null,
      sales_point_id: salesPointId,
      qrcode: qrcode
    };

    console.log('[Participant] Payload:', JSON.stringify(payload, null, 2));

    // URL de l'API participants
    const participantsUrl = (process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1') + '/manage-participants';
    console.log('[Participant] URL:', participantsUrl);

    // Récupérer un token d'authentification
    const authToken = await getAuthToken();

    // Faire l'appel HTTP POST (sans retry automatique pour gérer 409)
    try {
      const response = await makeHttpsRequest(
        participantsUrl,
        payload,
        'POST',
        {
          'apikey': API_SYNC_CONFIG.supabaseAnonKey
        },
        authToken
      );

      console.log('[Participant] ✅ Participant synchronisé avec succès');
      console.log('[Participant] Réponse:', JSON.stringify(response, null, 2));

      // Logger dans eclipso log
      logger.logSupabaseSync('PARTICIPANT_SYNC_SUCCESS', {
        participantId,
        universeId,
        qrcode,
        kioskId,
        salesPointId
      });

      return { status: 'success', response };

    } catch (httpError) {
      // Vérifier si c'est une erreur 409 (participant existe déjà)
      if (httpError.message && httpError.message.includes('409')) {
        console.log('[Participant] ℹ️  Participant existe déjà (409) - Continuation sans erreur');
        logger.logSupabaseSync('PARTICIPANT_ALREADY_EXISTS', {
          participantId,
          universeId,
          qrcode
        });
        return { status: 'exists', message: 'Participant existe déjà' };
      }
      // Sinon, propager l'erreur
      throw httpError;
    }

  } catch (error) {
    console.error('[Participant] ❌ Erreur synchronisation participant:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('PARTICIPANT_SYNC_FAILED', {
      participantId,
      universeId,
      error: error.message
    });

    return { status: 'error', error: error.message };
  }
}

// Handler IPC pour synchroniser un participant
ipcMain.handle('participant:sync-remote', async (event, { participantId, universeId }) => {
  console.log('[IPC] participant:sync-remote appelé');
  return await syncParticipantToRemote(participantId, universeId);
});

/**
 * ===== SYNCHRONISATION ÉTAT MACHINE VERS SUPABASE =====
 * Envoie l'état de la machine (online/offline) à intervalles réguliers
 */
let machineStateInterval = null;
let isQuitting = false;

/**
 * Obtenir la date locale au format ISO
 */
function getLocalDateISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

/**
 * Synchroniser l'état de la machine vers Supabase
 */
async function syncMachineState(status = 'online') {
  console.log('[MachineState] syncMachineState appelé:', status);

  if (!API_SYNC_CONFIG.enabled) {
    console.log('[MachineState] API désactivée');
    return { status: 'skipped', message: 'API désactivée' };
  }

  try {
    console.log('[MachineState] ═══════════════════════════════════════════════');
    console.log('[MachineState] 📤 SYNCHRONISATION ÉTAT MACHINE VERS SUPABASE');
    console.log('[MachineState] ═══════════════════════════════════════════════');
    console.log('[MachineState] status:', status);

    // Récupérer kiosk_id et sales_point_id depuis la DB
    let kioskId = null;
    let salesPointId = null;

    if (photoSystemReady && photoSystem?.db) {
      try {
        const dbConfig = await photoSystem.db.getMachineConfig();
        if (dbConfig) {
          kioskId = dbConfig.kiosk_id || null;
          salesPointId = dbConfig.sales_point_id || null;
        }
      } catch (dbError) {
        console.warn('[MachineState] Erreur chargement config DB:', dbError.message);
      }
    }

    // Fallback sur API_SYNC_CONFIG
    if (!kioskId) kioskId = API_SYNC_CONFIG.kioskId;
    if (!salesPointId) salesPointId = API_SYNC_CONFIG.salesPointId;

    // Nettoyer les valeurs par défaut
    if (kioskId === 'default-kiosk-uuid') kioskId = null;
    if (salesPointId === 'default-sales-point-uuid') salesPointId = null;

    console.log('[MachineState] kiosk_id:', kioskId);
    console.log('[MachineState] sales_point_id:', salesPointId);

    // Si pas de config valide, on ne peut pas synchroniser
    if (!kioskId || !salesPointId) {
      console.warn('[MachineState] Config machine incomplète, sync impossible');
      return { status: 'skipped', message: 'Config machine incomplète' };
    }

    // Construire le payload
    const payload = {
      kiosk_id: kioskId,
      sales_point_id: salesPointId,
      status: status,
      soft_type: 'command',
      date_local: getLocalDateISO(),
      version: app.getVersion()
    };

    console.log('[MachineState] Payload:', JSON.stringify(payload, null, 2));

    // URL de l'API machine state
    const machineStateUrl = (process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1') + '/manage-machine-state';
    console.log('[MachineState] URL:', machineStateUrl);

    // Récupérer un token d'authentification
    const authToken = await getAuthToken();

    // Faire l'appel HTTP POST
    const response = await makeHttpsRequest(
      machineStateUrl,
      payload,
      'POST',
      {
        'apikey': API_SYNC_CONFIG.supabaseAnonKey
      },
      authToken
    );

    console.log('[MachineState] ✅ État machine synchronisé avec succès');
    console.log('[MachineState] Réponse:', JSON.stringify(response, null, 2));

    // Logger dans eclipso log
    logger.logSupabaseSync('MACHINE_STATE_SYNC_SUCCESS', {
      status,
      kioskId,
      salesPointId
    });

    return { status: 'success', response };

  } catch (error) {
    console.error('[MachineState] ❌ Erreur synchronisation état machine:', error);

    // Logger l'erreur dans eclipso log
    logger.logSupabaseError('MACHINE_STATE_SYNC_FAILED', {
      status,
      error: error.message
    });

    return { status: 'error', error: error.message };
  }
}

/**
 * Démarrer la synchronisation périodique de l'état de la machine
 */
function startMachineStateSync() {
  if (!API_SYNC_CONFIG.enabled) {
    console.log('[MachineState] Sync périodique désactivée (ENABLE_API_SYNC=false)');
    return;
  }

  const intervalMs = API_SYNC_CONFIG.machineStateSyncIntervalMs;
  console.log(`[MachineState] Démarrage sync périodique (intervalle: ${intervalMs / 1000}s)`);

  // Sync immédiate au démarrage
  syncMachineState('online').catch(err => {
    console.error('[MachineState] Erreur sync initiale:', err.message);
  });

  // Sync périodique
  if (machineStateInterval) {
    clearInterval(machineStateInterval);
  }
  machineStateInterval = setInterval(() => {
    syncMachineState('online').catch(err => {
      console.error('[MachineState] Erreur sync périodique:', err.message);
    });
  }, intervalMs);
}

/**
 * Arrêter la synchronisation périodique et envoyer offline
 */
async function stopMachineStateSync() {
  console.log('[MachineState] Arrêt sync périodique');

  if (machineStateInterval) {
    clearInterval(machineStateInterval);
    machineStateInterval = null;
  }

  // Envoyer statut offline
  try {
    await syncMachineState('offline');
  } catch (error) {
    console.error('[MachineState] Erreur envoi offline:', error.message);
  }
}

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

ipcMain.handle('machine:save-config', async (event, kioskId, salesPointId, machineName, tva = 20) => {
  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }
  try {
    await photoSystem.db.saveMachineConfig(kioskId, salesPointId, machineName, tva);

    // Mettre à jour la configuration globale
    API_SYNC_CONFIG.kioskId = kioskId;
    API_SYNC_CONFIG.salesPointId = salesPointId;
    API_SYNC_CONFIG.tva = tva;

    console.log('[IPC] ✅ Configuration machine enregistrée:', { kioskId, salesPointId, machineName, tva });

    // Démarrer les services de sync maintenant que la config est complète
    if (photoSystem.startSyncServices) {
      console.log('[IPC] → Démarrage des services de synchronisation après config');
      photoSystem.startSyncServices();
    }
    startSyncRetrySystem();

    // Démarrer la synchronisation d'état machine (première configuration)
    console.log('[IPC] → Démarrage de la synchronisation d\'état machine après première config');
    await syncMachineState('online');
    startMachineStateSync();

    return { status: 'success' };
  } catch (error) {
    console.error('[IPC] Erreur sauvegarde config machine:', error);
    return { status: 'error', error: error.message };
  }
});

// Récupérer les infos d'un kiosk depuis l'API
ipcMain.handle('machine:fetch-kiosk', async (event, kioskId) => {
  console.log('[IPC] machine:fetch-kiosk appelé avec kioskId:', kioskId);

  if (!kioskId) {
    return { status: 'error', error: 'kiosk_id requis' };
  }

  try {
    // Construire l'URL de l'API
    const baseUrl = process.env.BASE_URL || 'https://ygetxuvqrknbggplzmvy.supabase.co/functions/v1';
    const apiUrl = `${baseUrl}/manage-kiosks?id=${encodeURIComponent(kioskId)}`;

    console.log('[IPC] Appel API:', apiUrl);

    // Obtenir le token d'authentification
    const authToken = await getAuthToken();
    if (!authToken) {
      console.warn('[IPC] Pas de token d\'authentification, tentative sans auth');
    }

    const headers = {
      'Content-Type': 'application/json',
      'apikey': API_SYNC_CONFIG.supabaseAnonKey
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers
    });

    console.log('[IPC] Réponse API status:', response.status);

    if (!response.ok) {
      if (response.status === 404) {
        return { status: 'not_found', message: 'Kiosk non trouvé' };
      }
      const errorText = await response.text();
      console.error('[IPC] Erreur API:', errorText);
      return { status: 'error', error: `Erreur API: ${response.status}` };
    }

    const data = await response.json();
    console.log('[IPC] Données kiosk reçues (raw):', JSON.stringify(data, null, 2));

    // Extraire le kiosk de la réponse (peut être dans data, data.kiosk, ou data.data)
    let kioskData = data;
    if (data && data.kiosk) {
      kioskData = data.kiosk;
      console.log('[IPC] Kiosk extrait de data.kiosk');
    } else if (data && data.data) {
      kioskData = data.data;
      console.log('[IPC] Kiosk extrait de data.data');
    }

    console.log('[IPC] Données kiosk finales:', JSON.stringify(kioskData, null, 2));

    // Vérifier que les champs requis sont présents
    if (!kioskData || !kioskData.sales_point_id) {
      console.warn('[IPC] Kiosk trouvé mais sales_point_id manquant');
      return { status: 'not_found', message: 'Kiosk invalide - sales_point_id manquant' };
    }

    // Extraire le vat_rate depuis sales_points si disponible
    let vatRate = 20; // Valeur par défaut
    if (kioskData.sales_points && kioskData.sales_points.vat_rate !== undefined) {
      vatRate = kioskData.sales_points.vat_rate;
      console.log('[IPC] VAT rate récupéré depuis sales_points:', vatRate);
    } else {
      console.log('[IPC] VAT rate non trouvé, utilisation de la valeur par défaut:', vatRate);
    }

    // Retourner les données du kiosk avec vat_rate
    return {
      status: 'success',
      kiosk: {
        ...kioskData,
        vat_rate: vatRate
      }
    };

  } catch (error) {
    console.error('[IPC] Erreur fetch kiosk:', error);
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

/**
 * ===== HANDLERS IPC WINDOW =====
 */
ipcMain.handle('window:toggle-fullscreen', async (event) => {
  if (mainWindow) {
    const isFullscreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullscreen);
    console.log('[IPC] Fullscreen toggled:', !isFullscreen);
    return { status: 'success', fullscreen: !isFullscreen };
  }
  return { status: 'error', error: 'Window not available' };
});

ipcMain.handle('window:is-fullscreen', async (event) => {
  if (mainWindow) {
    return { status: 'success', fullscreen: mainWindow.isFullScreen() };
  }
  return { status: 'error', error: 'Window not available' };
});

/**
 * ===== HANDLERS IPC APP =====
 */
ipcMain.handle('app:quit', async (event) => {
  console.log('[IPC] app:quit - Fermeture application demandée');
  // Fermer toutes les fenêtres puis quitter
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.close();
    }
    app.exit(0);
  }, 200);
  return { status: 'success' };
});

/**
 * ===== HANDLERS IPC PARTICIPANTS =====
 */
ipcMain.handle('participant:add-or-update', async (event, participantId, universeId, status) => {
  console.log('[IPC] participant:add-or-update appelé:', { participantId, universeId, status });

  if (!photoSystemReady || !photoSystem?.db) {
    return { status: 'error', error: 'PhotoSystem non disponible' };
  }

  try {
    await photoSystem.db.addOrUpdateParticipant(participantId, universeId, status || 'active');
    console.log('[IPC] ✅ Participant créé/mis à jour:', participantId);

    // Sync participant vers Supabase (non bloquant)
    syncParticipantToRemote(participantId, universeId)
      .then(syncResult => {
        if (syncResult.status === 'success') {
          console.log('[IPC] Participant synchronisé vers Supabase:', participantId);
        } else {
          console.warn('[IPC] Échec sync participant:', syncResult.error);
        }
      })
      .catch(err => {
        console.error('[IPC] Erreur sync participant:', err.message);
      });

    return { status: 'success', participantId, universeId };
  } catch (error) {
    console.error('[IPC] ❌ Erreur création participant:', error);
    return { status: 'error', error: error.message };
  }
});

console.log('[Main] Tous les handlers IPC sont enregistrés');



// Handler dupliqué supprimé - utiliser uniquement 'admin:dashboard' (ligne 288-301)