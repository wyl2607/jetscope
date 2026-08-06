'use client';

import { useEffect, useMemo, useState } from 'react';
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
const SCENARIO_NAME_MAX_LENGTH = 120;
const CRUDE_SOURCES = ['manual', 'brentEia', 'brentFred'] as const;
const CARBON_SOURCES = ['manual', 'cbamCarbonProxyUsd'] as const;
const BENCHMARK_MODES = ['crude-proxy', 'live-jet-spot'] as const;
const fieldClassName =
  'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent';
const textAreaClassName =
  'mt-1 h-32 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent';
const labelClassName = 'block text-xs font-semibold uppercase tracking-[0.14em] text-muted';
const compactLabelClassName = 'text-xs font-semibold text-muted';
const panelClassName = 'rounded-xl border border-line bg-surface-muted p-3';

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
  const trimmedName = name.trim();
  const nameTooLong = trimmedName.length > SCENARIO_NAME_MAX_LENGTH;
  const nameReady = Boolean(trimmedName) && !nameTooLong;
  const createDisabled = saving || !adminToken || !nameReady;
  const updateDisabled = saving || !selectedScenario || !adminToken || !nameReady;
  const deleteDisabled = saving || !selectedScenario || !adminToken;
  const writeHint = !adminToken
    ? '输入管理令牌后可创建、更新或删除情景。'
    : !trimmedName
      ? '填写情景名称后可创建新情景。'
      : nameTooLong
        ? `情景名称最长 ${SCENARIO_NAME_MAX_LENGTH} 个字符，请缩短后再保存。`
      : selectedScenario
        ? `已选择“${selectedScenario.name}”，可创建新情景或更新/删除所选情景。`
        : '可创建新情景；更新或删除需要先从左侧列表选择已有情景。';
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
    if (trimmed.length > SCENARIO_NAME_MAX_LENGTH) {
      setError(`情景名称最长 ${SCENARIO_NAME_MAX_LENGTH} 个字符`);
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
    if (trimmed.length > SCENARIO_NAME_MAX_LENGTH) {
      setError(`情景名称最长 ${SCENARIO_NAME_MAX_LENGTH} 个字符`);
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
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section>
        <h3 className="text-lg font-medium text-ink">情景库</h3>
        <p className="mt-1 text-sm leading-6 text-muted">保存团队确认过的转型假设。</p>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => loadScenarios({ preserveSelection: true })}
              disabled={loading || saving}
            >
              {loading ? '加载中...' : '刷新列表'}
            </button>
            <span className="rounded-lg border border-line bg-surface-muted px-3 py-1.5 text-xs text-muted">
              {status}
            </span>
          </div>
          <label className={labelClassName}>
            管理令牌（创建/更新/删除必需）
            <input
              className={fieldClassName}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-line bg-surface">
            {scenarios.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">尚未保存情景。</p>
            ) : (
              <ul>
                {scenarios.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`w-full border px-3 py-3 text-left transition ${
                        selectedId === item.id
                          ? 'border-accent bg-accent-soft'
                          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted'
                      }`}
                      onClick={() => populateFromScenario(item)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{item.name}</span>
                        <span className="text-xs text-muted">{formatTime(item.saved_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">版本 {item.id}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium text-ink">情景编辑器</h3>
        <p className="mt-1 text-sm leading-6 text-muted">创建、更新或删除受保护的情景记录。</p>
        <div className="space-y-4">
          <label className={labelClassName}>
            名称
            <input
              className={fieldClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={SCENARIO_NAME_MAX_LENGTH}
              aria-describedby="scenario-name-limit"
              placeholder="情景名称"
            />
            <span
              id="scenario-name-limit"
              className={`mt-1 block text-[11px] normal-case tracking-normal ${
                nameTooLong ? 'text-danger' : 'text-muted'
              }`}
            >
              {trimmedName.length}/{SCENARIO_NAME_MAX_LENGTH} 个字符
            </span>
          </label>

          <div className={panelClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">引导式偏好设置</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">引导式主航线编辑</p>
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

          <details className="rounded-xl border border-line bg-surface-muted p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-muted">
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
                <span className="mt-1 block text-[11px] normal-case tracking-normal text-muted">
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
                <span className="mt-1 block text-[11px] normal-case tracking-normal text-muted">
                  用于保留多航线成本和减排假设，默认无需展开。
                </span>
              </label>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <p className="basis-full rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-5 text-muted">
              {writeHint}
            </p>
            <button
              type="button"
              className="rounded-lg border border-line bg-success-soft px-3 py-1.5 text-xs font-semibold text-success transition hover:border-success disabled:cursor-not-allowed disabled:opacity-60"
              onClick={createScenario}
              disabled={createDisabled}
            >
              创建
            </button>
            <button
              type="button"
              className="rounded-lg border border-line bg-warning-soft px-3 py-1.5 text-xs font-semibold text-warning transition hover:border-warning disabled:cursor-not-allowed disabled:opacity-60"
              onClick={updateScenario}
              disabled={updateDisabled}
            >
              更新所选
            </button>
            <button
              type="button"
              className="rounded-lg border border-line bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-60"
              onClick={deleteScenario}
              disabled={deleteDisabled}
            >
              删除所选
            </button>
            <button
              type="button"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
              onClick={resetForm}
              disabled={saving}
            >
              清空编辑器
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
