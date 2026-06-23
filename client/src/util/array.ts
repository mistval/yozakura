import _ from 'lodash';
import { assertNonNullish } from '../errors/application_error';

type WeightedElement<TValue> = {
  value: TValue;
  weight: number;
};

export function getRequiredRandomChoice<T>(arr: T[]): T {
  const sample = _.sample(arr);
  assertNonNullish(sample, 'Array was empty');
  return sample;
}

function weightedRandomChoice<TValue>(weightMap: WeightedElement<TValue>[]): TValue {
  const total = weightMap.reduce((sum, el) => sum + el.weight, 0);
  if (total === 0) {
    throw new Error('Total weight is zero, cannot make a weighted random choice.');
  }

  let roll = Math.random() * total;

  for (const { value, weight } of weightMap) {
    roll -= weight;
    if (roll <= 0) {
      return value;
    }
  }

  return weightMap[weightMap.length - 1]!.value;
}

export function weightedSampleWithoutReplacement<TValue>(items: WeightedElement<TValue>[], count: number) {
  const pool = [...items];
  const picks: TValue[] = [];
  const targetCount = Math.max(0, Math.min(count, pool.length));
  for (let i = 0; i < targetCount; ++i) {
    const selected = weightedRandomChoice(pool);
    picks.push(selected);
    const index = pool.findIndex((entry) => entry.value === selected);
    pool.splice(index, 1);
  }
  return picks;
}

export function trimNewestByCreatedAt<T extends { createdAt: string }>(items: T[], max = 10): T[] {
  return [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, max);
}

export function concatUniqueById<TElementType extends { id: string }>(
  arr: TElementType[],
  newElement: TElementType
) {
  let found = false;
  return arr
    .map((el) => {
      if (el.id === newElement.id) {
        found = true;
        return newElement;
      }

      return el;
    })
    .concat(found ? [] : newElement);
}
