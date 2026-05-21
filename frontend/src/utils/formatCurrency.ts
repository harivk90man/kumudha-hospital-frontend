/**
 * Format INR amounts. Single source of truth so a future locale / symbol
 * change cascades to every billing surface (cashier, lab, pharmacy, owner).
 */
export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
