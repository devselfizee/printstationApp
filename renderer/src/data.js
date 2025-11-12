export const PRODUCTS = {
  print: { 
    id: 'print', 
    title: 'Photo papier (chevalet)', 
    first: 10, 
    next: 8 
  },
  magnet: { 
    id: 'magnet', 
    title: 'Porte-clé magnétique', 
    first: 15, 
    next: 12 
  }
};

export const UNIVERSES = {
  universe1: {
    id: 'universe1',
    name: 'Mondes Disparus',
    banner: './assets/banniere-monde-perdu.jpg',
    photos: [
      { id: 'p1', title: 'Scène 1 - Dinosaures', src: './assets/disparu-photo1.jpg' },
      { id: 'p2', title: 'Scène 2 - Paysage', src: './assets/disparu-photo2.jpg' },
      { id: 'p3', title: 'Scène 3 - Forêt', src: './assets/disparu-photo3.jpg' }
    ],
    productVisuals: {
      print: {
        image: './assets/chevalet-disparu.png'
      },
      magnet: {
        image: './assets/porte-cle-disparu.png'
      }
    }
  },
  universe2: {
    id: 'universe2',
    name: "L'horizon de khepos",
    banner: './assets/banniere-kheops.jpg',
    photos: [
      { id: 'p4', title: 'Devant la pyramide', src: './assets/kheops1.jpg' },
      { id: 'p5', title: 'En haut de la pyramide', src: './assets/kheops2.jpg' },
      { id: 'p6', title: 'Vue du ciel', src: './assets/kheops3.jpg' }
    ],
    productVisuals: {
      print: {
        image: './assets/chevalet-kheops.png'
      },
      magnet: {
        image: './assets/porte-cle-kheops.png'
      }
    }
  }
};

// Helper pour récupérer les visuels d'un produit selon l'univers
export const getProductVisual = (universeId, productId) => {
  const universe = UNIVERSES[universeId];
  if (!universe || !universe.productVisuals) {
    return null;
  }
  return universe.productVisuals[productId];
};