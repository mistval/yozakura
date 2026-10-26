import { applyPatch, type DeepPartial } from '../../util/settings_merge';

export type SettingsBridgeParams<T> = {
  get: () => T;
  getDefault: () => T;
  use: <TSelected = T>(selector?: (value: T) => TSelected) => TSelected;
  set: (patch: DeepPartial<T>) => void;
};

const identitySelector = <T, TSelected = T>(value: T): TSelected => value as unknown as TSelected;

export class SettingsBridge<T> {
  private readonly params: SettingsBridgeParams<T>;

  public constructor(params: SettingsBridgeParams<T>) {
    this.params = params;
  }

  /** Imperatively reads the current value of this slice. */
  public get(): T {
    return this.params.get();
  }

  /** Imperatively reads the default value of this slice. */
  public getDefault(): T {
    return this.params.getDefault();
  }

  /**
   * React hook that subscribes to this slice (or a sub-selection of it).
   * Only triggers a re-render when the selected value changes (`Object.is`).
   */
  public use<TSelected = T>(selector: (value: T) => TSelected = identitySelector): TSelected {
    return this.params.use(selector);
  }

  /** Applies a partial update to this slice, bubbling up to the root store. */
  public set(patch: DeepPartial<T>): void {
    this.params.set(patch);
  }

  /** Resets this slice back to its default value. */
  public resetToDefault(): void {
    this.params.set(this.params.getDefault() as DeepPartial<T>);
  }

  /**
   * Derives a child SettingsBridge focused on a nested property `TChild` within `T`.
   */
  public subBridge<TChild>(lens: {
    select: (parent: T) => TChild | undefined;
    fallbackDefault: TChild;
    toPatch: (childPatch: DeepPartial<TChild>) => DeepPartial<T>;
  }): SettingsBridge<TChild> {
    return new SettingsBridge<TChild>({
      get: () => lens.select(this.get()) ?? lens.fallbackDefault,
      getDefault: () => lens.select(this.getDefault()) ?? lens.fallbackDefault,
      use: <TSelected = TChild>(
        selector: (value: TChild) => TSelected = identitySelector
      ): TSelected => {
        return this.use((parentValue) =>
          selector(lens.select(parentValue) ?? lens.fallbackDefault)
        );
      },
      set: (childPatch) => {
        this.set(lens.toPatch(childPatch));
      },
    });
  }

  /**
   * Creates a standalone in-memory bridge for unit tests (no Zustand store needed).
   */
  public static createInMemory<T extends Record<string, unknown>>(
    initialValue: T,
    defaultValue: T = initialValue
  ): SettingsBridge<T> {
    let current = initialValue;
    return new SettingsBridge<T>({
      get: () => current,
      getDefault: () => defaultValue,
      use: <TSelected = T>(selector: (value: T) => TSelected = identitySelector) =>
        selector(current),
      set: (patch) => {
        current = applyPatch(current, patch);
      },
    });
  }
}
