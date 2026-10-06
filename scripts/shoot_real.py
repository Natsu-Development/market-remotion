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
import shutil
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


TESSERACT = shutil.which("tesseract") or "/opt/homebrew/bin/tesseract"


def ocr_words(page: tuple[int, int, int, int], region: tuple[int, int, int, int], tmp: Path) -> list[dict]:
    """Words tesseract reads inside `region` (x0, y0, x1, y1 in page-area points) of a fresh capture
    of the page area, as dicts {text, x, y, w, h, conf} in page-area points. FireAnt's UI is light
    text on dark, so the crop is inverted and upscaled 3x first (measured 2026-10-01: the tab strip
    reads "AAA(1D)", "VNM(1D)", "VNINDEX", "(1D)", "x" at 47-97% confidence)."""
    from PIL import Image, ImageOps
    pw_px, _ = capture(page, tmp)
    scale = pw_px / page[2]
    img = Image.open(tmp).convert("L")
    x0, y0, x1, y1 = region
    crop = ImageOps.invert(img.crop((int(x0 * scale), int(y0 * scale), int(x1 * scale), int(y1 * scale))))
    crop = crop.resize(((x1 - x0) * 3, (y1 - y0) * 3), Image.LANCZOS)
    crop.save(tmp)
    tsv = subprocess.run([TESSERACT, str(tmp), "-", "--psm", "6", "tsv"], capture_output=True, text=True).stdout
    tmp.unlink(missing_ok=True)
    words = []
    for line in tsv.splitlines()[1:]:
        p = line.split("\t")
        if len(p) == 12 and p[11].strip():
            words.append({"text": p[11].strip(), "x": x0 + int(p[6]) / 3, "y": y0 + int(p[7]) / 3,
                          "w": int(p[8]) / 3, "h": int(p[9]) / 3, "conf": float(p[10])})
    return words


# FireAnt's chart-tab strip and the TradingView symbol box, in page-area points at 1080 wide
# (header 0-48, tab strip 48-87; symbol box text at y ~104 right of the 🔍), measured 2026-10-01.
TAB_STRIP = (0, 50, 990, 88)
SYMBOL_BOX = (28, 94, 200, 116)


def tab_label(text: str) -> str:
    """'VNM(1D)' -> 'VNM'; 'VNINDEX' -> 'VNINDEX'."""
    return text.upper().split("(")[0].strip(" .,:;|‘’'\"!")


def find_tab(page, label: str, tmp: Path):
    """(x, y, label) — the centre in page points of the first chart tab whose label is one of the
    comma-separated `label` candidates, in the order given — or None. Never the tab's own close "x"
    (a separate word right of the label). Candidates let a caller name the tab by its own symbol AND
    by the tickers a failed restore could have left on it."""
    words = ocr_words(page, TAB_STRIP, tmp)
    for want in [s.strip().upper() for s in label.split(",") if s.strip()]:
        for w in words:
            if tab_label(w["text"]) == want:
                return int(w["x"] + w["w"] / 2), int(w["y"] + w["h"] / 2), want
    return None


def symbol_shown(page, tmp: Path) -> str:
    """The ticker the chart's symbol box shows right now (OCR), '' when unreadable."""
    for w in ocr_words(page, SYMBOL_BOX, tmp):
        t = "".join(ch for ch in w["text"].upper() if ch.isalnum())
        if len(t) >= 3:
            return t
    return ""


# FireAnt's candle colours and its price pane in page-area fractions (1080 wide; rules.shots.fireantStock).
FIREANT_CANDLES = ((15, 141, 118), (239, 58, 66))
PANE_FRAC = (0.058, 0.18, 0.896, 0.88)


def candle_columns(png: Path) -> tuple[float, float] | None:
    """(rightmost candle centre in image px, median px per candle) of a FireAnt page capture, or None."""
    import numpy as np
    from PIL import Image
    im = np.asarray(Image.open(png).convert("RGB")).astype(int)
    H, W = im.shape[:2]
    x0, y0, x1, y1 = (int(PANE_FRAC[0] * W), int(PANE_FRAC[1] * H), int(PANE_FRAC[2] * W), int(PANE_FRAC[3] * H))
    sub = im[y0:y1, x0:x1]
    m = np.zeros(sub.shape[:2], bool)
    for c in FIREANT_CANDLES:
        m |= np.abs(sub - np.array(c)).sum(axis=2) < 45
    def run(col):
        best = r = 0
        for v in col:
            r = r + 1 if v else 0
            best = max(best, r)
        return best
    has = [run(m[:, x]) >= 3 for x in range(m.shape[1])]
    centres, start = [], None
    for x in range(len(has) + 1):
        on = x < len(has) and has[x]
        if on and start is None:
            start = x
        if not on and start is not None:
            centres.append(x0 + (start + x - 1) / 2)
            start = None
    if len(centres) < 10:
        return None
    return centres[-1], float(np.median(np.diff(centres)))


