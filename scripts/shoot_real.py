#!/usr/bin/env python
"""Photograph a page in the user's REAL Chrome — the profile they are signed in with.

    ../video-factory/.venv/bin/python scripts/shoot_real.py --url https://fireant.vn/charts \
        --symbol VNINDEX --out public/shots/fireant-vnindex.png

Why this exists next to scripts/shoot.mjs: Chrome 136+ refuses DevTools on the profile in daily
use, and a copied profile is not the same login (video-factory measured that for Facebook;
FireAnt showed the same). So, exactly like video-factory's publish step, this drives the real
Chrome with OS-level mouse/keyboard events (CGEvent) and reads the screen with `screencapture`.
It reuses video-factory's `steps/screen.py`; run it with that repo's venv Python.

How it works
  1. `open -na "Google Chrome" --args --profile-directory=<dir> --app=<url>` opens an APP WINDOW
     (no tab strip, no omnibox) inside the running Chrome for that profile. Same cookies and
     login as the user's tabs; nothing of theirs is touched; the window is closed afterwards.
  2. The window is placed at a fixed size, raised, and checked: its title must end in the
     profile's name and Chrome must be frontmost, before EVERY click or key (video-factory rule).
  3. Where the page starts inside the window is measured from a capture (first dark row), not
     assumed — Chrome exposes no accessibility geometry for its own chrome.
  4. --fullscreen-chart presses Shift+F, TradingView's own shortcut, so the chart fills the
     page area; --symbol then clicks the symbol box, PASTES the ticker (the Vietnamese Telex input
     source mangles typed ASCII), waits for the result list, and presses Return.
  5. `screencapture -R` of the page area (points; PNG comes out at Retina 2x), plus a .json
     sidecar in the same shape shoot.mjs writes.

Prerequisites: Accessibility and Screen Recording permission for the terminal running this.
Do not touch the mouse or keyboard while it runs (~25 s).
"""

from __future__ import annotations

import argparse
import json
import struct
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEO_FACTORY = ROOT.parent / "video-factory"
sys.path.insert(0, str(VIDEO_FACTORY))
try:
    import steps.screen as sc  # noqa: E402
except ImportError as e:  # pragma: no cover
    sys.exit(f"shoot_real: cannot import video-factory/steps/screen.py ({e}). "
             f"Run with {VIDEO_FACTORY}/.venv/bin/python.")


def click(x: int, y: int, delay: float = 0.6) -> None:
    """Left click that web content recognises as a click.

    video-factory's `screen.click()` posts mouse-down/up without a click count. Chrome turns
    that into hover plus button state but fires no `click` event: measured 2026-09-22 on
    FireAnt's symbol box — tooltip appeared, dialog never opened. Setting
    kCGMouseEventClickState = 1 makes it a real single click.
    """
    import Quartz
    sc.move(x, y)
    for kind in (Quartz.kCGEventLeftMouseDown, Quartz.kCGEventLeftMouseUp):
        e = Quartz.CGEventCreateMouseEvent(None, kind, (x, y), Quartz.kCGMouseButtonLeft)
        Quartz.CGEventSetIntegerValueField(e, Quartz.kCGMouseEventClickState, 1)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(0.05)
    time.sleep(delay)


def key_alt(code: int, delay: float = 0.8) -> None:
    """Option+key. steps/screen.py's key() knows only cmd/shift; TradingView's reset view is ⌥R."""
    import Quartz
    for down in (True, False):
        e = Quartz.CGEventCreateKeyboardEvent(None, code, down)
        Quartz.CGEventSetFlags(e, Quartz.kCGEventFlagMaskAlternate)   # ALWAYS set flags (see screen.py)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(0.05)
    time.sleep(delay)


