"""Read a Chrome window's web content through the macOS Accessibility API, for fb.py groups/share.

AX FINDS things here — links and their URLs, buttons and their labels, text fields — and gives their screen
rectangles. The clicks stay CGEvent at those coordinates (SKILL.md §7: a System Events click does nothing on web
content); `at()` is the peek: which element is on top at a point right before a click there.

Chrome builds the web part of its AX tree only for an assistive client: VoiceOver turns it on with
AXEnhancedUserInterface, any other client with AXManualAccessibility on the application element (Chromium's switch for
non-VoiceOver clients). That is why SKILL.md §7 saw no page tree. `Session` sets AXManualAccessibility on the ONE
Chrome process that owns our window, or AXEnhancedUserInterface where this Chrome refuses the first (2026-10-12), and
puts it back when it is done.

ctypes, because video-factory's venv has pyobjc Quartz and Cocoa but not ApplicationServices. Pointers copied out of
AX are released when their Element is collected; the process is short-lived either way.
"""
from __future__ import annotations

import ctypes
import re
import time
import unicodedata
from ctypes import POINTER, Structure, byref, c_bool, c_char_p, c_double, c_float, c_int32, c_long, c_uint32, c_ulong, c_void_p

_AS = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
_CF = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")


def _sig(lib, name, res, *args):
    f = getattr(lib, name)
    f.restype, f.argtypes = res, list(args)
    return f


UTF8 = 0x08000100
_sig(_CF, "CFStringCreateWithCString", c_void_p, c_void_p, c_char_p, c_uint32)
_sig(_CF, "CFGetTypeID", c_ulong, c_void_p)
for _n in ("CFStringGetTypeID", "CFArrayGetTypeID", "CFURLGetTypeID", "CFBooleanGetTypeID", "CFNumberGetTypeID"):
    _sig(_CF, _n, c_ulong)
_sig(_CF, "CFArrayGetCount", c_long, c_void_p)
_sig(_CF, "CFArrayGetValueAtIndex", c_void_p, c_void_p, c_long)
_sig(_CF, "CFArrayCreate", c_void_p, c_void_p, POINTER(c_void_p), c_long, c_void_p)
_sig(_CF, "CFStringGetLength", c_long, c_void_p)
_sig(_CF, "CFStringGetMaximumSizeForEncoding", c_long, c_long, c_uint32)
_sig(_CF, "CFStringGetCString", c_bool, c_void_p, c_char_p, c_long, c_uint32)
_sig(_CF, "CFURLGetString", c_void_p, c_void_p)
_sig(_CF, "CFBooleanGetValue", c_bool, c_void_p)
_sig(_CF, "CFNumberGetValue", c_bool, c_void_p, c_long, c_void_p)
_sig(_CF, "CFRetain", c_void_p, c_void_p)
_sig(_CF, "CFRelease", None, c_void_p)
_sig(_CF, "CFEqual", c_bool, c_void_p, c_void_p)
_ARRAY_CALLBACKS = ctypes.addressof(ctypes.c_char.in_dll(_CF, "kCFTypeArrayCallBacks"))
_TRUE = c_void_p.in_dll(_CF, "kCFBooleanTrue").value
_FALSE = c_void_p.in_dll(_CF, "kCFBooleanFalse").value

_sig(_AS, "AXIsProcessTrusted", c_bool)
_sig(_AS, "AXUIElementGetTypeID", c_ulong)
_sig(_AS, "AXValueGetTypeID", c_ulong)
_sig(_AS, "AXUIElementCreateApplication", c_void_p, c_int32)
_sig(_AS, "AXUIElementCreateSystemWide", c_void_p)
_sig(_AS, "AXUIElementGetPid", c_int32, c_void_p, POINTER(c_int32))
_sig(_AS, "AXUIElementCopyAttributeValue", c_int32, c_void_p, c_void_p, POINTER(c_void_p))
_sig(_AS, "AXUIElementCopyMultipleAttributeValues", c_int32, c_void_p, c_void_p, c_uint32, POINTER(c_void_p))
_sig(_AS, "AXUIElementSetAttributeValue", c_int32, c_void_p, c_void_p, c_void_p)
_sig(_AS, "AXUIElementCopyElementAtPosition", c_int32, c_void_p, c_float, c_float, POINTER(c_void_p))
_sig(_AS, "AXUIElementSetMessagingTimeout", c_int32, c_void_p, c_float)
_sig(_AS, "AXValueGetType", c_uint32, c_void_p)
_sig(_AS, "AXValueGetValue", c_bool, c_void_p, c_uint32, c_void_p)

