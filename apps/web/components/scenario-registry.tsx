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
const fieldClassName =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
const textAreaClassName =
  'mt-1 h-32 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
const labelClassName = 'block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600';
const compactLabelClassName = 'text-xs font-semibold text-slate-600';
const panelClassName = 'rounded-xl border border-slate-200 bg-slate-50 p-3';

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
      <InfoCard title="情景库" subtitle="保存团队确认过的转型假设">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => loadScenarios({ preserveSelection: true })}
              disabled={loading || saving}
            >
              {loading ? '加载中...' : '刷新列表'}
            </button>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              {status}
            </span>
          </div>
          <label className={labelClassName}>
            管理令牌（创建/更新/删除必需）
            <input
              className={fieldClassName}
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {scenarios.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-600">尚未保存情景。</p>
            ) : (
              <ul>
                {scenarios.map((item) => (
                  <li key={item.id} className="border-b border-slate-100 last:border-none">
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left transition ${
                        selectedId === item.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => populateFromScenario(item)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-950">{item.name}</span>
                        <span className="text-xs text-slate-500">{formatTime(item.saved_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">版本 {item.id}</p>
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
          <label className={labelClassName}>
            名称
            <input
              className={fieldClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="情景名称"
            />
          </label>

          <div className={panelClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">引导式偏好设置</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className={compactLabelClassName}>
                原油基准
                <select
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                碳价基准
                <select
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                对比方式
                <select
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                碳价（美元/吨）
                <input
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                补贴（美元/升）
                <input
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                航煤代理斜率
                <input
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                航煤代理截距
                <input
                  className={fieldClassName}
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

          <div className={panelClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">引导式主航线编辑</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className={compactLabelClassName}>
                主航线
                <input
                  className={fieldClassName}
                  value={primaryRouteId}
                  onChange={(event) => setPrimaryRouteId(event.target.value || DEFAULT_ROUTE_ID)}
                />
              </label>
              <label className={compactLabelClassName}>
                基准成本（美元/升）
                <input
                  className={fieldClassName}
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
              <label className={compactLabelClassName}>
                减排量（kg/L）
                <input
                  className={fieldClassName}
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

          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              高级 JSON 设置
            </summary>
            <div className="mt-3 space-y-3">
              <label className={labelClassName}>
                偏好 JSON
                <textarea
                  className={textAreaClassName}
                  value={preferencesJson}
                  onChange={(event) => setPreferencesJson(event.target.value)}
                />
                <span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-500">
                  用于保留来源、模式和有限数值校验，默认无需展开。
                </span>
              </label>

              <label className={labelClassName}>
                航线编辑 JSON
                <textarea
                  className={textAreaClassName}
                  value={routeEditsJson}
                  onChange={(event) => setRouteEditsJson(event.target.value)}
                />
                <span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-500">
                  用于保留多航线成本和减排假设，默认无需展开。
                </span>
              </label>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={createScenario}
              disabled={saving || !adminToken}
            >
              创建
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={updateScenario}
              disabled={saving || !selectedScenario || !adminToken}
            >
              更新所选
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={deleteScenario}
              disabled={saving || !selectedScenario || !adminToken}
            >
              删除所选
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
