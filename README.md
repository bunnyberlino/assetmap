# Asset Map

An offline map of your people and physical assets, with named incident markers and impact rings.
It runs entirely in your browser from a plain folder: there is no server, no installation, and no data leaves your computer.

© 2026 Alexander Habath. Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE): free for any noncommercial use, including personal use, research, education, charities and government. Commercial use needs permission from the author. Third-party parts are listed in [`THIRD-PARTY.md`](THIRD-PARTY.md).

**Download:** get the latest `assetmap-vX.Y.Z.zip` from [Releases](https://github.com/bunnyberlino/assetmap/releases).

## Quick start

1. Unzip `assetmap-vX.Y.Z.zip` anywhere.
2. Open `index.html` in Chrome or Edge. Firefox and Safari work too, but cannot remember the folder.
3. Click **Open data folder** and choose the `data` folder, or your own folder of CSV files. You can also drag the folder onto the page.
4. In Chrome or Edge, the next time you open the page, click **Reopen "data"**.

## Your data — CSV files

Edit these files in Excel or any text editor. Comma, semicolon and tab separators all work, and so do UTF-8 and Windows encodings.
After editing, click **Data → Reload**.

| File | What it holds |
|---|---|
| `employees.csv` | People (employees, residents …). Any file whose name contains *employee, people, staff, resident* also works. |
| `assets.csv` | Physical assets (offices, partners, sites …). Any file whose name contains *asset, site, office, location* also works. |
| `types.csv` | One row per type: `category,type,label,marker,color` |
| `settings.csv` | `key,value`: the map title, company, rings, postal countries … |
| `incident-*.csv` | Saved incidents (written by the app) |

### employees.csv / assets.csv

| Column | Required | Notes |
|---|---|---|
| `id` | yes | Your reference (e.g. `3`, `56`) |
| `name` | – | |
| `email` | – | |
| `tag` | – | Free label, e.g. `VIP`, `offices`. You can filter on it. |
| `type` | yes | Must match a `type` in `types.csv`, e.g. `employee`, `office` |
| `city` | * | |
| `zip` | * | Postal code. Excel removing leading zeros is fine; they are restored. |
| `country` | yes | `CH`, `CHE`, `Switzerland`, `Schweiz`, `Suisse` … all work |
| `region` | – | State or canton; helps when two cities share a name (Portland OR / ME) |
| `lat`, `lon` | – | If filled in, these are used as-is and override the lookup |

\* Give a zip, a city, or both. Example rows:

```
id,name,email,tag,type,city,zip,country,region
3,John,john@example.com,VIP,employee,Milano,20121,Italy,Lombardia
```
```
id,name,email,tag,type,city,zip,country,region
56,Italy office,,offices,office,Milano,20121,Italy,
```

### How locations are found (offline)

Each record is placed by the first step that works. The popup and the Data tab show which step placed it.

1. The `lat`/`lon` columns.
2. The **postal code**, for countries with bundled postal data. For GB, CA, NL and IE these are area-level codes.
3. The **city** name within the country.
4. The **country centre**. This only shows roughly where the record is, so check these rows.
5. **Not placed**. The row is listed in the Data tab so you can fix it.

### types.csv

```
category,type,label,marker,color
human,employee,Employee,circle,#5D9CEC
physical,office,Office,square,#E11D2E
```

- `category` is `human` (clustered as bubbles) or `physical` (always an individual marker).
- `marker` is one of `circle, square, triangle, diamond, star, pin, hexagon, cross`.
- `color` is a hex code like `#E11D2E`, or a name: `red, blue, green, orange, yellow, purple, pink, grey, teal, cyan, brown`.

### settings.csv

| key | example | meaning |
|---|---|---|
| `map_title` | `Asset Map — Global` | Header title |
| `company_name` | `Example Corp` | Shown next to the title |
| `classification_label` | `Internal` | Badge in the header (leave empty to hide) |
| `default_rings_km` | `5;25;100` | Default impact rings for incident markers |
| `postal_countries` | `CH;DE;US` | Postal lookup only for these countries. Empty means all bundled; `none` turns postal lookup off |
| `default_basemap` | `offline` | `offline` or `terrain` |
| `theme` | `dark` | `dark` or `light` (the header button overrides it per browser) |

You can also change these under **Data → Settings** and click **Save settings.csv**.

## Incidents

The map handles one incident at a time, with as many named markers as you need.

- **Incident** holds the incident's name. **Marker name** is the prefix for new markers: `Fire` gives *Fire 1, Fire 2 …*. You can rename any marker in the list.
- **+ Place markers**: every click on the map adds a marker. Press Esc to stop. You can also paste coordinates (`47.12, 8.58`) and click **Add**. Drag pins to adjust.
- **Default rings (km)** apply to every marker. To override them for one marker, type its own radii in that marker's row.
- Every person and asset gets the nearest marker and the tightest ring it falls in. The impact area is the union of all rings.
- **Save** writes `incident-<name>-<date>.csv` into the data folder in Chrome/Edge, or downloads it in other browsers. **Load** reads one back. **Reset** clears all markers.
- The incident also autosaves in this browser.
- **Export affected** downloads everyone and everything inside the rings, with the nearest marker, distance and ring.

## Map layers

| Layer | Needs internet? |
|---|---|
| Offline → Outline | no |
| Offline → Terrain | no (bundled relief down to zoom 6; upscaled beyond that) |
| Online → Streets, Terrain/topo, Satellite | **yes**. Tiles come from Esri, which can see which map area you view (not your data). |

## Privacy

- Your CSVs are read locally. The page blocks all network connections except map tiles from Esri, and those load only if you pick an online layer.
- Chrome/Edge store a *handle* to your folder (not a copy of the data) so they can reopen it. The current incident is stored in the browser's local storage.

## For maintainers

| Command | Purpose |
|---|---|
| `open tests/tests.html` | Run the test suite in a browser |
| `node tools/fetch-geonames.mjs [CC …]` | Rebuild `geo/` (cities, countries, postal codes). Pass country codes to choose the postal countries. |
| `python3 tools/build-terrain.py` | Rebuild the offline terrain tiles |
| `node tools/make-sample.mjs` | Regenerate the synthetic sample data |
| `sh tools/package.sh` | Build `dist/assetmap-vX.Y.Z.zip` |

To release a version:

1. Bump `VERSION` and `AM.VERSION` in `app/main.js`.
2. Add a `CHANGELOG.md` entry.
3. Commit and tag `vX.Y.Z`.
4. Run `tools/package.sh`.
