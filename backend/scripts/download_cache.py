import json
import requests
import os

cache_path = r'd:\Personal\tvu-virtual-campus-tour\backend\data\qa_cache.json'
out_dir = r'd:\Personal\tvu-virtual-campus-tour\assets\audio_cache_test'
os.makedirs(out_dir, exist_ok=True)

with open(cache_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Bắt đầu tải {len(data)} file...")
for i, (key, value) in enumerate(data.items(), 1):
    url = value.get('audio_url')
    q = value.get('question', '').replace('?', '').replace(':', '').strip()
    loc = value.get('location', 'unknown')
    
    # Safe filename
    invalid_chars = '<>:"/\\|?*'
    for c in invalid_chars:
        q = q.replace(c, '')
        loc = loc.replace(c, '')
        
    filename = f'{loc}_{q}.wav'.replace(' ', '_')
    if url:
        print(f'Downloading {filename}...')
        response = requests.get(url, stream=True)
        if response.status_code == 200:
            with open(os.path.join(out_dir, filename), 'wb') as out_f:
                for chunk in response.iter_content(chunk_size=8192):
                    out_f.write(chunk)
        else:
            print(f"Failed to download {url}. Status: {response.status_code}")

print(f'Done downloading {len(data)} files to {out_dir}')
