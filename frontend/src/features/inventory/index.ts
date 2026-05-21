/**
 * Public surface of the inventory feature.
 * Maps to schema v2 module 14-inventory.
 */
export {
  searchMedicines,
  fetchPharmacyAlerts,
  fetchMedicines,
  fetchMedicineBatches,
  fetchSuppliers,
  fetchSupplier,
  createSupplier,
  updateSupplier,
  fetchGrns,
  fetchGrn,
  createGrn,
  updateGrn,
} from './inventoryApi';
export { MedicineAvailabilityBadge } from './components/MedicineAvailabilityBadge';
export { StockWarningBanner } from './components/StockWarningBanner';
export { PharmacyStockAlertCard } from './components/PharmacyStockAlertCard';
export { AllergyAlertBanner } from './components/AllergyAlertBanner';
export { isStockBlocked } from './inventoryTypes';
export { findAllergyMatch } from './allergyMatcher';
export { severityTone, severityPulse, severityLabel } from './severityVisuals';
export type {
  Medicine,
  MedicineForm,
  MedicineBatch,
  Supplier,
  CreateSupplierInput,
  UpdateSupplierInput,
  Grn,
  CreateGrnInput,
  UpdateGrnInput,
  GrnLineInput,
  PharmacyAlert,
  StockSeverity,
  MedicinesListParams,
  BatchesListParams,
} from './inventoryTypes';
