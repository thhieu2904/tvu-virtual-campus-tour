"""Insert all R2 media into database + verify public URL."""
import asyncio
import requests
from app.db.database import async_session
from app.db.tables import Location, Media
from sqlalchemy.future import select

R2_BASE = "https://pub-82602eacc26e46fb90fd956752353b89.r2.dev"

# Step 1: Verify public URL works
print("=== Testing R2 Public URL ===")
test_url = f"{R2_BASE}/cong-chinh/media/dh-tra-vinh-nhin-tu-tren-cao.jpg"
try:
    r = requests.head(test_url, timeout=10)
    print(f"  Status: {r.status_code} ({'OK' if r.status_code == 200 else 'FAIL'})")
except Exception as e:
    print(f"  ERROR: {e}")
    exit(1)

# Step 2: Define all media to insert
MEDIA_DATA = [
    # === b7-thu-vien ===
    {
        "slug": "b7-thu-vien",
        "items": [
            {
                "type": "video",
                "file": "gioi-thieu-thu-vien-b7.MP4",
                "caption": "Giới thiệu Thư viện B7",
                "keywords": ["thư viện", "giới thiệu", "b7", "tổng quan"],
                "is_intro": True,
                "sort_order": 0,
            },
            {
                "type": "image",
                "file": "b7-nhin-tu-tren-cao-goc-ben-trai.webp",
                "caption": "Thư viện B7 nhìn từ trên cao",
                "keywords": ["thư viện", "trên cao", "toàn cảnh", "b7"],
                "is_intro": True,
                "sort_order": 0,
            },
            {
                "type": "image",
                "file": "khuon-vien-ben-ngoai-b7.webp",
                "caption": "Khuôn viên bên ngoài Thư viện B7",
                "keywords": ["thư viện", "khuôn viên", "bên ngoài", "b7"],
                "is_intro": False,
                "sort_order": 1,
            },
        ],
    },
    # === c7-khoa-cntt ===
    {
        "slug": "c7-khoa-cntt",
        "items": [
            {
                "type": "video",
                "file": "may-tinh-nganh-cntt-tri-tue-nhan-tao.mp4",
                "caption": "Phòng máy tính ngành CNTT - Trí tuệ nhân tạo",
                "keywords": ["máy tính", "cntt", "trí tuệ nhân tạo", "AI", "phòng lab", "c7"],
                "is_intro": True,
                "sort_order": 0,
            },
            {
                "type": "image",
                "file": "truoc-sanh-khoa-cntt.jpg",
                "caption": "Trước sảnh Khoa Công nghệ thông tin C7",
                "keywords": ["khoa cntt", "sảnh", "c7", "mặt tiền"],
                "is_intro": True,
                "sort_order": 0,
            },
        ],
    },
    # === cong-chinh ===
    {
        "slug": "cong-chinh",
        "items": [
            {
                "type": "video",
                "file": "gioi-thieu-dh-tra-vinh.MP4",
                "caption": "Giới thiệu Đại học Trà Vinh",
                "keywords": ["đại học trà vinh", "giới thiệu", "tổng quan", "cổng chính"],
                "is_intro": True,
                "sort_order": 0,
            },
            {
                "type": "video",
                "file": "giao-luu-sinh-vien-nuoc-ngoai.MP4",
                "caption": "Giao lưu sinh viên quốc tế tại TVU",
                "keywords": ["sinh viên", "quốc tế", "giao lưu", "nước ngoài"],
                "is_intro": False,
                "sort_order": 1,
            },
            {
                "type": "image",
                "file": "dh-tra-vinh-nhin-tu-tren-cao.jpg",
                "caption": "Đại học Trà Vinh nhìn từ trên cao",
                "keywords": ["trên cao", "toàn cảnh", "đại học trà vinh", "cổng chính"],
                "is_intro": True,
                "sort_order": 0,
            },
        ],
    },
    # === d5-giang-duong ===
    {
        "slug": "d5-giang-duong",
        "items": [
            {
                "type": "video",
                "file": "su-kien-cong-nhan-dhtv-la-dai-hoc-13-o-D5.MP4",
                "caption": "Sự kiện công nhận ĐHTV là đại học thứ 13 tại Giảng đường D5",
                "keywords": ["sự kiện", "đại học", "công nhận", "d5", "giảng đường"],
                "is_intro": True,
                "sort_order": 0,
            },
            {
                "type": "video",
                "file": "ben-trong-giang-duong-d5.mp4",
                "caption": "Bên trong Giảng đường D5",
                "keywords": ["bên trong", "giảng đường", "d5", "nội thất"],
                "is_intro": False,
                "sort_order": 1,
            },
            {
                "type": "image",
                "file": "phia-truoc-giang-duong-D5.jpg",
                "caption": "Phía trước Giảng đường D5",
                "keywords": ["mặt tiền", "phía trước", "giảng đường", "d5"],
                "is_intro": True,
                "sort_order": 0,
            },
            {
                "type": "image",
                "file": "ben-trong-giang-duong-d5-truoc-san-khau.jpg",
                "caption": "Bên trong Giảng đường D5 - Trước sân khấu",
                "keywords": ["bên trong", "sân khấu", "giảng đường", "d5"],
                "is_intro": False,
                "sort_order": 1,
            },
            {
                "type": "image",
                "file": "nhin-duong-d5-nhin-tu-san-khau.jpg",
                "caption": "Giảng đường D5 nhìn từ sân khấu",
                "keywords": ["sân khấu", "giảng đường", "d5", "toàn cảnh"],
                "is_intro": False,
                "sort_order": 2,
            },
        ],
    },
]


async def main():
    print("\n=== Inserting media into database ===\n")

    async with async_session() as session:
        # Get all locations
        result = await session.execute(select(Location.id, Location.slug))
        locations = {row.slug: row.id for row in result.all()}
        print(f"Found {len(locations)} locations in DB: {list(locations.keys())}")

        total_inserted = 0

        for group in MEDIA_DATA:
            slug = group["slug"]
            loc_id = locations.get(slug)

            if not loc_id:
                print(f"\n  ⚠️  Location '{slug}' NOT FOUND in DB — skipping!")
                continue

            print(f"\n  📍 {slug} (id={loc_id})")

            for item in group["items"]:
                url = f"{R2_BASE}/{slug}/media/{item['file']}"
                media = Media(
                    location_id=loc_id,
                    type=item["type"],
                    url=url,
                    caption=item["caption"],
                    keywords=item["keywords"],
                    is_intro=item["is_intro"],
                    sort_order=item["sort_order"],
                )
                session.add(media)
                total_inserted += 1
                icon = "🎬" if item["type"] == "video" else "🖼️"
                print(f"    {icon} {item['caption']}")

        await session.commit()
        print(f"\n✅ Done! Inserted {total_inserted} media records.")


if __name__ == "__main__":
    asyncio.run(main())
