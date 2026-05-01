"""Quick script to list R2 bucket contents."""
import boto3
from botocore.config import Config

s3 = boto3.client('s3',
    endpoint_url='https://26f1095e37186210d6331fff5c2ea866.r2.cloudflarestorage.com',
    aws_access_key_id='a998c470c934ded688eb4bf063224a03',
    aws_secret_access_key='3e24ad9da33ed0438281032cde811aa9070033b530e85f50caf3187b9a97fe5f',
    config=Config(signature_version='s3v4'),
    region_name='auto',
)

# List all objects
result = s3.list_objects_v2(Bucket='tvu-tour-v1', MaxKeys=200)
print("=== R2 Bucket: tvu-tour-v1 ===\n")
for obj in result.get('Contents', []):
    size_kb = obj['Size'] / 1024
    if size_kb < 1024:
        size_str = f"{size_kb:.0f}KB"
    else:
        size_str = f"{size_kb/1024:.1f}MB"
    print(f"  {obj['Key']}  ({size_str})")

print(f"\nTotal: {result.get('KeyCount', 0)} files")
