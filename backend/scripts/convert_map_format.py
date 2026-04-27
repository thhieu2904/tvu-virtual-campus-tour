import json
from pathlib import Path

def convert():
    data_path = Path('d:/Personal/tvu-virtual-campus-tour/backend/data/map_grid.json')
    if not data_path.exists():
        print(f"File not found: {data_path}")
        return
        
    with open(data_path, 'r') as f:
        grid = json.load(f)

    if isinstance(grid, list):
        new_data = {
            'rows': len(grid),
            'cols': len(grid[0]) if grid else 0,
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
        with open(data_path, 'w') as f:
            json.dump(new_data, f)
        print('Successfully updated map_grid.json to new structure.')
    else:
        print('map_grid.json is already updated.')

if __name__ == '__main__':
    convert()
