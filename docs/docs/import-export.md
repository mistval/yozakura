---
title: Import / Export System
sidebar_position: 7
description: Back up, share, and selectively transfer scenarios, maps, characters, schedules, memories, and conversations using Yozakura export archives.
keywords:
  - yozakura import
  - yozakura export
  - backup save
  - share scenario
  - export archive
---

Yozakura's Import / Export system lets you package your scenarios, maps, and characters into `.yozakura_export.zip` archive files — useful for backing up your data, moving to another device, or sharing worlds and characters with others.

Because exports are organized as a tree, you don't have to take an all-or-nothing snapshot: you can export or import a complete scenario with all its memories and chat history, or just pick out a single map, character, or starting setup.

To open it, click **Import / Export** on the **Main Menu**.

:::info[Importing PNG Character Cards]
This tool is for `.yozakura_export.zip` archives (scenarios, maps, and character libraries). If you want to import individual SillyTavern/Yozakura PNG character cards or bulk-import a folder of cards, use the **Character Editor** or **Bulk Import** in **Manage Characters** — see [Import Characters](intro.md#import-characters).
:::

## Exporting Data

Open the **Export Data** tab in the **Import / Export Data** window:

1. **Name your archive:** Enter an **Export Archive Name** (a timestamped name is filled in for you, and `.yozakura_export.zip` is added automatically).
2. **Choose what to include:** Expand the tree under **Select Items to Export** and check the items you want:
   - **Scenarios:** Expand a scenario to pick everything or only specific parts — its **Map**, **Characters** (definitions and card images), **Character Groups**, **Group Schedules**, **Character Memories & Relationships**, and **Conversations** (logs and chat images).
   - **Maps:** Any maps in your global map library.
   - **Global Characters:** Any characters in your global character library.
3. Click **Export Selected Data**.

Once finished, Yozakura saves the `.yozakura_export.zip` file into its `data_exports` folder and displays the full file path with a **Copy Full Path** button. If an archive with the same filename already exists, it will ask before overwriting it.

> **Good to know:** Some scenario items depend on others — for example, **Group Schedules** requires **Character Groups**, and **Character Memories & Relationships** requires **Characters**. The tree automatically keeps these dependencies in sync when you check or uncheck them.

## Importing Data

Open the **Import Data** tab in the **Import / Export Data** window:

1. Click **Choose Yozakura Export Archive**, pick a `.yozakura_export.zip` (or `.zip`) archive, and click **Inspect Archive**.
2. Review the contents in **Select Items to Import**. Everything in the archive starts selected by default, so uncheck anything you don't want to bring in.
3. Click **Import Selected Data**.

### Resolving Conflicts

If the archive contains **Global Maps** or **Global Characters** that already exist in your local library, Yozakura opens a **Resolve Conflicts** dialog so you can choose what to do for each item (or apply one choice to all of them at once):

- **Skip:** Keep your local copy and ignore the version in the archive.
- **Overwrite:** Replace your local map or character with the version from the archive.
- **Make a Copy:** Keep your local version and import the archive's version alongside it as a separate copy.

### Automatic Safety Backup & Restoring

Before committing any import to your database, Yozakura automatically saves a backup of your current database to `backups/app_pre_import.sqlite` inside your Yozakura data directory (typically named `yozakura_data`).

> **Good to know:** Each new import overwrites `app_pre_import.sqlite` with the latest pre-import snapshot.

Restoring from a backup is a manual step:

1. **Close Yozakura completely** (if running from source, stop the server as well).
2. Open your Yozakura data folder (`yozakura_data` or `data`).
3. Delete or move aside the current `app.sqlite` file (along with `app.sqlite-wal` and `app.sqlite-shm` if present).
4. Copy (or cut) `backups/app_pre_import.sqlite` into the `yozakura_data` folder and rename it to `app.sqlite`.
5. Start Yozakura again.
