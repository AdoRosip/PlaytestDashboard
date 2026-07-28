import type { Response, Theme } from './types';

/**
 * AI themes are generated for a particular response set. When demographic
 * filters are active, keep only themes with linked evidence in the visible set.
 * Quotes are removed because the model output does not map each quote to a
 * response id, so retaining them could expose evidence from an excluded tester.
 */
export function filterThemesForResponses(
  themes: Theme[],
  responses: Response[],
  filtersActive: boolean,
): Theme[] {
  if (!filtersActive) return themes;
  const visibleResponseIds = new Set(responses.map((r) => r.id));
  return themes.flatMap((theme) => {
    const linkedResponseIds = theme.linkedResponseIds.filter((id) => visibleResponseIds.has(id));
    if (linkedResponseIds.length === 0) return [];
    return [{
      ...theme,
      linkedResponseIds,
      frequency: linkedResponseIds.length,
      representativeQuotes: [],
    }];
  });
}
