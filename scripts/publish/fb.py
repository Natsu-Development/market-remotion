#!/usr/bin/env python
"""Step-by-step driver for the skills publish-video (drafts) and share-groups (group re-posts): ONE Chrome app window on facebook.com in the
user's real Chrome, in the ONE profile that manages the Chứng Vịt Page — nothing else.

The profile is looked up, not assumed: .publish-profile (or $PUBLISH_PROFILE, both gitignored
because they name a person) holds a Google account; Chrome's Local State maps it to a profile dir
and a display name, and a window is ours when its title ENDS with that name. Exactly one profile
must match, and no other profile's name may end with it, or the driver refuses.

Every command: wake the display, check Chrome is in front and the AXMain window is our Facebook
APP window (no tabs of the user's to disturb, no address bar), act, then capture the window to
out/publish/shot.png (gitignored: it shows the account) for the operator to read the next point.
The window plumbing is scripts/shoot_real.py's, which drives the same Chrome for FireAnt.

  fb.py whoami                 open /me; pass when it resolves to page.json's pageId (then close)
  fb.py open compose|drafts|me|URL   open an app window (Facebook hosts only) and capture it
  fb.py shot                   raise our window and capture it (prints geometry + scale)
  fb.py peek X Y               crop the last capture around window POINTS (x,y) with a crosshair —
                               read the button label there BEFORE clicking Lưu
  fb.py click X Y              click at window POINTS (pixel in the capture / scale)
  fb.py paste TEXT | --file P  paste via clipboard (the Telex input source cannot mangle it)
  fb.py key CODE [cmd] [shift] macOS virtual key code: 36 Return, 53 Esc, 51 Delete, 0 A
  fb.py upload PATH            after "Thêm video": wait for the file dialog, set the path through
                               Accessibility, Return x2
  fb.py close                  close this profile's Facebook APP windows only
  fb.py groups [--out=P]       AS THE PAGE: every group it joined (facebook.com/groups/joins, Accessibility links to
                               /groups/<id>, scrolled to the end); writes out/publish/groups.json [{id, name, url}]
  fb.py bsgroups [--out=P]     Business Suite's group list for this Page (the dialog behind «Xem thêm các
                               nhóm» in the composer, share-groups/share.json composerUrl), closed unsaved; writes
                               out/publish/bs-groups.json [{name, members, checked}]
  fb.py bspost --video=MP4 --file=TEXT --groups=JSON [--dry]
                               ONE Business Suite post into 1..3 groups: JSON is the groups [{name, members}], or
                               what is still missing {missing: [{name, count}], posted: [{name, members}]} and the
                               groups are chosen in the dialog from what it shows now. Ticks exactly them (the Page
                               itself stays unticked), uploads the mp4, pastes TEXT, checks schedule/story/boost are
                               off, peeks «Đăng» and clicks it. --dry stops before «Đăng» with the window open.
                               Last line `RESULT {status, groups, why}`; exit 0 posted (or dry), 1 failed (nothing
                               posted), 3 aborted before any input, 4 unsure (Đăng clicked), 5 absent (none of the
                               missing groups in the dialog now)

Run with ../video-factory/.venv/bin/python. The draft flow (§3-6) never clicks "Đăng": which button a click
lands on is the operator's job, from the capture and a peek. The ONE exception is `bspost`, the group re-post the
user asked for with their own text (skill share-groups): it reads the button under the point through Accessibility right
before the click, and clicks only that label.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(1, str(ROOT / "scripts" / "publish"))
from shoot_real import WrongWindow, capture as grab, click, close_window, geometry, osa, sc, wheel, win_ref  # noqa: E402
import ax  # noqa: E402  (scripts/publish/ax.py: the page's Accessibility tree, ctypes)

PAGE = json.loads((ROOT / ".claude/skills/publish-video/page.json").read_text(encoding="utf-8"))
URLS = {"me": "https://www.facebook.com/me", "compose": "https://www.facebook.com/reels/create",
        "drafts": PAGE["draftsUrl"]}
LOCAL_STATE = Path.home() / "Library/Application Support/Google/Chrome/Local State"
OUT = ROOT / "out" / "publish"
STATE = OUT / "state.json"
W, H = 1080, 1300          # macOS clamps to the display: 1080×958 on the 1920×1080 landscape of 2026-10-03


def resolve_profile() -> tuple[str, str]:
    """(profile dir, display name) of the account in .publish-profile — or exit."""
    f = ROOT / PAGE["profileFile"]
    acct = os.environ.get("PUBLISH_PROFILE", "").strip() or next(
        (l.strip() for l in (f.read_text(encoding="utf-8").splitlines() if f.exists() else [])
         if l.strip() and not l.strip().startswith("#")), "")
    if not acct:
        sys.exit(f"fb: no {PAGE['profileFile']} (or $PUBLISH_PROFILE) — it names the Google account "
                 f"of the Chrome profile that manages {PAGE['name']}")
    cache = json.loads(LOCAL_STATE.read_text(encoding="utf-8"))["profile"]["info_cache"]
    hits = [(d, v.get("name", "")) for d, v in cache.items() if (v.get("user_name") or "").lower() == acct.lower()]
    if len(hits) != 1:
        sys.exit(f"fb: {len(hits)} Chrome profiles are signed in as that account — need exactly one. "
                 "Not trying any other profile.")
    d, name = hits[0]
    clash = [v.get("name") for k, v in cache.items() if k != d and (v.get("name") or "").endswith(name)]
    if not name or clash:
        sys.exit(f"fb: profile name {name!r} cannot be told apart from {clash} by window title")
    return d, name


PROFILE_DIR, PROFILE_TITLE = resolve_profile()


def on_facebook(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host == "facebook.com" or host.endswith(".facebook.com")


def app_windows() -> list[tuple[int, int, bool, str, str]]:
    """(pid, idx, isMain, url, title) of our profile's Facebook APP windows.

    Searched across every process named "Google Chrome" (this Mac runs two) and addressed by PID.
    Unlike shoot_real.app_windows the profile must END the title: a window of another profile on
    a page that merely mentions the name ("Zion Le | Facebook - Cát …") is not ours. Browser windows
    ("… - Google Chrome - <profile>") hold the user's own tabs and are skipped. Each process is read
    inside a try: `open -na` starts a second Chrome that hands off and quits mid-scan (measured
    2026-10-03, error -1719), and one vanished process must not empty the whole list — an empty
    list makes the guard abort.
    """
    title = PROFILE_TITLE.replace('"', '\\"')
    out = osa('tell application "System Events"\n'
              '  set acc to ""\n'
              '  repeat with p in (every application process whose name is "Google Chrome")\n'
              '    try\n'
              '      repeat with i from 1 to (count of windows of p)\n'
              '        set w to window i of p\n'
              '        set n to name of w\n'
              f'        if n ends with "{title}" and n does not contain " - Google Chrome - " then\n'
              '          set m to "false"\n'
              '          try\n'
              '            set m to (value of attribute "AXMain" of w) as text\n'
              '          end try\n'
              '          set d to ""\n'
              '          try\n'
              '            set d to (value of attribute "AXDocument" of w) as text\n'
              '          end try\n'
              '          set acc to acc & ((unix id of p) as text) & tab & (i as text) & tab & m & tab & d & tab & n & linefeed\n'
              '        end if\n'
              '      end repeat\n'
              '    end try\n'
              '  end repeat\n'
              '  return acc\n'
              'end tell')
    rows = [line.split("\t") for line in out.splitlines()]
    return [(int(r[0]), int(r[1]), r[2] == "true", r[3], r[4]) for r in rows if len(r) == 5 and on_facebook(r[3])]


def awake() -> None:
    """A sleeping display reports "locked" too; this Mac has no password, so Space wakes it (video-
    factory 2026-09-23: moving the mouse and caffeinate -u do not). Still locked = really locked."""
    if sc.screen_locked():
        sc.key(49, delay=1.5)
    sc.require_unlocked()


def ours() -> tuple[str, str, str]:
    """(ref, url, title) of OUR window, which must be AXMain with Chrome in front — else abort."""
    awake()
    if sc.frontmost_app() != "Google Chrome":
        raise WrongWindow(f"{sc.frontmost_app()!r} is in front, not Chrome")
    rows = app_windows()
    for pid, idx, main, url, title in rows:
        if main:
            return win_ref(pid, idx), url, title
    raise WrongWindow(f"no AXMain Facebook app window of profile {PROFILE_TITLE!r}; seen: {[r[3] for r in rows]}")


def raise_ours() -> tuple[str, str, str]:
    rows = app_windows()
    if not rows:
        raise WrongWindow(f"no Facebook app window of profile {PROFILE_TITLE!r} is open")
    osa('tell application "Google Chrome" to activate')
    time.sleep(0.5)
    osa(f'tell application "System Events" to perform action "AXRaise" of {win_ref(*rows[0][:2])}')
    time.sleep(0.8)
    return ours()


def shot(tag: str = "shot") -> str:
    """Raise our window, capture it, record geometry + scale for peek. Returns the window's URL."""
    ref, url, title = raise_ours()
    sc.move(5, 5)  # park the pointer off the page so no hover state is in the frame
    time.sleep(0.4)
    x, y, w, h = geometry(ref)
    out = OUT / f"{tag}.png"
    pw, ph = grab((x, y, w, h), out)
    STATE.write_text(json.dumps({"scale": pw / w, "shot": str(out), "url": url, "title": title}, ensure_ascii=False))
    print(f"window {w}x{h} at ({x},{y}) · capture {pw}x{ph}px · scale {pw / w:.2f}\nurl {url}\ntitle {title}\n→ {out}")
    return url


