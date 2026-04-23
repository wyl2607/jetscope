export type PolicyMilestoneColor =
  | '--success'
  | '--accent'
  | '--warning'
  | '--danger'
  | '--info'
  | '--purple';

export type PolicyMilestone = {
  year: number;
  headlineZh: string;
  headlineEn: string;
  detailZh: string;
  detailEn: string;
  pctLabel: string;
  color: PolicyMilestoneColor;
};

export const POLICY_MILESTONES: ReadonlyArray<PolicyMilestone> = [
  {
    year: 2025,
    headlineZh: 'EU SAF 强制令生效',
    headlineEn: 'EU SAF mandate enters into force',
    detailZh: '欧盟机场 2% 掺混义务',
    detailEn: 'EU airports start with a 2% SAF blending obligation.',
    pctLabel: '2%',
    color: '--success'
  },
  {
    year: 2026,
    headlineZh: 'EU e-SAF 子目标启动',
    headlineEn: 'EU e-SAF sub-target starts',
    detailZh: '需含 0.7% 合成燃料',
    detailEn: 'A 0.7% synthetic fuel share becomes mandatory.',
    pctLabel: 'e0.7%',
    color: '--purple'
  },
  {
    year: 2027,
    headlineZh: '印度 SAF 试点强制',
    headlineEn: 'India launches SAF pilot mandate',
    detailZh: '国际航班 1% SAF',
    detailEn: 'International flights begin at a 1% SAF blend.',
    pctLabel: '1%',
    color: '--warning'
  },
  {
    year: 2030,
    headlineZh: '主要市场关键节点',
    headlineEn: 'Key 2030 milestone across major markets',
    detailZh: 'EU 6% · 美国 3B 加仑 · 日本 10%',
    detailEn: 'EU 6% · US 3B gallons · Japan 10% progression node.',
    pctLabel: '6%+',
    color: '--info'
  },
  {
    year: 2035,
    headlineZh: 'EU SAF 大幅提升',
    headlineEn: 'EU SAF requirement steps up sharply',
    detailZh: '欧盟 20% 掺混目标',
    detailEn: 'EU reaches a 20% SAF blending target.',
    pctLabel: '20%',
    color: '--warning'
  },
  {
    year: 2050,
    headlineZh: '净零航空目标',
    headlineEn: 'Net-zero aviation destination',
    detailZh: '欧盟 70% · 全行业净零',
    detailEn: 'EU 70% SAF trajectory and industry-wide net-zero endpoint.',
    pctLabel: '70%',
    color: '--danger'
  }
];
