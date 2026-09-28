/**
 * universeAliases.js — lettres de QR code rattachées à un autre univers.
 *
 * Cas Lyon (septembre 2026) : des QR ont été générés avec la lettre I pour l'univers H,
 * « ISS » étant l'autre nom de « The infinite ». L'univers H répond donc aux deux lettres,
 * et la lettre I n'existe pas comme univers : ni à l'accueil, ni dans les statistiques.
 *
 * La normalisation se fait à chaque entrée d'une lettre dans le système — lecture du QR et
 * photos descendues de l'API — de sorte que rien ne soit jamais enregistré ni synchronisé
 * sous une lettre aliasée, ni en base locale ni dans Supabase. Table vide = mécanisme inerte.
 *
 * ⚠️ Le côté web applique la même correspondance pour ce qu'il écrit dans Supabase et pour
 * le champ `universe` qu'il expose : les deux tables doivent rester identiques.
 *
 * Ce module vit dans photosystem/ pour être à la fois embarqué dans le paquet (seul
 * renderer/src/photosystem est packagé, cf. "files" dans package.json) et repris par le
 * bundle du renderer.
 */

export const UNIVERSE_ALIASES = {
  I: 'H',
};

/**
 * Univers réel d'une lettre de QR code : la cible si la lettre est un alias, la lettre
 * elle-même sinon. Retourne l'entrée telle quelle si elle est vide.
 */
export function resolveUniverseCode(code) {
  if (!code) return code;
  const upper = String(code).toUpperCase();
  return UNIVERSE_ALIASES[upper] || upper;
}

/**
 * Indique si une lettre est un alias. Utile pour tracer dans les logs la lettre réellement
 * scannée, qui n'apparaît nulle part ailleurs une fois la normalisation faite.
 */
export function isUniverseAlias(code) {
  if (!code) return false;
  return Object.prototype.hasOwnProperty.call(UNIVERSE_ALIASES, String(code).toUpperCase());
}
