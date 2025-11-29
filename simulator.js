/**
 * Hexapay Simulator - Node.js UDP Server
 * Simule les réponses de l'application Hexapay
 * Écoute sur port 50001 (commandes)
 * Répond sur port 50000 (réponses)
 */

import dgram from 'dgram';

class HexapaySimulator {
  constructor(options = {}) {
    this.cmdPort = options.cmdPort || 50001;
    this.respPort = options.respPort || 50000;
    this.socket = dgram.createSocket('udp4');
    
    // Configuration : changer 'CBaccepted' en 'CBrefused' pour simuler rejet
    this.responses = {
      'CBready': 'CBreadyOk',
      'CBinfos': 'CBregistered',
      'CBpay': 'CBaccepted',        // Changez à 'CBrefused' pour tester rejet
      // 'CBpay': 'CBrefused',        // Changez à 'CBrefused' pour tester rejet
      'CBpayrec': 'CBpaydone',
      'CBcancel': 'CBcancelled',
      'CBtelecol': 'CBtelecollecteOk'
    };
    
    this.setupSocket();
  }

  setupSocket() {
    this.socket.on('message', (msg, rinfo) => {
      const command = msg.toString('utf-8').trim();
      const timestamp = this.getTimestamp();
      
      console.log(`\n[${timestamp}] ← Reçu: "${command}"`);
      console.log(`              De: ${rinfo.address}:${rinfo.port}`);
      
      const response = this.handleCommand(command);
      
      if (response) {
        this.sendResponse(response, rinfo);
        console.log(`[${timestamp}] → Envoyé: "${response}"`);
      } else {
        console.log(`[${timestamp}] ✗ Commande inconnue`);
      }
    });

    this.socket.on('error', (err) => {
      console.error('Erreur socket UDP:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${this.cmdPort} déjà utilisé.`);
        console.error('Essayez de fermer l\'autre instance ou changez les ports.');
      }
      process.exit(1);
    });

    this.socket.bind(this.cmdPort, '127.0.0.1', () => {
      console.log('\n' + '='.repeat(60));
      console.log('  Hexapay Simulator v1.0 (Node.js)');
      console.log('='.repeat(60));
      console.log(`✓ Écoute sur port ${this.cmdPort} (commandes)`);
      console.log(`✓ Répond sur port ${this.respPort} (réponses)`);
      console.log('\nCommandes supportées:');
      Object.entries(this.responses).forEach(([cmd, resp]) => {
        console.log(`  ${cmd.padEnd(15)} → ${resp}`);
      });
      console.log('\nPour simuler un rejet:');
      console.log('  Modifiez "CBpay": "CBaccepted"');
      console.log('  En "CBpay": "CBrefused" ligne 15');
      console.log('='.repeat(60));
      console.log('\nEn attente de commandes...\n');
    });
  }

  handleCommand(command) {
    // Trouver la commande correspondante
    for (const [key, response] of Object.entries(this.responses)) {
      if (command.startsWith(key)) {
        return response;
      }
    }
    return null;
  }

  sendResponse(response, clientInfo) {
    const buffer = Buffer.from(response, 'utf-8');
    this.socket.send(buffer, 0, buffer.length, this.respPort, '127.0.0.1', (err) => {
      if (err) {
        console.error(`✗ Erreur d'envoi: ${err.message}`);
      }
    });
  }

  getTimestamp() {
    return new Date().toLocaleTimeString('fr-FR');
  }

  stop() {
    this.socket.close();
    console.log('\n✓ Simulateur arrêté');
    process.exit(0);
  }
}

// Lancer le simulateur
const simulator = new HexapaySimulator();

// Gestion Ctrl+C
process.on('SIGINT', () => {
  simulator.stop();
});