def cmd_open(target: str, tag: str = "shot") -> str:
    url = URLS.get(target, target)
    if not on_facebook(url):
        sys.exit(f"fb: {url} is not Facebook — this driver opens facebook.com and business.facebook.com only")
    awake()
    before = len(app_windows())
    subprocess.run(["open", "-na", "Google Chrome", "--args", f"--profile-directory={PROFILE_DIR}", f"--app={url}"], check=False)
    deadline = time.time() + 25
    while len(app_windows()) <= before:
        if time.time() > deadline:
            sys.exit("fb: no new app window appeared in 25 s (display asleep? another app grabbed focus?)")
        time.sleep(0.8)
    time.sleep(1.5)
    ref, _u, _t = raise_ours()
    osa(f'tell application "System Events" to set position of {ref} to {{0, 25}}')
    osa(f'tell application "System Events" to set size of {ref} to {{{W}, {H}}}')
    time.sleep(6.0)
    return shot(tag)


def page_ok() -> bool:
    """/me resolves to whoever Facebook is acting as; the app window has no address bar, so the URL
    comes from AXDocument. The Page id is the check: for this Page the title is only
    "Facebook - <profile>" (measured 2026-10-01), and avatars do not tell a Page from a person.
    True (and the /me window closed) when it is the Page; else the window stays open for the switch."""
    url = cmd_open("me", tag="whoami")
    u = urlparse(url)
    if PAGE["pageId"] in parse_qs(u.query).get("id", []) or f"/{PAGE['pageId']}" in u.path:
        cmd_close()
        print(f"OK — Facebook is acting as {PAGE['name']} (id {PAGE['pageId']}).")
        return True
    print(f"STOP — /me is {url}, not Page {PAGE['pageId']}. Switch in THIS window: avatar top right → "
          f"{PAGE['name']} in the account switcher, then run whoami again. The window stays open.")
    return False


def cmd_whoami() -> int:
    return 0 if page_ok() else 1


def cmd_peek(x: int, y: int) -> None:
    from PIL import Image, ImageDraw
    st = json.loads(STATE.read_text(encoding="utf-8"))
    s = st["scale"]
    im = Image.open(st["shot"]).convert("RGB")
    cx, cy = int(x * s), int(y * s)
    d = ImageDraw.Draw(im)
    for line in ((cx - 14 * s, cy, cx + 14 * s, cy), (cx, cy - 14 * s, cx, cy + 14 * s)):
        d.line(line, fill=(255, 0, 170), width=max(1, int(2 * s)))
    out = OUT / "peek.png"
    im.crop((max(0, cx - int(180 * s)), max(0, cy - int(60 * s)),
             min(im.width, cx + int(180 * s)), min(im.height, cy + int(60 * s)))).save(out)
    print(f"crosshair at window ({x},{y}) of {Path(st['shot']).name} → {out}\n"
          "Read the label under the crosshair before clicking: Lưu is grey on the LEFT, Đăng blue on the right.")


