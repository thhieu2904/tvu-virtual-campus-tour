"""
Storage Service — Cloudflare R2 file management (S3-compatible).
Layer 2 (Business Logic): Upload/download/delete files from R2.
"""


async def upload_file(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload a file to Cloudflare R2.
    Returns the public URL of the uploaded file.

    Key format examples:
    - backgrounds/{location_slug}/main-360.jpg
    - documents/{location_slug}/filename.pdf
    - media/{location_slug}/image.jpg
    """
    # TODO: Initialize boto3 S3 client with R2 credentials
    # client.put_object(Bucket=bucket, Key=key, Body=file_bytes, ContentType=content_type)
    return f"https://r2.example.com/{key}"


async def delete_file(key: str) -> bool:
    """Delete a file from Cloudflare R2."""
    # TODO: client.delete_object(Bucket=bucket, Key=key)
    return True


async def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for temporary access."""
    # TODO: client.generate_presigned_url(...)
    return f"https://r2.example.com/{key}?signed=true"
