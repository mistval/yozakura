import { loadUserTextFileContent } from '../../../backend_bridge/database.js';
import { customScriptGroupKey } from './settings_scripts_state.js';

export function loadCustomScriptSource(sectionId: string, scriptId: string): Promise<string | undefined> {
  return loadUserTextFileContent(customScriptGroupKey(sectionId), scriptId);
}