def drag(x: int, y: int, dx: int, steps: int = 12, delay: float = 1.2) -> None:
    """Left-button drag from (x, y) by dx points, in steps. On a TradingView pane this PANS the
    time axis 1:1 in points: a negative dx (drag left) brings later dates into view. Deterministic,
    unlike wheel zoom, which anchors on the pointer and pans as much as it zooms (2026-09-23)."""
    import Quartz
    sc.move(x, y)
    time.sleep(0.15)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(
        None, Quartz.kCGEventLeftMouseDown, (x, y), Quartz.kCGMouseButtonLeft))
    time.sleep(0.08)
    for i in range(1, steps + 1):
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(
            None, Quartz.kCGEventLeftMouseDragged, (x + dx * i / steps, y), Quartz.kCGMouseButtonLeft))
        time.sleep(0.03)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(
        None, Quartz.kCGEventLeftMouseUp, (x + dx, y), Quartz.kCGMouseButtonLeft))
    time.sleep(delay)


def wheel(x: int, y: int, notches: int, delay: float = 0.25) -> None:
    """Vertical scroll-wheel over the chart: TradingView zooms the time axis (down = out)."""
    import Quartz
    sc.move(x, y)
    time.sleep(0.2)
    for _ in range(abs(notches)):
        e = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 1, -3 if notches > 0 else 3)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(delay)
    time.sleep(0.8)


def osa(script: str) -> str:
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"osascript: {r.stderr.strip()}", file=sys.stderr)
    return (r.stdout or "").strip()


def win_ref(pid: int, idx: int) -> str:
    return f"window {idx} of (first application process whose unix id is {pid})"


def app_windows(title_contains: str, profile_title: str) -> list[tuple[int, int, bool, str]]:
    """Every Chrome APP window (pid, idx, isMain, url) whose title has both fragments.

    An app window's title is "<page> - <profile>"; a normal window's is
    "<page> - Google Chrome - <profile>". That middle part is what tells ours apart from the
    user's own tab showing the same site. Window indices follow z-order and shift whenever a
    window opens, so never keep (pid, idx) across steps — re-resolve, and prefer the AXMain one.
    """
    out = osa('tell application "System Events"\n'
              '  set acc to ""\n'
              '  repeat with p in (every application process whose name is "Google Chrome")\n'
              '    repeat with i from 1 to (count of windows of p)\n'
              '      set w to window i of p\n'
              '      set n to name of w\n'
              f'      if n contains "{title_contains}" and n contains "{profile_title}" '
              'and n does not contain " - Google Chrome - " then\n'
              '        set m to "false"\n'
              '        try\n'
              '          set m to (value of attribute "AXMain" of w) as text\n'
              '        end try\n'
              '        set d to ""\n'
              '        try\n'
              '          set d to (value of attribute "AXDocument" of w) as text\n'
              '        end try\n'
              '        set acc to acc & ((unix id of p) as text) & tab & (i as text) & tab & m & tab & d & linefeed\n'
              '      end if\n'
              '    end repeat\n'
              '  end repeat\n'
              '  return acc\n'
              'end tell')
    rows = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 4:
            rows.append((int(parts[0]), int(parts[1]), parts[2] == "true", parts[3]))
    return rows


def our_window(title_contains: str, profile_title: str, url: str):
    """The AXMain app window on our URL, or None."""
    for pid, idx, main, doc in app_windows(title_contains, profile_title):
        if main and doc.startswith(url.split("#")[0].split("?")[0]):
            return pid, idx
    return None


class WrongWindow(RuntimeError):
    """The focused window is not the app window this script opened. Never type into it."""


