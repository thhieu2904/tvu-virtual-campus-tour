import json
import os
import boto3

# Read env
from dotenv import load_dotenv
load_dotenv('.env')

cache_path = r'd:\Personal\tvu-virtual-campus-tour\backend\data\qa_cache.json'
out_dir = r'd:\Personal\tvu-virtual-campus-tour\assets\audio_cache_test'
os.makedirs(out_dir, exist_ok=True)

s3 = boto3.client(
    's3',
    endpoint_url=os.getenv('R2_ENDPOINT_URL'),
    aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
    region_name='auto'
)
bucket = os.getenv('R2_BUCKET_NAME')

with open(cache_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Bắt đầu tải {len(data)} file bằng boto3...")
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
        # Extract R2 key from URL (e.g. https://.../tvu-tour-v1/global/cache/abc.wav)
        r2_key = url.split(f"{bucket}/")[-1]
        
        try:
            s3.download_file(bucket, r2_key, os.path.join(out_dir, filename))
        except Exception as e:
            print(f"Failed to download {r2_key}: {e}")

print(f'Done downloading {len(data)} files to {out_dir}')
