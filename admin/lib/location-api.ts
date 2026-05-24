const CACHE_TTL = 24 * 60 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() > parsed.expiry) { localStorage.removeItem(key); return null; }
    return parsed.value as T;
  } catch { return null; }
}

function cacheSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ value, expiry: Date.now() + CACHE_TTL }));
  } catch {}
}

export interface Country {
  name: string;
  iso2: string;
  currency: string;
}

export interface CurrencyInfo {
  symbol: string;
  code: string;
  name: string;
  flag: string;
}

export interface LocationInfo {
  country_code: string;
  country_name: string;
  region: string;
  city: string;
  currency: string;
}

export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const base = 0x1F1E6 - 65;
  const upper = countryCode.toUpperCase();
  return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1));
}

export async function getAllCountries(): Promise<Country[]> {
  const key = 'loc_all_countries';
  const cached = cacheGet<Country[]>(key);
  if (cached) return cached;
  try {
    const res = await fetch('https://countriesnow.space/api/v0.1/countries');
    const json = await res.json();
    const data: Country[] = (json.data ?? []).map((c: any) => ({
      name: c.country ?? '',
      iso2: c.iso2 ?? '',
      currency: c.currency ?? '',
    })).filter((c: Country) => c.name);
    cacheSet(key, data);
    return data;
  } catch {
    return [];
  }
}

export async function getStatesByCountry(country: string): Promise<string[]> {
  if (!country) return [];
  const key = `loc_states_${country}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const res = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
    });
    const json = await res.json();
    const states: string[] = (json.data?.states ?? []).map((s: any) => (typeof s === 'string' ? s : s.name ?? '')).filter(Boolean);
    cacheSet(key, states);
    return states;
  } catch {
    return [];
  }
}

export async function getCitiesByState(country: string, state: string): Promise<string[]> {
  if (!country || !state) return [];
  const key = `loc_cities_${country}_${state}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const res = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, state }),
    });
    const json = await res.json();
    const cities: string[] = (json.data ?? []).filter(Boolean);
    cacheSet(key, cities);
    return cities;
  } catch {
    return [];
  }
}

export async function getCurrencyByCountryCode(code: string): Promise<CurrencyInfo> {
  if (!code) return { symbol: '₹', code: 'INR', name: 'Indian Rupee', flag: '' };
  const key = `loc_currency_${code}`;
  const cached = cacheGet<CurrencyInfo>(key);
  if (cached) return cached;
  const fallback: CurrencyInfo = { symbol: '', code: '', name: '', flag: getCountryFlag(code) };
  try {
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
    if (!res.ok) return fallback;
    const json = await res.json();
    const c = Array.isArray(json) ? json[0] : json;
    const currencies = c?.currencies ?? {};
    const currCode = Object.keys(currencies)[0] ?? '';
    const result: CurrencyInfo = {
      symbol: currencies[currCode]?.symbol ?? '',
      code: currCode,
      name: currencies[currCode]?.name ?? '',
      flag: c?.flag ?? getCountryFlag(code),
    };
    cacheSet(key, result);
    return result;
  } catch {
    return fallback;
  }
}

export async function getLocationFromIP(ip: string): Promise<LocationInfo> {
  const key = `loc_ip_${ip}`;
  const cached = cacheGet<LocationInfo>(key);
  if (cached) return cached;
  const fallback: LocationInfo = { country_code: '', country_name: '', region: '', city: '', currency: '' };
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    const json = await res.json();
    const result: LocationInfo = {
      country_code: json.country_code ?? '',
      country_name: json.country_name ?? '',
      region: json.region ?? '',
      city: json.city ?? '',
      currency: json.currency ?? '',
    };
    cacheSet(key, result);
    return result;
  } catch {
    return fallback;
  }
}