def hover_capture(a, page, out: Path, ours) -> dict:
    """Hover the candle a.hover_back bars before the last and capture the page area to <out>.hover.png: the legend then
    prints THAT bar's OHLC and indicator values — FireAnt's own MA50/MA200 on the edition's date, nothing computed."""
    px, py, pw, ph = page
    found = candle_columns(out)
    if not found:
        print("hover: no candle columns found in the capture — skipped", file=sys.stderr)
        return {"back": a.hover_back, "ok": False}
    last, d = found
    scale = Image_size(out)[0] / pw
    hx = (last - a.hover_back * d) / scale
    hy = ph * 0.5
    ours()
    sc.move(int(round(px + hx)), int(round(py + hy)))
    time.sleep(1.6)
    hover = out.with_name(f"{out.stem}.hover.png")
    ours()
    capture(page, hover)
    sc.move(int(px + pw // 2), int(py - 20))             # park on the title bar again
    time.sleep(0.6)
    print(f"hover: {a.hover_back} bar(s) before the last (x {hx:.0f}pt of the page) → {hover.name}", file=sys.stderr)
    return {"back": a.hover_back, "ok": True, "xPage": round(hx, 1), "lastPx": round(last, 1), "dPx": round(d, 2), "file": hover.name}


def Image_size(png: Path) -> tuple[int, int]:
    data = png.read_bytes()
    return struct.unpack(">II", data[16:24])


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
    ap.add_argument("--tab", default=None,
                    help="FireAnt: click the chart tab with this label first (e.g. VNM), found by OCR on the tab strip; "
                         "the symbol box must then show that label, or nothing is pasted")
    ap.add_argument("--restore-symbol", default=None,
                    help="FireAnt: after the capture, paste this ticker back into the tab (the tab's own symbol before --symbol changed it)")
    ap.add_argument("--restore-tab", default=None,
                    help="FireAnt: after the capture (and --restore-symbol), click this tab so the one that was active stays active")
    ap.add_argument("--hover-back", type=int, default=None,
                    help="FireAnt: after the clean capture, hover the candle N bars before the last one and capture the "
                         "page again to <out>.hover.png — TradingView's legend then prints that bar's values (OHLC, MAs). "
                         "For an edition older than the chart's last bar (2026-10-03: the 1/10 reel, a chart ending 2/10)")
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
    a._restore = None
    try:
        run(a, hit, ref, W, H, out)
    except WrongWindow as e:
        mine = our_window(a.title_contains, a.profile_title, a.url) or hit
        if not a.keep_open:
            close_window(win_ref(*mine))
        # Never type into a window that is not ours — so a tab changed before the abort stays changed.
        left = f" The chart tab {a.tab or ''} may still show {a.symbol}: put {a.restore_symbol} back by hand." if a._restore and a.restore_symbol else ""
        sys.exit(f"shoot_real: ABORTED before any input — {e}. Nothing was typed.{left} "
                 "Leave Chrome alone for ~25s and run again.")
    except BaseException as e:
        try:
            if a._restore:
                a._restore()
        except WrongWindow as w:
            print(f"WARNING: could not restore the user's tab ({w}) — put {a.restore_symbol or a.restore_tab} back by hand", file=sys.stderr)
        if not a.keep_open:
            close_window(win_ref(*(our_window(a.title_contains, a.profile_title, a.url) or hit)))
        if isinstance(e, RuntimeError):
            sys.exit(f"shoot_real: {e}")
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

    dbg = (lambda tag: capture(page, out.with_name(f"{out.stem}.dbg-{tag}.png"))) if a.debug else (lambda tag: None)
    tmp = out.with_suffix(".ocr.png")

    def paste_symbol(symbol: str, tag: str, settle: float = 2.8) -> None:
        """Click the chart's symbol box, paste `symbol`, Return. The chart lives in a cross-origin
        iframe: the FIRST click into it only gives the frame focus (measured 2026-09-22: the symbol
        box showed its tooltip, no dialog), so the chart body is clicked first. `settle` is the wait
        for the result list after the paste: Return before the list refreshed picks the OLD first row
        (measured 2026-10-01: restoring VNM after MSR left the tab on MSR)."""
        # The symbol box ("🔍 FPT") sits under FireAnt's header and chart-tab strip; its position is
        # left-anchored, so it only depends on the vertical layout, not the width.
        sx, sy = (int(v) for v in a.symbol_box.split(","))
        bx, by = (px + 44, py + 20) if a.fullscreen_chart else (px + sx, py + sy)
        ours()
        click(px + pw // 3, py + ph // 2, delay=0.8)
        ours()
        print(f"symbol box click at screen ({bx},{by})", file=sys.stderr)
        click(bx, by, delay=1.4)                             # search dialog opens, current symbol selected
        dbg(f"{tag}-1-click")
        ours()                                               # the paste and Return go ONLY into our window
        sc.paste(symbol.upper(), delay=settle)               # replaces the selection; list refreshes
        dbg(f"{tag}-2-paste")
        ours()
        sc.key(36, delay=4.0)                                # Return → first result
        dbg(f"{tag}-3-return")

    def paste_verified(symbol: str, tag: str) -> str:
        """paste_symbol, then read the symbol box back (OCR); one retry with a longer wait for the
        result list. Returns what the box shows at the end."""
        paste_symbol(symbol, tag)
        shown = symbol_shown(page, tmp)
        if shown != symbol.upper():
            print(f"symbol box shows {shown!r} after pasting {symbol.upper()} — retrying with a longer wait", file=sys.stderr)
            paste_symbol(symbol, f"{tag}r", settle=5.5)
            shown = symbol_shown(page, tmp)
        return shown

    def click_tab(label: str, tag: str) -> str:
        """Make the chart tab `label` (comma-separated candidates) the active one; the symbol box must
        then show the label that matched. Returns that label."""
        ours()
        hit_tab = find_tab(page, label, tmp)
        if not hit_tab:
            raise RuntimeError(f"no chart tab labelled {label!r} on FireAnt's tab strip (OCR) — nothing clicked")
        tx, ty, found = hit_tab
        ours()
        click(px + tx, py + ty, delay=3.0)
        dbg(f"{tag}-tab")
        shown = symbol_shown(page, tmp)
        print(f"tab {found}: clicked at page ({tx},{ty}); symbol box shows {shown!r}", file=sys.stderr)
        if shown != found:
            raise RuntimeError(f"after clicking tab {found!r} the symbol box shows {shown!r} — stopping before any paste")
        return found

    if a.fullscreen_chart:
        ours()
        click(px + pw // 2, py + ph // 2, delay=0.6)        # focus the chart frame
        sc.key(3, shift=True, delay=1.8)                     # 3 = F → Shift+F, TradingView fullscreen
    state = {"pasted": False, "tabbed": False}

    def restore() -> None:
        """Put the user's tabs back as they were: the tab's own symbol (--restore-symbol), then the
        tab that was active (--restore-tab). main() also calls this when a later step fails."""
        a._restore = None
        if a.restore_symbol and state["pasted"]:
            shown = paste_verified(a.restore_symbol, "8")
            print(f"restored the tab's symbol: symbol box shows {shown!r}", file=sys.stderr)
            if shown != a.restore_symbol.upper():
                print(f"WARNING: the tab still shows {shown!r}, not {a.restore_symbol.upper()} — put it back by hand", file=sys.stderr)
        if a.restore_tab and state["tabbed"] and a.restore_tab.upper() != (a.tab or "").upper():
            click_tab(a.restore_tab, "9")

    a._restore = restore
    if a.tab:
        state["tabbed"] = True
        state["tabFound"] = click_tab(a.tab, "0")
    if a.symbol:
        state["pasted"] = True
        if a.tab or a.restore_symbol:
            # On a tab of the user's we change the symbol, so make sure it took (a ticker the search
            # matches loosely — first result not the ticker — would photograph the wrong stock).
            shown = paste_verified(a.symbol, "1")
            print(f"symbol box shows {shown!r} after pasting {a.symbol.upper()}", file=sys.stderr)
            if shown != a.symbol.upper():
                raise RuntimeError(f"the chart shows {shown!r}, not {a.symbol.upper()} — no capture")
        else:
            paste_symbol(a.symbol, "1")
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
        "tab": state.get("tabFound"), "restoredSymbol": a.restore_symbol, "restoredTab": a.restore_tab,
        "signedIn": None, "note": "sign-in state is whatever the user's Chrome has; check the header in the image",
    }
    if a.hover_back is not None and a.crop in (None, "full"):
        meta["hover"] = hover_capture(a, page, out, ours)
    out.with_suffix(".json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(f"{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}  {pw_px}×{ph_px}px  ← {a.url}")
    restore()

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