T_STR, T_ARR, T_URL, T_BOOL, T_NUM = (_CF.CFStringGetTypeID(), _CF.CFArrayGetTypeID(), _CF.CFURLGetTypeID(),
                                      _CF.CFBooleanGetTypeID(), _CF.CFNumberGetTypeID())
T_EL, T_VAL = _AS.AXUIElementGetTypeID(), _AS.AXValueGetTypeID()


class _Point(Structure):
    _fields_ = [("x", c_double), ("y", c_double)]


class _Size(Structure):
    _fields_ = [("w", c_double), ("h", c_double)]


_KEYS: dict[str, int] = {}


def _key(s: str) -> int:
    """A CFString for an attribute name, made once and kept."""
    if s not in _KEYS:
        _KEYS[s] = _CF.CFStringCreateWithCString(None, s.encode("utf-8"), UTF8)
    return _KEYS[s]


def _str(ref) -> str:
    n = _CF.CFStringGetMaximumSizeForEncoding(_CF.CFStringGetLength(ref), UTF8) + 1
    buf = ctypes.create_string_buffer(n)
    return buf.value.decode("utf-8", "replace") if _CF.CFStringGetCString(ref, buf, n, UTF8) else ""


def _py(ref):
    """CFTypeRef -> str | bool | float | list | tuple | Element | None (the ref is not consumed)."""
    if not ref:
        return None
    t = _CF.CFGetTypeID(ref)
    if t == T_STR:
        return _str(ref)
    if t == T_URL:
        s = _CF.CFURLGetString(ref)
        return _str(s) if s else None
    if t == T_BOOL:
        return bool(_CF.CFBooleanGetValue(ref))
    if t == T_NUM:
        v = c_double()
        return v.value if _CF.CFNumberGetValue(ref, 13, byref(v)) else None   # kCFNumberDoubleType
    if t == T_ARR:
        return [_py(_CF.CFArrayGetValueAtIndex(ref, i)) for i in range(_CF.CFArrayGetCount(ref))]
    if t == T_EL:
        return Element(ref, retain=True)
    if t == T_VAL:
        kind = _AS.AXValueGetType(ref)
        if kind == 1:   # kAXValueCGPointType
            p = _Point()
            return (p.x, p.y) if _AS.AXValueGetValue(ref, 1, byref(p)) else None
        if kind == 2:   # kAXValueCGSizeType
            s = _Size()
            return (s.w, s.h) if _AS.AXValueGetValue(ref, 2, byref(s)) else None
        return None     # kAXValueAXErrorType: an attribute this element does not have
    return None


class Element:
    __slots__ = ("ref",)

    def __init__(self, ref: int, retain: bool = False):
        self.ref = _CF.CFRetain(ref) if retain else ref

    def __del__(self):
        try:
            if self.ref:
                _CF.CFRelease(self.ref)
        except Exception:   # interpreter shutdown
            pass

    def __eq__(self, other):
        return isinstance(other, Element) and bool(_CF.CFEqual(self.ref, other.ref))

    def __hash__(self):
        return 0   # identity is CFEqual; a hash bucket per element is not needed at this size

    def attr(self, name: str):
        out = c_void_p()
        if _AS.AXUIElementCopyAttributeValue(self.ref, _key(name), byref(out)) != 0 or not out.value:
            return None
        try:
            return _py(out.value)
        finally:
            _CF.CFRelease(out.value)

    def attrs(self, names: list[str]) -> dict:
        """Several attributes in ONE call (a deep web tree is thousands of elements)."""
        arr = (c_void_p * len(names))(*[_key(n) for n in names])
        names_ref = _CF.CFArrayCreate(None, arr, len(names), _ARRAY_CALLBACKS)
        out = c_void_p()
        try:
            if _AS.AXUIElementCopyMultipleAttributeValues(self.ref, names_ref, 0, byref(out)) != 0 or not out.value:
                return {}
            vals = [_py(_CF.CFArrayGetValueAtIndex(out.value, i)) for i in range(_CF.CFArrayGetCount(out.value))]
            _CF.CFRelease(out.value)
            return dict(zip(names, vals))
        finally:
            _CF.CFRelease(names_ref)

    def set_bool(self, name: str, value: bool) -> int:
        return _AS.AXUIElementSetAttributeValue(self.ref, _key(name), _TRUE if value else _FALSE)

    def rect(self) -> tuple[float, float, float, float] | None:
        """(x, y, w, h) in global screen points, top-left origin — the space CGEvent clicks in."""
        a = self.attrs(["AXPosition", "AXSize"])
        p, s = a.get("AXPosition"), a.get("AXSize")
        return (p[0], p[1], s[0], s[1]) if isinstance(p, tuple) and isinstance(s, tuple) else None


