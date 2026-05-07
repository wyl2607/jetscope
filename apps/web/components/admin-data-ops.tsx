'use client';

import { useEffect, useState } from 'react';
import { InfoCard } from '@/components/cards';
import { validatePathwaysPayload, validatePoliciesPayload } from '@/lib/admin-validation';

const PATHWAYS_PLACEHOLDER = `[
  {
    "pathway_id": "sugar-atj",
    "name": "Sugar ATJ-SPK",
    "pathway": "Sugar -> Ethanol -> Jet",
    "base_cost_usd_per_l": 1.6,
    "co2_savings_kg_per_l": 1.5,
    "category": "saf"
  }
]`;

const POLICIES_PLACEHOLDER = `[
  {
    "year": 2030,
    "saf_share_pct": 6,
    "synthetic_share_pct": 1.2,
    "label": "Early scale-up"
  }
]`;

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonArray(raw: string, field: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${field} must be an array`);
  }
  return parsed;
}

function finiteDraftNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a finite number`);
  }
  return parsed;
}

export function AdminDataOps() {
  const [pathwaysJson, setPathwaysJson] = useState(PATHWAYS_PLACEHOLDER);
  const [policiesJson, setPoliciesJson] = useState(POLICIES_PLACEHOLDER);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('就绪');
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [draftPathwayId, setDraftPathwayId] = useState('new-pathway');
  const [draftPathwayName, setDraftPathwayName] = useState('New Pathway');
  const [draftPathwayCost, setDraftPathwayCost] = useState('1.80');
  const [draftPathwaySavings, setDraftPathwaySavings] = useState('1.60');
  const [draftPolicyYear, setDraftPolicyYear] = useState('2040');
  const [draftPolicySaf, setDraftPolicySaf] = useState('30');
  const [draftPolicySynthetic, setDraftPolicySynthetic] = useState('12');
  const [draftPolicyLabel, setDraftPolicyLabel] = useState('草案目标');

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [pathwaysRes, policiesRes] = await Promise.all([
        fetch('/api/pathways', { cache: 'no-store' }),
        fetch('/api/policies/refuel-eu', { cache: 'no-store' })
      ]);
      const [pathwaysPayload, policiesPayload] = await Promise.all([
        pathwaysRes.json(),
        policiesRes.json()
      ]);
      if (!pathwaysRes.ok) {
        throw new Error(pathwaysPayload?.error ?? `Pathways HTTP ${pathwaysRes.status}`);
      }
      if (!policiesRes.ok) {
        throw new Error(policiesPayload?.error ?? `Policies HTTP ${policiesRes.status}`);
      }
      setPathwaysJson(stringify(pathwaysPayload));
      setPoliciesJson(stringify(policiesPayload));
      setStatus('已加载路径与政策');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载管理数据失败');
    } finally {
      setLoading(false);
    }
  }

  async function savePathways() {
    setSaving(true);
    setError(null);
    try {
      const payload = validatePathwaysPayload(pathwaysJson);
      const response = await fetch('/api/pathways', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setPathwaysJson(stringify(body));
      setStatus('路径已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存路径失败');
    } finally {
      setSaving(false);
    }
  }

  async function savePolicies() {
    setSaving(true);
    setError(null);
    try {
      const payload = validatePoliciesPayload(policiesJson);
      const response = await fetch('/api/policies/refuel-eu', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setPoliciesJson(stringify(body));
      setStatus('政策已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存政策失败');
    } finally {
      setSaving(false);
    }
  }

  async function triggerMarketRefresh() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/market/refresh', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken }
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setStatus(body?.message ?? '已触发市场刷新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '触发市场刷新失败');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function handleAdminTokenChange(value: string) {
    setAdminToken(value);
  }

  function appendDraftPathway() {
    try {
      const list = parseJsonArray(pathwaysJson, 'pathways');
      list.push({
        pathway_id: draftPathwayId.trim(),
        name: draftPathwayName.trim(),
        pathway: draftPathwayName.trim(),
        base_cost_usd_per_l: finiteDraftNumber(draftPathwayCost, 'base_cost_usd_per_l'),
        co2_savings_kg_per_l: finiteDraftNumber(draftPathwaySavings, 'co2_savings_kg_per_l'),
        category: 'saf'
      });
      validatePathwaysPayload(JSON.stringify(list));
      setPathwaysJson(stringify(list));
      setStatus(`已追加路径行：${draftPathwayId}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加路径草案失败');
    }
  }

  function appendDraftPolicy() {
    try {
      const list = parseJsonArray(policiesJson, 'policies');
      list.push({
        year: finiteDraftNumber(draftPolicyYear, 'year'),
        saf_share_pct: finiteDraftNumber(draftPolicySaf, 'saf_share_pct'),
        synthetic_share_pct: finiteDraftNumber(draftPolicySynthetic, 'synthetic_share_pct'),
        label: draftPolicyLabel.trim()
      });
      validatePoliciesPayload(JSON.stringify(list));
      setPoliciesJson(stringify(list));
      setStatus(`已追加政策行：${draftPolicyYear}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加政策草案失败');
    }
  }

  function formatAndValidatePathways() {
    try {
      const payload = validatePathwaysPayload(pathwaysJson);
      setPathwaysJson(stringify(payload));
      setStatus('路径 JSON 已校验');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '路径校验失败');
    }
  }

  function formatAndValidatePolicies() {
    try {
      const payload = validatePoliciesPayload(policiesJson);
      setPoliciesJson(stringify(payload));
      setStatus('政策 JSON 已校验');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '政策校验失败');
    }
  }

  return (
    <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
      <InfoCard title="路径管理" subtitle="数据库支撑的 /v1/pathways">
        <div className="space-y-3">
          <div className="grid gap-3 rounded-xl border border-slate-800 p-3 md:grid-cols-2">
            <label className="text-xs text-slate-400">
              pathway_id
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={draftPathwayId}
                onChange={(event) => setDraftPathwayId(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              name
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={draftPathwayName}
                onChange={(event) => setDraftPathwayName(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              base_cost_usd_per_l
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                type="number"
                step="0.01"
                value={draftPathwayCost}
                onChange={(event) => setDraftPathwayCost(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              co2_savings_kg_per_l
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                type="number"
                step="0.01"
                value={draftPathwaySavings}
                onChange={(event) => setDraftPathwaySavings(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 md:col-span-2"
              onClick={appendDraftPathway}
              disabled={loading || saving}
            >
              追加路径草案行
            </button>
          </div>
          <textarea
            className="h-72 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
            value={pathwaysJson}
            onChange={(event) => setPathwaysJson(event.target.value)}
          />
          <p className="text-[11px] leading-5 text-slate-500">
            必须为数组，且每条记录包含 pathway_id/name/pathway/category 与有限数值字段。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300"
              onClick={formatAndValidatePathways}
              disabled={loading || saving}
            >
              校验并格式化
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200"
              onClick={savePathways}
              disabled={loading || saving || !adminToken}
            >
              保存路径
            </button>
          </div>
        </div>
      </InfoCard>

      <InfoCard title="政策管理" subtitle="数据库支撑的 /v1/policies/refuel-eu">
        <div className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
            管理令牌（写操作必需）
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          <div className="grid gap-3 rounded-xl border border-slate-800 p-3 md:grid-cols-2">
            <label className="text-xs text-slate-400">
              year
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                type="number"
                value={draftPolicyYear}
                onChange={(event) => setDraftPolicyYear(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              label
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={draftPolicyLabel}
                onChange={(event) => setDraftPolicyLabel(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              saf_share_pct
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                type="number"
                step="0.1"
                value={draftPolicySaf}
                onChange={(event) => setDraftPolicySaf(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              synthetic_share_pct
              <input
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                type="number"
                step="0.1"
                value={draftPolicySynthetic}
                onChange={(event) => setDraftPolicySynthetic(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 md:col-span-2"
              onClick={appendDraftPolicy}
              disabled={loading || saving}
            >
              追加政策草案行
            </button>
          </div>
          <textarea
            className="h-72 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
            value={policiesJson}
            onChange={(event) => setPoliciesJson(event.target.value)}
          />
          <p className="text-[11px] leading-5 text-slate-500">
            必须为数组；`year` 为整数，share 字段为有限数值，`label` 为非空字符串。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300"
              onClick={formatAndValidatePolicies}
              disabled={loading || saving}
            >
              校验并格式化
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200"
              onClick={savePolicies}
              disabled={loading || saving || !adminToken}
            >
              保存政策
            </button>
            <button
              type="button"
              className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200"
              onClick={triggerMarketRefresh}
              disabled={loading || saving || !adminToken}
            >
              触发市场刷新
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300"
              onClick={loadAll}
              disabled={loading || saving}
            >
              重新加载
            </button>
          </div>
          <p className="text-xs text-slate-400">{status}</p>
          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
        </div>
      </InfoCard>
    </section>
  );
}