def cmd_click(x: int, y: int) -> None:
    ref, _u, _t = raise_ours()
    wx, wy, _w, _h = geometry(ref)
    click(wx + x, wy + y, delay=1.6)   # shoot_real.click sets the click count Chrome needs
    shot()


def cmd_paste(text: str) -> None:
    ours()
    sc.paste(text, delay=1.8)
    shot()


def cmd_key(code: int, cmd: bool, shift: bool) -> None:
    ours()
    sc.key(code, cmd=cmd, shift=shift, delay=1.8)
    shot()


def cmd_upload(path: str) -> None:
    p = Path(path).resolve()
    if p.suffix.lower() != ".mp4" or not p.is_file():
        sys.exit(f"fb: {p} is not an mp4 on disk — upload the file prep.mjs printed")
    ours()
    if not sc.wait_for_file_dialog(15):
        sys.exit("fb: no macOS file dialog appeared — 'Thêm video' was not hit; do not type on")
    sc.dialog_open_path(str(p), settle=4.0)
    shot()


def cmd_close() -> None:
    # Highest index first: closing window 1 renumbers the rest, so an ascending loop hit "window 2" that was gone
    # (osascript -1719) and left a window open (2026-10-06).
    for pid, idx, _m, url, _t in sorted(app_windows(), key=lambda r: (r[0], -r[1])):
        close_window(win_ref(pid, idx))
        print(f"closed {url}")


# ── Business Suite: the reel into the Page's groups, three a post (skill share-groups) ───────────────
# User 2026-10-12, after a first look at sharing the post group by group from its insights page: "i see another page
# better: <the Business Suite composer> using it to repost to another group". Measured the same evening on this Page:
# the composer cannot attach an existing post ("Thêm video" offers only "Tải lên từ máy tính", so the reel's mp4 goes
# up again); the group dialog takes at most three groups a post ("Chọn tối đa 3 nhóm để đăng bài viết."); it lists 7 of
# the Page's 10 groups, scrolled to the end; and its rows carry no link, only the name and "Thành viên của N". Two of
# them are both "CHỨNG KHOÁN VIỆT" (512083 and 128365 members), so a group is its exact name plus its member count.
SHARE_JSON = ROOT / ".claude/skills/share-groups/share.json"     # the skill share-groups' own config; the Page is page.json's
BS = json.loads(SHARE_JSON.read_text(encoding="utf-8")) if SHARE_JSON.is_file() else {}
ASSET = (parse_qs(urlparse(PAGE["draftsUrl"]).query).get("asset_id") or [""])[0]
COMPOSER = (BS.get("composerUrl") or "").replace("{asset_id}", ASSET)
MAX_GROUPS = int(BS.get("maxGroupsPerPost") or 3)
POST_LABEL = BS.get("postLabel") or "Đăng"
L_TITLE = "Tạo bài viết"            # the page's heading: a click there closes a popup and changes nothing
L_DEST = "Đăng lên"                 # the destination picker reads "Đăng lên <the ticked names>"
L_MORE = "Xem thêm các nhóm"
L_GROUP_DIALOG = "Đăng lên Nhóm Facebook"
L_SAVE = "Lưu"
L_CLOSE = "Đóng"
L_ADD_VIDEO = "Thêm video"
L_UPLOAD = "Tải lên từ máy tính"
L_MEDIA = "File phương tiện"
L_DETAILS = "Chi tiết bài viết"
L_TEXT = "Hãy viết vào ô hộp thoại để thêm văn bản vào bài viết."
L_OFF = ["Đặt ngày và giờ", "Chia sẻ lên tin trên Facebook", "Quảng bá"]   # schedule, story, boost: all stay off
L_LEAVE = ["Leave", "Rời khỏi", "Leave site", "Rời khỏi trang web"]
MEMBERS_OF = re.compile(r"Thành viên của\s*([\d.,]+)")
BUSY = re.compile(r"(\d{1,3}\s?%|đang tải|đang xử lý|uploading|processing)", re.I)   # "Đang tải file phương tiện lên"
SAID_OK = re.compile(r"(đã đăng|đã được đăng|đăng thành công|đã chia sẻ|thành công)", re.I)
SAID_BAD = re.compile(r"(lỗi|không thể|thất bại|không đăng được|error|failed)", re.I)
CLICKABLE = {"AXButton", "AXLink", "AXMenuItem", "AXRadioButton", "AXCell", "AXRow", "AXCheckBox", "AXPopUpButton"}


class Fail(RuntimeError):
    """A step did not find what it needs. Nothing was posted."""


def pid_of(ref: str) -> int:
    return int(re.search(r"unix id is (\d+)", ref).group(1))


def snapshot(sess: "ax.Session", title: str):
    """The web content of OUR window as a tree of ax.Node, or None when Chrome shows none."""
    win = sess.window(title)
    if win is None:
        raise WrongWindow(f"Accessibility does not see our window {title!r}")
    wa = ax.web_area(win)
    if wa is None:
        return None
    root, n, full = ax.tree(wa)
    if not full:
        print(f"note: read the first {n} elements of the page only (cap)", file=sys.stderr)
    return root


def label_under(sess, cx: float, cy: float) -> list[str]:
    """Labels of the element on top at a screen point and its first ancestors — the peek, read by Accessibility.
    Chrome answers the FIRST hit test at a new point with an unlabelled group and the real element from the second
    on (measured 2026-10-12 at «Đăng»), so the test runs until it reads a label, three times at most."""
    out: list[str] = []
    for _ in range(3):
        el, out = ax.at(cx, cy), []
        for _ in range(6):
            if el is None:
                break
            a = el.attrs(["AXRole", "AXTitle", "AXDescription", "AXValue", "AXParent"])
            for k in ("AXTitle", "AXDescription", "AXValue"):
                if isinstance(a.get(k), str) and ax.clean(a[k]):
                    out.append(ax.clean(a[k]))
            el = a.get("AXParent") if isinstance(a.get("AXParent"), ax.Element) else None
        if out:
            return out
        time.sleep(0.4)
    return out


