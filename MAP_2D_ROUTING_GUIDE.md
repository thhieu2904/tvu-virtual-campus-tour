# Huong Dan Chi Tiet: Ve Cot Duong Di Tren Ban Do 2D + Tim Duong A*

Tai lieu nay giai thich theo dung bai toan cua ban:
- Nen la anh ban do that (khong phai grid block).
- Co lop SVG de ve route o tren anh.
- Duong di duoc tinh tu graph waypoint (cot duong), khong can he thong GIS phuc tap.

---

## 1) Tra loi cau hoi chinh cua ban

Dung, cach lam chuan la:
1. Ban do 2D la mot layer nen (img).
2. Tren no co mot layer SVG overlay cung kich thuoc.
3. Cac diem cot la cac waypoint co toa do chuan hoa (x, y trong [0..1]).
4. Route la mot duong polyline/path di qua danh sach waypoint do thuat toan tim ra.

Khong can ma tran nhu game block, ma can graph:
- Node = waypoint (nga tu, cho re, dau duong).
- Edge = doan duong noi giua 2 waypoint.

---

## 2) Vi sao dung toa do chuan hoa [0..1]

Neu ban luu pixel cung (vi du 523, 211), khi zoom hoac responsive se lech.

Neu luu chuan hoa:
- x = 0.5 nghia la nam giua chieu rong map.
- y = 0.25 nghia la nam 1/4 chieu cao map.

Khi render:
- px = x * mapWidth
- py = y * mapHeight

Nhu vay map co gian van dung vi tri.

---

## 3) Kien truc UI de ve route

Trong component map (vi du Minimap):

1. Parent container
- position: relative
- co kich thuoc xac dinh theo ti le anh

2. Layer 1: anh map
- img chi de hien thi nen

3. Layer 2: SVG overlay
- position absolute, inset 0
- viewBox "0 0 1 1" de ve truc tiep theo toa do chuan hoa

4. Layer 3: button node location
- cac nut B7, C7, C8...
- dat theo style left/top = x%, y%

Neu dung viewBox 0..1 thi ban co the ve duong truc tiep bang du lieu chuan hoa, khong can doi ra px.

---

## 4) Mo hinh du lieu nen dung

### 4.1 Waypoint

```ts
type Waypoint = {
	id: string;
	x: number; // 0..1
	y: number; // 0..1
};
```

### 4.2 Edge

```ts
type Edge = {
	from: string;   // waypoint id
	to: string;     // waypoint id
	weight?: number; // neu bo trong se tu tinh bang Euclid
	bidirectional?: boolean; // mac dinh true
};
```

### 4.3 Location anchor

```ts
type LocationAnchor = {
	slug: string;      // b7-thu-vien
	waypointId: string; // diem gan nhat de bat dau/ket thuc tim duong
};
```

---

## 5) Dat cot (waypoint) nhu the nao cho dung

Quy tac de de lam va de bao tri:
1. Dat o giao lo, cho re, cua vao khu vuc.
2. O duong cong dai, chen 1-2 diem trung gian de route men duong dep hon.
3. Khong dat trong khu khong the di (toa nha, ho, bai co neu khong cho di).
4. Moi waypoint nen noi 2-4 canh (thuong du cho campus).

Muc tieu:
- It diem nhung du mo ta moi huong di thuc te.
- Khong can day dac nhu navmesh 3D.

---

## 6) Cach tao toa do waypoint chinh xac tren anh

Lam 1 edit mode tam thoi:
1. Click len map de tao waypoint.
2. Hien marker va id.
3. Click 2 marker de tao edge.
4. Nut Export JSON de copy du lieu.

Cong thuc lay toa do click:

```ts
const rect = mapEl.getBoundingClientRect();
const x = (event.clientX - rect.left) / rect.width;
const y = (event.clientY - rect.top) / rect.height;
```

Nho clamp ve [0..1] truong hop click sat vien:

```ts
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
```

---

## 7) Chon thuat toan tim duong

### 7.1 Nen dung A*

Vi ban co trong so khoang cach va muon route ngan + nhanh.

Cong thuc:
- f(n) = g(n) + h(n)
- g(n): chi phi da di tu start den n
- h(n): uoc luong tu n den dich (heuristic)

Heuristic nen dung:
- Khoang cach Euclid giua n va goal.

```ts
const h = (a: Waypoint, b: Waypoint) => Math.hypot(a.x - b.x, a.y - b.y);
```

### 7.2 Khi nao dung BFS

Chi khi tat ca edge coi nhu bang nhau (moi doan duong cung 1 diem chi phi).

### 7.3 Khong nen dung DFS

DFS khong dam bao tim duong ngan nhat.

---

## 8) Pseudo code A* ngan gon

