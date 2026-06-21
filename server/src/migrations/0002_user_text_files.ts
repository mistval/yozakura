import type { Migration } from '../types.js';
import defaultWorkflow from '../external/SillyTavern/Default_Comfy_Workflow.json';
import defaultLoRAWorkflow from '../external/SillyTavern/Default_LoRA_Workflow.json';

const WORKFLOW_GROUP_KEY = 'imageGeneration::comfyui::workflow';

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS user_text_files (
    id TEXT PRIMARY KEY,
    group_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z')),
    updated_at TEXT NOT NULL DEFAULT (CONCAT(datetime('now'), 'Z'))
  );

  CREATE INDEX IF NOT EXISTS idx_user_text_files_group_key ON user_text_files(group_key);
`;

const DEFAULT_WORKFLOWS = [
  { id: 'comfyui-default', fileName: 'Default', content: JSON.stringify(defaultWorkflow, null, 2) },
  {
    id: 'comfyui-default-lora',
    fileName:
      'Default with LoRA support (requires comfyui_lora_tag_loader custom ComfyUI node to be installed)',
    content: JSON.stringify(defaultLoRAWorkflow, null, 2),
  },
];

export const migration: Migration = {
  doMigration(db) {
    db.exec(CREATE_SQL);

    const insert = db.prepare(
      `INSERT INTO user_text_files (id, group_key, file_name, file_content, created_at, updated_at)
       VALUES (?, ?, ?, ?, CONCAT(datetime('now'), 'Z'), CONCAT(datetime('now'), 'Z'))`
    );

    for (const workflow of DEFAULT_WORKFLOWS) {
      insert.run(workflow.id, WORKFLOW_GROUP_KEY, workflow.fileName, workflow.content);
    }
  },
};
