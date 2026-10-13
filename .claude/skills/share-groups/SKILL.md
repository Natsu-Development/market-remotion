---
description: Đăng lại reel ĐÃ ĐĂNG của Page "Chứng Vịt" vào các nhóm Page đã tham gia, qua composer của Meta Business Suite — mở Business Suite ĐÚNG HAI LẦN, hai bài, mỗi bài tối đa ba nhóm chưa đăng (tối đa 6 nhóm), rồi thôi, không mở trình duyệt thêm — bằng ĐÚNG chữ người dùng đưa (chưa có chữ thì HỎI, không viết hộ). Lái Chrome thật ở hồ sơ ghi trong .publish-profile, cùng bộ máy với publish-video. Dùng khi người dùng muốn chia sẻ / đăng lại / re-post / fan out reel vào nhóm, share vào group, đưa video vào các nhóm đã tham gia. KHÔNG dùng để tạo bản nháp hay đăng reel lên Page (đó là publish-video), và KHÔNG dùng cho Page nào khác Chứng Vịt.
argument-hint: "<mp4 hoặc Id> [chữ đăng kèm]"
allowed-tools: Read, Write, Edit, Bash(node scripts/publish/*), Bash(../video-factory/.venv/bin/python scripts/publish/fb.py *), Bash(ls *), Bash(cat *)
---

Đăng lại reel `$1` vào mọi nhóm của Page Chứng Vịt.

Tách khỏi `publish-video` (mục 9 cũ) ngày 2026-10-12 theo lời người dùng: "split this action sharing separate from the
publish skill for me". `publish-video` làm BẢN NHÁP và không bao giờ bấm Đăng; skill này chỉ chạy SAU khi người dùng đã tự
đăng reel lên Page, và nó CÓ bấm «Đăng» — trong composer của Business Suite, chỉ cho nhóm, chỉ với chữ của người dùng.
Sơ đồ luồng: https://claude.ai/artifact/9Giah7RawysCftrLr3e4Vq.

Cấu hình riêng ở [share.json](share.json) (composer, ba nhóm một bài, giãn cách, nhãn nút đăng). Page (tên, `pageId`,
`draftsUrl`, hồ sơ) là của chung, nằm ở [../publish-video/page.json](../publish-video/page.json); đừng chép sang đây. Mã dùng
chung với publish-video: `scripts/publish/fb.py` (`bsgroups`, `bspost`), `scripts/publish/ax.py`, và
`scripts/publish/share.mjs` (vòng lặp).

## 0. Ranh giới — đọc trước khi chạm vào Chrome

- **CHỈ hồ sơ Chrome của tài khoản trong `.publish-profile`, CHỈ cửa sổ app của chính script.** Mọi luật Chrome của
  publish-video mục 0 và mục 7 áp nguyên ở đây (màn hình ngủ, app khác chen lên, Telex, phím bổ trợ dính…). `fb.py` kiểm
  trước MỖI thao tác: Chrome ở trước, cửa sổ AXMain là cửa sổ app của đúng hồ sơ; sai thì `ABORTED`, đừng nới chốt chặn.
- **Không bao giờ tick chính Page** trong «Đăng lên»: tick là reel lên Page lần hai. `fb.py` đọc lại và dừng nếu nó tick.
- **Không đăng khi thiếu chữ của người dùng hay lời xác nhận của họ (mục 1).**
- Một phiên khác đang lái cùng hồ sơ thì `fb.py close` của bên này đóng cửa sổ bên kia: hỏi nhau trước (đã xảy ra 12/10).
  Nói người dùng đừng đụng chuột trong lúc chạy.

## 1. Trước bài đầu tiên

Người dùng 2026-10-12: "Please ask when not provide and when the people confirm publish it to all page when the original
video already published, choose 3 group each once and re-post it". Rồi 2026-10-13: "Not need to check the video already
existed or not since when user using this skill, they ensure the video already published".

1. **Chữ là của người dùng.** Chưa có thì HỎI; đừng viết hộ, đừng lấy caption của Page thay vào. Chép NGUYÊN VĂN (cả xuống
   dòng, hashtag) vào `out/publish/share-<tên video>/text.txt`. 12/10: `VN-Index thủng đáy thứ Sáu tuần trước, cùng mình
   review thị trường ngày hôm nay nhé` / `#vnindex #tongketphien #reviewthitruong`; 13/10 (phần 1 Mr. Market): `Cùng mình xây
   dựng hệ thống giao dịch của chính bạn nhé` / `#hethonggiaodich #vnindex`.
2. **Reel gốc đã đăng: người dùng lo, skill KHÔNG kiểm.** Gọi skill là người dùng đã đăng reel lên Page. Đừng mở Business
   Suite hay thư viện nội dung để tìm bài gốc; `--original` không bắt buộc, có thì chỉ ghi vào log.
3. **Đưa chữ để đăng là xác nhận** cho ĐÚNG reel đó; reel sau hỏi lại.

## 2. Chạy

```bash
node scripts/publish/share.mjs fanout --video=<mp4 của reel> --text=out/publish/share-<tên>/text.txt --dry
node scripts/publish/share.mjs fanout --video=… --text=…       # chạy nền: đúng hai lần mở, ~4,5 phút, rồi thôi
```

mp4 là file render của reel (`out/<id>.mp4`, bản phiên `out/review/daily-<ngày>.mp4`, chuỗi Minervini
`out/minervini/p<số>-<tên>.mp4`); `out/` là symlink chung của mọi checkout. `prep.mjs <Id>` ở checkout làm ra reel in đúng
đường dẫn đó nếu cần tìm.

## 3. Một lượt chạy

`fanout` lấy MỌI nhóm Page đã tham gia từ danh sách LƯU SẴN [groups.json](groups.json) làm đích (người dùng 13/10: "Just store
the info of all group join as once and remove the step listing all group"; đọc một lần 13/10 10:45 từ
`facebook.com/groups/joins` bằng chính Page, 10 nhóm) và giữ nguyên; lượt chạy KHÔNG đọc lại danh sách đó. Rồi đăng liên tục (người dùng 12/10: "scroll on the
business suite for upload to all group 3 groups as a one time share, until all the group be posted", rồi "Not need for
waiting, after press the button Đăng continue to another page group … since the post is waiting for approving"):

- mỗi bài là MỘT `fb.py bspost` nhận danh sách nhóm còn thiếu và tự CHỌN ≤ `maxGroupsPerPost` nhóm trong hộp nhóm của
  Business Suite đúng lúc đó; bài sau bắt đầu ngay sau «Đăng» (`spacingSeconds` = 0);
- **mỗi lần dùng skill mở Business Suite đúng HAI lần** (`maxPerRun` = 2): hai bài, mỗi bài ≤ 3 nhóm chưa đăng — tối đa 6
  nhóm — rồi THÔI. Không lặp, không chạy lại cho các nhóm còn lại, không mở trình duyệt thêm lần nào sau hai bài đó (không
  kiểm nhóm, không đọc lại danh sách). Người dùng 12/10: "I see the limit Facebook just display 7 groups, so maximum update to
  6 group with 2 times open the dialog for the group not post"; 13/10: "Just open the business twice for 6 groups and not need
  loop it since the Facebook just display 7 groups at once. I want this skill just open the browse twice for the twice post on
  business suite for 6 groups, after this action don't open browser any-time". Lần mở không có nhóm nào còn thiếu cũng tính
  là một lần. Các nhóm ngoài sáu nhóm đó là chủ ý, không phải lỗi; người dùng tự gọi lại skill nếu muốn.

Một bài: mở composer (`composerUrl`, cửa sổ mới) → «Đăng lên» → «Xem thêm các nhóm» → đọc mọi dòng (cuộn tới cuối) →
chọn → bỏ mọi ô khác rồi tick đúng các nhóm đã chọn → «Lưu» → đọc lại «Đăng lên»: đúng các nhóm đó, Page Chứng Vịt KHÔNG
tick → «Thêm video» → «Tải lên từ máy tính» → hộp thoại macOS → chờ tới khi có «Gỡ video» và hết "Đang tải file phương
tiện lên" → dán chữ (clipboard), đọc lại → «Đặt ngày và giờ», «Chia sẻ lên tin trên Facebook», «Quảng bá» đều TẮT → đọc
nhãn trên cùng dưới «Đăng» → bấm → chờ Business Suite chuyển sang lịch nội dung (vài giây) → đóng cửa sổ.
Mỗi bài xong, `out/publish/share-<tên video>/log.json` có một dòng cho mỗi nhóm: người dùng gọi lại skill cho cùng reel
thì nhóm đã đăng bị bỏ qua. Skill không tự chạy lại.

## 4. Đo 2026-10-12 trên Page này (composer `ref=fb_composer_share_to_groups`)

- Không gắn được BÀI đã đăng: «Thêm video» chỉ có «Tải lên từ máy tính», nên mp4 của reel lên lại ở mỗi bài (52 MB, ~5–20 s).
  Business Suite báo "Đăng video dưới dạng thước phim": video dọc vào nhóm thành reel; lượt xem nằm ở bài trong nhóm.
- Hộp nhóm nhận tối đa **ba nhóm một bài** ("Chọn tối đa 3 nhóm để đăng bài viết.").
- Hộp nhóm hiện **tối đa 7 nhóm** (cuộn tới cuối vẫn 7) và XOAY VÒNG: sau mỗi bài, và cả giữa hai lần mở không có bài nào.
  Nhóm vừa đăng lên đầu và có thể đẩy nhóm chưa đăng ra ngoài (22:11: "CHỨNG KHOÁN VIỆT NAM · 119532" có ở lần đọc 22:03,
  mất ở 22:04 và 22:11). Vì thế danh sách được đọc lại trong MỖI bài.
- Dòng nhóm không có link, chỉ tên + "Thành viên của N", mà "CHỨNG KHOÁN VIỆT" là HAI nhóm (512083 và 128365 thành viên):
  một nhóm = tên đúng từng chữ (hoa/thường khác là nhóm khác) + số thành viên lệch ≤ 2 % (số nhích vài người giữa hai lần đọc).
- Chrome này từ chối `AXManualAccessibility` (−25205), nên `ax.Session` bật `AXEnhancedUserInterface` thay và trả lại khi
  xong. Phép thử điểm đầu tiên ở một chỗ mới trả về một nhóm không nhãn (lớp extension phủ trang); từ lần thứ hai mới là nút
  thật, nên `label_under` hỏi system-wide và thử tới ba lần.
- Đóng composer có nội dung thì Chrome hỏi "Leave app?" trong một CỬA SỔ hộp thoại riêng, không tên (không phải sheet);
  `close_hard` chỉ bấm «Leave» khi hộp đó nằm trên cửa sổ vừa đóng của mình.
- Dải Stage Manager đè mép trái cửa sổ: `press` hỏi app nào nằm trên cùng tại điểm bấm (`ax.owner_at`), không phải Chrome
  thì dừng. Popover xếp cửa sổ của nút xanh Chrome (Move & Resize) làm AppleEvent của Chrome treo: Esc đóng nó.

## 5. Dừng khi

- Một bài UNSURE (đã bấm «Đăng» mà không thấy dấu hiệu): bài đó KHÔNG BAO GIỜ tự đăng lại. Mở từng nhóm của bài xem (mục 6),
  chưa có thì chạy lại với `--retry`.
- Hai bài liền nhau lỗi. Lỗi thường (`failed`) là chưa có gì được đăng: đọc `out/publish/shot.png`, sửa, chạy lại.
- `fb.py` báo ABORTED: app khác lên trước (12/10 QuickTime của dự án khác chen lên giữa lúc tải video, bài chưa đi).
- Đủ hai lần mở Business Suite: đó là KẾT THÚC bình thường của skill, không phải lỗi. Báo các nhóm đã đăng; không chạy lại.

`fb.py bspost` chỉ đăng SAU khi in dòng `CHOSEN`; một lần chạy chết trước dòng đó là `failed`, không phải `unsure`.

## 6. Sau khi đăng

Không mở trình duyệt sau hai bài (người dùng 13/10: "after this action don't open browser any-time"), nên không kiểm từng nhóm. Dấu hiệu bài đã đi là Business
Suite chuyển sang `/latest/content_calendar/` ngay sau «Đăng»; `log.json` ghi theo dấu hiệu đó. Người dùng muốn xem thì
trang "Nội dung của bạn" của nhóm (`facebook.com/groups/<id>/my_posted_content`, `…/my_pending_content`) cho biết bài đã lên
hay đang chờ quản trị viên duyệt; thư viện nội dung của Page cũng liệt kê bài trong nhóm kèm lượt xem. 12/10: cả 9 nhóm đăng
được đều có bài (3 lên ngay, còn lại chờ duyệt); nhóm `muanhahanoigiare` đã gỡ ba bài Page chia sẻ tay trước đó.

**Giao diện đổi hay lần đầu trên máy khác:** `fb.py bspost --video=… --file=… --groups=<[{name, members}]> --dry` đi hết các
bước rồi dừng TRƯỚC «Đăng», cửa sổ để mở; đọc `out/publish/shot.png` và `peek.png` rồi `fb.py close`. Nhãn nằm ở đầu khối
Business Suite trong `fb.py` (`L_*`), nút đăng ở `postLabel` của share.json.

## 7. Không giãn cách

Trước 12/10 hai bài cách nhau 3–7 phút ngẫu nhiên, vì cùng video và chữ vào nhiều nhóm trong vài phút là thứ bộ lọc spam
của Meta bắt. Người dùng bỏ: phần lớn nhóm giữ bài của Page chờ quản trị viên duyệt. Bài bắt đầu bị chặn (Page bị cấm đăng
vào nhóm, bài bị gỡ hàng loạt) thì nâng `spacingSeconds` lại và báo người dùng. Nhóm có luật riêng (không link, chỉ thứ
Bảy…): người dùng nói bỏ thì xoá nhóm đó khỏi `joined.json` của lượt rồi chạy với `--joined=`.
