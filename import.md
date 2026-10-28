# Import/Export Components/Stages

## Tree Data Viewer

This will be a React component that shows the tree view of data. It will be generic and display arbitrary tree-like data (but for this feature, the roots will be at least: scenarios, maps, global characters, settings).

It takes in an array of root objects that implement a certain interface including at least:
1. The user-facing name of the object
2. An async function to lazily get its children

When an item is opened, an async callback will be invoked to get its children (if any). So the tree structure gets built on the fly. The children would be stored in a map in the tree component, and the selected state would be represented as a set.

It would also take in a function that returns controls, and it would pass the enabled set into that function, so the parent can render an "export" button that would have the enabled set available in its onclick handler (writing that broke my brain but hopefully you understand me).

## Data Export Component

This would wrap around Tree Data Viewer and provide the data wiring and controls. The user can choose a name for their export. When they click export, the commands get sent to the backend to do the data export.

I think the database commands would basically be an array of objects, where each object has a table name, a selector column (usually id or scenario_id), and an array of IDs. The database gets all rows from the table where the value of the selector column is in the array of IDs. It renders the rows into a string with one JSON object per line (for future if people ever have enormous exports). It also renders a manifest file string that has the database version and maybe some other info.

Oh and I guess we would have to do something special for settings, since I want to allow users to granually choose which settings to export (for example just templates) but those all live in one database row. Interested in your thoughts. We could consider deferring for now. Maybe we have the frontend generate this row and send it in the export request, and also be responsible for doing the import for that row. The exported row could have a special flag like "send this one to the frontend to handle after you import everything else".

It outputs those to a temp working folder in the yozakura data directory. Then it copies over all the images it was told to (guarding against path traversal outside of the data directory). There's a one-JSON-object-per-line file for images too, describing what each image is (either chat image with scenario id, scenario character card with scenario id, or global character card).

## Data Export Backend

I more or less described it above already. It's pretty dumb and just copies what the frontend tells it to, then zips it and puts it into a `data_export` folder in the yozakura data folder. I think I want to avoid allowing the user to choose export path, since that would require path traversal, which could then potentially be abused by malicious code that the user copies into templates or whatnot. They'll just have to open their yozakura data folder and copy it from there.

## Data Import Backend

I won't elaborate here because I think it more or less falls out of what we've already talked about, plus the above. I'll let you elaborate on it for me.

## Data Import Component

I think it's safe to use a file selector here and allow the user to select any zip file on their machine. Cuz the contents won't go through the frontend unless they're a valid yozakura export. In case it's not clear why I have these considerations, it's because I'm worried about un-savvy users copying malicious JS code into their Yozakura templates, which can then take over the client. I want to limit the blast radius from that happening.

Also uses the Tree Data Viewer. Once the user selects the file and it gets staged and migrated in the backend temporary database (let's do temp file system database, not in memory, just to reduce memory usage) the backend will expose an API for querying the temporary database (like it already does with the permanent database) and this component can use that and its knowledge of the data hierarchy to populate Tree Data Viewer. Hopefully this can share a lot of logic with "Data Export Component". They'd be querying the same stuff, just from different databases.

When the user clicks next, we have the backend dry-run the row inserts and generate a report of which entities are going to overwrite something, and return that to frontend. Frontend decides how to resolve, probably with the user's input. Like we discussed, only global entities can cause overwrite, since scenario entities will all have their IDs re-written on every import.

