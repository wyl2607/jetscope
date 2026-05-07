'use client';

import { useEffect, useMemo, useState } from 'react';
import { InfoCard } from '@/components/cards';
import { validateScenarioPayload } from '@/lib/admin-validation';

type ScenarioRecord = {
  id: string;
  workspace_slug: string;
  name: string;
  saved_at: string;
  preferences: Record<string, unknown>;
  route_edits: Record<string, unknown>;
};

const EMPTY_OBJECT_JSON = '{}';
const DEFAULT_ROUTE_ID = 'sugar-atj';
const CRUDE_SOURCES = ['manual', 'brentEia', 'brentFred'] as const;
const CARBON_SOURCES = ['manual', 'cbamCarbonProxyUsd'] as const;
const BENCHMARK_MODES = ['crude-proxy', 'live-jet-spot'] as const;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function patchJsonObject(
  raw: string,
  patch: Record<string, unknown>,
  removableKeys: string[] = []
): string {
  const base = safeParseObject(raw);
  const next: Record<string, unknown> = { ...base, ...patch };
  for (const key of removableKeys) {
    if (next[key] === '' || next[key] === null || next[key] === undefined) {
      delete next[key];
    }
  }
  return stringifyJson(next);
}

export function ScenarioRegistry() {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [preferencesJson, setPreferencesJson] = useState(EMPTY_OBJECT_JSON);
  const [routeEditsJson, setRouteEditsJson] = useState(EMPTY_OBJECT_JSON);
  const [primaryRouteId, setPrimaryRouteId] = useState(DEFAULT_ROUTE_ID);
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');

  const selectedScenario = useMemo(
    () => scenarios.find((item) => item.id === selectedId) ?? null,
    [scenarios, selectedId]
  );
  const parsedPreferences = useMemo(() => safeParseObject(preferencesJson), [preferencesJson]);
  const parsedRouteEdits = useMemo(() => safeParseObject(routeEditsJson), [routeEditsJson]);
  const parsedPrimaryRouteEdit = useMemo(() => {
    const candidate = parsedRouteEdits[primaryRouteId];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return {};
    }
    return candidate as Record<string, unknown>;
  }, [parsedRouteEdits, primaryRouteId]);

  async function loadScenarios(options?: { preserveSelection?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/scenarios', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      const list = Array.isArray(payload) ? (payload as ScenarioRecord[]) : [];
      setScenarios(list);
      if (!options?.preserveSelection && list.length > 0) {
        const first = list[0];
        setSelectedId(first.id);
        setName(first.name);
        setPreferencesJson(stringifyJson(first.preferences));
        setRouteEditsJson(stringifyJson(first.route_edits));
      }
      if (list.length === 0 && !options?.preserveSelection) {
        resetForm();
      }
      setStatus(`已加载 ${list.length} 个情景`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载情景失败');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSelectedId('');
    setName('');
    setPreferencesJson(EMPTY_OBJECT_JSON);
    setRouteEditsJson(EMPTY_OBJECT_JSON);
    setPrimaryRouteId(DEFAULT_ROUTE_ID);
  }

  function populateFromScenario(item: ScenarioRecord) {
    setSelectedId(item.id);
    setName(item.name);
    setPreferencesJson(stringifyJson(item.preferences));
    setRouteEditsJson(stringifyJson(item.route_edits));
    const firstRoute = Object.keys(item.route_edits ?? {})[0];
    setPrimaryRouteId(firstRoute || DEFAULT_ROUTE_ID);
    setStatus(`已将情景“${item.name}”载入编辑器`);
    setError(null);
  }

  async function createScenario() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('情景名称不能为空');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const validated = validateScenarioPayload(preferencesJson, routeEditsJson);
      const payload = { name: trimmed, ...validated };
      const response = await fetch('/api/scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${response.status}`);
      }
      setStatus(`已创建情景“${body.name}”`);
      await loadScenarios({ preserveSelection: true });
      populateFromScenario(body as ScenarioRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建情景失败');
    } finally {
      setSaving(false);
    }
  }

  async function updateScenario() {
    if (!selectedId) {
      setError('请先选择一个情景');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('情景名称不能为空');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const validated = validateScenarioPayload(preferencesJson, routeEditsJson);
      const payload = { name: trimmed, ...validated };
      const response = await fetch(`/api/scenarios/${selectedId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${response.status}`);
      }
      setStatus(`已更新情景“${body.name}”`);
      await loadScenarios({ preserveSelection: true });
      populateFromScenario(body as ScenarioRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新情景失败');
    } finally {
      setSaving(false);
    }
  }

  async function deleteScenario() {
    if (!selectedId) {
      setError('请先选择一个情景');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/scenarios/${selectedId}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken }
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${response.status}`);
      }
      setStatus(`已删除情景 ${body?.scenario_id ?? selectedId}`);
      resetForm();
      await loadScenarios();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除情景失败');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadScenarios();
  }, []);

  function handleAdminTokenChange(value: string) {
    setAdminToken(value);
  }

  function setPreferenceField(key: string, value: unknown, removable = true) {
    const removal = removable ? [key] : [];
    setPreferencesJson((prev) => patchJsonObject(prev, { [key]: value }, removal));
  }

  function setPrimaryRouteField(key: string, value: unknown) {
    const base = safeParseObject(routeEditsJson);
    const current =
      base[primaryRouteId] && typeof base[primaryRouteId] === 'object' && !Array.isArray(base[primaryRouteId])
        ? ({ ...(base[primaryRouteId] as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    if (value === '' || value === null || value === undefined) {
      delete current[key];
    } else {
      current[key] = value;
    }

    if (Object.keys(current).length === 0) {
      delete base[primaryRouteId];
    } else {
      base[primaryRouteId] = current;
    }

    setRouteEditsJson(stringifyJson(base));
  }

  return (
    <section className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <InfoCard title="实时情景注册表" subtitle="FastAPI + PostgreSQL">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200"
              onClick={() => loadScenarios({ preserveSelection: true })}
              disabled={loading || saving}
            >
              {loading ? '加载中...' : '刷新列表'}
            </button>
            <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
              {status}
            </span>
          </div>
          <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
            管理令牌（创建/更新/删除必需）
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800">
            {scenarios.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400">尚未保存情景。</p>
            ) : (
              <ul>
                {scenarios.map((item) => (
                  <li key={item.id} className="border-b border-slate-900 last:border-none">
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left transition ${
                        selectedId === item.id ? 'bg-sky-500/10' : 'hover:bg-slate-800/60'
                      }`}
                      onClick={() => populateFromScenario(item)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-white">{item.name}</span>
                        <span className="text-xs text-slate-400">{formatTime(item.saved_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.id}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </InfoCard>

      <InfoCard title="情景编辑器" subtitle="创建 / 更新 / 删除">
        <div className="space-y-4">
          <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
            名称
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="情景名称"
            />
          </label>

          <div className="rounded-xl border border-slate-800 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">引导式偏好设置</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-slate-400">
                crudeSource
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={String(parsedPreferences.crudeSource ?? 'manual')}
                  onChange={(event) => setPreferenceField('crudeSource', event.target.value, false)}
                >
                  {CRUDE_SOURCES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                carbonSource
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={String(parsedPreferences.carbonSource ?? 'manual')}
                  onChange={(event) => setPreferenceField('carbonSource', event.target.value, false)}
                >
                  {CARBON_SOURCES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                benchmarkMode
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={String(parsedPreferences.benchmarkMode ?? 'crude-proxy')}
                  onChange={(event) => setPreferenceField('benchmarkMode', event.target.value, false)}
                >
                  {BENCHMARK_MODES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-slate-400">
                carbonPriceUsdPerTonne
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  type="number"
                  value={String(parsedPreferences.carbonPriceUsdPerTonne ?? '')}
                  onChange={(event) =>
                    setPreferenceField(
                      'carbonPriceUsdPerTonne',
                      event.target.value === '' ? '' : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="text-xs text-slate-400">
                subsidyUsdPerLiter
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  type="number"
                  step="0.01"
                  value={String(parsedPreferences.subsidyUsdPerLiter ?? '')}
                  onChange={(event) =>
                    setPreferenceField(
                      'subsidyUsdPerLiter',
                      event.target.value === '' ? '' : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="text-xs text-slate-400">
                jetProxySlope
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  type="number"
                  step="0.0001"
                  value={String(parsedPreferences.jetProxySlope ?? '')}
                  onChange={(event) =>
                    setPreferenceField(
                      'jetProxySlope',
                      event.target.value === '' ? '' : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="text-xs text-slate-400">
                jetProxyIntercept
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  type="number"
                  step="0.01"
                  value={String(parsedPreferences.jetProxyIntercept ?? '')}
                  onChange={(event) =>
                    setPreferenceField(
                      'jetProxyIntercept',
                      event.target.value === '' ? '' : Number(event.target.value)
                    )
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">引导式主航线编辑</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs text-slate-400">
                route id
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={primaryRouteId}
                  onChange={(event) => setPrimaryRouteId(event.target.value || DEFAULT_ROUTE_ID)}
                />
              </label>
              <label className="text-xs text-slate-400">
                baseCostUsdPerLiter
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  type="number"
                  step="0.01"
                  value={String(parsedPrimaryRouteEdit.baseCostUsdPerLiter ?? '')}
                  onChange={(event) =>
                    setPrimaryRouteField(
                      'baseCostUsdPerLiter',
                      event.target.value === '' ? '' : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="text-xs text-slate-400">
                co2SavingsKgPerLiter
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  type="number"
                  step="0.01"
                  value={String(parsedPrimaryRouteEdit.co2SavingsKgPerLiter ?? '')}
                  onChange={(event) =>
                    setPrimaryRouteField(
                      'co2SavingsKgPerLiter',
                      event.target.value === '' ? '' : Number(event.target.value)
                    )
                  }
                />
              </label>
            </div>
          </div>

          <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
            偏好 JSON（高级）
            <textarea
              className="mt-1 h-32 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
              value={preferencesJson}
              onChange={(event) => setPreferencesJson(event.target.value)}
            />
            <span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-500">
              支持 `schema_version`、source/mode 字段与有限数值（finite number）校验。
            </span>
          </label>

          <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
            航线编辑 JSON（高级）
            <textarea
              className="mt-1 h-32 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
              value={routeEditsJson}
              onChange={(event) => setRouteEditsJson(event.target.value)}
            />
            <span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-500">
              每个 route edit 必须是对象；成本和减排字段必须是有限数值。
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200"
              onClick={createScenario}
              disabled={saving || !adminToken}
            >
              创建
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200"
              onClick={updateScenario}
              disabled={saving || !selectedScenario || !adminToken}
            >
              更新所选
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200"
              onClick={deleteScenario}
              disabled={saving || !selectedScenario || !adminToken}
            >
              删除所选
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300"
              onClick={resetForm}
              disabled={saving}
            >
              清空编辑器
            </button>
          </div>
        </div>
      </InfoCard>
    </section>
  );
}
