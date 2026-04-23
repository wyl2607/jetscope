export function renderLocalPersistenceSection({
  localStateTarget,
  sourceLockTarget,
  scenarioTargets,
  scenarioState,
  helpers
}) {
  renderLocalStateCard(localStateTarget, scenarioState, helpers);
  renderSourceLockCard(sourceLockTarget, scenarioState, helpers);
  renderScenariosSection(scenarioTargets, scenarioState, helpers);
}

function renderLocalStateCard(target, state, { formatDateTime, formatRelativeTime, t, countRouteOverrides, countSettingOverrides }) {
  if (!target) {
    return;
  }

  const overrideCount = countRouteOverrides() + countSettingOverrides();
  const browserSavedText = state.persistedAt
    ? `${t('浏览器快照', 'Browser snapshot')}: ${formatDateTime(state.persistedAt)}${t(`（${formatRelativeTime(state.persistedAt)}）`, ` (${formatRelativeTime(state.persistedAt)})`)}`
    : `${t('浏览器快照', 'Browser snapshot')}: ${t('尚未生成', 'not created yet')}`;
  const serverSavedText = state.serverPersistence?.exists
    ? `${t('服务器文件', 'Server file')}: ${state.serverPersistence.savedAt ? formatDateTime(state.serverPersistence.savedAt) : t('已存在', 'exists')}`
    : `${t('服务器文件', 'Server file')}: ${t('未保存', 'not saved')}`;
  const serverSemantics = state.serverPersistence?.semantics?.persistedPreferences?.length
    ? `${t('服务器可保存', 'Server can persist')} ${state.serverPersistence.semantics.persistedPreferences.length} ${t('个设置 + 路线覆盖', 'settings + route overrides')}`
    : `${t('服务器持久化', 'Server persistence')}: ${t('未检测到或不可用', 'not detected or unavailable')}`;
  const warningText = state.serverPersistenceError ?? state.serverPersistence?.warning;

  target.innerHTML = `
    <div class="local-state-head">
      <strong>${t('本地持久化', 'Local persistence')}</strong>
      <span class="badge ${state.serverPersistence?.exists ? 'ok' : 'reference'}">${state.serverPersistence?.exists ? 'server-ready' : 'browser-only'}</span>
    </div>
    <p>${t('浏览器会自动保存当前场景；如后端可用，可额外把支持的偏好与路线覆盖写入服务器本地文件，便于下次启动直接恢复。', 'The browser auto-saves the current working state. If the backend is available, supported preferences and route overrides can also be written to a server-local file for the next startup.')}</p>
    <div class="local-state-meta">
      <span>${t('本地覆盖项', 'Local overrides')}: ${overrideCount}</span>
      <span>${browserSavedText}</span>
      <span>${serverSavedText}</span>
      <span>${serverSemantics}</span>
    </div>
    ${warningText ? `<div class="subtle">${warningText}</div>` : ''}
  `;
}

function renderSourceLockCard(target, state, { getBenchmarkLabel, getCarbonSourceLabel, getCrudeSourceLabel, getLiveJetSpot, isSourceLocked, t }) {
  if (!target) {
    return;
  }

  const crudeLocked = isSourceLocked(state.crudeSource);
  const carbonLocked = isSourceLocked(state.carbonSource);
  const benchmarkLine =
    state.benchmarkMode === 'live-jet-spot' && getLiveJetSpot() == null
      ? t('live jet spot 当前不可用，比较已回退到 crude proxy。', 'Live jet spot is unavailable; comparison falls back to the crude proxy.')
      : `${t('比较口径', 'Benchmark mode')}: ${getBenchmarkLabel()}`;

  target.innerHTML = `
    <div class="local-state-head">
      <strong>${t('来源锁定状态', 'Source lock status')}</strong>
      <span class="badge ${crudeLocked || carbonLocked ? 'ok' : 'reference'}">${crudeLocked || carbonLocked ? 'locked' : 'manual'}</span>
    </div>
    <p>${t('选择公开来源时，对应输入框会锁定并跟随最新抓取值；改回 manual 后，数值才由当前浏览器场景接管。', 'When a public source is selected, the paired input is locked to the latest fetched value. Switch back to manual to let the current browser scenario control it again.')}</p>
    <div class="local-state-meta">
      <span>${t('原油', 'Crude')}: ${crudeLocked ? t(`锁定到 ${getCrudeSourceLabel()}`, `Locked to ${getCrudeSourceLabel()}`) : t('manual / 可编辑', 'manual / editable')}</span>
      <span>${t('碳价', 'Carbon')}: ${carbonLocked ? t(`锁定到 ${getCarbonSourceLabel()}`, `Locked to ${getCarbonSourceLabel()}`) : t('manual / 可编辑', 'manual / editable')}</span>
      <span>${benchmarkLine}</span>
    </div>
  `;
}

function renderScenariosSection(targets, state, { countScenarioDifferences, formatDateTime, formatRelativeTime, getSelectedScenario, t }) {
  const { scenarioName, activeScenarioName, scenarioList, scenarioSummary } = targets;
  const scenarios = state.savedScenarios;
  const selectedScenario = getSelectedScenario();
  const diff = countScenarioDifferences(selectedScenario);

  if (scenarioName) {
    scenarioName.value = state.scenarioDraftName;
  }

  if (activeScenarioName) {
    activeScenarioName.textContent =
      selectedScenario?.name || state.scenarioDraftName.trim() || t('未命名当前情景', 'Untitled current scenario');
  }

  if (scenarioList) {
    scenarioList.innerHTML = [
      `<option value="">${t('未选择', 'None selected')}</option>`,
      ...scenarios.map(
        (scenario) =>
          `<option value="${scenario.id}" ${scenario.id === state.selectedScenarioId ? 'selected' : ''}>${scenario.name}</option>`
      )
    ].join('');
  }

  if (!scenarioSummary) {
    return;
  }

  if (!selectedScenario) {
    scenarioSummary.innerHTML = `
      <article class="scenario-card muted">
        <strong>${t('还没有选中 scenario', 'No scenario selected yet')}</strong>
        <p>${t('给当前参数命名后点击“保存当前 scenario”，之后可以快速加载、覆盖保存或删除。', 'Name the current state and click “Save current scenario” to load, overwrite, or delete it later.')}</p>
      </article>
    `;
    return;
  }

  scenarioSummary.innerHTML = `
    <article class="scenario-card">
      <strong>${selectedScenario.name}</strong>
      <p>${t('保存时间', 'Saved at')}: ${formatDateTime(selectedScenario.savedAt)}</p>
      <small>${formatRelativeTime(selectedScenario.savedAt)}</small>
    </article>
    <article class="scenario-card">
      <strong>${diff.settings}</strong>
      <p>${t('当前状态与所选 scenario 的设置差异项', 'Setting differences versus the selected scenario')}</p>
      <small>${t('包含来源选择、价格、补贴与 proxy 参数', 'Includes source selection, prices, subsidies, and proxy parameters')}</small>
    </article>
    <article class="scenario-card">
      <strong>${diff.routes}</strong>
      <p>${t('当前状态与所选 scenario 的路线差异项', 'Route differences versus the selected scenario')}</p>
      <small>${t('按路线基础成本 / CO₂ 字段逐项比较', 'Compared field by field across base cost and CO₂ values')}</small>
    </article>
  `;
}