def press(node, what: str, delay: float = 2.2, sess=None, expect: str | None = None) -> None:
    """CGEvent click at the centre of `node`, after the focus guard, only inside our window and only where Chrome is
    the app on top (Stage Manager's strip lies over the window's left edge). With `sess` the labels under the point are
    printed (the peek); with `expect` one of them must start with it."""
    ref, _u, _t = ours()
    wx, wy, ww, wh = geometry(ref)
    r = node.rect() if node is not None else None
    if not r or r[2] < 2 or r[3] < 2:
        raise Fail(f"{what}: Accessibility gives it no visible box")
    cx, cy = r[0] + r[2] / 2, r[1] + r[3] / 2
    if not (wx <= cx <= wx + ww and wy <= cy <= wy + wh):
        raise Fail(f"{what}: ({cx:.0f},{cy:.0f}) is outside our window")
    owner = ax.owner_at(cx, cy)
    if owner is not None and owner != pid_of(ref):
        raise Fail(f"{what}: another app (pid {owner}) is on top at window ({cx - wx:.0f},{cy - wy:.0f})")
    under = label_under(sess, cx, cy) if sess is not None else []
    if expect and not any(ax.fold(u).startswith(ax.fold(expect)) for u in under):
        raise Fail(f"{what}: under the point is {under[:3]}, not «{expect}»")
    print(f"click {what} at window ({cx - wx:.0f},{cy - wy:.0f})" + (f" · under: {under[0][:48]!r}" if under else ""))
    click(int(cx), int(cy), delay=delay)


def leave_dialogs(frames: list[tuple]) -> int:
    """Answer Chrome's "Leave app? Changes you made may not be saved." for windows we just closed. It is a separate,
    unnamed dialog window, not a sheet (measured 2026-10-12 on a composer), so it is answered only when it sits over
    one of `frames` (the windows we closed): a dialog of the user's own tabs is never touched."""
    names = " or ".join(f'n is "{x}"' for x in L_LEAVE)
    out = osa('tell application "System Events"\n'
              '  set acc to ""\n'
              '  repeat with p in (every application process whose name is "Google Chrome")\n'
              '    try\n'
              '      repeat with i from 1 to (count of windows of p)\n'
              '        set w to window i of p\n'
              '        if name of w is "" then\n'
              '          set {x, y} to position of w\n'
              '          set {ww, hh} to size of w\n'
              '          repeat with b in (buttons of w)\n'
              '            set n to name of b\n'
              f'            if {names} then\n'
              '              set acc to acc & ((unix id of p) as text) & tab & i & tab & x & tab & y & tab & ww & tab & hh & tab & n & linefeed\n'
              '            end if\n'
              '          end repeat\n'
              '        end if\n'
              '      end repeat\n'
              '    end try\n'
              '  end repeat\n'
              '  return acc\n'
              'end tell')
    done = 0
    for line in out.splitlines():
        p = line.split("\t")
        if len(p) != 7:
            continue
        pid, idx = int(p[0]), int(p[1])
        x, y, w, h = (float(v) for v in p[2:6])
        cx, cy = x + w / 2, y + h / 2
        if not any(fx <= cx <= fx + fw and fy <= cy <= fy + fh for fx, fy, fw, fh in frames):
            continue
        osa(f'tell application "System Events" to click (first button of window {idx} of '
            f'(first application process whose unix id is {pid}) whose name is "{p[6]}")')
        print(f"answered Chrome's leave dialog over our window: {p[6]}")
        done += 1
    return done


def close_hard() -> None:
    """Close our app windows, answering Chrome's leave dialog for them; refuse to go on while one stays open."""
    frames = []
    for pid, idx, _m, _u, _t in app_windows():
        try:
            frames.append(geometry(win_ref(pid, idx)))
        except Exception:  # noqa: BLE001 — a window that vanished mid-scan needs no frame
            pass
    cmd_close()
    for _ in range(6):
        time.sleep(1.0)
        if not app_windows():
            return
        leave_dialogs(frames)
    left = app_windows()
    if left:
        raise WrongWindow(f"could not close {[r[3] for r in left]} — close it by hand")


def gname(s) -> str:
    """A group's name exactly as shown: 'Chứng Khoán Việt' and 'CHỨNG KHOÁN VIỆT' are two different groups."""
    return ax.clean(s)


def same_group(a: dict, b: dict) -> bool:
    """Same exact name and member counts within 2 %: a count drifts by a few between two reads (300345 → 300344)."""
    if gname(a.get("name")) != gname(b.get("name")):
        return False
    ma, mb = a.get("members"), b.get("members")
    return ma is None or mb is None or abs(ma - mb) <= max(50, 0.02 * max(ma, mb))


def tag(g: dict) -> str:
    return f"{gname(g.get('name'))} · {g.get('members') if g.get('members') is not None else '?'}"


def members_of(text: str) -> int | None:
    m = MEMBERS_OF.search(text or "")
    return int(re.sub(r"\D", "", m.group(1))) if m else None


def only(nodes: list, what: str):
    if len(nodes) != 1:
        raise Fail(f"{len(nodes)} × {what} on the page — need exactly one")
    return nodes[0]


def labelled(root, label: str, roles, dialog: bool | None = None) -> list:
    return [n for n in root.walk() if n.role in roles and ax.fold(n.label()) == ax.fold(label)
            and (dialog is None or (n.dialog() is not None) == dialog)]


def squash(s: str) -> str:
    """Letters and digits only — compares a pasted text with what the box reads back (emoji, spaces, # aside)."""
    return re.sub(r"[\W_]+", "", ax.fold(s))


def bs_root(sess):
    """Our window's tree; our window must still be the composer of this Page's Business Suite asset."""
    _ref, url, title = ours()
    if "business.facebook.com" not in url or "/composer" not in url or parse_qs(urlparse(url).query).get("asset_id", [""])[0] != ASSET:
        raise Fail(f"our window is not the composer of asset {ASSET}: {url}")
    root = snapshot(sess, title)
    if root is None:
        raise Fail("the composer exposes no Accessibility tree")
    return root


def close_popups(sess) -> None:
    """Click the page's «Tạo bài viết» heading: the picker and the hashtag suggestions close, nothing changes."""
    press(only(labelled(bs_root(sess), L_TITLE, {"AXHeading"}), f"«{L_TITLE}»"), f"«{L_TITLE}» (closes popups)", delay=1.2)


