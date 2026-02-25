/**
 * universeService.js - Gestion des univers graphiques
 * AMÉLORÉ: Utilise des données locales au lieu de l'API externe
 */

import * as db from './db.js';
import path from 'path';
import os from 'os';
import * as fs from 'fs/promises';

const DATA_DIR = path.join(os.homedir(), '.printstation');
const UNIVERSES_DIR = path.join(DATA_DIR, 'universes');

const universeCache = new Map();

/**
 * ===== UNIVERS PRÉDÉFINIS LOCAUX =====
 * Alternative à l'API externe si elle n'est pas disponible
 */
const LOCAL_UNIVERSES = {
  A: {
    id: 'A',
    name: 'L\'horizon de Khéops',
    description: 'Thème égyptien avec couleurs dorées et bleues',

    theme: {
      primaryColor: '#1e3a8a',
      secondaryColor: '#1e40af',
      backgroundColor: '#fef3c7',
      fontFamily: 'Arial, sans-serif',
      accentColor: '#fbbf24',
    },

    pricing: {
      basePrice: 3.00,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.92 },
        { quantity: 10, multiplier: 0.88 },
        { quantity: 20, multiplier: 0.80 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/A/logo.png',
      background: '/assets/A/bg.jpg',
    },
  },

  B: {
    id: 'B',
    name: 'Mondes Disparus',
    description: 'Collection archéologique avec thèmes anciens',

    theme: {
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
      backgroundColor: '#F5DEB3',
      fontFamily: 'Georgia, serif',
      accentColor: '#FFD700',
    },

    pricing: {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
        { quantity: 20, multiplier: 0.85 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/B/logo.png',
      background: '/assets/B/bg.jpg',
    },
  },

  C: {
    id: 'C',
    name: 'Remparts',
    description: 'Remparts',

    theme: {
      primaryColor: '#059669',
      secondaryColor: '#10b981',
      backgroundColor: '#ecfdf5',
      fontFamily: 'Verdana, sans-serif',
      accentColor: '#34d399',
    },

    pricing: {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
        { quantity: 20, multiplier: 0.85 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/C/logo.png',
      background: '/assets/C/bg.jpg',
    },
  },

  D: {
    id: 'D',
    name: 'Impressionnistes',
    description: 'Impressionnistes',

    theme: {
      primaryColor: '#7c3aed',
      secondaryColor: '#8b5cf6',
      backgroundColor: '#f5f3ff',
      fontFamily: 'Times New Roman, serif',
      accentColor: '#a78bfa',
    },

    pricing: {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
        { quantity: 20, multiplier: 0.85 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/D/logo.png',
      background: '/assets/D/bg.jpg',
    },
  },

  E: {
    id: 'E',
    name: 'Ère Glaciaire',
    description: 'Thème hivernal avec couleurs froides',

    theme: {
      primaryColor: '#0ea5e9',
      secondaryColor: '#38bdf8',
      backgroundColor: '#f0f9ff',
      fontFamily: 'Helvetica, sans-serif',
      accentColor: '#7dd3fc',
    },

    pricing: {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
        { quantity: 20, multiplier: 0.85 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/E/logo.png',
      background: '/assets/E/bg.jpg',
    },
  },

  F: {
    id: 'F',
    name: 'Titanic',
    description: 'Thème hivernal avec couleurs froides',

    theme: {
      primaryColor: '#0ea5e9',
      secondaryColor: '#38bdf8',
      backgroundColor: '#f0f9ff',
      fontFamily: 'Helvetica, sans-serif',
      accentColor: '#7dd3fc',
    },

    pricing: {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
        { quantity: 20, multiplier: 0.85 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/E/logo.png',
      background: '/assets/E/bg.jpg',
    },
  },
  G: {
    id: 'G',
    name: 'Colisée',
    description: 'Thème hivernal avec couleurs froides',

    theme: {
      primaryColor: '#0ea5e9',
      secondaryColor: '#38bdf8',
      backgroundColor: '#f0f9ff',
      fontFamily: 'Helvetica, sans-serif',
      accentColor: '#7dd3fc',
    },

    pricing: {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
        { quantity: 20, multiplier: 0.85 },
      ],
    },

    templates: {
      layout1: '4x6',
      layout2: '5x7',
      layout3: '8x10',
    },

    assets: {
      logo: '/assets/E/logo.png',
      background: '/assets/E/bg.jpg',
    },
  }
};

/**
 * Initialiser les répertoires univers
 */
export async function initUniverseDirectories() {
  try {
    await fs.mkdir(UNIVERSES_DIR, { recursive: true });
    console.log('[Universe] Répertoires initialisés');
  } catch (error) {
    console.error('[Universe] Erreur création répertoires:', error);
  }
}

/**
 * Charger ou créer un univers
 * AMÉLIORÉ: Utilise d'abord les données locales si API échoue
 */
export async function loadUniverse(universeId, configUrl = null) {
  // Vérifier le cache d'abord
  if (universeCache.has(universeId)) {
    console.log(`[Universe] ${universeId} chargé depuis le cache`);
    return universeCache.get(universeId);
  }

  console.log(`[Universe] Chargement de ${universeId}...`);

  try {
    // ⭐ CORRECTION: Juste lire l'univers depuis la DB, AUCUNE création/mise à jour
    const existingUniverse = await db.getUniverse(universeId);
    
    if (!existingUniverse) {
      console.warn(`[Universe] ⚠️  Univers ${universeId} n'existe pas en DB`);
      // Ne pas créer, juste retourner une erreur ou un univers minimal
      return {
        id: universeId,
        name: universeId,
        config_url: '',
        status: 'unknown'
      };
    }

    console.log(`[Universe] ✓ Univers chargé depuis DB: ${existingUniverse.name}`);

    // Vérifier si config existe localement
    const configPath = path.join(UNIVERSES_DIR, universeId, 'config.json');
    let config = null;

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(content);
      console.log(`[Universe] Config chargée depuis le disque: ${universeId}`);
    } catch (error) {
      // Config n'existe pas localement
      
      // Essayer de charger depuis l'API (si URL fournie et disponible)
      if (configUrl) {
        try {
          config = await fetchUniverseConfig(configUrl);
          console.log(`[Universe] Config chargée depuis l'API: ${universeId}`);
          // Sauvegarder localement
          await saveUniverseConfig(universeId, config);
        } catch (apiError) {
          console.warn(`[Universe] API échouée (${apiError.message}), utilisation des données locales`);
          // Utiliser les données locales prédéfinies
          if (LOCAL_UNIVERSES[universeId]) {
            config = LOCAL_UNIVERSES[universeId];
            console.log(`[Universe] Utilisation données locales: ${universeId}`);
            // Sauvegarder pour future utilisation
            await saveUniverseConfig(universeId, config);
          } else {
            throw new Error(`Univers ${universeId} non trouvé (ni API ni local)`);
          }
        }
      } else {
        // Pas d'URL API, utiliser directement les données locales
        if (LOCAL_UNIVERSES[universeId]) {
          config = LOCAL_UNIVERSES[universeId];
          console.log(`[Universe] Utilisation données locales: ${universeId}`);
          // Sauvegarder pour future utilisation
          await saveUniverseConfig(universeId, config);
        } else {
          throw new Error(`Univers ${universeId} non trouvé`);
        }
      }
    }

    // Valider la config
    validateUniverseConfig(config);

    // Cacher en mémoire
    universeCache.set(universeId, config);
    console.log(`[Universe] ${universeId} prêt`);

    return config;

  } catch (error) {
    console.error(`[Universe] Erreur chargement ${universeId}:`, error.message);
    return null;
  }
}

/**
 * Récupérer la configuration de l'univers (depuis API)
 */
async function fetchUniverseConfig(configUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(configUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const config = await response.json();
    
    // Valider la structure minimale
    validateUniverseConfig(config);
    
    return config;

  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sauvegarder la config de l'univers localement
 */
async function saveUniverseConfig(universeId, config) {
  try {
    const dir = path.join(UNIVERSES_DIR, universeId);
    await fs.mkdir(dir, { recursive: true });
    
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`[Universe] Config sauvegardée: ${universeId}`);
  } catch (error) {
    console.error(`[Universe] Erreur sauvegarde config:`, error);
  }
}

/**
 * Valider la configuration d'un univers
 */
function validateUniverseConfig(config) {
  const required = ['id', 'name', 'pricing'];
  
  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Config invalide: manque le champ "${field}"`);
    }
  }

  // Valider structure de prix
  if (!config.pricing.basePrice || !Array.isArray(config.pricing.tiers)) {
    throw new Error('Config invalide: structure de prix invalide');
  }

  return true;
}

/**
 * Mettre à jour le cache d'un univers
 */
export async function refreshUniverse(universeId) {
  universeCache.delete(universeId);
  
  const universe = await db.getUniverse(universeId);
  if (!universe) {
    console.warn(`[Universe] ${universeId} pas trouvé en DB`);
    return null;
  }

  return loadUniverse(universeId, universe.config_url);
}

/**
 * Lister tous les univers disponibles
 */
export function listAvailableUniverses() {
  return Object.keys(LOCAL_UNIVERSES);
}

/**
 * Lister tous les univers chargés
 */
export function listLoadedUniverses() {
  return Array.from(universeCache.keys());
}

/**
 * Nettoyer le cache d'un univers
 */
export function clearUniverseCache(universeId) {
  universeCache.delete(universeId);
}

/**
 * Nettoyer tout le cache
 */
export function clearAllUniverseCache() {
  universeCache.clear();
}

/**
 * Stats des univers chargés
 */
export function getUniverseStats() {
  return {
    loadedCount: universeCache.size,
    list: Array.from(universeCache.keys()),
    available: listAvailableUniverses(),
  };
}

/**
 * Obtenir un univers depuis le cache
 */
export function getUniverse(universeId) {
  return universeCache.get(universeId) || null;
}

/**
 * Obtenir les informations de tarification d'un univers
 */
export function getUniversePricing(universeId) {
  const universe = getUniverse(universeId);
  
  if (!universe || !universe.pricing) {
    // Retourner un prix par défaut
    return {
      basePrice: 2.50,
      currency: 'EUR',
      tiers: [
        { quantity: 1, multiplier: 1.0 },
        { quantity: 5, multiplier: 0.95 },
        { quantity: 10, multiplier: 0.90 },
      ],
    };
  }

  return universe.pricing;
}

/**
 * Calculer le prix pour N photos dans un univers
 */
export function calculatePrice(universeId, quantity) {
  const pricing = getUniversePricing(universeId);
  
  // Trouver le tier applicable
  let applicableTier = pricing.tiers[0];
  
  for (const tier of pricing.tiers) {
    if (quantity >= tier.quantity) {
      applicableTier = tier;
    }
  }

  const unitPrice = pricing.basePrice * applicableTier.multiplier;
  const totalPrice = unitPrice * quantity;

  return {
    unitPrice,
    quantity,
    totalPrice,
    discount: pricing.basePrice - unitPrice,
  };
}

/**
 * Obtenir les couleurs/styles d'un univers
 */
export function getUniverseTheme(universeId) {
  const universe = getUniverse(universeId);
  
  if (!universe || !universe.theme) {
    // Retourner un thème par défaut
    return {
      primaryColor: '#FF6B9D',
      secondaryColor: '#C44569',
      backgroundColor: '#FFF5F7',
      fontFamily: 'Arial, sans-serif',
    };
  }

  return universe.theme;
}

/**
 * Précharger les univers disponibles au démarrage
 */
export async function preloadAllUniverses() {
  const universeIds = listAvailableUniverses();
  
  for (const universeId of universeIds) {
    try {
      await loadUniverse(universeId);
    } catch (error) {
      console.warn(`[Universe] Erreur préchargement ${universeId}:`, error.message);
    }
  }
  
  console.log(`[Universe] Préchargement complet: ${listLoadedUniverses().length} univers`);
}