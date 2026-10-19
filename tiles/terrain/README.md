# Terrain tiles

Offline shaded-relief basemap for Asset Map's "Terrain" layer.

- Layout: `{z}/{x}/{y}.jpg`, XYZ (Leaflet default, y = 0 at the north), 256 px tiles
- Projection: Web Mercator (EPSG:3857), clipped at ±85.0511°
- Zoom 0–6: 5461 tiles, about 26 MB, JPEG quality 80, progressive
- Leaflet: `L.tileLayer('tiles/terrain/{z}/{x}/{y}.jpg', {maxNativeZoom: 6})`

## Source

Natural Earth 10m raster **Cross Blended Hypso with Shaded Relief, Water,
Drainages, and Ocean Bottom** (`HYP_HR_SR_OB_DR`, 21600×10800, version 2.0.0),
<https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/>
(direct download: <https://naciscdn.org/naturalearth/10m/raster/HYP_HR_SR_OB_DR.zip>).

Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.
Natural Earth data is in the public domain.

## Rebuild

```sh
python3 -m venv venv && venv/bin/pip install pillow numpy
venv/bin/python -I tools/build-terrain.py --src /path/to/HYP_HR_SR_OB_DR.tif
```

See the docstring in `tools/build-terrain.py` for options (`--maxzoom`, `--quality`, `--out`).
