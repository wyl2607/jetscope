const INDUSTRY_SIGNAL_TONES = {
  viable: 'success',
  threshold: 'warning',
  watching: 'accent',
  far: 'danger'
};

function createIndustrySignalCard() {
  const card = document.createElement('article');
  const title = document.createElement('h3');
  const detail = document.createElement('p');

  card.className = 'industry-signal-card';
  card.append(title, detail);
  card._refs = { title, detail };

  return card;
}

function createIndustryProgressRow() {
  const row = document.createElement('div');
  const name = document.createElement('span');
  const progressWrap = document.createElement('div');
  const barOuter = document.createElement('div');
  const barFill = document.createElement('div');
  const barTarget = document.createElement('div');
  const value = document.createElement('span');
  const badge = document.createElement('span');

  row.className = 'industry-country-row';

  name.className = 'industry-country-name';
  progressWrap.className = 'industry-country-progress';
  barOuter.className = 'industry-bar-outer';
  barFill.className = 'industry-bar-fill';
  barTarget.className = 'industry-bar-target';
  value.className = 'industry-country-value';
  badge.className = 'industry-country-badge';

  barOuter.append(barFill, barTarget);
  progressWrap.append(barOuter);
  row.append(name, progressWrap, value, badge);

  row._refs = { name, barFill, barTarget, value, badge };
  return row;
}

function createIndustryTimelineRow() {
  const row = document.createElement('li');
  const year = document.createElement('span');
  const copy = document.createElement('div');
  const headline = document.createElement('strong');
  const detail = document.createElement('span');

  year.className = 'industry-timeline-year';
  copy.className = 'industry-timeline-copy';
  copy.append(headline, detail);
  row.append(year, copy);

  row._refs = { year, headline, detail };
  return row;
}

