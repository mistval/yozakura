import { Eta } from 'eta/core';

const eta = new Eta({
  autoEscape: false,
});

export function etaRenderSync(templateString: string, context: object): string {
  return eta.renderString(templateString, context);
}

export async function etaRender(templateString: string, context: object): Promise<string> {
  return eta.renderStringAsync(templateString, context);
}

export function etaCompile(source: string) {
  return eta.compile(source, { async: true });
}
