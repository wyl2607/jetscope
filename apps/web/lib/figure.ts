/**
 * The Figure contract - docs/UI_CONTRACT.md section 3.
 *
 * `SourceFooter` answers "where did this page come from" for the page as a
 * whole. This is the other half: the same four questions - what is it, when is
 * it from, where did it come from, how was it derived - answered per number,
 * carried by the number itself instead of by a sentence somewhere near it.
 *
 * The reason this is a type and not a convention: a bare `number` crossing a
 * component boundary loses its provenance silently, and the loss is invisible
 * in review. `fossilJetUsdPerL: number` looks identical whether it came from a
 * spot price feed or from a hardcoded `?? 0.657` four fallbacks down the chain.
 * Once it is a `Figure`, the fallback has to say what it is.
 *
 * Construct figures through `observed` / `derived` / `assumed` / `missing`
 * rather than by object literal: the constructors are what make "a derived
 * value must state its method" and "a null must state its reason" unforgeable.
 */

export type FigureBasis = 'observed' | 'derived' | 'assumption';

export type Figure = {
  /** null means "we do not know", never 0 and never a stale carry-forward. */
  value: number | null;
  /** Canonical unit, machine-stable: 'USD/L', '%', 'weeks', 'events'. */
  unit: string;
  /** Reader-facing unit override when the canonical form is not presentable. */
  unitLabel?: string;
  /** ISO 8601 source time, not fetch time. null when there is no honest time. */
  asOf: string | null;
  /** Resolvable against the page's SourceFooter `SourceRef.id`. */
  sourceId: string;
  basis: FigureBasis;
  /** Required when basis !== 'observed'. How the number came to exist. */
  method?: string;
  /** Anchor or route for the method section. */
  methodHref?: string;
  /** Required when value is null. Why it is missing, in the reader's words. */
  reason?: string;
  /** Decimal places for display. Defaults to 2. */
  precision?: number;
  /**
   * How old this source is allowed to get before the timestamp is a warning.
   * Section 3 rule 5. Omit when the figure has no natural cadence.
   */
  maxAgeHours?: number;
};

type Common = {
  unit: string;
  unitLabel?: string;
  sourceId: string;
  precision?: number;
  maxAgeHours?: number;
};

/** A measurement. The only basis that may claim a value was seen. */
export function observed(input: Common & { value: number; asOf: string }): Figure {
  return { ...input, basis: 'observed' };
}

/**
 * Computed from observations. `method` is required because a derived number
 * without its method is indistinguishable from an invented one.
 */
export function derived(
  input: Common & { value: number | null; asOf: string | null; method: string; methodHref?: string; reason?: string }
): Figure {
  return { ...input, basis: 'derived' };
}

/**
 * A scenario input, a default, a fallback constant. Anything nobody measured.
 * `asOf` is deliberately not accepted: an assumption has no observation time,
 * and the recurring failure this contract exists to stop is exactly that -
 * stamping invented values with `new Date()` so they read as fresh.
 */
export function assumed(
  input: Common & { value: number | null; method: string; methodHref?: string; reason?: string }
): Figure {
  return { ...input, asOf: null, basis: 'assumption' };
}

/** Known-unknown. Renders "—" plus the reason, never 0. */
export function missing(input: Common & { sourceId: string; reason: string; basis?: FigureBasis }): Figure {
  const { basis = 'observed', ...rest } = input;
  return { ...rest, value: null, asOf: null, basis, method: basis === 'observed' ? undefined : 'unavailable' };
}

export function isFigure(value: unknown): value is Figure {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Figure>;
  return (
    (typeof candidate.value === 'number' || candidate.value === null) &&
    typeof candidate.unit === 'string' &&
    typeof candidate.sourceId === 'string' &&
    (candidate.basis === 'observed' || candidate.basis === 'derived' || candidate.basis === 'assumption')
  );
}

/**
 * The invariants the constructors already guarantee, checked again at the
 * render boundary so a figure hand-rolled as an object literal - or arriving
 * from JSON - cannot quietly skip them.
 */
export function figureViolations(figure: Figure): string[] {
  const problems: string[] = [];
  if (!figure.unit) problems.push('unit is required (contract section 3)');
  if (!figure.sourceId) problems.push('sourceId is required and must resolve in SourceFooter');
  if (figure.basis !== 'observed' && !figure.method) {
    problems.push(`basis "${figure.basis}" requires a method (section 3 rule 4)`);
  }
  if (figure.value === null && !figure.reason) {
    problems.push('a null value must state its reason (section 3 rule 3)');
  }
  if (figure.basis === 'assumption' && figure.asOf) {
    problems.push('an assumption has no observation time; asOf must be null (section 3 rule 2)');
  }
  if (figure.asOf !== null && figure.asOf !== undefined && Number.isNaN(new Date(figure.asOf).getTime())) {
    problems.push(`asOf "${figure.asOf}" is not a parseable ISO 8601 timestamp`);
  }
  return problems;
}

export function assertFigure(figure: Figure, where: string): void {
  const problems = figureViolations(figure);
  if (problems.length > 0) {
    throw new Error(`Figure contract violation in ${where}:\n  - ${problems.join('\n  - ')}`);
  }
}

/** True when the figure is older than the cadence its source promised. */
export function isStale(figure: Figure, now: Date = new Date()): boolean {
  if (!figure.asOf || figure.maxAgeHours === undefined) return false;
  const at = new Date(figure.asOf).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > figure.maxAgeHours * 3_600_000;
}

/**
 * The page-level as-of stamp, computed rather than hand-picked.
 *
 * Section 2 says the header carries the source time of the freshest figure on
 * the page. Doing that by hand is how pages end up quoting the timestamp of one
 * number while displaying another - or worse, quoting a fallback's `new Date()`.
 * Assumptions carry no time and therefore cannot win.
 */
export function freshestAsOf(figures: readonly Figure[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const figure of figures) {
    if (figure.basis === 'assumption' || !figure.asOf) continue;
    const at = new Date(figure.asOf).getTime();
    if (Number.isNaN(at)) continue;
    if (best === null || at > best) {
      best = at;
      bestIso = figure.asOf;
    }
  }
  return bestIso;
}

/**
 * The page as a whole is only as observed as its weakest load-bearing number.
 * Use it for the SourceRef basis so the footer cannot say "observed" while a
 * chart above it is drawing a default constant.
 */
export function weakestBasis(figures: readonly Figure[]): FigureBasis {
  if (figures.some((figure) => figure.basis === 'assumption')) return 'assumption';
  if (figures.some((figure) => figure.basis === 'derived')) return 'derived';
  return 'observed';
}

const DASH = '—';

/** Number + unit only. The provenance half is `FigureValue`'s job. */
export function formatFigure(figure: Figure, locale: 'zh' | 'de' | 'en' = 'zh'): string {
  if (figure.value === null) return DASH;
  const tag = locale === 'zh' ? 'zh-CN' : locale === 'de' ? 'de-DE' : 'en-GB';
  const digits = figure.precision ?? 2;
  const formatted = new Intl.NumberFormat(tag, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(figure.value);
  const unit = figure.unitLabel ?? figure.unit;
  if (!unit) return formatted;
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}
