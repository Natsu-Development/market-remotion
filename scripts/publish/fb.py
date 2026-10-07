#!/usr/bin/env python
"""Step-by-step driver for the skill publish-video: ONE Chrome app window on facebook.com in the
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

Run with ../video-factory/.venv/bin/python. It never clicks "Đăng": which button a click lands on
is the operator's job, from the capture and a peek.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from shoot_real import WrongWindow, capture as grab, click, close_window, geometry, osa, sc, win_ref  # noqa: E402

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


def cmd_whoami() -> int:
    """/me resolves to whoever Facebook is acting as; the app window has no address bar, so the URL
    comes from AXDocument. The Page id is the check: for this Page the title is only
    "Facebook - <profile>" (measured 2026-10-01), and avatars do not tell a Page from a person."""
    url = cmd_open("me", tag="whoami")
    u = urlparse(url)
    if PAGE["pageId"] in parse_qs(u.query).get("id", []) or f"/{PAGE['pageId']}" in u.path:
        cmd_close()
        print(f"OK — Facebook is acting as {PAGE['name']} (id {PAGE['pageId']}).")
        return 0
    print(f"STOP — /me is {url}, not Page {PAGE['pageId']}. Switch in THIS window: avatar top right → "
          f"{PAGE['name']} in the account switcher, then run whoami again. The window stays open.")
    return 1


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


def main() -> None:
    a = sys.argv[1:] or ["help"]
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
