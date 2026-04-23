'use client';

import { useState } from 'react';

export default function ClientBreakevenCalculator() {
  const [oilPrice, setOilPrice] = useState(115);
  const [safPrice, setSafPrice] = useState(1.75);
  const [euEtsPrice, setEuEtsPrice] = useState(92.50);
  const [germanyPremium, setGermanyPremium] = useState(2.5);
  const [blendRate, setBlendRate] = useState(6);

  // Calculations
  const jetCostPerLiter = (oilPrice / 158.987) * 1.20;
  const carbonCostPerLiterJet = (euEtsPrice * 3.15 * (1 - blendRate / 100)) / 1000;
  const carbonCostPerLiterSaf = (euEtsPrice * 3.15 * 0.20 * (blendRate / 100)) / 1000;
  const germanyCostPerLiter = jetCostPerLiter * (germanyPremium / 100);
  
  const totalJet = jetCostPerLiter + carbonCostPerLiterJet + germanyCostPerLiter;
  const totalSaf = safPrice + carbonCostPerLiterSaf + germanyCostPerLiter;
  const blendedCost = totalJet * (1 - blendRate / 100) + totalSaf * (blendRate / 100);
  const premiumVsJet = ((blendedCost / totalJet) - 1) * 100;

  return (
    <section className="rounded-lg border border-emerald-800/50 bg-slate-950 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-emerald-300">SAF Breakeven-Rechner</h2>
        <span className="text-xs text-slate-500">Interaktiv: Parameter anpassen</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderControl
          label="Ölpreis (Brent)"
          value={oilPrice}
          min={60}
          max={180}
          step={5}
          unit="$/bbl"
          onChange={setOilPrice}
        />
        <SliderControl
          label="SAF Preis"
          value={safPrice}
          min={0.8}
          max={3.0}
          step={0.05}
          unit="$/L"
          onChange={setSafPrice}
        />
        <SliderControl
          label="EU ETS Preis"
          value={euEtsPrice}
          min={30}
          max={200}
          step={5}
          unit="€/tCO₂"
          onChange={setEuEtsPrice}
        />
        <SliderControl
          label="DE Premium"
          value={germanyPremium}
          min={0}
          max={10}
          step={0.5}
          unit="%"
          onChange={setGermanyPremium}
        />
        <SliderControl
          label="SAF Blend-Rate"
          value={blendRate}
          min={0}
          max={70}
          step={1}
          unit="%"
          onChange={setBlendRate}
          highlight
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <ResultCard
          label="Reiner Jet-A"
          value={`$${totalJet.toFixed(3)}`}
          unit="/L"
          color="blue"
        />
        <ResultCard
          label="Reiner SAF"
          value={`$${totalSaf.toFixed(3)}`}
          unit="/L"
          color="emerald"
        />
        <ResultCard
          label={`${blendRate}% Blend`}
          value={`$${blendedCost.toFixed(3)}`}
          unit="/L"
          color={premiumVsJet > 30 ? 'red' : premiumVsJet > 15 ? 'yellow' : 'green'}
          subValue={`+${premiumVsJet.toFixed(1)}% vs Jet`}
        />
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p>Annahmen: 3.15 tCO₂/m³ Jet | 0.63 tCO₂/m³ SAF (80% RED) | 158.987 L/bbl</p>
        <p>EU ETS gilt nur für nicht-SAF-Anteil; SAF zählt 80% reduziert.</p>
      </div>
    </section>
  );
}

function SliderControl({ label, value, min, max, step, unit, onChange, highlight }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded border ${highlight ? 'border-emerald-700 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/50'}`}>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm text-slate-300">{label}</label>
        <span className="text-sm font-mono text-sky-300">{value.toFixed(step < 1 ? 2 : 0)} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
      />
    </div>
  );
}

function ResultCard({ label, value, unit, color, subValue }: {
  label: string;
  value: string;
  unit: string;
  color: 'blue' | 'emerald' | 'green' | 'yellow' | 'red';
  subValue?: string;
}) {
  const colorMap = {
    blue: 'border-blue-800/50 bg-blue-950/20',
    emerald: 'border-emerald-800/50 bg-emerald-950/20',
    green: 'border-green-800/50 bg-green-950/20',
    yellow: 'border-yellow-800/50 bg-yellow-950/20',
    red: 'border-red-800/50 bg-red-950/20',
  };

  const textMap = {
    blue: 'text-blue-300',
    emerald: 'text-emerald-300',
    green: 'text-green-300',
    yellow: 'text-yellow-300',
    red: 'text-red-300',
  };

  return (
    <div className={`p-4 rounded border ${colorMap[color]} text-center`}>
      <p className="text-xs text-slate-400 uppercase">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-slate-500">{unit}</p>
      {subValue && (
        <p className={`text-xs mt-1 font-mono ${textMap[color]}`}>{subValue}</p>
      )}
    </div>
  );
}
