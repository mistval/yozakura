import { describe, expect, it } from 'vitest';
import {
  getModalLayerParams,
  hasParamsAfterModalLayer,
  popModalParams,
  pushModalParams,
  updateModalLayerParams,
} from './queryParams.js';

describe('modal query param stacking helpers', () => {
  it('pushes duplicate modal layers without dropping earlier layers and pops only the topmost layer', () => {
    const step1 = pushModalParams('', 'map', { map_id: 'm1', mapview: 'zones' });
    expect(step1.toString()).toBe('map=true&map_id=m1&mapview=zones');

    const step2 = pushModalParams(step1, 'objecteditor', { oe_type: 'world_map', oe_id: 'm1' });
    expect(step2.toString()).toBe(
      'map=true&map_id=m1&mapview=zones&objecteditor=true&oe_type=world_map&oe_id=m1'
    );

    const step3 = pushModalParams(step2, 'map', { map_id: 'm1' });
    expect([...step3.keys()].lastIndexOf('map')).toBeGreaterThan(
      [...step3.keys()].lastIndexOf('objecteditor')
    );
    expect(getModalLayerParams(step3, 'map').get('mapview')).toBeNull();
    expect(getModalLayerParams(step3, 'map').get('map_id')).toBe('m1');

    const step3Updated = updateModalLayerParams(step3, 'map', { mapview: 'log' });
    expect(getModalLayerParams(step3Updated, 'map').get('mapview')).toBe('log');

    const step4 = popModalParams(step3Updated, 'map', ['map_id', 'mapview']);
    expect(step4.toString()).toBe(step2.toString());
    expect(getModalLayerParams(step4, 'map').get('mapview')).toBe('zones');

    const step5 = popModalParams(step4, 'objecteditor', ['oe_type', 'oe_id', 'oe_from', 'oe_to']);
    expect(step5.toString()).toBe(step1.toString());

    const step6 = popModalParams(step5, 'map', ['map_id', 'mapview']);
    expect(step6.toString()).toBe('');
  });

  it('isolates selected_ids to the active topmost characteroverview layer', () => {
    const base = pushModalParams('', 'characteroverview', { selected_ids: ['c1'] });
    const withOe = pushModalParams(base, 'objecteditor', { oe_type: 'scenario_character', oe_id: 'c1' });
    const withInspect = pushModalParams(withOe, 'characteroverview', { selected_ids: ['c2', 'c3'] });

    expect(getModalLayerParams(withInspect, 'characteroverview').getAll('selected_ids')).toEqual([
      'c2',
      'c3',
    ]);

    const afterCloseInspect = popModalParams(withInspect, 'characteroverview', [
      'selected_ids',
      'co_character',
      'co_add',
      'cotab',
      'scrolldown',
      'cogroup',
    ]);
    expect(getModalLayerParams(afterCloseInspect, 'characteroverview').getAll('selected_ids')).toEqual([
      'c1',
    ]);
  });

  it('detects when another modal layer or unowned param appears after a modal layer', () => {
    const ownedKeys = ['oe_type', 'oe_id', 'oe_from', 'oe_to'];
    expect(hasParamsAfterModalLayer(new URLSearchParams(''), 'objecteditor', ownedKeys)).toBe(false);

    const oeOnly = pushModalParams('', 'objecteditor', { oe_type: 'world_map', oe_id: 'm1' });
    expect(hasParamsAfterModalLayer(oeOnly, 'objecteditor', ownedKeys)).toBe(false);

    const withMapOnTop = pushModalParams(oeOnly, 'map', { map_id: 'm1', mapview: 'zones' });
    expect(hasParamsAfterModalLayer(withMapOnTop, 'objecteditor', ownedKeys)).toBe(true);
    expect(hasParamsAfterModalLayer(withMapOnTop, 'map', ['map_id', 'mapview'])).toBe(false);

    const afterPopMap = popModalParams(withMapOnTop, 'map', ['map_id', 'mapview']);
    expect(hasParamsAfterModalLayer(afterPopMap, 'objecteditor', ownedKeys)).toBe(false);
  });
});