def trusted() -> bool:
    return bool(_AS.AXIsProcessTrusted())


def app(pid: int) -> Element:
    el = Element(_AS.AXUIElementCreateApplication(pid))
    _AS.AXUIElementSetMessagingTimeout(el.ref, 3.0)
    return el


def at(x: float, y: float) -> Element | None:
    """The deepest element ON TOP under the screen point — what a click there lands on. Asked system-wide: Chrome's own
    hit test answers with an unlabelled overlay group lying over the whole page (an extension's layer; measured
    2026-10-12 at Business Suite's «Đăng»: Chrome said AXGroup '', the system-wide test AXButton 'Đăng')."""
    wide = Element(_AS.AXUIElementCreateSystemWide())
    out = c_void_p()
    if _AS.AXUIElementCopyElementAtPosition(wide.ref, c_float(x), c_float(y), byref(out)) != 0 or not out.value:
        return None
    return Element(out.value)


def owner_at(x: float, y: float) -> int | None:
    """PID of the app whose element is on top at the screen point — Stage Manager's strip lies over the window's left
    edge (2026-10-12), and a click there would switch apps."""
    el, pid = at(x, y), c_int32()
    return pid.value if el is not None and _AS.AXUIElementGetPid(el.ref, byref(pid)) == 0 else None


# ── a snapshot of the tree ──────────────────────────────────────────────────────────────────
WALK = ["AXRole", "AXSubrole", "AXTitle", "AXDescription", "AXValue", "AXURL", "AXPlaceholderValue", "AXChildren"]
DIALOG_SUBROLES = {"AXApplicationDialog", "AXDialog", "AXApplicationAlertDialog"}


def clean(s) -> str:
    """NFC, zero-width characters dropped (Business Suite ends labels with U+200B: 'Đóng \u200b'), spaces collapsed."""
    s = unicodedata.normalize("NFC", s if isinstance(s, str) else "")
    return re.sub(r"\s+", " ", re.sub(r"[\u200b\u200c\u200d\u2060\ufeff]", "", s)).strip()


def fold(s: str) -> str:
    """For comparing names: NFC, case-folded, spaces collapsed."""
    return clean(s).casefold()


def bare(s: str) -> str:
    """fold() without diacritics — an OCR'd name (eng traineddata drops them) against the real one."""
    d = unicodedata.normalize("NFD", fold(s)).replace("đ", "d")
    return "".join(ch for ch in d if unicodedata.category(ch) != "Mn")


