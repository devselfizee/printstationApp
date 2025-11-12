# PrintStation - Kiosk d'impression modulaire

Application Electron pour kiosk d'impression photos avec sélection d'univers graphiques, panier dynamique et paiement.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev    # Build + Lance Electron
npm run watch  # Mode watch (rechargement auto)
```

## Build

```bash
npm run build  # Build une fois
```

## Structure

```
.
├── main.js              # Electron main process
├── preload.js           # Preload script (sécurité)
├── build.js             # Configuration esbuild
├── package.json
└── renderer/
    ├── index.html
    ├── styles.css
    ├── app.js           # Entry point renderer
    ├── dist/
    │   └── app.bundle.js (généré)
    └── src/
        ├── state.js
        ├── data.js
        ├── i18n.js
        ├── utils.js
        ├── cart.js
        ├── navigation.js
        └── pages/
            ├── topbar.js
            ├── qr.js
            ├── listing.js
            ├── detail.js
            ├── cart.js
            ├── payment.js
            ├── form.js
            ├── thanks.js
            └── modal.js
```

## Fonctionnalités

- ✅ Multilingue (FR/EN/ES/IT/DE)
- ✅ Univers graphiques personnalisés
- ✅ Panier avec pricing progressif
- ✅ Upselling modal
- ✅ Formulaire email avec clavier virtuel
- ✅ Architecture modulaire
- ✅ ES6 modules avec esbuild

## Notes

- Les images doivent être dans `renderer/assets/`
- À ajouter : QR code scanner, intégration paiement, email