def focused_ours(title_contains: str, profile_title: str, url: str) -> str:
    """Reference to OUR app window, which must be the AXMain window right now.

    Incident 2026-09-22: the user opened a Claude.ai tab in the same profile mid-run; the old
    guard (Chrome frontmost + profile name in the title) passed, and the ticker was pasted into
    their chat and sent. Ours is the AXMain window whose title has no " - Google Chrome - "
    (an app window) and whose AXDocument is our URL. Anything else aborts before any input.
    Window indices shift with z-order, so this is re-resolved before every single action.
    """
    if sc.frontmost_app() != "Google Chrome":
        raise WrongWindow(f"{sc.frontmost_app()!r} is in front, not Chrome")
    mine = our_window(title_contains, profile_title, url)
    if not mine:
        rows = app_windows(title_contains, profile_title)
        raise WrongWindow("our FireAnt app window is not the focused window "
                          f"(app windows seen: {[(r[2], r[3]) for r in rows]}); focused: {sc.chrome_focused()[2]!r}")
    return win_ref(*mine)


def geometry(ref: str) -> tuple[int, int, int, int]:
    out = osa('tell application "System Events"\n'
              f'  set p to position of {ref}\n'
              f'  set s to size of {ref}\n'
              '  return ((item 1 of p) as text) & "," & ((item 2 of p) as text) & "," '
              '& ((item 1 of s) as text) & "," & ((item 2 of s) as text)\n'
              'end tell')
    try:
        x, y, w, h = (int(float(v)) for v in out.split(","))
    except ValueError:
        sys.exit(f"shoot_real: could not read the window geometry (got {out!r})")
    return x, y, w, h


def close_window(ref: str) -> None:
    osa(f'tell application "System Events" to perform action "AXPress" of '
        f'(first button of {ref} whose subrole is "AXCloseButton")')


def capture(rect: tuple[int, int, int, int], out: Path) -> tuple[int, int]:
    x, y, w, h = rect
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["screencapture", "-x", "-o", "-R", f"{x},{y},{w},{h}", str(out)], check=True)
    data = out.read_bytes()
    pw, ph = struct.unpack(">II", data[16:24])
    return pw, ph


