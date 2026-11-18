# Demo Character Images

Drop PNG portraits for the 16 demo characters into this folder (`server/demo_source/images/characters/`).
`npm run pack:demo --prefix server` looks up each character by `<globalId>.png` (or `<scenarioCharacterId>.png` / `<slug>.png`) and falls back to `_default_placeholder.png` if a file is not present.

Expected filenames (`globalId`):

- `c10000000000000001.png` (`leo_vance`)
- `c10000000000000002.png` (`sera_kisaragi`)
- `c10000000000000003.png` (`dorian_locke`)
- `c10000000000000004.png` (`celestia_thorne`)
- `c10000000000000005.png` (`mina_bellweather`)
- `c10000000000000006.png` (`noelle_vespera`)
- `c10000000000000007.png` (`kaede_jin`)
- `c10000000000000008.png` (`vivienne_clairmont`)
- `c10000000000000009.png` (`lyra_solis`)
- `c1000000000000000a.png` (`rhea_nocturne`)
- `c1000000000000000b.png` (`julian_ashford`)
- `c1000000000000000c.png` (`finnian_reed`)
- `c1000000000000000d.png` (`soren_lindqvist`)
- `c1000000000000000e.png` (`evelyn_marlowe`)
- `c1000000000000000f.png` (`aurelia_sterling`)
- `c10000000000000010.png` (`alistair_thorne`)

Optional opening scene image:

- Place `server/demo_source/images/chat/opening_scene.png` to include an opening illustration at the top of the initial Waystone Quad chat.
