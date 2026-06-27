import _ from 'lodash';

export type OmitFunctions<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

export function omitNilValues<TValueType>(dict: Record<string, TValueType | undefined | null>) {
  return _.omitBy(dict, _.isNil) as Record<string, TValueType>;
}