def picker_rows(root) -> list[dict] | None:
    """The open Đăng lên picker, else None: [{name, members, selected, node}]. Its rows are options (AXStaticText to
    Chrome) with children, ticked when AXSelected; the Page's own row has no member count, Instagram's is disabled."""
    lists = [n for n in root.walk() if n.role == "AXList" and ax.fold(n.label()) == ax.fold(L_DEST)]
    if not lists:
        return None
    rows = []
    for n in lists[0].walk():
        r = n.rect()
        if n.role != "AXStaticText" or not n.kids or not r or r[3] < 30 or n.el.attr("AXEnabled") is False:
            continue
        rows.append({"name": gname(n.label()), "members": members_of(n.text(300)),
                     "selected": n.el.attr("AXSelected") is True, "node": n})
    return rows


def open_picker(sess):
    root = bs_root(sess)
    rows = picker_rows(root)
    if rows is None:
        combo = only([n for n in root.walk() if n.role == "AXComboBox" and ax.fold(n.label()).startswith(ax.fold(L_DEST))],
                     f"«{L_DEST} …» picker")
        press(combo, f"the «{L_DEST}» picker", sess=sess, expect=L_DEST)
        root = bs_root(sess)
        rows = picker_rows(root)
        if rows is None:
            raise Fail(f"the «{L_DEST}» picker did not open")
    return root, rows


def check_picker(sess, want: list[dict]) -> None:
    """The picker must tick exactly `want` and NOT the Page itself (that would post the reel on the Page a second
    time). A ticked Page row is unticked once; anything else wrong stops the run."""
    for attempt in range(2):
        root, rows = open_picker(sess)
        page = [r for r in rows if r["members"] is None and r["name"] == gname(PAGE["name"])]
        if len(page) != 1:
            raise Fail(f"the picker shows {len(page)} row(s) for the Page {PAGE['name']!r}")
        if page[0]["selected"]:
            if attempt:
                raise Fail(f"the Page {PAGE['name']} stays ticked in «{L_DEST}»")
            press(page[0]["node"], f"untick the Page {PAGE['name']}", sess=sess, delay=1.5)
            continue
        got = [r for r in rows if r["members"] is not None and r["selected"]]
        if len(got) != len(want) or not all(any(same_group(g, w) for w in want) for g in got):
            raise Fail(f"«{L_DEST}» ticks {[tag(g) for g in got]}, not {[tag(w) for w in want]}")
        close_popups(sess)
        return


def dialog_open(root) -> bool:
    return bool(labelled(root, L_GROUP_DIALOG, {"AXHeading"}, dialog=True))


def dialog_rows(root) -> list[dict]:
    """The group dialog's rows in list order: [{name, members, checked, node}]."""
    rows = []
    for n in root.walk():
        if n.role != "AXCheckBox" or n.dialog() is None:
            continue
        box = next((a for a in list(n.ancestors())[:5] if len(MEMBERS_OF.findall(a.text(400))) == 1), None)
        rows.append({"name": gname(n.label()), "members": members_of(box.text(400)) if box is not None else None,
                     "checked": n.el.attr("AXValue") in (1, 1.0, True), "node": n})
    return rows


def open_group_dialog(sess):
    root = bs_root(sess)
    if not dialog_open(root):
        root, _rows = open_picker(sess)
        press(only(labelled(root, L_MORE, {"AXLink"}), f"«{L_MORE}»"), f"«{L_MORE}»", sess=sess)
        root = bs_root(sess)
        if not dialog_open(root):
            raise Fail("the group dialog did not open")
    return root


def scroll_dialog(root, notches: int) -> None:
    rows = dialog_rows(root)
    dlg = rows[0]["node"].dialog() if rows else None
    d = dlg.rect() if dlg is not None else None
    if not d:
        raise Fail("the group dialog has no box")
    ours()
    wheel(int(d[0] + d[2] / 2), int(d[1] + d[3] / 2), notches)
    time.sleep(0.6)


def all_groups(sess) -> list[dict]:
    """Every row of the group dialog, its list scrolled to the end (a longer list may render rows only as they come)."""
    root = open_group_dialog(sess)
    seen: list[dict] = []
    for _ in range(15):
        rows = dialog_rows(root)
        new = [r for r in rows if not any(same_group(r, s) for s in seen)]
        seen += new
        if seen and not new:
            break
        scroll_dialog(root, 6)
        root = bs_root(sess)
    scroll_dialog(root, -30)
    return [{"name": r["name"], "members": r["members"], "checked": r["checked"]} for r in seen]


def in_view(sess, want: dict):
    """The dialog row of `want`, scrolled fully into view first (Chrome clips a box at the list's edge: 25×8)."""
    for _ in range(10):
        root = bs_root(sess)
        rows = dialog_rows(root)
        hits = [i for i, r in enumerate(rows) if same_group(r, want)]
        if len(hits) != 1:
            raise Fail(f"{len(hits)} rows of the group dialog match {tag(want)}")
        r = rows[hits[0]]["node"].rect()
        if r and r[3] >= 20:
            return rows[hits[0]]
        shown = [i for i, x in enumerate(rows) if (x["node"].rect() or (0, 0, 0, 0))[3] >= 20]
        scroll_dialog(root, 2 if not shown or hits[0] > max(shown) else -2)
    raise Fail(f"could not scroll {tag(want)} into view")


def pick_groups(sess, want: list[dict]) -> None:
    """Tick exactly `want` in the group dialog — every other box off first, since it takes at most MAX_GROUPS — read
    the boxes back, «Lưu», then check the picker (and that the Page itself stays unticked)."""
    open_group_dialog(sess)
    wanted = lambda r: any(same_group(r, w) for w in want)  # noqa: E731
    tries: dict[str, int] = {}
    for phase in ("off", "on"):
        while True:
            rows = dialog_rows(bs_root(sess))
            todo = [r for r in rows if ((r["checked"] and not wanted(r)) if phase == "off" else (not r["checked"] and wanted(r)))]
            if not todo:
                break
            k = f"{phase} {tag(todo[0])}"
            tries[k] = tries.get(k, 0) + 1
            if tries[k] > 2:
                raise Fail(f"the box of {tag(todo[0])} does not turn {phase}")
            row = in_view(sess, todo[0])
            press(row["node"], f"{'untick' if phase == 'off' else 'tick'} {tag(row)}", sess=sess, delay=1.0)
    rows = dialog_rows(bs_root(sess))
    ticked = [r for r in rows if r["checked"]]
    missing = [w for w in want if not any(same_group(r, w) for r in rows)]
    if missing:
        raise Fail(f"not in Business Suite's group list: {[tag(w) for w in missing]}")
    if len(ticked) != len(want) or not all(wanted(r) for r in ticked):
        raise Fail(f"the dialog ticks {[tag(r) for r in ticked]}, not {[tag(w) for w in want]}")
    root = bs_root(sess)
    press(only(labelled(root, L_SAVE, {"AXButton"}, dialog=True), f"«{L_SAVE}» of the group dialog"), f"«{L_SAVE}»", sess=sess)
    if dialog_open(bs_root(sess)):
        raise Fail(f"the group dialog stayed open after «{L_SAVE}»")
    check_picker(sess, want)


