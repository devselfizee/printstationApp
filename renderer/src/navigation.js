import { state } from './state.js';

export const goBack = () => {
  if (state.page === 'qr') return;
  else if (state.page === 'listing') { 
    state.page = 'qr'; 
    state.universe = null; 
    state.photos = []; 
  }
  else if (state.page === 'detail') { 
    state.page = 'listing'; 
    state.currentPhoto = null; 
  }
  else if (state.page === 'cart') { 
    state.page = 'detail'; 
  }
  else if (state.page === 'payment') { 
    state.page = 'cart'; 
    clearTimeout(state.timer); 
  }
  else if (state.page === 'form') { 
    state.page = 'cart'; 
  }
  else if (state.page === 'thanks') { 
    state.page = 'qr'; 
  }
  window.render();
};