def page_top_offset(window_rect: tuple[int, int, int, int], tmp: Path) -> int:
    """Points from the window's top edge to the first row of the PAGE (a dark page under a
    light title bar). Falls back to 40, the app-window title bar measured 2026-09-22."""
    try:
        from PIL import Image
    except ImportError:
        return 40
    pw, ph = capture(window_rect, tmp)
    img = Image.open(tmp).convert("L")
    scale = pw / window_rect[2]
    w, h = img.size
    xs = range(w // 4, 3 * w // 4, max(1, w // 40))
    for row in range(0, min(h, int(120 * scale))):
        mean = sum(img.getpixel((x, row)) for x in xs) / len(xs)
        if mean < 80:
            return int(round(row / scale))
    return 40


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--symbol")
    ap.add_argument("--site")
    ap.add_argument("--title-contains", default="FireAnt", help="fragment of the page title, to find our window")
    ap.add_argument("--profile-dir", default="Default")
    ap.add_argument("--profile-title", required=True, help="profile name Chrome appends to window titles (shoot.mjs passes it)")
    ap.add_argument("--size", default="1080x640", help="window size in points; the display is 1080 wide")
    ap.add_argument("--wait", type=float, default=8.0)
    ap.add_argument("--fullscreen-chart", action="store_true",
                    help="Shift+F: TradingView chart fills the page. Measured 2026-09-22: FireAnt's embed ignores it")
    ap.add_argument("--symbol-box", default="48,104",
                    help="x,y of the chart's symbol search box inside the page area (points). FireAnt at 1080 wide: 48,104")
    ap.add_argument("--interval", choices=["D", "W", "2W", "M"],
                    help="FireAnt: click that interval favourite in the chart toolbar (the user pinned D W 2W M)")
    ap.add_argument("--reset-view", action="store_true",
                    help="Option+R in the chart after the interval click: TradingView's reset view — default zoom, latest bar at the right edge. "
                         "Needed after --interval: a resolution switch keeps the BAR COUNT anchored left, so recent years slide off the right (2026-09-23)")
    ap.add_argument("--pan", type=int, default=0,
                    help="drag the price pane horizontally by this many points after the interval/reset steps; "
                         "negative = drag left = show later dates (after --range=5y --interval=M the view sits 2006-2020, ~4.1pt/month)")
    ap.add_argument("--zoom-out", type=int, default=0,
                    help="FireAnt: mouse-wheel notches over the chart to show more history (about 15%% per notch)")
    ap.add_argument("--indicator", default=None,
                    help="FireAnt: add this indicator through the fx dialog (e.g. MACD). It is SAVED into the user's chart layout — only when they asked")
    ap.add_argument("--range", choices=["5y", "1y", "6p", "3p", "1p", "5n", "1n"],
                    help="FireAnt time-range button to press (5y..1n = 5 năm .. 1 ngày); positions measured at 1080x640")
    ap.add_argument("--crop", default=None,
                    help="what to capture, in page-area points: x,y,w,h — 'chart' for FireAnt's chart frame — 'full' for the page area")
    ap.add_argument("--keep-open", action="store_true")
    ap.add_argument("--debug", action="store_true", help="save a frame of the page area after every input step")
    a = ap.parse_args()

    W, H = (int(v) for v in a.size.lower().split("x"))
    out = Path(a.out)
    if not out.is_absolute():
        out = ROOT / out

    if sc.input_source and "Telex" in (sc.input_source() or ""):
        print("note: Vietnamese Telex input source is active — text is pasted, never typed", file=sys.stderr)

    n_before = len(app_windows(a.title_contains, a.profile_title))
    subprocess.run(["open", "-na", "Google Chrome", "--args",
                    f"--profile-directory={a.profile_dir}", f"--app={a.url}"], check=False)
    t0 = time.time()
    hit = None
    while time.time() - t0 < 25:
        time.sleep(0.8)
        if len(app_windows(a.title_contains, a.profile_title)) > n_before:
            hit = our_window(a.title_contains, a.profile_title, a.url)
            if hit:
                break
    if not hit:
        sys.exit(f"shoot_real: no new Chrome app window for {a.url} (title *{a.title_contains}*, profile "
                 f"*{a.profile_title}*) appeared in 25s. Is Google Chrome running with profile {a.profile_dir!r}?")
    pid, idx = hit
    ref = win_ref(pid, idx)
    try:
        run(a, hit, ref, W, H, out)
    except WrongWindow as e:
        mine = our_window(a.title_contains, a.profile_title, a.url) or hit
        if not a.keep_open:
            close_window(win_ref(*mine))
        sys.exit(f"shoot_real: ABORTED before any input — {e}. Nothing was typed. "
                 "Leave Chrome alone for ~25s and run again.")
    except BaseException:
        if not a.keep_open:
            close_window(ref)
        raise


def run(a, hit, ref, W, H, out: Path) -> None:
    ours = lambda: focused_ours(a.title_contains, a.profile_title, a.url)  # noqa: E731

    def raise_ours() -> str:
        """Bring our app window to the front and return a fresh reference to it."""
        for pid, idx, _main, doc in app_windows(a.title_contains, a.profile_title):
            if doc.startswith(a.url.split("#")[0].split("?")[0]):
                sc._osa('tell application "Google Chrome" to activate')
                time.sleep(0.5)
                sc._osa(f'tell application "System Events" to perform action "AXRaise" of {win_ref(pid, idx)}')
                time.sleep(0.9)
                break
        return ours()

    ref = raise_ours()
    osa(f'tell application "System Events" to set position of {ref} to {{0, 25}}')
    osa(f'tell application "System Events" to set size of {ref} to {{{W}, {H}}}')
    time.sleep(0.8)
    ref = raise_ours()
    wx, wy, ww, wh = geometry(ref)
    if (ww, wh) != (W, H):
        raise WrongWindow(f"window did not take size {W}x{H} (is {ww}x{wh}) — refusing to click into it")
    time.sleep(a.wait)

    ref = raise_ours()
    wx, wy, ww, wh = geometry(ref)
    top = page_top_offset((wx, wy, ww, wh), out.with_suffix(".window.png"))
    out.with_suffix(".window.png").unlink(missing_ok=True)
    if not 20 <= top <= 60:
        raise WrongWindow(f"page top offset measured {top}pt; an app window's title bar is ~33pt — wrong window?")
    page = (wx, wy + top, ww, wh - top)
    px, py, pw, ph = page
    print(f"window {ww}x{wh} at ({wx},{wy}); page starts {top}pt down → page area {pw}x{ph}", file=sys.stderr)

    if a.fullscreen_chart:
        ours()
        click(px + pw // 2, py + ph // 2, delay=0.6)        # focus the chart frame
        sc.key(3, shift=True, delay=1.8)                     # 3 = F → Shift+F, TradingView fullscreen
    if a.symbol:
        ours()
        # The chart's symbol box ("🔍 FPT") sits under FireAnt's header and chart-tab strip; its
        # position is left-anchored, so it only depends on the vertical layout, not the width.
        sx, sy = (int(v) for v in a.symbol_box.split(","))
        bx, by = (px + 44, py + 20) if a.fullscreen_chart else (px + sx, py + sy)
        dbg = (lambda tag: capture(page, out.with_name(f"{out.stem}.dbg-{tag}.png"))) if a.debug else (lambda tag: None)
        # The chart lives in a cross-origin iframe. The FIRST click into it only gives the frame
        # focus (measured 2026-09-22: the symbol box showed its tooltip, no dialog); the click
        # that opens the dialog has to be the second one. So click the chart body first.
        click(px + pw // 3, py + ph // 2, delay=0.8)
        ours()
        print(f"symbol box click at screen ({bx},{by})", file=sys.stderr)
        click(bx, by, delay=1.4)                             # search dialog opens, current symbol selected
        dbg("1-click")
        ours()                                               # the paste and Return go ONLY into our window
        sc.paste(a.symbol.upper(), delay=2.8)                # replaces the selection; list refreshes
        dbg("2-paste")
        ours()
        sc.key(36, delay=4.0)                                # Return → first result
        dbg("3-return")
    if a.range:
        # Range goes BEFORE interval: TradingView's range presets also reset the resolution
        # (5y -> 1W, measured 2026-09-23), so an interval clicked first is silently undone.
        # The range buttons sit on the chart's bottom bar, left-anchored: 5y 1y 6p 3p 1p 5n 1n.
        # x measured on the 1080x607 page area (2026-09-22); y is 26pt above the page bottom.
        RANGE_X = {"5y": 82, "1y": 110, "6p": 137, "3p": 165, "1p": 192, "5n": 219, "1n": 247}
        ours()
        click(px + pw // 3, py + ph // 2, delay=0.6)        # focus the chart frame first
        ours()
        click(px + RANGE_X[a.range], py + ph - 26, delay=3.0)
    if a.interval:
        # Interval favourites the user pinned on the TradingView toolbar, right of the symbol box
        # (page-area 1080 wide, 2026-09-23): D 166, W 189, 2W 220, M 247 at y = 104.
        INTERVAL_X = {"D": 166, "W": 189, "2W": 220, "M": 247}
        ours()
        click(px + pw // 3, py + ph // 2, delay=0.6)        # focus the chart frame first
        ours()
        click(px + INTERVAL_X[a.interval], py + 104, delay=3.0)
    if a.reset_view:
        ours()
        click(px + pw // 3, py + ph // 2, delay=0.6)        # focus the chart frame first
        ours()
        key_alt(15, delay=2.5)                               # 15 = R → Option+R, TradingView "reset chart view"
        dbg("reset-view")
    if a.indicator:
        # The "fx Các chỉ báo" button on the TradingView toolbar (page-area 1080 wide: x ≈ 356,
        # y = 104) opens a dialog whose search box has focus; Enter adds the first match.
        ours()
        click(px + pw // 3, py + ph // 2, delay=0.6)        # focus the chart frame first
        ours()
        click(px + 356, py + 104, delay=1.6)
        dbg = (lambda tag: capture(page, out.with_name(f"{out.stem}.dbg-{tag}.png"))) if a.debug else (lambda tag: None)
        dbg("ind-1-dialog")
        ours()
        sc.paste(a.indicator, delay=2.2)
        dbg("ind-2-typed")
        # Enter and Esc do nothing in this dialog (measured 2026-09-23), and its first click is
        # swallowed as focus like the chart frame's. So: focus the dialog on its header, then click
        # the first result row (page-area 1080 wide: x ≈ 330, y ≈ 272), then the X top-right.
        ours()
        sc.key(125, delay=0.6)                               # Down → highlight the first result
        ours()
        sc.key(36, delay=2.2)                                # Return → add it
        dbg("ind-3-added")
        ours()
        click(px + 676, py + 140, delay=1.5)
        dbg("ind-4-closed")
    if a.pan:
        ours()
        drag(px + 540, py + 200, a.pan)
        dbg("pan")
    if a.zoom_out:
        # Wheel zoom keeps the bar under the pointer fixed, so anchor near the RIGHT edge of the
        # price pane: history grows to the left and the latest bars stay in frame.
        ours()
        wheel(px + 600, py + 330, a.zoom_out)
        time.sleep(1.5)
    # There is no "widen the chart" step on purpose. FireAnt's ⤢ on the tab strip does nothing
    # useful, and TradingView's ⛶ calls the browser Fullscreen API: the app window went macOS
    # fullscreen over the user's whole display and lost its close button (2026-09-22). Don't.
    # Park the pointer on the title bar so no tooltip or crosshair is in the shot.
    sc.move(wx + ww // 2, wy + 12)
    time.sleep(0.8)

    shot_rect = page
    if a.crop and a.crop != "full":
        if a.crop == "chart":
            # TradingView frame below FireAnt's header (48) + chart-tab strip (39), 6pt margins,
            # right panel 393 wide, bottom bar 6 — measured on the 1080x607 page area.
            cx, cy, cw, ch = 6, 87, pw - 393, ph - 93
        else:
            cx, cy, cw, ch = (int(v) for v in a.crop.split(","))
        shot_rect = (px + cx, py + cy, cw, ch)

    ours()
    pw_px, ph_px = capture(shot_rect, out)
    meta = {
        "url": a.url, "capturedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "browser": "google-chrome (real, app window)", "profile": f"{a.profile_dir} ({a.profile_title})",
        "symbol": a.symbol, "windowPoints": [ww, wh], "pageAreaPoints": [pw, ph], "pageTopOffset": top,
        "pixels": [pw_px, ph_px], "scale": round(pw_px / shot_rect[2], 2), "fullscreenChart": a.fullscreen_chart,
        "range": a.range, "interval": a.interval, "resetView": bool(a.reset_view), "pan": a.pan, "indicator": a.indicator, "zoomOut": a.zoom_out, "crop": a.crop or "full",
        "shotRectPoints": list(shot_rect),
        "signedIn": None, "note": "sign-in state is whatever the user's Chrome has; check the header in the image",
    }
    out.with_suffix(".json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(f"{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}  {pw_px}×{ph_px}px  ← {a.url}")

    if not a.keep_open:
        if a.fullscreen_chart:
            sc.key(53, delay=0.6)                            # Esc leaves TradingView fullscreen
        # Re-resolve: only close the focused APP window on our URL, never a user tab.
        mine = our_window(a.title_contains, a.profile_title, a.url)
        if mine:
            close_window(win_ref(*mine))
            time.sleep(0.6)
        if our_window(a.title_contains, a.profile_title, a.url):
            print("warning: the app window did not close; close it by hand", file=sys.stderr)


if __name__ == "__main__":
    main()
