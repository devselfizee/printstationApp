import { keyFor } from './utils.js';

export const addOne = (photoId, productId, cart, products) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (line) line.qty += 1;
  else cart.push({ key: k, photoId, productId, qty: 1 });
  return cart;
};

export const removeOne = (photoId, productId, cart) => {
  const k = keyFor(photoId, productId);
  const line = cart.find(l => l.key === k);
  if (!line) return cart;
  line.qty -= 1;
  return line.qty <= 0 ? cart.filter(l => l.key !== k) : cart;
};
