import type { DashboardReadModel } from '@/lib/product-read-model';

function envNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

const JET_PRICE_ALERT_THRESHOLD_USD_PER_L = envNumber('SAFVSOIL_ALERT_JET_PRICE_USD_PER_L', 1.30);
const BRENT_DAILY_CHANGE_ALERT_PCT = envNumber('SAFVSOIL_ALERT_BRENT_DAILY_CHANGE_PCT', 5.0);

export type AlertBanner = {
  level: 'alert' | 'watch';
  title: string;
  message: string;
  href?: string;
};

export type ReserveSeverity = {
  level: 'critical' | 'elevated' | 'watch' | 'normal';
  label: string;
  color: string;
  barColor: string;
  tone: 'red' | 'amber' | 'blue';
};

export type TippingPointSignalTone = 'teal' | 'amber' | 'red';

export function computeDashboardAlertBanners(
  market: DashboardReadModel['market'],
  risk: DashboardReadModel['topRiskSignal']
): AlertBanner[] {
  const banners: AlertBanner[] = [];
  const values = market?.values ?? {};

  const jetEu = values.jet_eu_proxy_usd_per_l ?? values.jet_usd_per_l ?? 0;
  if (Number.isFinite(jetEu) && jetEu >= JET_PRICE_ALERT_THRESHOLD_USD_PER_L) {
    banners.push({
      level: 'alert',
      title: 'Jet Fuel Price Alert',
      message: `EU jet proxy reached $${jetEu.toFixed(3)}/L (threshold $${JET_PRICE_ALERT_THRESHOLD_USD_PER_L.toFixed(2)}/L). Short-haul margins under severe pressure.`,
      href: '/crisis/eu-jet-reserves'
    });
  }

  const brent1d = risk?.metricKey === 'brent_usd_per_bbl' && risk.window === '1d' ? risk.changePct : undefined;
  if (typeof brent1d === 'number' && Number.isFinite(brent1d) && Math.abs(brent1d) >= BRENT_DAILY_CHANGE_ALERT_PCT) {
    const direction = brent1d > 0 ? 'surged' : 'dropped';
    banners.push({
      level: 'alert',
      title: 'SAF Inflection Alert',
      message: `Brent ${direction} ${Math.abs(brent1d).toFixed(2)}% in 1d. SAF competitiveness gap narrowing rapidly.`,
      href: '/crisis/eu-jet-reserves'
    });
  }

  if (risk && risk.level === 'watch' && risk.window === '1d' && banners.length === 0) {
    banners.push({
      level: 'watch',
      title: 'Market Watch',
      message: `${risk.metric} moved ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}% in 1d. Monitor for inflection signals.`,
      href: '/sources'
    });
  }

  return banners;
}

export function getReserveSeverity(weeks: number): ReserveSeverity {
  if (weeks <= 2) {
    return {
      level: 'critical',
      label: 'CRITICAL — Immediate action required',
      color: 'text-rose-300',
      barColor: 'bg-rose-500',
      tone: 'red'
    };
  }
  if (weeks <= 4) {
    return {
      level: 'elevated',
      label: 'ELEVATED — SAF switch window opening',
      color: 'text-amber-300',
      barColor: 'bg-amber-500',
      tone: 'amber'
    };
  }
  if (weeks <= 6) {
    return {
      level: 'watch',
      label: 'WATCH — Monitor closely',
      color: 'text-yellow-300',
      barColor: 'bg-yellow-500',
      tone: 'blue'
    };
  }
  return {
    level: 'normal',
    label: 'NORMAL',
    color: 'text-emerald-300',
    barColor: 'bg-emerald-500',
    tone: 'blue'
  };
}

export function getTippingPointSignalMeta(
  signal: string,
  locale: 'en' | 'zh' = 'en'
): { tone: TippingPointSignalTone; label: string } {
  const tone: TippingPointSignalTone =
    signal === 'saf_cost_advantaged' ? 'teal' : signal === 'switch_window_opening' ? 'amber' : 'red';
  if (locale === 'zh') {
    return {
      tone,
      label:
        signal === 'saf_cost_advantaged'
          ? 'SAF 已占优'
          : signal === 'switch_window_opening'
            ? '切换窗口开启'
            : 'SAF 仍不经济'
    };
  }
  return {
    tone,
    label:
      signal === 'saf_cost_advantaged'
        ? 'SAF cost advantaged'
        : signal === 'switch_window_opening'
          ? 'Switch window opening'
          : 'Fossil still advantaged'
  };
}

export function getAirlineDecisionSignalLabel(signal: string): string {
  if (signal === 'switch_window_opening') return 'Switch window opening';
  if (signal === 'capacity_stress_dominant') return 'Capacity stress dominant';
  return 'Incremental adjustment';
}

export function getPathwayStatusLabel(status: string): string {
  if (status === 'competitive') return 'SAF cost advantaged';
  if (status === 'inflection') return 'Switch window opening';
  if (status === 'premium') return 'Fossil still advantaged';
  return 'Unknown';
}
