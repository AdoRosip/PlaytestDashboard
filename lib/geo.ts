// Shared country → continent grouping. Keyed on lowercased country *names*
// (not ISO codes) because tester profiles store free-text country names.
// Anything not listed here falls into "Unknown" — expand the map / add aliases
// as new spellings show up in real data. (For colouring world-atlas shapes by
// numeric ISO code, see COUNTRY_CODE_TO_CONTINENT in countryContinents.ts.)

export const COUNTRY_TO_CONTINENT: Record<string, string> = {
  argentina: 'South America',
  australia: 'Oceania',
  austria: 'Europe',
  belgium: 'Europe',
  brazil: 'South America',
  bulgaria: 'Europe',
  canada: 'North America',
  chile: 'South America',
  china: 'Asia',
  colombia: 'South America',
  croatia: 'Europe',
  czechia: 'Europe',
  'czech republic': 'Europe',
  denmark: 'Europe',
  egypt: 'Africa',
  estonia: 'Europe',
  finland: 'Europe',
  france: 'Europe',
  germany: 'Europe',
  greece: 'Europe',
  hungary: 'Europe',
  india: 'Asia',
  indonesia: 'Asia',
  ireland: 'Europe',
  italy: 'Europe',
  japan: 'Asia',
  malaysia: 'Asia',
  mexico: 'North America',
  netherlands: 'Europe',
  'new zealand': 'Oceania',
  norway: 'Europe',
  philippines: 'Asia',
  poland: 'Europe',
  portugal: 'Europe',
  romania: 'Europe',
  serbia: 'Europe',
  singapore: 'Asia',
  slovakia: 'Europe',
  slovenia: 'Europe',
  'south africa': 'Africa',
  'south korea': 'Asia',
  spain: 'Europe',
  sweden: 'Europe',
  switzerland: 'Europe',
  thailand: 'Asia',
  turkey: 'Europe',
  uk: 'Europe',
  'united kingdom': 'Europe',
  usa: 'North America',
  us: 'North America',
  'united states': 'North America',
  'united states of america': 'North America',
  vietnam: 'Asia',
};

// Display order for continent chips / bars (data-present ones are filtered by
// the caller; Unknown is always surfaced last so name-mapping gaps stay visible).
export const CONTINENTS = [
  'Europe',
  'North America',
  'South America',
  'Asia',
  'Oceania',
  'Africa',
  'Unknown',
] as const;

export function normaliseCountry(country: string): string {
  return country.trim().toLowerCase();
}

export function continentFor(country: string): string {
  if (!country.trim()) return 'Unknown';
  return COUNTRY_TO_CONTINENT[normaliseCountry(country)] ?? 'Unknown';
}
