import type { TippingPointReadModel } from '@/lib/product-read-model';

type Props = {
  tippingPoint: TippingPointReadModel | null;
  selectedPathwayKey: string;
};

const barColors: Record<string, string> = {
  fossil: 'bg-gradient-to-r from-rose-500 to-red-300',
  effective: 'bg-gradient-to-r from-amber-500 to-yellow-300',
  hefa: 'bg-gradient-to-r from-emerald-500 to-emerald-300',
  atj: 'bg-gradient-to-r from-sky-500 to-sky-300',
  ft: 'bg-gradient-to-r from-amber-500 to-orange-300',
  ptl: 'bg-gradient-to-r from-violet-500 to-fuchsia-300'
};

function midpoint(low: number, high: number): number {
  return (low + high) / 2;
}

export function ScenarioCostStackChart({ tippingPoint, selectedPathwayKey }: Props) {
  if (!tippingPoint || tippingPoint.pathways.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="mb-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
            Scenario cost stack
          </h4>
          <p className="mt-2 text-sm text-slate-500">Scenario cost data unavailable.</p>
        </div>
      </section>
    );
  }

  const selectedPathway =
    tippingPoint.pathways.find((pathway) => pathway.pathway_key === selectedPathwayKey) ??
    tippingPoint.pathways[0];
  const fossilSpot = tippingPoint.inputs.fossilJetUsdPerL;
  const effectiveFossil = tippingPoint.effectiveFossilJetUsdPerL;
  const selectedMidpoint = midpoint(
    selectedPathway.net_cost_low_usd_per_l,
    selectedPathway.net_cost_high_usd_per_l
  );
  const maxValue = Math.max(fossilSpot, effectiveFossil, selectedMidpoint, 1);
  const rows = [
    {
      key: 'fossil',
      label: 'Fossil spot',
      value: fossilSpot,
      hint: 'Observed market price',
    },
    {
      key: 'effective',
      label: 'Effective fossil',
      value: effectiveFossil,
      hint: 'Spot plus modeled carbon pressure',
    },
    {
      key: selectedPathway.pathway_key,
      label: `${selectedPathway.display_name} midpoint`,
      value: selectedMidpoint,
      hint: `Net cost band ${selectedPathway.net_cost_low_usd_per_l.toFixed(2)}–${selectedPathway.net_cost_high_usd_per_l.toFixed(2)}/L`,
    }
  ];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="mb-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
          Scenario cost stack
        </h4>
        <p className="mt-2 text-sm text-slate-500">
          A compact comparison of spot fossil cost, carbon-adjusted fossil cost, and the selected pathway midpoint.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <div>
                <div className="font-medium text-white">{row.label}</div>
                <div className="text-xs text-slate-500">{row.hint}</div>
              </div>
              <div className="font-mono text-white">${row.value.toFixed(2)}/L</div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${barColors[row.key] ?? 'bg-gradient-to-r from-slate-500 to-slate-300'}`}
                style={{ width: `${Math.max(6, (row.value / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
