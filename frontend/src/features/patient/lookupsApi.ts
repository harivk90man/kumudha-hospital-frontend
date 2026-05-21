import { supabase } from '@/lib/supabase/supabaseClient';

/**
 * Allergy + chronic-condition catalogue lookups. Demo-wired to Supabase
 * directly; replace with httpClient calls once the Spring backend lands.
 */

export const fetchAllergySuggestions = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('allergies_lookup')
    .select('allergy_name')
    .is('deleted_at', null)
    .order('allergy_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.allergy_name as string);
};

export const fetchConditionSuggestions = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('chronic_conditions_lookup')
    .select('condition_name')
    .is('deleted_at', null)
    .order('condition_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.condition_name as string);
};
