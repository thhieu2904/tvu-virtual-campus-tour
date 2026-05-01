"""Fix slugs + insert remaining media for b7-thu-vien and c7-khoa-cntt."""
import asyncio
from app.db.database import async_session
from app.db.tables import Location, Media
from sqlalchemy.future import select
from sqlalchemy import update

R2_BASE = "https://pub-82602eacc26e46fb90fd956752353b89.r2.dev"

SLUG_FIXES = {
    "thu-vien": "b7-thu-vien",
    "khoa-cntt": "c7-khoa-cntt",
}

REMAINING_MEDIA = [
    {
        "slug": "b7-thu-vien",
        "items": [
            {"type": "video", "file": "gioi-thieu-thu-vien-b7.MP4", "caption": "Giới thiệu Thư viện B7", "keywords": ["thư viện", "giới thiệu", "b7", "tổng quan"], "is_intro": True, "sort_order": 0},
            {"type": "image", "file": "b7-nhin-tu-tren-cao-goc-ben-trai.webp", "caption": "Thư viện B7 nhìn từ trên cao", "keywords": ["thư viện", "trên cao", "toàn cảnh", "b7"], "is_intro": True, "sort_order": 0},
            {"type": "image", "file": "khuon-vien-ben-ngoai-b7.webp", "caption": "Khuôn viên bên ngoài Thư viện B7", "keywords": ["thư viện", "khuôn viên", "bên ngoài", "b7"], "is_intro": False, "sort_order": 1},
        ],
    },
    {
        "slug": "c7-khoa-cntt",
        "items": [
            {"type": "video", "file": "may-tinh-nganh-cntt-tri-tue-nhan-tao.mp4", "caption": "Phòng máy tính ngành CNTT - Trí tuệ nhân tạo", "keywords": ["máy tính", "cntt", "trí tuệ nhân tạo", "AI", "phòng lab", "c7"], "is_intro": True, "sort_order": 0},
            {"type": "image", "file": "truoc-sanh-khoa-cntt.jpg", "caption": "Trước sảnh Khoa Công nghệ thông tin C7", "keywords": ["khoa cntt", "sảnh", "c7", "mặt tiền"], "is_intro": True, "sort_order": 0},
        ],
    },
]


async def main():
    async with async_session() as session:
        # Step 1: Fix slugs
        print("=== Step 1: Fixing slugs ===")
        for old_slug, new_slug in SLUG_FIXES.items():
            stmt = update(Location).where(Location.slug == old_slug).values(slug=new_slug)
            result = await session.execute(stmt)
            if result.rowcount > 0:
                print(f"  ✅ '{old_slug}' → '{new_slug}'")
            else:
                print(f"  ⚠️  '{old_slug}' not found (maybe already fixed?)")

        await session.flush()

        # Step 2: Get updated locations
        result = await session.execute(select(Location.id, Location.slug, Location.name))
        locations = {row.slug: (row.id, row.name) for row in result.all()}
        print(f"\n  Current slugs: {list(locations.keys())}")

        # Step 3: Insert remaining media
        print("\n=== Step 2: Inserting remaining media ===")
        total = 0
        for group in REMAINING_MEDIA:
            slug = group["slug"]
            loc_data = locations.get(slug)
            if not loc_data:
                print(f"  ⚠️  '{slug}' not found!")
                continue

            loc_id, loc_name = loc_data
            print(f"\n  📍 {loc_name} ({slug})")
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
                total += 1
                icon = "🎬" if item["type"] == "video" else "🖼️"
                print(f"    {icon} {item['caption']}")

        await session.commit()
        print(f"\n✅ Done! Fixed {len(SLUG_FIXES)} slugs, inserted {total} media records.")

        # Step 4: Verify total media count
        result = await session.execute(select(Media))
        all_media = result.scalars().all()
        print(f"📊 Total media in DB: {len(all_media)}")


if __name__ == "__main__":
    asyncio.run(main())