class Node:
    __slots__ = ("el", "role", "subrole", "title", "desc", "value", "url", "placeholder", "kids", "parent", "depth")

    def __init__(self, el, a: dict, parent, depth):
        self.el, self.parent, self.depth, self.kids = el, parent, depth, []
        self.role, self.subrole = a.get("AXRole") or "", a.get("AXSubrole") or ""
        self.title, self.desc = clean(a.get("AXTitle")), clean(a.get("AXDescription"))
        v = a.get("AXValue")
        self.value = clean(v) if isinstance(v, str) else ""
        self.url = a.get("AXURL") if isinstance(a.get("AXURL"), str) else ""
        self.placeholder = clean(a.get("AXPlaceholderValue"))

    def label(self) -> str:
        """The element's own accessible name: title, else aria-label (AXDescription), else its value."""
        return self.title or self.desc or (self.value if self.role in ("AXStaticText", "AXHeading", "AXButton", "AXLink") else "")

    def text(self, limit: int = 300) -> str:
        """Every text inside, in document order — what a person reads on that element."""
        out: list[str] = []
        stack = [self]
        while stack and sum(len(t) for t in out) < limit:
            n = stack.pop()
            if n.role == "AXStaticText" and n.value:
                out.append(n.value)
            elif n is not self and n.role in ("AXImage",) and n.desc:
                pass   # avatars repeat the name; keep only real text
            stack.extend(reversed(n.kids))
        return clean(" ".join(out)) or self.label()

    def ancestors(self):
        n = self.parent
        while n is not None:
            yield n
            n = n.parent

    def dialog(self):
        """The dialog (role=dialog in the page, or a menu) this node sits in, or None."""
        for n in self.ancestors():
            if n.subrole in DIALOG_SUBROLES or n.role in ("AXSheet", "AXMenu", "AXDialog"):
                return n
        return None

    def walk(self):
        stack = [self]
        while stack:
            n = stack.pop()
            yield n
            stack.extend(reversed(n.kids))

    def rect(self):
        return self.el.rect()


def tree(root: Element, max_nodes: int = 25000, max_seconds: float = 40.0) -> tuple[Node, int, bool]:
    """(root node, node count, complete?) — a depth-first snapshot of everything under `root`."""
    t0 = time.time()
    top = Node(root, root.attrs(WALK), None, 0)
    count, stack = 1, [(top, root.attrs(["AXChildren"]).get("AXChildren") or [])]
    while stack:
        node, kids = stack.pop()
        for k in kids:
            if not isinstance(k, Element):
                continue
            if count >= max_nodes or time.time() - t0 > max_seconds:
                return top, count, False
            a = k.attrs(WALK)
            child = Node(k, a, node, node.depth + 1)
            node.kids.append(child)
            count += 1
            grand = a.get("AXChildren") or []
            if grand:
                stack.append((child, grand))
    return top, count, True


def web_area(window: Element, wait: float = 8.0) -> Element | None:
    """The AXWebArea of a Chrome window with something in it (Chrome fills it in once Session turned AX on)."""
    t0 = time.time()
    while True:
        stack, seen = [window], 0
        while stack and seen < 400:
            el = stack.pop()
            seen += 1
            a = el.attrs(["AXRole", "AXChildren"])
            if a.get("AXRole") == "AXWebArea" and a.get("AXChildren"):
                return el
            stack.extend(reversed([k for k in (a.get("AXChildren") or []) if isinstance(k, Element)]))
        if time.time() - t0 > wait:
            return None
        time.sleep(0.8)


class Session:
    """AX on for the Chrome process `pid` while in use, then back to what it was."""

    def __init__(self, pid: int):
        self.pid, self.app, self.was, self.turned_on = pid, app(pid), None, []

    def __enter__(self):
        self.was = self.app.attr("AXManualAccessibility")
        if self.was is not True:
            if self.app.set_bool("AXManualAccessibility", True) == 0:
                self.turned_on.append("AXManualAccessibility")
            elif self.app.attr("AXEnhancedUserInterface") is not True:
                # This Chrome refuses AXManualAccessibility (-25205, attribute unsupported; measured 2026-10-12: the web
                # area stayed empty and `fb.py groups` read 0 of the Page's 10 groups). VoiceOver's switch still builds
                # the page tree, although the call itself returns -25208.
                self.app.set_bool("AXEnhancedUserInterface", True)
                self.turned_on.append("AXEnhancedUserInterface")
        return self

    def __exit__(self, *exc):
        for name in self.turned_on:
            self.app.set_bool(name, False)
        return False

    def window(self, title: str) -> Element | None:
        """Our window: the app's AXMainWindow when its title is ours, else the one titled so."""
        main = self.app.attr("AXMainWindow")
        if isinstance(main, Element) and clean(main.attr("AXTitle")) == clean(title):
            return main
        for w in self.app.attr("AXWindows") or []:
            if isinstance(w, Element) and clean(w.attr("AXTitle")) == clean(title):
                return w
        return None
