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
      title: '航煤价格预警',
      message: `欧盟航煤代理价格达到 $${jetEu.toFixed(3)}/L（阈值 $${JET_PRICE_ALERT_THRESHOLD_USD_PER_L.toFixed(2)}/L）。短途航线利润率承压显著。`,
      href: '/crisis/eu-jet-reserves'
    });
  }

  const brent1d = risk?.metricKey === 'brent_usd_per_bbl' && risk.window === '1d' ? risk.changePct : undefined;
  if (typeof brent1d === 'number' && Number.isFinite(brent1d) && Math.abs(brent1d) >= BRENT_DAILY_CHANGE_ALERT_PCT) {
    const direction = brent1d > 0 ? '上涨' : '下跌';
    banners.push({
      level: 'alert',
      title: 'SAF 拐点预警',
      message: `Brent 1日内${direction} ${Math.abs(brent1d).toFixed(2)}%。SAF 竞争力差距正在快速收窄。`,
      href: '/crisis/eu-jet-reserves'
    });
  }

  if (risk && risk.level === 'watch' && risk.window === '1d' && banners.length === 0) {
    banners.push({
      level: 'watch',
      title: '市场观察',
      message: `${risk.metric} 1日内变动 ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%。请持续观察拐点信号。`,
      href: '/sources'
    });
  }

  return banners;
}

export function getReserveSeverity(weeks: number): ReserveSeverity {
  if (weeks <= 2) {
    return {
      level: 'critical',
      label: '危急 - 需要立即行动',
      color: 'text-rose-300',
      barColor: 'bg-rose-500',
      tone: 'red'
    };
  }
  if (weeks <= 4) {
    return {
      level: 'elevated',
      label: '升高 - SAF 切换窗口开启',
      color: 'text-amber-300',
      barColor: 'bg-amber-500',
      tone: 'amber'
    };
  }
  if (weeks <= 6) {
    return {
      level: 'watch',
      label: '观察 - 密切监控',
      color: 'text-yellow-300',
      barColor: 'bg-yellow-500',
      tone: 'blue'
    };
  }
  return {
    level: 'normal',
    label: '正常',
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
  if (signal === 'switch_window_opening') return '切换窗口开启';
  if (signal === 'capacity_stress_dominant') return '运力压力主导';
  return '渐进调整';
}

export function getPathwayStatusLabel(status: string): string {
  if (status === 'competitive') return 'SAF 成本占优';
  if (status === 'inflection') return '切换窗口开启';
  if (status === 'premium') return '化石航油仍占优';
  return '未知';
}
