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
  A: {
    id: 'A',
    name: "L'horizon de kheops",
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
  },
  B: {
    id: 'B',
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
  C: {
    id: 'C',
    name: 'Remparts',
    banner: './assets/banniere-remparts.jpg',
    photos: [
      { id: 'p7', title: '', src: './assets/disparu-photo1.jpg' },
      { id: 'p8', title: '', src: './assets/disparu-photo2.jpg' },
      { id: 'p9', title: '', src: './assets/disparu-photo3.jpg' }
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
  D: {
    id: 'D',
    name: 'Impressionnistes',
    banner: './assets/banniere-impressionnistes.jpg',
    photos: [
      { id: 'p10', title: '', src: './assets/disparu-photo1.jpg' },
      { id: 'p11', title: '', src: './assets/disparu-photo2.jpg' },
      { id: 'p12', title: '', src: './assets/disparu-photo3.jpg' }
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
  E: {
    id: 'E',
    name: 'Batisseurs',
    banner: './assets/banniere-batisseurs.jpg',
    photos: [
      { id: 'p13', title: '', src: './assets/disparu-photo1.jpg' },
      { id: 'p14', title: '', src: './assets/disparu-photo2.jpg' },
      { id: 'p15', title: '', src: './assets/disparu-photo3.jpg' }
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
  F: {
    id: 'F',
    name: 'Titanic',
    banner: './assets/banniere-titanic.jpg',
    photos: [
      { id: 'p13', title: '', src: './assets/disparu-photo1.jpg' },
      { id: 'p14', title: '', src: './assets/disparu-photo2.jpg' },
      { id: 'p15', title: '', src: './assets/disparu-photo3.jpg' }
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
  G: {
    id: 'G',
    name: 'Colisée',
    banner: './assets/banniere-colisee.jpg',
    photos: [
      { id: 'p13', title: '', src: './assets/disparu-photo1.jpg' },
      { id: 'p14', title: '', src: './assets/disparu-photo2.jpg' },
      { id: 'p15', title: '', src: './assets/disparu-photo3.jpg' }
    ],
    productVisuals: {
      print: {
        image: './assets/chevalet-disparu.png'
      },
      magnet: {
        image: './assets/porte-cle-disparu.png'
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

  // Support pour les IDs numériques et textuels
  // Si le productId est numérique, on cherche d'abord par ID exact, puis par les anciennes clés
  let visual = universe.productVisuals[productId];

  // Si pas trouvé et que c'est un ID numérique, essayer les mappings par défaut
  if (!visual && typeof productId === 'number') {
    // Mapping basique : 1 = print, 2 = magnet (ajustable selon votre API)
    const mapping = {
      1: 'print',
      2: 'magnet'
    };
    const mappedKey = mapping[productId];
    if (mappedKey) {
      visual = universe.productVisuals[mappedKey];
    }
  }

  return visual || null;
};
