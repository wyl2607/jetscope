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

type RefreshEvidence = {
  refreshedAt: string;
  sourceStatus: string;
  persistedMetricCount: number;
  snapshotGeneratedAt: string;
  snapshotOverall: string;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function friendlyAdminError(body: unknown, status: number, fallback: string): string {
  const record = bodyRecord(body);
  const raw = String(record.error ?? record.detail ?? '');
  if (raw.includes('Server admin token is not configured')) {
    return '后端没有配置 JETSCOPE_ADMIN_TOKEN，本次写操作没有进入本地数据库。请用带管理令牌的 API 服务重启后再试。';
  }
  if (status === 401 || raw.includes('Invalid admin token')) {
    return '管理令牌不匹配，后端拒绝写入。';
  }
  return raw || `${fallback}（HTTP ${status}）`;
}

export function AdminDataOps() {
  const [pathwaysJson, setPathwaysJson] = useState(PATHWAYS_PLACEHOLDER);
  const [policiesJson, setPoliciesJson] = useState(POLICIES_PLACEHOLDER);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('就绪');
  const [error, setError] = useState<string | null>(null);
  const [refreshEvidence, setRefreshEvidence] = useState<RefreshEvidence | null>(null);
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
      const [pathwaysPayload, policiesPayload] = await Promise.all([readJson(pathwaysRes), readJson(policiesRes)]);
      if (!pathwaysRes.ok) {
        throw new Error(friendlyAdminError(pathwaysPayload, pathwaysRes.status, '加载路径失败'));
      }
      if (!policiesRes.ok) {
        throw new Error(friendlyAdminError(policiesPayload, policiesRes.status, '加载政策失败'));
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
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(friendlyAdminError(body, response.status, '保存路径失败'));
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
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(friendlyAdminError(body, response.status, '保存政策失败'));
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
      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(friendlyAdminError(body, response.status, '触发市场刷新失败'));
      }
      const snapshotResponse = await fetch('/api/market', { cache: 'no-store' });
      const snapshot = await readJson(snapshotResponse);
      if (!snapshotResponse.ok) {
        throw new Error(friendlyAdminError(snapshot, snapshotResponse.status, '读取刷新后市场快照失败'));
      }
      const refreshBody = bodyRecord(body);
      const snapshotBody = bodyRecord(snapshot);
      const persistedMetricCount = Number(refreshBody.persisted_metric_count ?? 0);
      const refreshedAt = String(refreshBody.refreshed_at ?? '');
      const sourceStatus = String(refreshBody.source_status ?? 'unknown');
      const snapshotStatus = snapshotBody.source_status && typeof snapshotBody.source_status === 'object'
        ? snapshotBody.source_status as Record<string, unknown>
        : {};
      setRefreshEvidence({
        refreshedAt,
        sourceStatus,
        persistedMetricCount,
        snapshotGeneratedAt: String(snapshotBody.generated_at ?? refreshedAt),
        snapshotOverall: String(snapshotStatus.overall ?? sourceStatus)
      });
      setStatus(`市场刷新已写入本地数据库：market_snapshots ${persistedMetricCount} 行，状态 ${sourceStatus}`);
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
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
            <label className="text-xs text-slate-600">
              pathway_id
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                value={draftPathwayId}
                onChange={(event) => setDraftPathwayId(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              name
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                value={draftPathwayName}
                onChange={(event) => setDraftPathwayName(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              base_cost_usd_per_l
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                type="number"
                step="0.01"
                value={draftPathwayCost}
                onChange={(event) => setDraftPathwayCost(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              co2_savings_kg_per_l
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                type="number"
                step="0.01"
                value={draftPathwaySavings}
                onChange={(event) => setDraftPathwaySavings(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 md:col-span-2"
              onClick={appendDraftPathway}
              disabled={loading || saving}
            >
              追加路径草案行
            </button>
          </div>
          <textarea
            className="h-72 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-950"
            value={pathwaysJson}
            onChange={(event) => setPathwaysJson(event.target.value)}
          />
          <p className="text-[11px] leading-5 text-slate-500">
            必须为数组，且每条记录包含 pathway_id/name/pathway/category 与有限数值字段。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={formatAndValidatePathways}
              disabled={loading || saving}
            >
              校验并格式化
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
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
          <label className="block text-xs uppercase tracking-[0.14em] text-slate-600">
            管理令牌（写操作必需）
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
            <label className="text-xs text-slate-600">
              year
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                type="number"
                value={draftPolicyYear}
                onChange={(event) => setDraftPolicyYear(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              label
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                value={draftPolicyLabel}
                onChange={(event) => setDraftPolicyLabel(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              saf_share_pct
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                type="number"
                step="0.1"
                value={draftPolicySaf}
                onChange={(event) => setDraftPolicySaf(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-600">
              synthetic_share_pct
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                type="number"
                step="0.1"
                value={draftPolicySynthetic}
                onChange={(event) => setDraftPolicySynthetic(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 md:col-span-2"
              onClick={appendDraftPolicy}
              disabled={loading || saving}
            >
              追加政策草案行
            </button>
          </div>
          <textarea
            className="h-72 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-950"
            value={policiesJson}
            onChange={(event) => setPoliciesJson(event.target.value)}
          />
          <p className="text-[11px] leading-5 text-slate-500">
            必须为数组；`year` 为整数，share 字段为有限数值，`label` 为非空字符串。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={formatAndValidatePolicies}
              disabled={loading || saving}
            >
              校验并格式化
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"
              onClick={savePolicies}
              disabled={loading || saving || !adminToken}
            >
              保存政策
            </button>
            <button
              type="button"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800"
              onClick={triggerMarketRefresh}
              disabled={loading || saving || !adminToken}
            >
              触发市场刷新
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={loadAll}
              disabled={loading || saving}
            >
              重新加载
            </button>
          </div>
          <p className="text-xs text-slate-600">{status}</p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
            <p className="font-semibold text-slate-950">刷新写入证据</p>
            {refreshEvidence ? (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <p>
                  本地数据库：
                  <span className="font-mono text-slate-950">
                    market_snapshots +{refreshEvidence.persistedMetricCount}
                  </span>
                </p>
                <p>
                  后端刷新状态：
                  <span className="font-mono text-slate-950">{refreshEvidence.sourceStatus}</span>
                </p>
                <p>
                  写入时间：
                  <span className="font-mono text-slate-950">{refreshEvidence.refreshedAt}</span>
                </p>
                <p>
                  前端读回：
                  <span className="font-mono text-slate-950">
                    /api/market generated_at={refreshEvidence.snapshotGeneratedAt}
                  </span>
                </p>
                <p className="md:col-span-2">
                  读回状态：
                  <span className="font-mono text-slate-950">{refreshEvidence.snapshotOverall}</span>
                </p>
              </div>
            ) : (
              <p className="mt-2">
                等待刷新。成功后这里会显示 `/api/market/refresh` 写入 FastAPI 本地数据库，再由
                `/api/market` 读回的证据。
              </p>
            )}
          </div>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </InfoCard>
    </section>
  );
}
