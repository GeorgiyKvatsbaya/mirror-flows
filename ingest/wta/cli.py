"""`wta` command line: ingest sources, build boundaries, export web data."""

from __future__ import annotations

import argparse


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="wta", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    ingest = sub.add_parser("ingest", help="Download a source into data/raw or data/reference")
    ingest.add_argument("source", choices=["baci", "imf", "worldbank", "hs"])
    ingest.add_argument("--force", action="store_true", help="BACI: re-ingest the same version")
    ingest.add_argument("--keep-zip", action="store_true", help="BACI: keep the downloaded zip")

    sub.add_parser("boundaries", help="Build web/public/data/geo/world.json")
    sub.add_parser("lineage", help="Write web/public/data/model.json from the dbt manifest")
    sub.add_parser("baci-version", help="Print the latest BACI version and the ingested one")
    export = sub.add_parser("export", help="Write web data from the dbt marts")
    export.add_argument("--monthly-only", action="store_true", help="Only the IMF monthly series")

    args = parser.parse_args(argv)
    if args.command == "ingest":
        if args.source == "baci":
            from . import baci

            baci.ingest(force=args.force, keep_zip=args.keep_zip)
        elif args.source == "imf":
            from . import imf

            imf.ingest()
        elif args.source == "hs":
            from . import hs

            hs.ingest()
        else:
            from . import worldbank

            worldbank.ingest()
    elif args.command == "boundaries":
        from . import boundaries

        boundaries.build()
    elif args.command == "baci-version":
        import json

        from . import baci
        from .http import PoliteClient
        from .paths import REFERENCE

        manifest = REFERENCE / "baci_manifest.json"
        current = json.loads(manifest.read_text())["version"] if manifest.exists() else None
        print(json.dumps({"latest": baci.latest_version(PoliteClient()), "ingested": current}))
    elif args.command == "lineage":
        from . import lineage

        lineage.build()
    elif args.command == "export":
        from . import export

        export.run(monthly_only=args.monthly_only)


if __name__ == "__main__":
    main()
