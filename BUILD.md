# 📦 Guide de Compilation PrintStation

Ce guide explique comment créer un fichier `.exe` pour distribuer l'application PrintStation sur d'autres ordinateurs Windows.

---

## 🛠️ Prérequis

Avant de compiler, assurez-vous d'avoir :

- **Node.js** 18 ou supérieur
- **npm** ou **yarn**
- **Git** (optionnel)
- **Windows 10/11** (pour compiler un .exe Windows)

---

## 📋 Étapes de Compilation

### 1. **Installer les dépendances**

```bash
npm install
```

Cela va installer :
- Electron
- electron-builder (outil de packaging)
- sqlite3 (base de données)
- Toutes les autres dépendances

### 2. **Compiler l'application**

```bash
npm run dist
```

Cette commande va :
1. Exécuter `node build.js` pour préparer les fichiers
2. Lancer `electron-builder --win` pour créer l'exécutable Windows

**Temps estimé** : 2-5 minutes (selon votre machine)

### 3. **Récupérer les fichiers .exe**

Une fois la compilation terminée, les fichiers se trouvent dans le dossier :

```
dist/
  ├── PrintStation Setup 1.0.0.exe    ← Installeur NSIS
  └── PrintStation 1.0.0.exe          ← Version portable
```

**Deux versions sont créées :**

1. **PrintStation Setup 1.0.0.exe** (Installeur)
   - Nécessite une installation
   - Crée un raccourci sur le bureau
   - Crée une entrée dans le menu Démarrer
   - Permet de désinstaller proprement
   - **Recommandé pour la distribution**

2. **PrintStation 1.0.0.exe** (Portable)
   - Aucune installation nécessaire
   - Peut être exécuté depuis une clé USB
   - Idéal pour les tests ou usage temporaire

---

## 🚀 Distribution

### Option 1 : Distribuer l'installeur (Recommandé)

Envoyez le fichier **PrintStation Setup 1.0.0.exe** aux utilisateurs.

**Instructions pour les utilisateurs :**
1. Double-cliquer sur `PrintStation Setup 1.0.0.exe`
2. Suivre l'assistant d'installation
3. Choisir le dossier d'installation (par défaut : `C:\Program Files\PrintStation`)
4. Lancer l'application depuis le bureau ou le menu Démarrer

### Option 2 : Distribuer la version portable

Envoyez le fichier **PrintStation 1.0.0.exe** aux utilisateurs.

**Instructions pour les utilisateurs :**
1. Copier `PrintStation 1.0.0.exe` où vous voulez
2. Double-cliquer pour lancer l'application
3. Aucune installation nécessaire

---

## ⚙️ Configuration de Build

La configuration se trouve dans `package.json` :

```json
{
  "build": {
    "appId": "com.printstation.app",
    "productName": "PrintStation",
    "win": {
      "target": ["nsis", "portable"],
      "icon": "renderer/assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    }
  }
}
```

### Personnalisation

**Changer le nom de l'application :**
```json
"productName": "VotreNom"
```

**Changer l'icône :**
1. Remplacer `renderer/assets/icon.ico` par votre icône
2. Format requis : `.ico` avec tailles multiples (16x16, 32x32, 48x48, 256x256)

**Changer la version :**
```json
"version": "1.0.0"
```

**Créer uniquement l'installeur :**
```json
"target": ["nsis"]
```

**Créer uniquement la version portable :**
```json
"target": ["portable"]
```

---

## 📝 Scripts Disponibles

| Script | Description |
|--------|-------------|
| `npm start` | Démarre l'application en mode développement |
| `npm run dev` | Build + démarre l'application |
| `npm run build` | Compile les fichiers JS (esbuild) |
| `npm run dist` | **Crée le fichier .exe** |
| `npm run watch` | Mode watch pour le développement |

---

## 🐛 Résolution de Problèmes

### Erreur : "Cannot find module 'sqlite3'"

**Solution :**
```bash
npm install
npm run postinstall
```

### Erreur : "ENOENT: no such file or directory, open 'icon.ico'"

**Solution :**
Vérifiez que le fichier `renderer/assets/icon.ico` existe.

### Le .exe se lance mais l'application ne fonctionne pas

**Vérifications :**
1. Vérifiez que le dossier `renderer/src/photosystem` est inclus dans le build
2. Regardez les logs dans la console Electron (F12)
3. Vérifiez que la base de données SQLite est accessible

### Erreur de compilation sur Linux/Mac

**Note :** Pour compiler un .exe Windows depuis Linux/Mac, vous avez besoin de :
```bash
# Installer wine (sur Linux)
sudo apt-get install wine

# Puis lancer le build
npm run dist
```

---

## 📊 Taille du Fichier

- **Installeur NSIS** : ~150-200 MB
- **Version portable** : ~150-200 MB

La taille inclut :
- Electron runtime (~100 MB)
- Node.js embedded
- sqlite3 natif
- Votre application

---

## 🔒 Signature de Code (Optionnel)

Pour signer votre application avec un certificat de code :

```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "YOUR_PASSWORD"
    }
  }
}
```

**Avantages :**
- Évite l'avertissement "Éditeur inconnu"
- Augmente la confiance des utilisateurs
- Requis pour certaines entreprises

**Coût :** ~200-400€/an pour un certificat de signature de code

---

## 📦 Build Multi-Plateforme

### Windows + Mac + Linux

```bash
npm run dist -- --win --mac --linux
```

### Configuration dans package.json

```json
{
  "build": {
    "mac": {
      "target": "dmg",
      "icon": "renderer/assets/icon.icns"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "renderer/assets/icon.png"
    }
  }
}
```

---

## ✅ Checklist Avant Distribution

- [ ] Version mise à jour dans `package.json`
- [ ] Variables d'environnement configurées (`.env`)
- [ ] Base de données testée
- [ ] Icône personnalisée ajoutée
- [ ] Application testée en mode production (`npm run dist` puis lancer l'exe)
- [ ] README utilisateur inclus
- [ ] Licence ajoutée (si applicable)

---

## 📞 Support

Pour plus d'informations sur electron-builder :
- [Documentation officielle](https://www.electron.build/)
- [GitHub](https://github.com/electron-userland/electron-builder)

---

**Bonne compilation ! 🚀**
