import { describe, expect, it } from 'vitest';

import { consumptionQuery } from '../road-fuels-read-model';

describe('consumptionQuery', () => {
  it('maps page params to API params', () => {
    expect(consumptionQuery({ diesel_l: '5.5', petrol_l: '8', ev_kwh: '20' })).toBe(
      '?diesel_l_per_100km=5.5&petrol_l_per_100km=8&ev_kwh_per_100km=20'
    );
  });

  it('drops missing, non-numeric and out-of-bounds values so the API default applies', () => {
    expect(consumptionQuery(undefined)).toBe('');
    expect(consumptionQuery({ diesel_l: 'abc', petrol_l: '0', ev_kwh: '61' })).toBe('');
    expect(consumptionQuery({ ev_kwh: ['17', '99'], diesel_l: '' })).toBe('?ev_kwh_per_100km=17');
  });
});