```ts
function aStar(startId, goalId, graph) {
	openSet = { startId }
	cameFrom = new Map()
	gScore[startId] = 0
	fScore[startId] = h(startId, goalId)

	while (openSet not empty) {
		current = node in openSet co fScore nho nhat
		if (current == goalId) return reconstructPath(cameFrom, current)

		remove current khoi openSet
		for (neighbor of neighbors(current)) {
			tentative = gScore[current] + weight(current, neighbor)
			if (tentative < gScore[neighbor]) {
				cameFrom[neighbor] = current
				gScore[neighbor] = tentative
				fScore[neighbor] = tentative + h(neighbor, goalId)
				add neighbor vao openSet
			}
		}
	}
	return [] // khong co duong
}
```

---

## 9) Ve duong route bang SVG

Neu route waypoint ids la [p1, p5, p9, p12], doi thanh points:

```ts
const points = routeIds
	.map((id) => {
		const p = waypointMap[id];
		return `${p.x},${p.y}`;
	})
	.join(" ");
```

Render:

```tsx
<svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0">
	<polyline
		points={points}
		fill="none"
		stroke="var(--primary)"
		strokeWidth={0.006}
		strokeLinecap="round"
		strokeLinejoin="round"
	/>
</svg>
```

Animation line chay:
1. Lay tong do dai path.
2. Dat strokeDasharray = length.
3. Animate strokeDashoffset tu length ve 0.

Neu muon nhanh hon, tam thoi dung framer-motion opacity + scale cho line cung du dep.

---

## 10) Luong du lieu trong du an cua ban

### 10.1 Frontend hien tai

Trong Minimap:
1. User click node dich (vi du C7).
2. Lay startSlug (node hien tai) va endSlug (node user chon).
3. Map slug -> waypointId.
4. Chay A* tren graph waypoint.
5. Render route SVG.
6. Khi user xac nhan, trigger transition scene.

### 10.2 Backend sau nay

Ban da co y tuong path_points trong schema, rat hop:
- Co the luu route precomputed cho cac cap pho bien.
- Hoac luu graph + tinh runtime.

Goi y practical:
1. Demo: luu precomputed path_points.
2. Ban sau: luu waypoint + edge, backend tra route tinh bang A*.

---

## 11) Cach lam theo tung ngay (de khong ngop)

### Ngay 1
1. Dung map image that lam nen.
2. Them SVG overlay viewBox 0 0 1 1.
3. Ve thu 1 route cung bang points hard-code.

### Ngay 2
1. Tao 15-30 waypoint o cac nga tu/chot re.
2. Tao edges.
3. Viet A* function.
4. Click 2 location -> route hien ra.

### Ngay 3
1. Them animation line + dot.
2. Them fallback: khong co route thi bao loi than thien.
3. Export graph ra JSON de version control.

---

## 12) Loi thuong gap va cach sua

1. Route lech khoi duong
- Nguyen nhan: luu pixel cung hoac sai ti le container.
- Cach sua: luu chuan hoa 0..1 va dung cung mot he quy chieu.

2. Route cat xuyen toa nha
- Nguyen nhan: edge noi tat khong theo duong that.
- Cach sua: chi noi edge khi co duong di hop le.

3. A* khong tim thay duong
- Nguyen nhan: graph bi dut (connected components roi rac).
- Cach sua: kiem tra lien thong giua cac khu vuc.

4. Di duong vong vo ly
- Nguyen nhan: weight sai hoac heuristic sai.
- Cach sua: weight = Euclid, heuristic = Euclid.

---

## 13) Mau JSON toi thieu de ban bat dau

```json
{
	"waypoints": [
		{ "id": "p_b7_gate", "x": 0.66, "y": 0.16 },
		{ "id": "p_center_top", "x": 0.50, "y": 0.28 },
		{ "id": "p_c7", "x": 0.30, "y": 0.55 }
	],
	"edges": [
		{ "from": "p_b7_gate", "to": "p_center_top", "bidirectional": true },
		{ "from": "p_center_top", "to": "p_c7", "bidirectional": true }
	],
	"anchors": [
		{ "slug": "b7-thu-vien", "waypointId": "p_b7_gate" },
		{ "slug": "c7-khoa-cntt", "waypointId": "p_c7" }
	]
}
```

---

## 14) Ket luan ngan gon

Ban dang di dung huong:
1. Dung lop SVG overlay o tren map anh that.
2. Dung graph waypoint, khong can grid block.
3. Dung A* voi weight khoang cach la vua de vua dung.

Neu ban muon, buoc tiep theo la tao mot Edit Mode trong Minimap de click dat waypoint va export JSON. Day la cach nhanh nhat de ban tu lam chu toan bo he thong route 2D.
