import { httpClient } from '@/lib/http/httpClient';

interface AllergyItem {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface ConditionItem {
  id: string;
  code: string;
  name: string;
  category: string;
}

export const fetchAllergySuggestions = (): Promise<string[]> =>
  httpClient
    .get<AllergyItem[]>('/lookups/allergies')
    .then((items) => items.map((a) => a.name));

export const fetchConditionSuggestions = (): Promise<string[]> =>
  httpClient
    .get<ConditionItem[]>('/lookups/chronic-conditions')
    .then((items) => items.map((c) => c.name));
