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
  email: '',
  optin: false,
  timer: null,
  thanksCounter: 5,
  photoIndex: 0
};

export const resetState = () => {
  state.page = 'qr';
  state.cart = [];
  state.cartItems = [];
  state.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;  // Nouveau sessionId à chaque reset
  state.participantId = null;  // Réinitialiser le participantId
  state.email = '';
  state.optin = false;
  state.currentPhoto = null;
  state.universe = null;
  state.photos = [];
  state.thanksCounter = 5;
  state.photoIndex = 0;
  if (state.timer) clearTimeout(state.timer);
};
