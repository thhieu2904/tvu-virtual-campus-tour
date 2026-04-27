# Avatar3D Legacy Bundle

Nguon: `src-tham-khao/aic-rag/frontend`

Muc tieu: gom model va code lien quan den Avatar3D de tai su dung trong du an hien tai.

## Cau truc

- `code/Avatar3D.tsx`: component Avatar3D goc tu code cu.
- `code/LoginPage_avatar3d_block.tsx`: doan JSX tich hop Avatar3D trong LoginPage (dang duoc comment trong code cu).
- `code/avatar3d-dependencies.json`: dependency can thiet cho Avatar3D.
- `models/character.glb`: model chinh dang duoc `Avatar3D.tsx` load.
- `models/character_optimized.glb`: ban optimized (cung kich thuoc voi character.glb o code cu).
- `models/character_new.glb`: ban model moi trong code cu.
- `models/character_backup_20260312.glb`: ban backup cu.

## Ghi chu

- Trong `Avatar3D.tsx`, duong dan model la `"/models/character.glb"`.
- Neu ban dung lai trong app moi, dat model vao public/models hoac sua lai duong dan trong component.
