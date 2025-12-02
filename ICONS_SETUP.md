# 🎨 Configuration des Icônes PrintStation

## 📁 Placement des Fichiers

### Structure recommandée :
```
printstationApp/
├── renderer/
│   └── assets/
│       ├── favicon.ico     ← Pour Windows (build)
│       └── favicon.png     ← Pour la fenêtre (runtime)
└── package.json
```

## ⚙️ Configuration

### 1. Icône de la fenêtre de l'application (runtime)

L'icône qui s'affiche dans la barre des tâches quand l'app est lancée.

**Fichier:** `main.js` (ligne 42)

**Configuration actuelle:**
```javascript
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
```

**Configuration avec icône:**
```javascript
mainWindow = new BrowserWindow({
  width: 1920,
  height: 1080,
  fullscreen: process.env.NODE_ENV === 'production',
  icon: path.join(__dirname, 'renderer', 'assets', 'favicon.png'), // ✅ Ajout de l'icône
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    enableRemoteModule: false,
    nodeIntegration: false,
  },
});
```

### 2. Icône de l'installateur et du .exe

L'icône qui s'affiche pour le fichier .exe et dans les programmes installés.

**Fichier:** `package.json`

**Configuration actuelle:**
```json
{
  "build": {
    "win": {
      "icon": "renderer/assets/icon.ico"
    }
  }
}
```

**Configuration avec votre fichier:**
```json
{
  "build": {
    "win": {
      "icon": "renderer/assets/favicon.ico"  // ✅ Utiliser favicon.ico
    }
  }
}
```

## 📋 Formats Requis

| Utilisation | Format | Résolution Minimale |
|-------------|--------|---------------------|
| Fenêtre de l'app (runtime) | `.png` | 256x256 ou 512x512 |
| Build Windows (.exe) | `.ico` | Multi-tailles (16, 32, 48, 256) |
| Build macOS | `.icns` | 512x512 ou 1024x1024 |
| Build Linux | `.png` | 512x512 ou 1024x1024 |

## ✅ Checklist

- [ ] Placer `favicon.png` dans `renderer/assets/`
- [ ] Placer `favicon.ico` dans `renderer/assets/`
- [ ] Modifier `main.js` pour ajouter `icon: path.join(__dirname, 'renderer', 'assets', 'favicon.png')`
- [ ] Modifier `package.json` pour changer `icon.ico` en `favicon.ico`
- [ ] Tester en mode dev: `npm start` (vérifier l'icône dans la barre des tâches)
- [ ] Compiler: `npm run dist` (vérifier l'icône du .exe)

## 🧪 Test

### Test en développement
```bash
npm start
```
→ L'icône devrait apparaître dans la barre des tâches

### Test après compilation
```bash
npm run dist
```
→ L'icône devrait apparaître:
- Sur le fichier `PrintStation Setup 1.0.0.exe`
- Sur le fichier `PrintStation 1.0.0.exe`
- Dans la barre des tâches quand l'app est lancée
- Dans "Programmes et fonctionnalités" (après installation)

## 🔧 Résolution de Problèmes

### L'icône n'apparaît pas en mode dev

**Cause:** Le chemin vers l'icône est incorrect

**Solution:**
```javascript
// Vérifier que le fichier existe
console.log('Icon path:', path.join(__dirname, 'renderer', 'assets', 'favicon.png'));
console.log('Icon exists:', fs.existsSync(path.join(__dirname, 'renderer', 'assets', 'favicon.png')));
```

### L'icône n'apparaît pas après le build

**Cause:** Le fichier .ico n'est pas inclus dans le build

**Solution:** Vérifier que le fichier est bien dans `renderer/assets/` avant de compiler

### L'icône est floue ou pixelisée

**Cause:** Résolution trop basse

**Solution:** Utiliser une icône haute résolution (512x512 minimum)

## 📦 Pour Distribution Multi-Plateforme

Si vous voulez compiler pour plusieurs plateformes :

```json
{
  "build": {
    "win": {
      "icon": "renderer/assets/favicon.ico"
    },
    "mac": {
      "icon": "renderer/assets/favicon.icns"
    },
    "linux": {
      "icon": "renderer/assets/favicon.png"
    }
  }
}
```

## 🎯 Raccourci: Configuration Automatique

Si vous avez déjà placé vos fichiers dans `renderer/assets/`, exécutez simplement les modifications décrites ci-dessus dans:
1. `main.js` (ajout de la propriété `icon`)
2. `package.json` (changement de `icon.ico` vers `favicon.ico`)
