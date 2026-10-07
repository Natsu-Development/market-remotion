---
description: Đưa reel đã render (Channel, DailyReview, …) lên Facebook Page "Chứng Vịt" dưới dạng BẢN NHÁP để người dùng tự duyệt rồi bấm Đăng — soát trước bằng script, viết caption một dòng, lái Chrome thật ở ĐÚNG hồ sơ ghi trong .publish-profile (không hồ sơ nào khác). Dùng khi người dùng muốn đăng, đưa lên Facebook, tạo bản nháp, publish, up reel lên Page. KHÔNG dùng để làm video (market-video, market-review) và KHÔNG dùng cho Page nào khác Chứng Vịt.
argument-hint: "<Id>  (Channel | DailyReview | …)"
allowed-tools: Read, Write, Edit, Bash(node scripts/publish/*), Bash(../video-factory/.venv/bin/python scripts/publish/fb.py *), Bash(npm run verify *), Bash(ffprobe *), Bash(ls *), Bash(cat *)
---

Đưa reel `$1` lên Page Chứng Vịt dưới dạng bản nháp.

Chép từ lệnh `publish-video` của video-factory (2026-09-30), đổi cho repo này: reel Remotion của
repo thay cho job lồng tiếng, cửa duyệt `status: reviewed` + `verify` thay cho `06_verify.txt`,
caption của một kênh chứng khoán thay cho kênh review ăn uống, hồ sơ ghi trong .publish-profile thay cho hồ sơ FireAnt.

Chạy SAU khi reel đã được duyệt trên trang duyệt và render xong (`npm run approve -- <Id>` rồi
`npm run build -- --id=<Id>`). Hai phần: **caption + soát** (mục 1-2) rồi **tạo bản nháp** (mục 3-6).

**Chỉ MỘT Page, chỉ MỘT hồ sơ.** Page đích khai ở [page.json](page.json): tên `Chứng Vịt`, `pageId`
và địa chỉ danh sách nháp — script đọc từ đó, đừng chép id ra chỗ khác. Không có bảng Page để chọn như video-factory: reel nào không phải cho Chứng Vịt thì
không đi qua skill này. Tên trên màn hình (footer, brand của outro, `channel.name`) phải trùng tên Page;
`prep.mjs` dừng khi lệch, vì bài nằm sai kênh thì bộ gợi ý đã học sai tệp người xem, và gỡ xuống rồi
vẫn còn người đã thấy.

## 0. Ranh giới — đọc trước khi chạm vào Chrome

**KHÔNG BẤM "Đăng". Skill này dừng ở BẢN NHÁP.** Người dùng xem lại rồi tự đăng. Nút cần bấm ở bước
cuối là **"Lưu"** (xám, bên trái), không phải "Đăng" (xanh, bên phải). Hai nút cạnh nhau, cách nhau
~175px: trước cú bấm đó chạy `fb.py peek X Y` và đọc chữ dưới dấu thập rồi mới `click`.

**CHỈ hồ sơ Chrome của tài khoản ghi trong `.publish-profile`.** Người dùng chốt 2026-09-30. Tài khoản nằm ở
`.publish-profile` (hoặc `$PUBLISH_PROFILE`), gitignore như `.shoot-profile` vì nó gọi tên một
người; `fb.py` tra nó trong `Local State` của Chrome ra thư mục hồ sơ + tên hiển thị (hôm nay là
`Profile 1` / `Zion`) chứ không tin con số `Profile 1`. Không đúng MỘT hồ sơ khớp thì script thoát,
**không thử hồ sơ khác**. Hồ sơ `Default` (tài khoản FireAnt, ghi trong `.shoot-profile`) là của FireAnt và video-factory — skill
này không bao giờ mở nó.

`fb.py` kiểm lại trước MỖI thao tác: Chrome đang là app ở TRƯỚC, và cửa sổ AXMain là cửa sổ app
Facebook của đúng hồ sơ đó (tên hồ sơ ở cuối tiêu đề, URL trên `facebook.com`). Sai thì in
`ABORTED before any input` và dừng. Khi đó bảo người dùng buông Chrome rồi chạy lại bước đó;
**đừng nới chốt chặn**: nới là gõ vào app của họ (đã xảy ra với `shoot_real` 2026-09-22).

`fb.py open` chỉ mở `facebook.com` / `business.facebook.com`, trong **cửa sổ app** riêng (không
tab, không thanh địa chỉ), nên không đụng tab nào của người dùng. Ba đích có tên: `compose` (soạn
reel), `drafts` (danh sách nháp, `draftsUrl` của page.json), `me`. Muốn sang trang khác thì mở cửa
sổ khác, `close` cửa sổ cũ. Nói với người dùng đừng đụng chuột trong lúc chạy.

## 1. Viết caption: ĐÚNG MỘT DÒNG

Đọc lời của reel để biết video nói gì: `narration` từng scene trong `content/<reel>.json`, và
headline `line1`/`line2` của khung đầu. Đừng viết caption từ `title` hay từ trí nhớ; số và chữ thật
nằm ở đó và ở fact pack (`reel.facts`).

Ghi ra `out/<id viết thường>.caption.txt` (ví dụ `out/dailyreview.caption.txt`), theo khuôn của Page:

```
<Một dòng móc câu, có emoji chèn trong dòng>

#Tag1 #Tag2 #Tag3 #Tag4 #Tag5 #xuhuong #chungkhoan #chungvit
```

Ví dụ theo khuôn, viết từ hook của hai reel đang có (số là số khung đầu đang hiện; chưa bài nào đăng):

```
VN-Index chạm kháng cự 1933 lần thứ ba 📈 hai lần trước chạm xong là rơi sâu, lần này thì sao👀

#KenhGia #VNIndex #PhanTichKyThuat #DauTu #CoPhieu #xuhuong #chungkhoan #chungvit
```

```
VN-Index mất 0,51%, mã giảm nhiều hơn mã tăng 📉 vậy tiền đang chảy vào đâu👀

#TongKetPhien #VNIndex #ThiTruongChungKhoan #DauTu #CoPhieu #xuhuong #chungkhoan #chungvit
```

### Khuôn cứng

- **MỘT dòng, KHÔNG có đoạn mô tả.** Nội dung đã nằm trong video, caption không kể lại (người dùng
  chốt ở video-factory 2026-09-21; giữ nguyên cho Page này).
- **Emoji chèn TRONG dòng**, 1-2 cái: một cái sau danh từ chính, một cái dính liền cuối dòng. 📈📉👀🔥
  hợp kênh này; đừng dùng 💰🚀 (đọc như hứa lãi).
- **Đúng 8 hashtag: 5 tag chủ đề + đuôi cố định `#xuhuong #chungkhoan #chungvit`** (`caption.tailTags`
  trong page.json). Tag chủ đề viết **KHÔNG DẤU, CamelCase** (`#PhienPhanPhoi`, `#KenhGia`), đuôi
  viết thường.
- **Không gọi lệnh.** Không "nên mua", "điểm mua", "vào hàng", "chốt lời", "cam kết", "chắc chắn",
  không giá mục tiêu. Danh sách ở `caption.callWords`, `prep.mjs` chặn. Caption nói biểu đồ cho thấy
  gì, không bảo người ta làm gì. Cùng lý do verify FAIL scene `scenario` thiếu chữ "nếu … thì".
  Mã cổ phiếu nêu được nếu có trong video, nhưng chỉ như dữ kiện ("có mặt ở cả RS Strong lẫn
  Uptrend"), không kèm lời mời.
- **Không lặp miễn trừ.** Câu "chỉ là thông tin tham khảo" đã nằm dưới outro; caption không mang nó,
  giống lời đọc (CLAUDE.md, đoạn miễn trừ).

### Viết cho hiệu quả phân phối

Page mới gần như không có follower, nên mọi lượt xem đến từ bộ gợi ý. Thứ bộ gợi ý đọc được từ
caption chỉ có hai: nó giữ người xem lại bao lâu, và nó nói video này về cái gì.

1. **~50 KÝ TỰ ĐẦU là toàn bộ đất diễn.** Trình phát Reels cắt caption bằng "... Xem thêm" sớm hơn
   nhiều so với mốc ~125 ký tự của News Feed (video-factory đo trên bài Emirates: cắt sau dòng thứ
   hai). `prep.mjs` in ra đúng 50 ký tự đó; đọc lại chúng.
2. **Mở bằng thứ NHÌN THẤY trong giây đầu của video.** Caption và khung hình đầu phải nói cùng một
   chuyện. Khung đầu của reel là headline scene hook: mượn chuyện của nó, không mở bằng bối cảnh.
3. **Cài MỘT vòng lặp mở**, lấy từ chính lời hook: câu hỏi mà video trả lời ở cuối ("tiền đang chảy
   vào đâu", "lần này thì sao"). Nêu ra, đừng trả lời. Retention là tín hiệu mạnh nhất của Reels.
4. **Con số đứng SAU hình ảnh.** Một con số là đủ, và nó phải là số khung đầu đang hiện.
5. **KHÔNG mồi tương tác.** "Comment mã bạn đang cầm", "tag bạn bè" — Meta xếp vào engagement bait và
   HẠ phân phối. Lời kêu gọi đã nằm ở outro (thả tim · chia sẻ · theo dõi); caption không lặp.
6. **Mọi con số phải có trong fact pack hoặc trên màn hình.** Số trên màn hình của repo này truy được
   về fact pack (CLAUDE.md); caption cũng vậy. `prep.mjs` cảnh báo số nào không tìm thấy. Viết số theo
   kiểu Việt `1780,68`, không `1,780.68`.
7. **Tag: 1 tag NICHE chính xác + 3-4 tag CHỦ ĐỀ có lượng lớn + đuôi cố định.** `#PhienPhanPhoi` hay
   `#KenhGia` nói cho bộ phân loại biết video về cái gì; `#VNIndex`, `#DauTu`, `#CoPhieu`,
   `#ThiTruongChungKhoan`, `#PhanTichKyThuat` mới là chỗ có người.

### Nghe cho ra NGƯỜI, đừng ra máy

Đúng hết thông tin mà đọc lên như dòng mô tả sản phẩm là cách hỏng hay gặp nhất (người dùng bác đúng
kiểu đó ở video-factory 2026-09-21, và ở lời đọc của repo này 2026-09-23). Giọng là của **trader**,
như lời đọc (`prompts/scene-writer.md`, phần "Giọng người"): kháng cự, hỗ trợ, tích luỹ, phá vỡ,
thanh khoản; không ví von đời thường.

| Nghe như máy | Vì sao | Viết lại |
|---|---|---|
| `VN-Index: −0,51% · 129 tăng / 178 giảm` | dấu `:` `·` `/` là bảng kê | `VN-Index mất 0,51%, mã giảm nhiều hơn mã tăng` |
| `Phân tích kênh giá tháng VNINDEX` | mở bằng DANH TỪ = tiêu đề báo cáo | `VN-Index chạm kháng cự 1933 lần thứ ba…` |
| `Cập nhật thị trường phiên 30/9` | ai cũng viết được, không có chuyện | kể điều lạ của phiên: chỉ số đi ngang mà mã giảm áp đảo |
| `Đừng bỏ lỡ!` | lời quảng cáo | để câu hỏi của hook làm việc đó |

Bốn quy tắc:

1. **Mở bằng CHUYỆN, đừng mở bằng nhãn.** Cụm danh từ chồng bổ ngữ đứng đầu câu luôn nghe như tiêu
   đề báo cáo, kể cả khi từng chữ đều đúng.
2. **Để ĐỘNG TỪ chở câu.** "chạm xong là rơi sâu" thay vì "sự sụt giảm mạnh sau các lần chạm".
3. **Mượn chính chữ của lời đọc.** Người viết đã chọn từ đời thường rồi; caption dùng lại thì giọng
   caption và giọng video khớp nhau.
4. **Soát bằng `/humanizer`** như `_script.md`: các mẫu AI (không X mà là Y, bộ ba ép, gạch ngang)
   sửa đi; số và thuật ngữ giữ nguyên.

Rồi ĐỌC TO lên. Không nói thế ngoài đời thì viết lại.

## 2. Soát — MỘT lần, sau caption

```bash
node scripts/publish/prep.mjs <Id>
```

Chặn (exit 1) khi:

- reel chưa `reviewed`: người dùng chưa duyệt nó trên trang duyệt (market-video §2c / market-review),
  và đăng bản chưa duyệt là bỏ qua đúng điểm dừng họ đã chốt. Hoặc verify còn lỗi: đây là lần verify
  đầu tiên SAU khi có giọng, vì `approve` chạy trước lồng tiếng và các check âm thanh lúc đó là SKIP;
- thiếu video của reel (`out/<id>.mp4`; bản phiên/tuần có ngày: `out/review/<format>-<edition>.mp4`, file `render.mjs` ghi — mỗi bản một file từ 2026-10-06), hoặc nó cũ hơn content hay bất kỳ file nào reel trỏ tới (giọng, ảnh, logo).
  Một lần `approve` sau render cũng tính: file không chứng minh được nó dựng từ đúng lời đã duyệt.
  Render lại bằng `npm run build -- --id=<Id>`;
- có scene không có track giọng; thiếu hình hoặc tiếng; ngắn hơn 10 giây (sàn duy nhất còn lại của
  Reels, `../video-factory/reference/nghien-cuu-facebook.md` mục 1);
- tên trên màn hình khác tên Page;
- chưa có caption, caption cũ hơn reel (bản tin hôm qua), caption có chữ gọi lệnh.

FAIL vì duyệt hay render thì caption vẫn giữ được: sửa xong chạy lại. Hồ sơ Chrome không soát ở đây;
`fb.py` soát nó trước mọi lệnh (mục 0). Cảnh báo (vẫn chạy tiếp):
số trong caption không tìm thấy ở fact pack hay trên màn hình; caption không đúng một dòng, quá dài,
số hashtag, đuôi, tag có dấu; codec không phải h264/aac; khung không phải 1080×1920.

Nó KHÔNG chép file và không hạ cỡ: canvas của repo đã là 1080×1920 h264/aac, đúng thứ Reels muốn.
Nó in ra ĐÚNG MỘT đường dẫn để tải lên (`out/<id>.mp4`, hay `out/review/daily-<ngày>.mp4` cho bản phiên), Page và caption. Đọc dòng
`PAGE` rồi mới đi tiếp.

## 3. Vào đúng Page

```bash
PY=../video-factory/.venv/bin/python
$PY scripts/publish/fb.py whoami
```

`whoami` mở `facebook.com/me` trong cửa sổ app của hồ sơ trong `.publish-profile` và đọc URL thật qua
Accessibility (`AXDocument`), vì cửa sổ app không có thanh địa chỉ. Đạt khi URL mang `pageId` của
page.json; đạt thì nó tự đóng cửa sổ đó. Không đạt là Facebook đang hoạt động bằng tài khoản người:
trong cửa sổ còn mở, bấm ảnh đại diện góc phải trên → chọn **Chứng Vịt** trong bảng chuyển tài khoản
(chụp, đọc toạ độ, `fb.py click`), rồi chạy `whoami` lại.

Id là chốt duy nhất, và đủ: ảnh đại diện không phân biệt được Page với người (video-factory đo
2026-09-22), còn tiêu đề cửa sổ của `/me` với Page này chỉ là "Facebook - Zion" (đo 2026-10-01). Lần
chạy thật đầu tiên (2026-10-01, reel Channel), bảng chuyển tài khoản có ĐÚNG MỘT "Chứng Vịt": Page MỚI
(ảnh bìa và avatar con vịt), không phải Page cũ `61594310620177` ("Cuộc sống sang chành") từng ghi ở đây.

## 4. Tải video lên

```bash
$PY scripts/publish/fb.py open compose
```

Mỗi lệnh `fb.py` chụp lại cả cửa sổ vào `out/publish/shot.png` và in `scale`. **NHÌN ảnh rồi mới lấy
toạ độ**, chia pixel cho `scale` ra point của cửa sổ; đừng dùng toạ độ của phiên trước.

Bấm **"Thêm video"**, rồi đưa đúng file `prep.mjs` vừa in:

```bash
$PY scripts/publish/fb.py click <x> <y>                 # "Thêm video"
$PY scripts/publish/fb.py upload <đường dẫn prep in ra>  # chờ hộp thoại, Cmd+Shift+G, đặt đường dẫn, Return x2
```

`upload` tự chờ hộp thoại mở file; không thấy thì thoát, **đừng gõ tiếp**. Đường dẫn đi qua
Accessibility (`ax_set_field`), không qua bàn phím: bộ gõ Telex biến `/Users` thành `/Úe` (mục 7).

Chờ ~12 giây cho video nạp (`fb.py shot`): nút đổi thành **"Thay video"** và khung xem trước chạy.
Rồi bấm **"Tiếp"**.

## 5. Tắt phụ đề tự động — BẮT BUỘC

Bước "Chỉnh sửa thước phim" có mục **"Phụ đề" > "Tự động thêm phụ đề"**, và nó **mặc định BẬT**.
Reel của repo này đã có headline hai dòng dựng dần ở dưới panel. Phụ đề tự động sẽ đè lên đúng vùng
đó, và nó chép lời đọc bằng nhận dạng giọng: "một nghìn bảy trăm tám mươi" thành chữ số tuỳ hứng, "FTD"
thành "ép tê đi". Những số đó không truy được về fact pack. Mở mục "Phụ đề", bấm công tắc cho nó xám
đi, chụp lại xác nhận, rồi "Tiếp".

Tắt rồi mà danh sách Business Suite vẫn hiện huy hiệu `CC` màu CAM thì KHÔNG phải lỗi: Facebook vẫn
sinh phụ đề nhưng CHƯA gắn vào video, chờ duyệt ("Cần xét duyệt chú thích"). Để nguyên, **đừng bấm
duyệt**.

## 6. Caption và LƯU BẢN NHÁP

Bước "Cài đặt thước phim": bấm vào ô mô tả rồi

```bash
$PY scripts/publish/fb.py paste --file out/<id>.caption.txt
```

`paste` đi qua clipboard nên tiếng Việt có dấu và emoji vào đúng; đừng gõ phím. Chụp lại: hashtag
phải hiện màu xanh (Facebook đã nhận), dòng trống giữa câu và hashtag không mất. Gõ hashtag xong
Facebook bung ô gợi ý ngay dưới con trỏ: bấm ra chỗ trống cho nó tắt trước khi bấm nút nào khác.

Soát nhanh: quyền xem **Công khai**, lịch **Đăng ngay**, **"Thêm nhãn AI" TẮT** (người dùng chốt
2026-09-30, như video-factory).

Rồi **LƯU**, không đăng:

```bash
$PY scripts/publish/fb.py peek <x> <y>     # đọc chữ dưới dấu thập: phải là "Lưu"
$PY scripts/publish/fb.py click <x> <y>
```

Composer đóng lại. **Xác nhận bản nháp đã có:**

```bash
$PY scripts/publish/fb.py close
$PY scripts/publish/fb.py open drafts
```

Dòng mới phải hiện ở tab **"Bản nháp"** kèm nút "Chỉnh sửa bài viết". Lần đầu vào Business Suite có
popup xin quyền thông báo (bấm **Block**) và một modal giới thiệu (bấm **X**). `drafts` là `draftsUrl`
của page.json, và `asset_id` trong đó KHÔNG phải id Page (đo 2026-10-01: id Page ra trang lỗi "nội dung
này hiện không khả dụng"). Trang lỗi hay danh sách rỗng mà composer đã đóng thì
`fb.py open https://business.facebook.com/latest/posts/draft_posts` (không `asset_id`), đọc id Business
Suite tự chọn, sửa `draftsUrl`, rồi mới kết luận là lưu hỏng.

**Đừng tìm bản nháp ở Page.** Tab "Thước phim đã lưu" trên Page là reel BOOKMARK của người khác, không
phải nháp. Nháp chỉ nằm ở Business Suite > Nội dung > Bản nháp.

Xong thì `fb.py close`, rồi báo lại cho người dùng: link tab Bản nháp, caption đã dùng, đã tắt phụ đề
tự động. Nhắc rằng còn đúng một bước: họ mở bản nháp, xem lại rồi tự bấm Đăng.

## 6b. Sửa caption của bản nháp đã có

Không làm lại từ đầu. `fb.py open drafts` → **"Chỉnh sửa bài viết"** của đúng dòng → composer của Business
Suite:

```bash
$PY scripts/publish/fb.py click <x_ô_văn_bản> <y>
$PY scripts/publish/fb.py key 0 cmd        # Cmd+A
$PY scripts/publish/fb.py key 51           # Delete
$PY scripts/publish/fb.py paste --file out/<id>.caption.txt
$PY scripts/publish/fb.py click <x_chỗ_trống> <y>   # tắt ô gợi ý hashtag
```

Composer của Business Suite có ba nút: **"Hủy"**, **"Hoàn tất sau"**, **"Đăng"**. Giữ nháp thì bấm
**"Hoàn tất sau"** (nút GIỮA, `peek` trước). Đây là nút khác với "Lưu" ở composer reel của mục 6.

**Danh sách nó quay về là bản CŨ trong cache**, nhìn như lưu hỏng. `fb.py close` rồi `fb.py open drafts` lại,
và xác nhận bằng TIÊU ĐỀ dòng đó đổi theo câu đầu của caption mới, không chỉ nhìn `Ngày cập nhật`.

## 6c. Nếu lỡ đăng thật thay vì lưu nháp

Nói ngay với người dùng. Business Suite > Nội dung > tab **"Đã đăng"** > nút `...` của dòng đó >
**"Quản lý bài viết"** (submenu bung sang TRÁI) > **"Xóa bài viết"** > **"Chuyển vào thùng rác"**.
Xoá MỀM: bài nằm thùng rác 30 ngày. Gỡ là thao tác trên bài công khai của họ, nên hỏi họ trước khi
gỡ; rồi làm lại mục 4-6 và bấm "Lưu".

## 7. Những đường đã thử và HỎNG — đừng đi lại

Gom từ video-factory (2026-09-21..23) và từ lượt dựng Page của repo này (2026-09-30).

- **MÀN HÌNH NGỦ trông y hệt "Chrome kẹt" — kiểm cái này TRƯỚC MỌI THỨ.** Khi đó CGEvent không tới
  app nào, System Events thấy 0 cửa sổ, `screencapture` chỉ ra hình nền KHÔNG CÓ thanh menu, trong
  khi AppleScript của Chrome vẫn khai đúng cửa sổ và URL. Cờ `CGSSessionScreenIsLocked` bật cả khi
  màn hình chỉ NGỦ; máy này không đặt mật khẩu nên phím Space đánh thức (rê chuột và `caffeinate -u`
  thì không). `fb.py` tự bấm Space trước mỗi bước. Space rồi vẫn khoá thì là khoá thật: DỪNG, đừng
  gõ mật khẩu hộ ai. Repo này đã chẩn đoán nhầm đúng chỗ đó ngày 2026-09-29.
- **App khác chen lên TRƯỚC là mọi thứ đi nhầm chỗ, im lặng.** Toạ độ vẫn đúng, tiêu đề cửa sổ vẫn
  đúng, nhưng chuột và phím rơi vào app đang ở trước (video-factory: một Return thừa trong hộp thoại
  mở file làm QuickTime mở chính file mp4 và cướp focus, cú bấm "Lưu" rơi vào QuickTime). Thao tác
  "không ăn" thì nghi chỗ này đầu tiên, đừng nghi toạ độ.
- **Máy chạy HAI tiến trình cùng tên "Google Chrome".** `tell process "Google Chrome"` bắt vào tiến
  trình đầu khớp tên, có thể là cái không có cửa sổ: chốt chặn khi đó soát một cửa sổ khác cửa sổ
  nhận chuột. `fb.py` tìm cửa sổ khắp MỌI tiến trình cùng tên và định danh bằng PID.
- **Bộ gõ tiếng Việt (Telex) nuốt mọi thứ gõ bằng mã phím.** `/Users/…` ra `/Úe/…`, "book" thành
  "bôk"; hộp thoại im lặng từ chối đường dẫn sai. Ô của TRANG WEB dùng `paste`, ô của HỘP THOẠI macOS
  dùng `ax_set_field` (trong `upload`). Cây AX bất ổn (lỗi -1728) thì trong hộp thoại: Cmd+Shift+G →
  Cmd+A → `paste` đường dẫn → soát "Go to:" phân giải đúng file → Return → Return.
- **Phím bổ trợ dính.** CGEvent không đặt flags thì kế thừa trạng thái đang treo; sau một Cmd+Shift+G
  mọi ký tự dính Shift. `screen.key()` luôn gọi `CGEventSetFlags`; đừng bỏ dòng đó.
- **`System Events … click at {x,y}` không bấm được nội dung TRANG WEB.** Chạy không lỗi mà không gì
  xảy ra: Chrome không phơi cây Accessibility của trang. Chỉ CGEvent theo toạ độ đọc từ ảnh mới ăn;
  `screen.click()` thiếu click count nên Chrome có khi bỏ qua; `fb.py click` dùng `click` của
  `shoot_real.py`, có đặt nó (cùng bộ ống nước cửa sổ với ảnh FireAnt).
- **Playwright không lái được hồ sơ Chrome thật.** Chrome từ chối DevTools trên user-data-dir mặc định,
  và bản sao hồ sơ không mang phiên (cookie mã hoá bằng khoá Keychain gắn đường dẫn gốc; repo này đo
  lại với FireAnt 2026-09-22: giải mã được mà trang vẫn hiện "Đăng nhập"). Đừng viết lại.
- **"Allow JavaScript from Apple Events" không bật được bằng System Events**, nên
  `execute javascript` cũng không dùng được.
- **Cửa sổ app không có thanh địa chỉ.** Cmd+L không có tác dụng ở đó, nên đổi trang là `close` rồi
  `open` URL mới. Trạng thái "đang hoạt động bằng Page" là của cả tài khoản, nên mở cửa sổ mới không
  làm mất nó.

## 8. Nội dung tài chính — nói một lần rồi thôi

Reel của kênh là phân tích kỹ thuật, không phải lời mời đầu tư, và outro đã có câu miễn trừ. Caption
giữ đúng ranh giới đó (mục 1, "Không gọi lệnh"). Chart trong reel là ảnh chụp FireAnt và terminal của
người dùng: đưa ảnh giao diện của FireAnt lên Page công khai là việc người dùng quyết. Nhưng nếu họ hỏi
vì sao bài bị giảm phân phối hay bị gắn cờ, chỗ nên xem trước là lời gọi lệnh trong caption, không phải
hashtag.
