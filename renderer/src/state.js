export const state = {
  lang: 'fr',
  page: 'qr',
  universe: null,
  participantId: null,  // ID du participant (depuis QR code ou sessionId par défaut)
  photos: [],
  currentPhoto: null,
  cart: [],
  cartItems: [],  // Items de la DB
  sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,  // 🆕 Créé dès le départ
  localOrderId: null,  // ID de la commande locale (créé lors du paiement)
  supabaseOrderId: null,  // ID de la commande Supabase (créé lors du paiement)
  email: '',
  optin: false,
  timer: null,
  thanksCounter: 5,
  photoIndex: 0,
  furthestStep: null  // Étape la plus avancée atteinte dans le parcours
};

// Ordre des étapes dans le parcours client
const STEP_ORDER = ['qr', 'listing', 'detail', 'cart', 'form', 'payment'];

/**
 * Met à jour l'étape la plus avancée si la nouvelle page est plus loin dans le parcours
 */
export const updateFurthestStep = (page) => {
  const currentIndex = STEP_ORDER.indexOf(state.furthestStep);
  const newIndex = STEP_ORDER.indexOf(page);

  // Si la nouvelle page est plus avancée (ou si furthestStep n'est pas défini)
  if (newIndex > currentIndex) {
    state.furthestStep = page;
    console.log('[State] Étape la plus avancée mise à jour:', page);
  }
};

export const resetState = () => {
  state.page = 'qr';
  state.cart = [];
  state.cartItems = [];
  state.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;  // Nouveau sessionId à chaque reset
  state.localOrderId = null;  // Réinitialiser l'ID de commande locale
  state.supabaseOrderId = null;  // Réinitialiser l'ID de commande Supabase
  state.participantId = null;  // Réinitialiser le participantId
  state.email = '';
  state.optin = false;
  state.currentPhoto = null;
  state.universe = null;
  state.photos = [];
  state.thanksCounter = 5;
  state.photoIndex = 0;
  state.furthestStep = null;  // Réinitialiser l'étape la plus avancée
  if (state.timer) clearTimeout(state.timer);
};
