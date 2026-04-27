"""
Sync map_grid.json locations with DB slugs.
Maps building codes (b7, c7, d5...) to DB slugs (khoa-cntt, thu-vien...).
"""
import json
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

# Mapping: DB slug → building code in the grid JSON
SLUG_TO_BUILDING = {
    "cong-chinh": "cong-chinh",  # Already exists
    "khoa-cntt": "c7",           # C7 = Khoa CNTT
    "thu-vien": "b7",            # B7 = Thư viện TVU
}

def sync():
    grid_path = BACKEND_ROOT / "data" / "map_grid.json"
    with open(grid_path, "r") as f:
        data = json.load(f)

    locations = data.get("locations", {})
    
    updated = False
    for db_slug, building_code in SLUG_TO_BUILDING.items():
        if db_slug not in locations and building_code in locations:
            locations[db_slug] = locations[building_code].copy()
            print(f"  Added: '{db_slug}' → {locations[db_slug]} (from '{building_code}')")
            updated = True
        elif db_slug in locations:
            print(f"  OK: '{db_slug}' already exists → {locations[db_slug]}")

    if updated:
        data["locations"] = locations
        with open(grid_path, "w") as f:
            json.dump(data, f)
        print("\n✅ map_grid.json updated!")
    else:
        print("\n✅ No changes needed.")

if __name__ == "__main__":
    sync()
