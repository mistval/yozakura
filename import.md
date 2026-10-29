# Import / Export Design & Implementation Plan

## 0. Prerequisite: Universal 18-Char Hex ID Invariant (`0007` Migration & Shared ID Rewriter)

Current generated IDs in Yozakura use [`newId()`](file:///c:/Users/Randall/code/yozakura/client/src/util/id.ts) (`uid(18)` $\to$ `[0-9a-f]{18}`), but three legacy ID sources exist in code and existing user databases:

- **Older `newId()` implementation:** Earlier versions of `newId()` used `crypto.randomUUID().replaceAll('-', '')`, so older user databases (and on-disk image folders/files under `<dataDir>/character_cards/` and `<dataDir>/scenario/`) contain user-created entities with 32-character lowercase hex IDs (`[0-9a-f]{32}`).
- [`default_maps.ts`](file:///c:/Users/Randall/code/yozakura/client/src/engine/map/default_maps.ts) uses 32-character hex UUIDs for the 4 default maps and their 47 locations.
- [`demo_characters.ts`](file:///c:/Users/Randall/code/yozakura/client/src/engine/demo_characters.ts) uses hyphenated `demo-<first>-<last>` IDs for the 20 demo global characters.

Before building import/export, Phase 0 introduces the shared server-side token ID rewriter (`applyIdMap` in `server/src/id_map.ts`), updates `DEFAULT_WORLD_MAPS` and `DEMO_CHARACTERS` to use static, hardcoded 18-character lowercase hex IDs (`[0-9a-f]{18}`)—keeping `imagePath: "/images/character/demo-*.png"` unchanged on demo characters so the 20 static PNG files in `client/src/public/images/character/` don't need renaming—and runs migration `0007` across all entities:

- **Build `idMap` safely:** Seeds `idMap` with the 71 static mappings (4 default maps, 47 default locations, 20 demo characters), then scans all entity tables (`character`, `scenario`, `scenario_character`, `character_relationship`, `conversation`, `conversation_participant`, `map`, `scenario_character_group`, `scenario_character_group_schedule`, `scenario_event_log`), `key_value` (`scenario_%_turn`), and `settings.llmConfigs` profile keys for any remaining `[0-9a-f]{32}` IDs—minting a fresh `[0-9a-f]{18}` ID for each one while intentionally never scanning non-ID `settings` values (protecting 32-char hex secrets like Cloudflare Account IDs) or `user_text_files` (which was introduced after `newId()` switched to 18-char hex).
- **Rewrite all SQLite tables & on-disk `<dataDir>` image paths:** Applies `applyIdMap` across all primary keys, foreign key columns, `scenario_%_turn` keys, and JSON `data` blobs (preserving `rowid`, `created_at`, `updated_at`, and static `/images/character/demo-*.png` paths, with `PRAGMA defer_foreign_keys = ON` + `PRAGMA foreign_key_check`), then renames matching files and scenario directories under `<dataDir>/character_cards/` and `<dataDir>/scenario/`.

Once `0007` is in place, **every entity ID in the system is guaranteed to match `[0-9a-f]{18}`**, and Phase 3 reuses the exact same `applyIdMap` helper for import commit remapping.

---

## 1. Archive Format & Security Model

### Zip Contents

An exported `.yozakura_export.zip` archive contains four items:

1. **`manifest.json`**: Metadata about the export:
   - `exportName`: User-chosen name of the export.
   - `dbUserVersion`: The SQLite `PRAGMA user_version` at the time of export.
2. **`db_rows.jsonl`**: Newline-delimited JSON (one object per line) so exports and imports can be streamed line-by-line without holding the entire dataset in memory:
   ```json
   {"table": "scenario", "row": {"id": "...", "data": "{...}", "created_at": "...", "updated_at": "..."}}
   {"table": "key_value", "row": {"key": "settings", "data": "{...}", "created_at": "...", "updated_at": "..."}}
   ```
3. **`images.jsonl`**: Newline-delimited JSON manifest describing each bundled image:
   ```json
   {"zipPath": "images/scenario/scen1/character_cards/char1.png", "kind": "scenario_character_card", "scenarioId": "scen1"}
   {"zipPath": "images/scenario/scen1/chat_images/img1.png", "kind": "chat_image", "scenarioId": "scen1"}
   {"zipPath": "images/character_cards/gchar1.png", "kind": "global_character_card"}
   ```
4. **`images/`**: Directory containing the raw image files referenced by `images.jsonl`.

### Security Model & Blast Radius

The goal is to limit the blast radius if a user pastes malicious JS into a prompt template or script that runs in the client:

- **Exports restricted to `<dataDir>/data_exports/` + `.yozakura_export.zip` suffix:** Exports are always saved inside `<dataDir>/data_exports/` (resolved via `resolveDiskPath` in [`pathGuard.ts`](file:///c:/Users/Randall/code/yozakura/server/src/routes/pathGuard.ts) with no ability to write outside that folder). The frontend appends `.yozakura_export.zip` to the filename, and the backend validates and rejects if the suffix is missing. After exporting, the UI shows the full path on disk so the user knows where to find the file.
- **Import only exposes data from valid Yozakura export zips:** The user can select any `.zip` file on their machine via `<input type="file">`. Before returning any file contents to the frontend, the backend verifies that the archive is a properly structured Yozakura export (`manifest.json`, `db_rows.jsonl` that passes migration). If not, the backend returns a generic error message rather than leaking file contents.
- **Server-controlled `ATTACH` only:** During import commit, the backend attaches only its own server-managed `import_staging.sqlite` path (never accepting arbitrary filesystem paths to `ATTACH` from the client).
- **Path traversal protection on internal image paths:** Every image source path (on export) and destination path (on import) inside `<dataDir>` is validated through `resolveDiskPath`.
- **Executable code warnings on import:** Prompt templates and their parsers (`templateGroupData`) can execute arbitrary JS and should be badged/warned in the import tree.

---

## 2. UI Components & Related Features

### 2.0 Entry Point Modal (`MainMenu.tsx`)

Export and Import live inside a modal launched from an **Import / Export** button at the bottom of the main action button column in [`MainMenu.tsx`](file:///c:/Users/Randall/code/yozakura/client/src/pages/MainMenu.tsx#L94-L105) (keeping import/export out of active mid-turn scenario sessions).

### 2.1 `TreeDataViewer` (Generic Lazy Tree Component)

A reusable React component that renders a hierarchical checkbox tree with tri-state checkboxes (`none`, `some`, `all`).

- **Node Interface:**
  ```ts
  type TreeNode = {
    id: string; // Entity/selection ID (may appear under multiple parents, e.g. a Scenario's Map and global Maps)
    label: string;
    subtitle?: string;
    badge?: string;
    getChildren: () => Promise<TreeNode[]>; // Returns [] when the node has no children
  };
  ```
- **Lazy Loading & Selection State:**
  - Takes an array of root `TreeNode`s. For v1, the potential roots are: **Scenarios**, **Maps**, **Global Characters**, and **Settings** (containing **Prompt Templates** only for v1, which expands through template groups down to **Template Chains** as the selectable leaf nodes—selecting a chain includes all of its templates, `parserSource`, and metadata).
  - **Omit empty branches on Import:** When building the tree for an import, only root nodes and child categories that actually contain data in `import_staging.sqlite` are included (e.g. if the archive has no maps, the **Maps** root and scenario **Map** child are omitted; if a scenario has no event logs in the archive, its **Event Logs** child is omitted).
  - **Select all by default on Import:** On Export, nodes start unselected; on Import, everything present in the archive starts **selected by default**.
  - When a row is expanded for the first time, `getChildren()` is called and cached in the component (an empty array `[]` indicates a leaf node).
  - **Expand state vs. Selection state (Aliased Nodes):** Expand/collapse state is tracked by tree path (e.g. `scenarios/scen1/map1` vs. `maps/map1`), while checked state is tracked by `node.id` (`map:map1`). This allows placing a **Map** child node directly under a Scenario that stays automatically synchronized with that same Map node under the top-level **Maps** list.
  - **Collapsed parent selection:** If a parent row is checked while collapsed (or auto-selected on import load), `TreeDataViewer` recursively calls `getChildren()` and selects all descendants while keeping the row visually collapsed.
  - Accepts a render prop (e.g. `renderControls: (selection: TreeSelectionState) => ReactNode`) so the wrapping component can render its action buttons ("Export" / "Next") with access to the selection state.

### 2.2 Scenario Subtree Granularity & Dependencies

Under each Scenario in the tree, children are exposed at the **category level** (all optional, and on import only shown if present in the archive):

- **Map (`<Map Name>`)** (aliased to the corresponding Map under the root **Maps** node)
- **Characters** (`scenario_character`)
- **Character Groups** (`scenario_character_group`)
- **Group Schedules** (`scenario_character_group_schedule` — requires Character Groups due to SQLite foreign key `group_id REFERENCES scenario_character_group(id)`)
- **Memories** (`character_relationship` rows **plus** memory fields on `scenario_character`: `globalMemories`, `rollingConversationSummaries`, and `nextConversationWithCharacterId` — requires Characters)
- **Conversation Logs** (`conversation` + `conversation_participant` + scenario `chat_images`)
- **Active Conversation State** (`key_value` row `scenario_<id>_turn`)
- **Event Logs** (`scenario_event_log`)

**Resilience to Missing Linked Data:**

- **Missing Characters at Scenario Load Time:** Resolved _before_ `startScenarioLoop()` begins:
  - If the user loads into a scenario that has no characters (e.g. exported or imported without its `Characters`), we automatically pick a random character from `useGlobalCharactersStore`, add it to the scenario, and set it as `userCharacterId`. If there are no global characters either, [`ScenarioView.tsx`](file:///c:/Users/Randall/code/yozakura/client/src/pages/ScenarioView.tsx) renders an error screen explaining what is wrong (similar to the existing `if (noMapsExist)` guard) and renders nothing else.
  - If the scenario _does_ have characters (`scenarioCharacters.length > 0`) but `scenario.userCharacterId` does not match any of them, `userCharacterId` falls back to one of the existing scenario characters before starting the turn loop.
- **Active Conversation State with Missing Characters:** We will update the turn/chat engine to be resilient when loading `scenario_<id>_turn`: if it references characters that aren't present in the scenario, it skips loading the saved turn state and starts a new turn cleanly. (The onus is on the exporter to include the relevant characters; no warning needed in v1.)

### 2.3 Character Editor Modal: "Overwrite Global Character" Option

Instead of prompting during import whether to install scenario characters globally, we will add an action in the Character Editor Modal (when editing a scenario character) to **save/overwrite the Global Character with the Scenario Character's data**:

- Creates the global character if its `globalCharacterId` doesn't exist locally yet, or overwrites it if it does.
- Resets scenario-specific runtime fields (`globalMemories: ''`, `rollingConversationSummaries: []`, `nextConversationWithCharacterId: ''`, `groupIds: []`, `locationId: ''`, `scenarioId: ''`) so the Global Character stays a clean template for new scenarios.
- Copies its portrait image to `character_cards/<globalCharacterId>.png` (if not using a built-in `/images/...` static asset).

### 2.4 `DatabaseClient` Class & Early `ATTACH` Namespacing

In [`database.ts`](file:///c:/Users/Randall/code/yozakura/client/src/backend_bridge/database.ts), we will wrap the database functions into a class that accepts an optional `targetSchema` constructor parameter (defaulting to `'main'`) and prefixes every table reference with `${this.targetSchema}.<table>`. We export two instances:

- `mainDatabase` (`targetSchema = 'main'`)
- `importStagingDatabase` (`targetSchema = 'import_staging'`)

On the backend, once `import_staging.sqlite` has finished migrating in Stage 1, the backend immediately attaches it to the main `app.sqlite` connection as `import_staging` (`ATTACH DATABASE <stagingPath> AS import_staging`).

- No custom HTTP headers or separate server DB wrappers are needed: `mainDatabase` and `importStagingDatabase` share the exact same `/api/db/*` endpoints and hierarchy-building queries, while explicit `mainDatabase` vs. `importStagingDatabase` naming prevents accidental writes to `main`.
- Whenever `import_staging` is detached (on commit completion, import cancellation, or before staging a new import), the backend clears `preparedStatementCache` first so no cached statement handles reference `import_staging`.

---

## 3. Export Flow (Frontend & Backend)

### 3.1 `DataExportComponent`

1. User enters an export name (frontend constructs `<exportName>.yozakura_export.zip`) and selects items in `TreeDataViewer`.
2. The frontend builds the export payload:
   - **SQL Table Export Queries:** Because the frontend owns the SQL schema knowledge in [`database.ts`](file:///c:/Users/Randall/code/yozakura/client/src/backend_bridge/database.ts), it sends an array of table export queries:
     ```ts
     type TableExportQuery = {
       table: string;
       statement: string;
       params: unknown[];
     };
     ```
     This keeps the backend generic while allowing the frontend to:
     - Express `JOIN` queries for tables without a `scenario_id` column (`conversation_participant` and `character_relationship`).
     - Order `scenario_event_log` by `ORDER BY rowid ASC` so chronological `rowid` order is preserved.
     - Strip unchecked fields from `scenario_character` on the fly using SQLite's built-in `json_patch(data, ?)` when **Characters** is checked:
       - If **Memories** is unchecked, patch `'{"globalMemories":"","rollingConversationSummaries":[],"nextConversationWithCharacterId":""}'`.
       - If **Character Groups** is unchecked, patch `'{"groupIds":[]}'` (combined into a single patch object when both are unchecked):
       ```sql
       SELECT
         id,
         scenario_id,
         json_patch(data, ?) AS data,
         created_at,
         updated_at
       FROM scenario_character
       WHERE scenario_id = ?
       ```
   - **Pre-built Rows:** An array of literal `{ table: string, row: Record<string, unknown> }` entries to write directly to `db_rows.jsonl`. Used for settings: constructing a `key_value` row (`key = 'settings'`) containing the **full concrete** `TemplateChainSettingsData` from `useSettingsStore.getState().templateGroupData` for each selected template chain (rather than only diff overrides against `DEFAULT_SETTINGS`, so unmodified selected chains are still exported and future changes to `DEFAULT_SETTINGS` cannot alter exported prompts).
   - **Overwrite Confirmation Flag:** `overwrite?: boolean` (defaults to `false`). If `<dataDir>/data_exports/<exportName>.yozakura_export.zip` already exists and `overwrite` is `false`, the backend returns `409` (`{ alreadyExists: true }`), prompting a confirmation dialog in the UI before re-submitting with `overwrite: true`.
   - **Image Copy Descriptors:** Explicit copy instructions telling the backend which files or directories under `<dataDir>` to bundle and how to tag them in `images.jsonl`:
     ```ts
     type ImageCopyDescriptor =
       | {
           mode: 'file';
           // Relative to <dataDir>, stripped of leading "/api/files/" and "?v=..." query params.
           // Only emitted for selected global characters whose imagePath starts with "/api/files/"
           // (built-in "/images/..." static assets are skipped).
           sourceRelPath: string; // e.g. "character_cards/gchar1.png"
           kind: 'global_character_card';
         }
       | {
           mode: 'directory';
           // Copies every file in this directory under <dataDir> (if the directory exists).
           sourceRelDir: string; // e.g. "scenario/scen1/character_cards" or "scenario/scen1/chat_images"
           kind: 'scenario_character_card' | 'chat_image';
           scenarioId: string;
         };
     ```

### 3.2 Data Export Backend

1. Validates that the filename ends with `.yozakura_export.zip` and resolves its destination inside `<dataDir>/data_exports/` via `resolveDiskPath`. If the destination file already exists and `overwrite` is not `true`, returns `409` (`{ alreadyExists: true }`) without writing anything.
2. Creates a single temporary working directory inside `<dataDir>`.
3. Writes `manifest.json` (`exportName` and current `PRAGMA user_version`).
4. Creates `db_rows.jsonl`:
   - For each `TableExportQuery`, runs `db.prepare(statement).iterate(...params)` and appends each row as `{"table": query.table, "row": row}`.
   - Appends any pre-built rows from the request in the same `{"table": ..., "row": ...}` format.
5. Processes `ImageCopyDescriptor[]` into `images/` and `images.jsonl`:
   - Validates every `sourceRelPath` / `sourceRelDir` through `resolveDiskPath` to ensure it stays inside `<dataDir>`.
   - For `mode: 'file'`, if the file exists on disk, copies it to `<workDir>/images/<sourceRelPath>` and writes `{"zipPath": "images/<sourceRelPath>", "kind": "global_character_card"}` to `images.jsonl`.
   - For `mode: 'directory'`, if the directory exists on disk, copies every file inside it to `<workDir>/images/<sourceRelDir>/<filename>` and writes `{"zipPath": "images/<sourceRelDir>/<filename>", "kind": descriptor.kind, "scenarioId": descriptor.scenarioId}` to `images.jsonl`.
6. Zips the working directory to `<dataDir>/data_exports/<filename>.yozakura_export.zip`, deletes the temporary working directory, and returns the saved file's full path on disk so the UI can tell the user where to find it.

---

## 4. Import Flow (Frontend-Driven Staging + `ATTACH` Atomic Commit)

### Stage 1: Unpack, Migrate & Early `ATTACH` (`POST /api/import/stage`)

1. Frontend streams the user-selected `File` directly as the raw binary request body (`fetch('/api/import/stage', { method: 'POST', body: file })`), and backend pipes `req` to disk via `pipeline(req, createWriteStream(...))` (same pattern as `PUT /api/files/*` in [`files.ts`](file:///c:/Users/Randall/code/yozakura/server/src/routes/files.ts#L16-L27)).
2. If a previous `import_staging` database is still attached, clears `preparedStatementCache`, runs `DETACH DATABASE import_staging`, and deletes the old staging folder.
3. Unpacks the `.zip` into `<dataDir>/temp_import/<sessionId>/` and verifies `manifest.json` exists with `dbUserVersion <= CURRENT_DB_VERSION`.
4. Opens an on-disk temporary SQLite database `<stagingDir>/import_staging.sqlite`.
5. Runs migrations `0` $\to$ `manifest.dbUserVersion` using [`migrator.ts`](file:///c:/Users/Randall/code/yozakura/server/src/migrator.ts).
6. **Truncates all tables generically:** Queries `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'` and runs `DELETE FROM "<name>"` on every user table (with `PRAGMA foreign_keys = OFF`), wiping any rows seeded by migrations without hardcoding table names in the backend.
7. Streams `db_rows.jsonl` into `import_staging.sqlite`.
8. Runs remaining migrations (`manifest.dbUserVersion` $\to$ `CURRENT_DB_VERSION`, including `0007` if importing an older DB) on `import_staging.sqlite`.
9. Closes that standalone migration handle and runs `ATTACH DATABASE <stagingPath> AS import_staging` on the main `app.sqlite` connection.
10. Returns the parsed `manifest.json` and `images.jsonl` entries to the frontend.
11. Frontend queries `importStagingDatabase` (`import_staging.*`) to display `TreeDataViewer` (omitting empty categories, selecting all present items by default, and badging any `templateGroupData` prompt template chains with executable-code warnings).

### Stage 2: Frontend Validation, Conflict Resolution & Staging DB Preparation

All domain logic stays in the frontend via `importStagingDatabase`:

1. **Conflict Detection via Authoritative Zustand Stores:** Frontend ensures `useMapStore` and `useGlobalCharactersStore` are loaded, checks which selected **Global Entities** (`map`, `character`) already exist by `id` in those stores, and prompts the user for collisions (**Skip**, **Overwrite**, or **Make a Copy**). _(Scenarios and scenario-scoped child rows never collide because their IDs are always rewritten; selected Prompt Template Chains overwrite any existing chain with the same ID without a separate conflict prompt.)_
2. **Paged Zod Validation:** Frontend pages through all selected tables via `importStagingDatabase` and Zod-parses every row to ensure 100% of data to be imported is valid before touching `main` (validating `key_value` `key = 'settings'` by merging onto `DEFAULT_SETTINGS` via `applyPatch` and parsing with `settingsSchema`).
3. **Prepare `import_staging` In-Place (via `importStagingDatabase`):**
   - **Build `import_staging._id_map` in SQLite:** Creates `CREATE TABLE import_staging._id_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL)` and populates `(id, lower(hex(randomblob(9))))` for all selected scenario-scoped rows (`scenario`, `scenario_character`, `character_relationship`, `conversation`, `conversation_participant`, `scenario_character_group`, `scenario_character_group_schedule`, `scenario_event_log`) plus any Global Entities where the user chose **Make a Copy**.
   - **Mutate Staged Data as Needed:**
     - For copied Maps, updates the map's name in `import_staging.map` via `json_set` to append ` (Imported From <exportName>)` (because `(orig_map_id, new_map_id)` is in `import_staging._id_map`, any Scenario referencing that map will automatically have `data.mapId` rewritten to `new_map_id` during commit).
     - For **Overwritten** Global Characters whose `imagePath` points to `/api/files/...`, updates `data.imagePath` in `import_staging.character` with a fresh `?v=` cache-busting query param so the browser reloads the overwritten portrait image.
     - For scenarios where **Memories** and/or **Character Groups** were unchecked on import, clears `globalMemories` / `rollingConversationSummaries` / `nextConversationWithCharacterId` (for unchecked **Memories**) and `groupIds` (for unchecked **Character Groups**) on `import_staging.scenario_character` via `json_patch`.

### Stage 3: Single-Transaction Commit (`POST /api/import/commit`)

The frontend sends a commit request containing:

- `sqlStatements`: Ordered `INSERT INTO main.<table> ... SELECT apply_id_map(...) FROM import_staging.<table> ...` statements in foreign-key dependency order:
  - Sets `updated_at` to import time on top-level entities (`scenario`, `map`, `character`), using `ON CONFLICT(id) DO UPDATE` for Global Entities where **Overwrite** was chosen.
  - Preserves original `created_at` and `updated_at` on historical log tables (`conversation`, `conversation_participant`, `scenario_event_log` ordered by `rowid ASC`) so chronological history order is maintained.
  - Excludes `key_value` (`key = 'settings'`) so the frontend can merge selected prompt template chains via `useSettingsStore`.
- `imageCopies`: Array of `{ zipPath: string, targetRelPath: string }` filtered from `images.jsonl` for non-skipped selected entities/categories (with `targetRelPath` still containing the pre-remap relative path, e.g. `"scenario/<oldScenId>/character_cards/<oldCharId>.png"`).

The backend executes `POST /api/import/commit` without any domain schema knowledge:

1. **Backup `app.sqlite`:** Runs `await db.backup(backupPath)` (SQLite's backup API backs up `"main"` specifically and ignores attached schemas).
2. **Register `apply_id_map`:**
   - Loads `SELECT old_id, new_id FROM import_staging._id_map` into a JS `Map<string, string>` and registers a custom SQLite scalar function `apply_id_map(text)` via `better-sqlite3`'s `db.function()`, reusing `applyIdMap(text, idMap)` from `server/src/id_map.ts` (built in Phase 0).
3. **Atomic Multi-Table Copy:** Executes all `sqlStatements` inside a **single `db.transaction()`**, streaming rows directly from `import_staging` into `main` in SQLite.
4. **Copy & Rename Images:** For each `{ zipPath, targetRelPath }` in `imageCopies`, computes the final destination inside `<dataDir>` via `applyIdMap(targetRelPath, idMap)` (which automatically rewrites scenario folder IDs and character card filename stems present in `idMap` while passing unmapped chat image IDs and non-ID filenames through unchanged), validates paths with `resolveDiskPath`, and copies the file (overwriting any existing file at the destination).
5. **Post-Commit & Clean Up:** Backend clears `preparedStatementCache`, runs `DETACH DATABASE import_staging`, and deletes `<stagingDir>`; frontend merges any selected prompt template chains into `useSettingsStore` (overwriting matching chain IDs) and refreshes its stores.

---

## 5. Development Phases

### Phase 0: Shared ID Rewriter & Universal Entity ID Normalization (`0007` Migration)

1. Implement shared server ID-rewriting utility `server/src/id_map.ts` (`applyIdMap` + 18-char hex generator) used by both migration `0007` and Phase 3 import commits.
2. Define static 18-char lowercase hex IDs for `DEFAULT_WORLD_MAPS` (and their locations) and `DEMO_CHARACTERS` (keeping `imagePath: "/images/character/demo-*.png"` unchanged).
3. Pass `{ dataDir }` context into `runMigrations` and add migration `0007` to rewrite **all** legacy IDs (the 71 static IDs plus any user-created 32-char UUID hex IDs from older `newId()`) across all SQLite tables and `<dataDir>` image files/folders so every entity ID in the app conforms to `[0-9a-f]{18}`.

### Phase 1: `TreeDataViewer` & Export Pipeline

1. Build generic `TreeDataViewer` with tri-state checkboxes, lazy `getChildren()`, aliased node selection (for Scenario $\leftrightarrow$ Map sync), and recursive `getChildren()` selection when checking a collapsed parent.
2. Add the Import / Export modal and launch button at the bottom of the button column in [`MainMenu.tsx`](file:///c:/Users/Randall/code/yozakura/client/src/pages/MainMenu.tsx).
3. Build `DataExportComponent` with the SQL query builder per selected table/category (using SQLite `json_patch` when Memories and/or Character Groups are unchecked), pre-built `settings` row with full concrete `TemplateChainSettingsData` for selected template chains, `.yozakura_export.zip` filename suffixing, overwrite confirmation dialog on `409`, and `ImageCopyDescriptor[]` builder.
4. Implement `POST /api/export` on the backend: validates `.yozakura_export.zip` suffix, checks existing file vs. `overwrite`, writes inside `<dataDir>/data_exports/`, streams SQL queries and pre-built rows into `db_rows.jsonl`, copies files/directories from `ImageCopyDescriptor[]` into `images/` + `images.jsonl`, zips, and returns the saved file path.

### Phase 2: `DatabaseClient` Refactor, Import Staging & Preview Tree

1. Refactor [`database.ts`](file:///c:/Users/Randall/code/yozakura/client/src/backend_bridge/database.ts) into a `DatabaseClient(targetSchema)` class exporting `mainDatabase` (`main`) and `importStagingDatabase` (`import_staging`).
2. Implement `POST /api/import/stage` (detaches any prior `import_staging`, unpacks zip, creates `import_staging.sqlite`, migrates `0 -> dbUserVersion`, generically truncates all user tables via `sqlite_schema`, inserts `db_rows.jsonl`, migrates `dbUserVersion -> latest`, `ATTACH`es `import_staging.sqlite` as `import_staging`, returns `manifest.json` + `images.jsonl`).
3. Wire `DataImportComponent` to reuse the tree builder via `importStagingDatabase` (hiding empty branches, selecting all present nodes by default, and badging `templateGroupData` nodes with executable-code warnings).

### Phase 3: Frontend Staging Prep, Atomic Commit & Resilience

1. Build frontend conflict resolution via `useMapStore` and `useGlobalCharactersStore` (**Skip** / **Overwrite** / **Make a Copy**), paged Zod validation via `importStagingDatabase`, and `import_staging._id_map` / data preparation in `import_staging`.
2. Implement `POST /api/import/commit`: `db.backup()`, `apply_id_map()` custom SQLite function, single-transaction SQL execution, `applyIdMap`-driven image copying, cache clear + `DETACH`, and staging cleanup.
3. Update scenario load / [`ScenarioView.tsx`](file:///c:/Users/Randall/code/yozakura/client/src/pages/ScenarioView.tsx) to auto-add a random character from `useGlobalCharactersStore` as `userCharacterId` when a scenario has no characters (or render an error screen in `ScenarioView.tsx` if no global characters exist), and update turn/chat engine loading (`scenario_<id>_turn`) to gracefully start a fresh turn if referenced characters are missing.

### Phase 4: Character Editor Global Save & Cleanup

1. Add the "Overwrite / Save to Global Character" option in the Character Editor Modal for scenario characters (clearing runtime scenario fields).
2. Add cleanup of stale staging directories and rotation of old pre-import DB backups.

### Phase 5: Top-Level Integration Test Suite (`test/`)

1. **Separate Top-Level Test Suite (`test/`):**
   - Keep `client/src/**/*.test.ts` focused on fast unit tests, and add a top-level `test/` folder (`test/vitest.config.ts`, `test/tsconfig.json`, `test/*.test.ts`) wired to `vitest` and `@types/node` in the root [`package.json`](file:///c:/Users/Randall/code/yozakura/package.json) (`npm run test:integration` and `npm run typecheck:test`, added to `check:all` and [`.github/workflows/ci.yml`](file:///c:/Users/Randall/code/yozakura/.github/workflows/ci.yml)).
   - Because `test/` sits above both `server/` and `client/`, tests can directly import `startServer` from [`server/src/app.ts`](file:///c:/Users/Randall/code/yozakura/server/src/app.ts) alongside client engine modules (`mainDatabase`, `importStagingDatabase`, stores, and the headless export/import orchestrators).
   - Build a test harness that launches real Express + `better-sqlite3` instances against temporary `dataDir` folders (`fs.mkdtemp`, updating `startServer().close()` to close the SQLite handle so temp dirs clean up cleanly on Windows) and shims `globalThis.fetch` in Node so client relative `/api/...` calls hit the active ephemeral server port over real HTTP.
2. **Integration Test Coverage:**
   - **Full round-trip pack, unpack & ID remapping:** Populate a source server with scenarios, maps, characters, groups, schedules, relationships/memories, conversations + participants, active turn state (`scenario_<id>_turn`), event logs, prompt template chains, and image files on disk; export to `.yozakura_export.zip` and import into a target server; assert every scenario-scoped ID is remapped to a fresh `[0-9a-f]{18}` ID while all relational/JSON cross-references, renamed character card files, unmapped chat image filenames, and chronological log ordering remain intact.
   - **Partial subtree selection & `json_patch` stripping:** Verify unchecking **Memories** and/or **Character Groups** (on export or on import) omits excluded tables and strips memory fields / `groupIds` from `scenario_character`.
   - **Global conflict resolution (`Skip`, `Overwrite`, `Make a Copy`):** Verify `Skip` leaves existing rows/images untouched, `Overwrite` updates rows + overwrites destination image files + bumps `?v=` on `imagePath`, and `Make a Copy` mints new IDs in `import_staging._id_map`, suffixes copied Map names with ` (Imported From <exportName>)`, and rewrites imported Scenarios' `data.mapId` to the copied Map ID.
   - **Cross-version archive migration (including pre-`0007` IDs):** Stage and commit an archive exported at an older `dbUserVersion` (with legacy 32-char entity UUIDs and `demo-*` character IDs) and verify Stage 1's two-step migration + generic table truncation upgrades and normalizes all IDs before commit.
   - **Security & error guardrails:** Verify `.yozakura_export.zip` suffix enforcement, `409` overwrite confirmation behavior, path-traversal rejection, generic error handling on invalid `.zip` files, and clean `DETACH DATABASE import_staging` across back-to-back imports.
