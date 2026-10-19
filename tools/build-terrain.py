#!/usr/bin/env python3
"""Build the offline "Terrain" basemap tile pack for Asset Map.

Reprojects the Natural Earth 10m raster "Cross Blended Hypso with Shaded
Relief, Water, Drainages and Ocean Bottom" (HYP_HR_SR_OB_DR, equirectangular
EPSG:4326, public domain) to Web Mercator (EPSG:3857) XYZ tiles:

    tiles/terrain/{z}/{x}/{y}.jpg     256 px, zoom 0-6, Leaflet default scheme

Source:
    https://naciscdn.org/naturalearth/10m/raster/HYP_HR_SR_OB_DR.zip
    (unzip it somewhere outside the repo and pass the .tif with --src)

Usage:
    python3 -m venv venv && venv/bin/pip install pillow numpy
    venv/bin/python -I tools/build-terrain.py --src /path/to/HYP_HR_SR_OB_DR.tif
    venv/bin/python -I tools/build-terrain.py --src ... --maxzoom 5 --quality 70

Options:
    --src PATH      source raster (required); any Pillow-readable equirect image
                    covering -180..180 lon, 90..-90 lat
    --out DIR       output directory (default: <repo>/tiles/terrain)
    --minzoom N     first zoom level (default 0)
    --maxzoom N     last zoom level (default 6)
    --quality Q     JPEG quality (default 80)

Method: for each zoom z the source is Lanczos-resized to W = 256*2^z by W/2,
so columns map 1:1 onto Mercator columns. Each output pixel row py is mapped
back to latitude with lat = atan(sinh(pi*(1 - 2*(py+0.5)/W))) and sampled from
the resized source with linear interpolation between neighbouring rows. The
Mercator scale factor is >= 1, so rows are only ever upsampled (no aliasing).
Latitudes beyond +/-85.0511 deg fall outside the Mercator square and are clipped.
Existing zoom directories in --out are removed before they are rebuilt.
"""
import argparse
import math
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TILE = 256


def build_zoom(src, z, out, quality):
    W = TILE * 2 ** z
    H = W // 2
    level = np.asarray(src.resize((W, H), Image.LANCZOS), dtype=np.float32)

    zdir = out / str(z)
    if zdir.exists():
        shutil.rmtree(zdir)
    n = 2 ** z
    for x in range(n):
        (zdir / str(x)).mkdir(parents=True)

    for ty in range(n):
        py = np.arange(ty * TILE, (ty + 1) * TILE, dtype=np.float64) + 0.5
        lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * py / W))))
        row = (90.0 - lat) / 180.0 * H - 0.5
        r0 = np.floor(row).astype(np.int64)
        f = (row - r0).astype(np.float32)[:, None, None]
        r1 = np.clip(r0 + 1, 0, H - 1)
        r0 = np.clip(r0, 0, H - 1)
        strip = level[r0] * (1.0 - f) + level[r1] * f
        strip = np.clip(strip + 0.5, 0, 255).astype(np.uint8)
        for tx in range(n):
            tile = Image.fromarray(strip[:, tx * TILE:(tx + 1) * TILE])
            tile.save(zdir / str(tx) / f"{ty}.jpg", "JPEG",
                      quality=quality, progressive=True, optimize=True)
    del level


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=here.parent / "tiles" / "terrain")
    ap.add_argument("--minzoom", type=int, default=0)
    ap.add_argument("--maxzoom", type=int, default=6)
    ap.add_argument("--quality", type=int, default=80)
    a = ap.parse_args()

    t0 = time.time()
    src = Image.open(a.src)
    print(f"source {a.src.name}: {src.size[0]}x{src.size[1]} {src.mode}")
    if src.mode != "RGB":
        src = src.convert("RGB")
    src.load()
    a.out.mkdir(parents=True, exist_ok=True)

    for z in range(a.minzoom, a.maxzoom + 1):
        build_zoom(src, z, a.out, a.quality)
        print(f"z{z}: {4 ** z} tiles  ({time.time() - t0:.0f}s)")

    files = list(a.out.glob("*/*/*.jpg"))
    size = sum(p.stat().st_size for p in files)
    print(f"done: {len(files)} tiles, {size / 1e6:.1f} MB in {a.out}")


if __name__ == "__main__":
    main()
