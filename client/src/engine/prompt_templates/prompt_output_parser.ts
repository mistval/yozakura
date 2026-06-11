import type z from 'zod';
import { useSettingsStore } from '../../state/settings_store';

export class PromptOutputParser<TContextType extends object, TParserResult> {
  constructor(
    public readonly defaultParserSource: string,
    public readonly parserOverrideSettingId: string,
    public readonly parserOutputSchema: z.ZodType<TParserResult>
  ) {}

  getParserSource() {
    return (
      useSettingsStore.getState().promptParserOverrides[this.parserOverrideSettingId]?.source ??
      this.defaultParserSource
    );
  }

  async parse(input: string, context: TContextType): Promise<TParserResult> {
    const parserSource = this.getParserSource();

    const parserFactory = new Function(`return (${parserSource});`);
    const parser = parserFactory();
    const parserResult = await parser(input, context);

    return this.parserOutputSchema.parse(parserResult);
  }
}
