"""World map: Natural Earth 1:110m admin-0 countries (public domain), trimmed for the web.

Feature id is ADM0_A3, not ISO_A3 — Natural Earth sets ISO_A3 to -99 for France and Norway.
Antarctica is dropped (no trade data, and it dominates the projection). Run on demand; the
output is committed.
"""

from __future__ import annotations

import json

from shapely import make_valid, set_precision
from shapely.geometry import MultiPolygon, Polygon, mapping, shape

from .http import PoliteClient
from .paths import WEB_DATA

SOURCE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/"
    "geojson/ne_110m_admin_0_countries.geojson"
)
OUTPUT = WEB_DATA / "geo" / "world.json"
DROP = {"ATA"}
PRECISION = 0.01  # degrees, ~1 km: invisible at world scale


def polygonal(geometry):
    """Keep only polygon parts: make_valid / set_precision can emit GeometryCollections with
    stray lines or points, which ECharts rejects ("Invalid geoJson format")."""
    if isinstance(geometry, Polygon | MultiPolygon):
        return geometry
    parts = [
        part
        for item in getattr(geometry, "geoms", [])
        for part in (item.geoms if isinstance(item, MultiPolygon) else [item])
        if isinstance(part, Polygon) and not part.is_empty
    ]
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def build() -> None:
    raw = PoliteClient().get_json(SOURCE)
    features = []
    for item in raw["features"]:
        props = item["properties"]
        code = props["ADM0_A3"]
        if code in DROP:
            continue
        geometry = polygonal(set_precision(polygonal(make_valid(shape(item["geometry"]))), PRECISION))
        features.append(
            {
                "type": "Feature",
                "properties": {"id": code, "name": props["NAME_EN"]},
                "geometry": mapping(geometry),
            }
        )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))
    )
    print(f"Done: {len(features)} countries, {OUTPUT.stat().st_size / 1024:.0f} KB")
