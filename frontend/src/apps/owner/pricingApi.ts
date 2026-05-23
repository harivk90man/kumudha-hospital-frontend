/**
 * Owner pricing & threshold settings.
 *
 * DEMO MODE: writes straight to Supabase. Real backend would expose
 * /api/owner/services + /api/owner/drug-catalogue endpoints with the
 * same shapes.
 *
 * Tables touched:
 *   - services             (default_price, default_gst_pct)
 *   - drug_catalogue       (low_stock_threshold, max_stock_threshold, gst_pct)
 *
 * Both are direct UPDATE calls — no append-only guards on these
 * catalog tables. fn_touch_updated trigger bumps updated_at server-side.
 */

import { supabase, DEMO_USER_ID } from '@/lib/supabase/supabaseClient';

export interface ServicePricingRow {
  id: string;
  serviceCode: string;
  serviceName: string;
  serviceType: string;
  defaultPrice: number;
  defaultGstPct: number;
}

export interface DrugThresholdRow {
  id: string;
  drugCode: string;
  genericName: string;
  brandName: string | null;
  form: string;
  strength: string | null;
  lowStockThreshold: number;
  maxStockThreshold: number;
  gstPct: number;
}

/* ---------- Services ---------- */

export const fetchAllServices = async (): Promise<ServicePricingRow[]> => {
  const { data, error } = await supabase
    .from('services')
    .select('id, service_code, service_name, service_type, default_price, default_gst_pct')
    .is('deleted_at', null)
    .order('service_type', { ascending: true })
    .order('service_code', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      service_code: string;
      service_name: string;
      service_type: string;
      default_price: number | string;
      default_gst_pct: number | string;
    };
    return {
      id: row.id,
      serviceCode: row.service_code,
      serviceName: row.service_name,
      serviceType: row.service_type,
      defaultPrice: Number(row.default_price),
      defaultGstPct: Number(row.default_gst_pct),
    };
  });
};

export const updateServicePricing = async (
  id: string,
  patch: { defaultPrice?: number; defaultGstPct?: number },
): Promise<void> => {
  const updates: Record<string, number | string> = { updated_by: DEMO_USER_ID };
  if (patch.defaultPrice !== undefined)  updates.default_price = patch.defaultPrice;
  if (patch.defaultGstPct !== undefined) updates.default_gst_pct = patch.defaultGstPct;
  const { error } = await supabase.from('services').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
};

/* ---------- Drug catalogue thresholds ---------- */

export const fetchAllDrugs = async (): Promise<DrugThresholdRow[]> => {
  const { data, error } = await supabase
    .from('drug_catalogue')
    .select('id, drug_code, generic_name, brand_name, form, strength, low_stock_threshold, max_stock_threshold, gst_pct')
    .is('deleted_at', null)
    .order('generic_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      drug_code: string;
      generic_name: string;
      brand_name: string | null;
      form: string;
      strength: string | null;
      low_stock_threshold: number;
      max_stock_threshold: number;
      gst_pct: number | string;
    };
    return {
      id: row.id,
      drugCode: row.drug_code,
      genericName: row.generic_name,
      brandName: row.brand_name,
      form: row.form,
      strength: row.strength,
      lowStockThreshold: Number(row.low_stock_threshold),
      maxStockThreshold: Number(row.max_stock_threshold),
      gstPct: Number(row.gst_pct),
    };
  });
};

export const updateDrugThresholds = async (
  id: string,
  patch: {
    lowStockThreshold?: number;
    maxStockThreshold?: number;
    gstPct?: number;
  },
): Promise<void> => {
  const updates: Record<string, number | string> = { updated_by: DEMO_USER_ID };
  if (patch.lowStockThreshold !== undefined) updates.low_stock_threshold = patch.lowStockThreshold;
  if (patch.maxStockThreshold !== undefined) updates.max_stock_threshold = patch.maxStockThreshold;
  if (patch.gstPct !== undefined)            updates.gst_pct = patch.gstPct;
  const { error } = await supabase.from('drug_catalogue').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
};