def media_state(root) -> dict:
    """The «File phương tiện» card (its own column, from its heading down to «Chi tiết bài viết»; the sidebar shares
    those rows): its texts, how many items it holds — one «Gỡ video»/«Gỡ ảnh» button each (measured 2026-10-12: an
    uploaded reel is a row "1080 × 1920 • 2:56 phút" with «Chỉnh sửa video» and «Gỡ video») — and whether a text says
    it is still working ("Đang tải file phương tiện lên", "Đang tải bản xem trước")."""
    head = only(labelled(root, L_MEDIA, {"AXHeading"}), f"«{L_MEDIA}»").rect()
    bottom = only(labelled(root, L_DETAILS, {"AXHeading"}), f"«{L_DETAILS}»").rect()[1]
    texts, media = [], 0
    for n in root.walk():
        r = n.rect()
        if not r or not (head[1] < r[1] + r[3] / 2 < bottom) or not (head[0] - 20 <= r[0] + r[2] / 2 <= head[0] + head[2] + 20):
            continue
        if n.role == "AXStaticText" and n.value:
            texts.append(n.value)
        elif n.role == "AXButton" and ax.fold(n.label()).startswith("gỡ "):
            media += 1
    return {"texts": texts, "media": media, "busy": any(BUSY.search(t) for t in texts)}


def attach_video(sess, path: Path) -> None:
    root = bs_root(sess)
    st = media_state(root)
    if st["media"]:
        raise Fail(f"the composer already holds media ({' | '.join(st['texts'])[:80]}) — not adding the reel twice")
    press(only(labelled(root, L_ADD_VIDEO, {"AXPopUpButton", "AXButton"}), f"«{L_ADD_VIDEO}»"), f"«{L_ADD_VIDEO}»",
          sess=sess, expect=L_ADD_VIDEO)
    item = only(labelled(bs_root(sess), L_UPLOAD, {"AXMenuItem", "AXButton"}), f"«{L_UPLOAD}»")
    press(item, f"«{L_UPLOAD}»", sess=sess)            # a menu: no `expect` (see press)
    if not sc.wait_for_file_dialog(15):
        raise Fail(f"no file dialog after «{L_UPLOAD}» — nothing was typed")
    sc.dialog_open_path(str(path), settle=4.0)
    t0, quiet, last = time.time(), 0, None
    while time.time() - t0 < 900:
        time.sleep(4)
        root = bs_root(sess)
        st = media_state(root)
        ready = [b for b in labelled(root, POST_LABEL, {"AXButton"}, dialog=False) if b.el.attr("AXEnabled") is not False]
        quiet = quiet + 1 if st["media"] == 1 and not st["busy"] and ready else 0
        now = f"media {st['media']} · {'busy' if st['busy'] else 'idle'} · {' | '.join(st['texts'])[:100]}"
        if now != last:
            print(f"  upload {time.time() - t0:3.0f}s · {now}")
            last = now
        if st["media"] > 1:
            raise Fail(f"the media card holds {st['media']} items — the reel went in twice")
        if quiet >= 3:
            return
    raise Fail("the video did not finish uploading in 15 min")


def write_text(sess, text: str) -> None:
    box = only(labelled(bs_root(sess), L_TEXT, {"AXTextArea"}), "the text box")
    if ax.clean(box.el.attr("AXValue") or ""):
        raise Fail("the text box already holds text — not adding to it")
    press(box, "the text box", sess=sess)
    ours()
    sc.paste(text, delay=2.5)
    close_popups(sess)                                  # the hashtag suggestions open under the caret
    box = only(labelled(bs_root(sess), L_TEXT, {"AXTextArea"}), "the text box")
    got = box.el.attr("AXValue") or box.text(4000)
    if squash(text) not in squash(got if isinstance(got, str) else ""):
        raise Fail(f"the text box reads back {str(got)[:80]!r}, not the text")


def all_off(root) -> None:
    for lab in L_OFF:
        sw = only(labelled(root, lab, {"AXCheckBox"}), f"the switch «{lab}»")
        if sw.el.attr("AXValue") not in (0, 0.0, False):
            raise Fail(f"«{lab}» is on — this post goes out now, to the groups only, unboosted; nothing was changed")


def page_texts(root) -> set[str]:
    return {n.value for n in root.walk() if n.role == "AXStaticText" and n.value}


def outcome(sess, before: set[str], t_max: float = 180.0) -> tuple[str, str]:
    """After «Đăng»: ('posted', how) when the composer closes, resets, or a NEW text says so; ('unsure', why) on a new
    error text or silence. Every doubt after the click is 'unsure': the run stops and the groups are checked by hand."""
    t0 = time.time()
    while time.time() - t0 < t_max:
        time.sleep(3)
        try:
            _ref, url, title = ours()
        except WrongWindow as e:
            return "unsure", f"lost our window after the click: {e}"
        if "/composer" not in url:
            return "posted", f"the composer closed → {url}"
        root = snapshot(sess, title)
        if root is None:
            continue
        new = page_texts(root) - before
        bad = sorted(t for t in new if SAID_BAD.search(t))
        if bad:
            return "unsure", f"the page says: {bad[0][:160]}"
        ok = sorted(t for t in new if SAID_OK.search(t))
        if ok:
            return "posted", f"the page says: {ok[0][:160]}"
        btn = labelled(root, POST_LABEL, {"AXButton"}, dialog=False)
        boxes = labelled(root, L_TEXT, {"AXTextArea"})
        if not btn or (len(boxes) == 1 and not ax.clean(boxes[0].el.attr("AXValue") or "") and not media_state(root)["media"]):
            return "posted", "the composer emptied itself"
    return "unsure", f"no sign of the post {t_max:.0f} s after «{POST_LABEL}»"