export function renderIndustryDashboardSection({
  locale,
  targets,
  viewModel,
  clampProgressPct,
  formatCurrency,
  formatNumber,
  reconcileKeyedChildren,
  t
}) {
  if (
    !targets.signalCards &&
    !targets.countries &&
    !targets.airlines &&
    !targets.pathways &&
    !targets.timeline
  ) {
    return;
  }

  const bestPathway = viewModel.pathways.find((pathway) => pathway.routeId === viewModel.bestSafRouteId);
  const signalCards = [
    {
      id: 'status',
      title: t('行业成本信号', 'Industry cost signal'),
      detail: locale === 'en' ? viewModel.signal.labelEn : viewModel.signal.labelZh,
      tone: INDUSTRY_SIGNAL_TONES[viewModel.signal.status] ?? 'danger'
    },
    {
      id: 'gap',
      title: t('与传统燃料价差', 'Gap vs conventional fuel'),
      detail: `${viewModel.signal.gapUsdPerLiter >= 0 ? '+' : ''}${formatCurrency(viewModel.signal.gapUsdPerLiter, 2)}/L`,
      tone:
        viewModel.signal.gapUsdPerLiter <= 0
          ? 'success'
          : viewModel.signal.gapUsdPerLiter <= 0.25
            ? 'warning'
            : 'danger'
    },
    {
      id: 'leader',
      title: t('当前最优路线', 'Current leading pathway'),
      detail: bestPathway
        ? (locale === 'en' ? bestPathway.nameEn : bestPathway.nameZh)
        : t('暂无可用路线', 'No SAF pathway available'),
      tone: 'accent'
    }
  ];

  reconcileKeyedChildren(
    targets.signalCards,
    signalCards,
    (item) => item.id,
    () => createIndustrySignalCard(),
    (card, item) => {
      const { title, detail } = card._refs;
      title.textContent = item.title;
      detail.textContent = item.detail;
      card.dataset.tone = item.tone;
    }
  );

  reconcileKeyedChildren(
    targets.countries,
    viewModel.countries,
    (country) => country.id,
    () => createIndustryProgressRow(),
    (row, country) => {
      const { name, barFill, barTarget, value, badge } = row._refs;
      const progressPct = clampProgressPct(country.progressPct);
      name.textContent = `${country.flag ?? ''} ${locale === 'en' ? country.nameEn : country.nameZh}`.trim();
      value.textContent = `${formatNumber(country.currentPct, 2)}% / ${formatNumber(country.target2030Pct, 2)}%`;
      badge.textContent = `${locale === 'en' ? country.strengthBadge.labelEn : country.strengthBadge.labelZh}${country.verificationStatus === 'estimate' ? (locale === 'en' ? ' · est.' : ' · 估算') : ''}`;
      badge.style.borderColor = country.strengthBadge.color;
      badge.style.color = country.strengthBadge.color;
      barFill.style.background = country.progressColor;
      barFill.style.setProperty('--progress', `${progressPct}%`);
      barTarget.style.left = '100%';
      row.title = country.sourceNote ?? '';
      row.dataset.unverified = country.verificationStatus === 'estimate' ? 'true' : 'false';
    }
  );

  reconcileKeyedChildren(
    targets.airlines,
    viewModel.airlines,
    (airline) => airline.id,
    () => createIndustryProgressRow(),
    (row, airline) => {
      const { name, barFill, barTarget, value, badge } = row._refs;
      const progressPct = clampProgressPct(airline.progressPct);
      name.textContent = airline.name;
      value.textContent = `${formatNumber(airline.currentPct, 2)}% / ${formatNumber(airline.target2030Pct, 2)}%`;
      badge.textContent = `${airline.alliance}${airline.verificationStatus === 'estimate' ? (locale === 'en' ? ' · est.' : ' · 估算') : ''}`;
      badge.style.borderColor = 'var(--border)';
      badge.style.color = 'var(--text-secondary)';
      barFill.style.background = airline.progressColor;
      barFill.style.setProperty('--progress', `${progressPct}%`);
      barTarget.style.left = '100%';
      row.title = airline.sourceNote ?? '';
      row.dataset.unverified = airline.verificationStatus === 'estimate' ? 'true' : 'false';
    }
  );

  reconcileKeyedChildren(
    targets.pathways,
    viewModel.pathways,
    (pathway) => pathway.routeId,
    () => createIndustryProgressRow(),
    (row, pathway) => {
      const { name, barFill, barTarget, value, badge } = row._refs;
      const readinessPct = clampProgressPct(pathway.readiness);
      name.textContent = locale === 'en' ? pathway.nameEn : pathway.nameZh;
      value.textContent = `${pathway.gapUsdPerLiter >= 0 ? '+' : ''}${formatCurrency(pathway.gapUsdPerLiter, 2)}/L`;
      badge.textContent =
        locale === 'en'
          ? `${formatNumber(pathway.readiness, 0)}% ready`
          : `${formatNumber(pathway.readiness, 0)}% 就绪`;
      badge.style.borderColor = pathway.statusColor;
      badge.style.color = pathway.statusColor;
      barFill.style.background = pathway.statusColor;
      barFill.style.setProperty('--progress', `${readinessPct}%`);
      barTarget.style.left = '100%';
    }
  );

  reconcileKeyedChildren(
    targets.timeline,
    viewModel.timeline,
    (milestone) => milestone.year,
    () => createIndustryTimelineRow(),
    (row, milestone) => {
      const { year, headline, detail } = row._refs;
      year.textContent = `${milestone.year}`;
      headline.textContent = locale === 'en' ? milestone.headlineEn : milestone.headlineZh;
      detail.textContent = locale === 'en' ? milestone.detailEn : milestone.detailZh;
      row.dataset.past = milestone.isPast ? 'true' : 'false';
      row.dataset.current = milestone.isCurrent ? 'true' : 'false';
      row.style.setProperty('--timeline-color', `var(${milestone.color ?? '--accent'})`);
    }
  );
}
