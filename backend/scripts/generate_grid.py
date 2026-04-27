import json
from pathlib import Path
from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parent.parent

def generate_grid():
    img_path = BACKEND_ROOT.parent / "assets" / "bản đồ v3.png"
    img = Image.open(img_path).convert('RGB')
    
    # Resize to 100x100. Using NEAREST or BILINEAR.
    grid_size = 100
    img_small = img.resize((grid_size, grid_size), Image.Resampling.BILINEAR)
    
    grid = []
    for y in range(grid_size):
        row = []
        for x in range(grid_size):
            r, g, b = img_small.getpixel((x, y))
            
            # Detect grey roads. 
            # Roads in the image are dark grey: r,g,b around 60-90.
            # Also need to consider white road markings but they are small, might be filtered out by resize.
            
            # Is it greyish?
            is_grey = max(r, g, b) - min(r, g, b) < 30
            # Is it dark?
            is_dark = r < 110 and g < 110 and b < 110
            
            if is_grey and is_dark:
                row.append(0)  # Road (walkable)
            else:
                row.append(1)  # Obstacle (building, grass)
                
        grid.append(row)
        
    # Print an ASCII representation to console to verify
    for row in grid:
        line = "".join(["." if c == 0 else "█" for c in row])
        print(line)

    # Save to JSON
    out_path = BACKEND_ROOT / "data" / "map_grid.json"
    new_data = {
        'rows': grid_size,
        'cols': grid_size,
        'legend': {
            '0': 'road',
            '1': 'landscape',
            '2': 'building'
        },
        'locations': {
            'cong-chinh': {'x': 50, 'y': 85},
            'thu-vien': {'x': 70, 'y': 10},
            'khoa-cntt': {'x': 30, 'y': 50}
        },
        'grid': grid
    }
    with open(out_path, "w") as f:
        json.dump(new_data, f)
    
    print(f"\nGrid saved to {out_path}")

if __name__ == "__main__":
    generate_grid()