def cmd_bsgroups(out_path: Path) -> int:
    """Read Business Suite's group list (the dialog behind «Xem thêm các nhóm»), close it unsaved, write the JSON."""
    try:
        close_hard()
        cmd_open(COMPOSER)
        ref, _u, _t = ours()
        with ax.Session(pid_of(ref)) as sess:
            rows = all_groups(sess)
            x = only(labelled(bs_root(sess), L_CLOSE, {"AXButton"}, dialog=True), f"«{L_CLOSE}» of the group dialog")
            press(x, f"«{L_CLOSE}» of the group dialog (nothing saved)", sess=sess)
        close_hard()
    except Fail as e:
        print(f"failed — {e}")
        return 1
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for r in rows:
        print(f"  {tag(r)}{'  (ticked when the composer opened)' if r['checked'] else ''}")
    print(f"{len(rows)} group(s) in Business Suite → {out_path.relative_to(ROOT)}")
    return 0 if rows else 1


def choose(rows: list[dict], spec: dict) -> list[dict]:
    """Up to MAX_GROUPS of the dialog's rows, in its order, that are still missing: a joined name with groups left to reach
    (spec.missing [{name, count}]) and not a group this reel already went to (spec.posted [{name, members}])."""
    need = {gname(m["name"]): int(m.get("count") or 1) for m in spec.get("missing", [])}
    posted = spec.get("posted", [])
    picked: list[dict] = []
    for r in rows:
        if need.get(r["name"], 0) <= 0 or any(same_group(r, p) for p in posted + picked):
            continue
        picked.append({"name": r["name"], "members": r["members"]})
        need[r["name"]] -= 1
        if len(picked) == MAX_GROUPS:
            break
    return picked


