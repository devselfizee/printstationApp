/**
 * universes.js - Source de vérité unique (côté renderer) pour la liste des codes d'univers.
 *
 * La liste est chargée depuis le registre `home_screen_universes` (rempli au seed de la
 * base, activable/désactivable en admin) via `window.photoAPI.universes.list()`.
 *
 * Toute la plateforme (validation des scans, parsing QR, dev-simulator) doit utiliser
 * `isValidUniverseCode()` / `getUniverseCodes()` plutôt qu'une liste codée en dur.
 */

// Utilisé tant que le registre n'a pas répondu (1er rendu, DB pas prête, etc.)
const FALLBACK_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

let universeCodes = [...FALLBACK_CODES];
let loaded = false;

/**
 * Charger (ou rafraîchir) les codes d'univers depuis le registre admin.
 * Idempotent : peut être appelé plusieurs fois.
 */
export async function loadUniverseCodes() {
  try {
    if (window.photoAPI?.universes?.list) {
      const result = await window.photoAPI.universes.list();
      if (result?.status === 'success' && Array.isArray(result.codes) && result.codes.length > 0) {
        universeCodes = result.codes.map(c => String(c).toUpperCase());
        loaded = true;
        console.log('[Universes] Codes chargés depuis le registre admin:', universeCodes.join(', '));
      }
    }
  } catch (error) {
    console.warn('[Universes] Échec chargement des codes, fallback utilisé:', error.message);
  }
  return universeCodes;
}

/**
 * Liste courante des codes d'univers valides (toujours un tableau, jamais vide).
 */
export function getUniverseCodes() {
  return universeCodes;
}

/**
 * Vérifie si un code (lettre) correspond à un univers valide du registre.
 */
export function isValidUniverseCode(code) {
  if (!code) return false;
  return universeCodes.includes(String(code).toUpperCase());
}

/**
 * Indique si la liste a bien été chargée depuis le registre (vs fallback).
 */
export function universeCodesLoaded() {
  return loaded;
}
