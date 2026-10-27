import type z from 'zod';
import type { SettingsBridge } from '../settings/settings_bridge';

export class PromptOutputParser<TContextType extends object, TParserResult> {
  public readonly parserOutputSchema: z.ZodType<TParserResult>;
  public readonly settingsBridge: SettingsBridge<string>;

  public constructor(params: {
    parserOutputSchema: z.ZodType<TParserResult>;
    settingsBridge: SettingsBridge<string>;
  }) {
    this.parserOutputSchema = params.parserOutputSchema;
    this.settingsBridge = params.settingsBridge;
  }

  public get defaultParserSource(): string {
    return this.settingsBridge.getDefault();
  }

  public getParserSource(): string {
    return this.settingsBridge.get();
  }

  public async parse(input: string, context: TContextType): Promise<TParserResult> {
    const parserSource = this.getParserSource();

    const parserFactory = new Function(`return (${parserSource});`);
    const parser = parserFactory();
    const parserResult = await parser(input, context);

    return this.parserOutputSchema.parse(parserResult);
  }
}
