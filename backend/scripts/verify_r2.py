"""Verify R2 connection with new credentials."""
import os
from dotenv import load_dotenv
import boto3
from botocore.config import Config

load_dotenv()

s3 = boto3.client('s3',
    endpoint_url=os.environ["R2_ENDPOINT_URL"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    config=Config(signature_version='s3v4'),
    region_name='auto',
)

result = s3.list_objects_v2(Bucket=os.environ["R2_BUCKET_NAME"], MaxKeys=5)
print(f"✅ R2 connection OK — {result.get('KeyCount', 0)} objects found")
for obj in result.get('Contents', [])[:5]:
    print(f"  📄 {obj['Key']}")
