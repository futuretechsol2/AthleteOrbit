// What families can order from their photos. Prices are what the family pays (USD); the print lab's
// product code for each is a server setting (PRINT_SKU_*), checked by /api/health.
export const PRINTS = {
  p4x6: { name: "4×6 print", price: 0.99, minPx: 1200, env: "PRINT_SKU_4X6", sku: "GLOBAL-PHO-4x6" },
  p5x7: { name: "5×7 print", price: 2.99, minPx: 1500, env: "PRINT_SKU_5X7", sku: "GLOBAL-PHO-5x7" },
  p8x10: { name: "8×10 print", price: 6.99, minPx: 2000, env: "PRINT_SKU_8X10", sku: "GLOBAL-PHO-8x10" },
  p11x14: { name: "11×14 poster", price: 16.99, minPx: 2600, env: "PRINT_SKU_11X14", sku: "GLOBAL-FAP-11x14" },
  book: { name: "Season Book — 8×8 hardcover", price: 44.99, minPx: 0, env: "PRINT_SKU_BOOK", sku: null },
};
export const SHIPPING = { price: 5.99, freeOver: 50 };
export const printTotal = (lines) => {
  const sub = lines.reduce((a, l) => a + PRINTS[l.product].price * l.qty, 0);
  const ship = sub >= SHIPPING.freeOver ? 0 : SHIPPING.price;
  return { sub: Math.round(sub * 100) / 100, ship, total: Math.round((sub + ship) * 100) / 100 };
};