def cmd_bspost(video: str, file: str, groups_file: str, dry: bool) -> int:
    """ONE post into 1..MAX_GROUPS groups. --groups is either the groups themselves [{name, members}] or what is still
    missing {missing: [{name, count}], posted: [{name, members}]}: then the groups are chosen in the open dialog, from
    what Business Suite shows at that moment (it shows at most seven and rotates them). The last line is
    `RESULT {"status", "groups", "why"}`; exit 0 posted (or dry), 1 failed (nothing posted), 3 aborted before any input,
    4 unsure (Đăng was clicked), 5 absent (none of the missing groups is in the dialog now — nothing posted)."""
    path = Path(video).resolve()
    text = Path(file).read_text(encoding="utf-8").strip() if Path(file).is_file() else ""
    want: list[dict] = []
    clicked = False

    def finish(status: str, why: str, code: int) -> int:
        print(f"{status} {'; '.join(tag(g) for g in want) or '-'} — {why}")
        print("RESULT " + json.dumps({"status": status, "groups": want, "why": why}, ensure_ascii=False))
        return code

    try:
        spec = json.loads(Path(groups_file).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return finish("failed", f"groups file {groups_file}: {e}", 1)
    if isinstance(spec, list):
        want = [{"name": gname(g.get("name")), "members": g.get("members")} for g in spec if isinstance(g, dict) and g.get("name")]
        if not 1 <= len(want) <= MAX_GROUPS or len(want) != len(spec):
            return finish("failed", f"need 1..{MAX_GROUPS} groups [{{name, members}}] in {groups_file}", 1)
    elif not (isinstance(spec, dict) and isinstance(spec.get("missing"), list) and spec["missing"]):
        return finish("failed", f"{groups_file} is neither [{{name, members}}] nor {{missing, posted}}", 1)
    problem = (f"no mp4 at {path}" if path.suffix.lower() != ".mp4" or not path.is_file()
               else f"empty or missing text file {file}" if not text
               else "share-groups/share.json composerUrl or page.json draftsUrl's asset_id is missing" if not COMPOSER or not ASSET else "")
    if problem:
        return finish("failed", problem, 1)
    try:
        close_hard()
        cmd_open(COMPOSER)
        ref, _u, _t = ours()
        with ax.Session(pid_of(ref)) as sess:
            if not want:
                rows = all_groups(sess)
                want = choose(rows, spec)
                print(f"Business Suite shows {len(rows)}: {'  |  '.join(tag(r) for r in rows)}")
                if not want:
                    x = only(labelled(bs_root(sess), L_CLOSE, {"AXButton"}, dialog=True), f"«{L_CLOSE}» of the group dialog")
                    press(x, f"«{L_CLOSE}» of the group dialog (nothing saved)", sess=sess)
                    close_hard()
                    return finish("absent", "none of the missing groups is in Business Suite's list right now", 5)
            print("CHOSEN " + json.dumps(want, ensure_ascii=False), flush=True)   # the run's log knows them even if this dies
            pick_groups(sess, want)
            attach_video(sess, path)
            write_text(sess, text)
            all_off(bs_root(sess))
            check_picker(sess, want)                   # once more, after every edit
            root = bs_root(sess)
            btn = only(labelled(root, POST_LABEL, {"AXButton"}, dialog=False), f"«{POST_LABEL}»")
            if btn.el.attr("AXEnabled") is False:
                raise Fail(f"«{POST_LABEL}» is disabled")
            shot()
            r = btn.rect()
            wx, wy, _w, _h = geometry(ours()[0])
            cmd_peek(int(r[0] + r[2] / 2 - wx), int(r[1] + r[3] / 2 - wy))
            if dry:
                return finish("dry", f"groups, video, text and switches set; «{POST_LABEL}» NOT clicked. Read "
                              "out/publish/shot.png; the window stays open (fb.py close)", 0)
            before = page_texts(root)
            clicked = True
            press(btn, f"«{POST_LABEL}»", sess=sess, expect=POST_LABEL)
            status, how = outcome(sess, before)
            try:
                shot()
            except Exception:  # noqa: BLE001
                pass
            if status == "posted":
                close_hard()
                return finish("posted", how, 0)
            return finish("unsure", how, 4)
    except WrongWindow as e:
        return finish("unsure" if clicked else "failed", f"ABORTED: {e}. Leave Chrome alone and run the step again.", 4 if clicked else 3)
    except Fail as e:
        try:
            shot()
        except Exception:  # noqa: BLE001
            pass
        return finish("unsure" if clicked else "failed", str(e), 4 if clicked else 1)
    except Exception as e:  # noqa: BLE001 — after the click any error leaves the post unknown
        return finish("unsure" if clicked else "failed", f"{type(e).__name__}: {e}", 4 if clicked else 1)


# ── every group the Page joined: share-groups' target (facebook.com/groups/joins, read AS THE PAGE) ──────────────
# Business Suite's group dialog is not that list: it shows at most seven groups and reorders them after each post (measured
# 2026-10-12: before the first post it held 7 of the 10, after three posts another 7, two of them new) — so the fan-out
# reads it again after every post and stops only when every joined group has the reel.
JOINS = "https://www.facebook.com/groups/joins/?nav_source=tab"
GROUP_URL = re.compile(r"^https?://(?:[a-z0-9-]+\.)?facebook\.com/groups/([^/?#]+)/?(?:[?#].*)?$", re.I)
NOT_GROUP = {"joins", "feed", "discover", "create", "notifications", "search", "you", "categories", "browse",
             "learning_units", "your_groups", "invites", "membership_questions"}
GENERIC = {"xem nhóm", "truy cập nhóm", "view group", "visit group", "xem thêm", "see more", "tham gia nhóm", "join group"}
AVATAR_OF = re.compile(r"^Ảnh đại diện của nhóm\s+", re.I)
ACTIVITY = re.compile(r"\s+Lần (?:hoạt động|truy cập)", re.I)      # a sidebar link reads "<name> Lần hoạt động gần nhất: …"
JOINED_COUNT = re.compile(r"đã tham gia \((\d+)\)", re.I)


def first_text(node) -> str:
    """A link's name: its accessible name, else its FIRST text (a row link also holds 'Lần truy cập …')."""
    if node.label():
        return node.label()
    for n in node.walk():
        if n.role == "AXStaticText" and n.value:
            return n.value
    return ""


def joined_rows(root) -> dict[str, dict]:
    """{id: {id, name, url}} from the links to /groups/<id>/ on the page."""
    rows: dict[str, dict] = {}
    for n in root.walk():
        m = GROUP_URL.match(n.url or "") if n.role == "AXLink" else None
        if not m or m.group(1).lower() in NOT_GROUP:
            continue
        row = rows.setdefault(m.group(1), {"id": m.group(1), "name": "", "url": f"https://www.facebook.com/groups/{m.group(1)}/"})
        name = ACTIVITY.split(AVATAR_OF.sub("", ax.clean(first_text(n))))[0].strip()
        if name and ax.fold(name) not in GENERIC and not row["name"]:
            row["name"] = name
    return {k: v for k, v in rows.items() if v["name"]}


def cmd_groups(out_path: Path) -> int:
    """AS THE PAGE: every group it joined, scrolling the joins page until no new row; writes [{id, name, url}]."""
    close_hard()
    if not page_ok():
        return 3
    cmd_open(JOINS)
    found: dict[str, dict] = {}
    said = None
    ref, _u, _t = ours()
    with ax.Session(pid_of(ref)) as sess:
        still = 0
        for rnd in range(30):
            ref, _u, title = ours()
            root = snapshot(sess, title)
            rows = joined_rows(root) if root is not None else {}
            if root is not None and said is None:
                said = next((int(m.group(1)) for m in (JOINED_COUNT.search(t) for t in page_texts(root)) if m), None)
            new = [k for k in rows if k not in found]
            for k, v in rows.items():
                found.setdefault(k, v)
            print(f"round {rnd + 1}: {len(rows)} group link(s), {len(new)} new, {len(found)} in all")
            still = 0 if new else still + 1
            if still >= 2 or (said is not None and len(found) >= said and not new):
                break
            wx, wy, ww, wh = geometry(ref)
            ours()
            wheel(wx + int(ww * 0.62), wy + int(wh * 0.6), 8)   # the main column loads more as it scrolls
            time.sleep(2.0)
    close_hard()
    rows = list(found.values())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for r in rows:
        print(f"  {r['name']}  {r['url']}")
    print(f"{len(rows)} group(s) joined → {out_path.relative_to(ROOT)}"
          + (f" (the page says {said})" if said is not None else "") + ("  MISMATCH" if said is not None and said != len(rows) else ""))
    return 0 if rows and (said is None or said == len(rows)) else 1


def run_flow(a: list[str]) -> int:
    opts = {k: v for k, _, v in (x[2:].partition("=") for x in a[1:] if x.startswith("--"))}
    try:
        if a[0] == "bsgroups":
            return cmd_bsgroups(ROOT / (opts.get("out") or "out/publish/bs-groups.json"))
        if a[0] == "groups":
            return cmd_groups(ROOT / (opts.get("out") or "out/publish/groups.json"))
        if not all(opts.get(k) for k in ("video", "file", "groups")):
            print(__doc__)
            return 2
        return cmd_bspost(opts["video"], opts["file"], opts["groups"], "dry" in opts)
    except WrongWindow as e:
        print(f"failed - — ABORTED before any input: {e}. Leave Chrome alone and run the step again.")
        return 3


def main() -> None:
    a = sys.argv[1:] or ["help"]
    if a[0] in ("groups", "bsgroups", "bspost"):
        sys.exit(run_flow(a))
    cmds = {
        "whoami": lambda: sys.exit(cmd_whoami()),
        "open": lambda: cmd_open(a[1]),
        "shot": shot,
        "peek": lambda: cmd_peek(int(a[1]), int(a[2])),
        "click": lambda: cmd_click(int(a[1]), int(a[2])),
        "paste": lambda: cmd_paste(Path(a[2]).read_text(encoding="utf-8").strip() if a[1:2] == ["--file"] else " ".join(a[1:])),
        "key": lambda: cmd_key(int(a[1]), "cmd" in a[2:], "shift" in a[2:]),
        "upload": lambda: cmd_upload(a[1]),
        "close": cmd_close,
    }
    if a[0] not in cmds:
        sys.exit(__doc__)
    try:
        cmds[a[0]]()
    except IndexError:
        sys.exit(__doc__)   # a command without its arguments
    except WrongWindow as e:
        sys.exit(f"fb: ABORTED before any input — {e}. Leave Chrome alone and run the step again.")


if __name__ == "__main__":
    main()
