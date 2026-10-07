#!/usr/bin/env python
"""Listen to every sentence of a voiced reel and keep, per sentence, a take in which every figure, ticker and term is HEARD.

OmniVoice is stochastic: the same sentence comes back clean in one take and with a word gone in the next. Measured
2026-09-30 on the Channel reel it dropped "phẩy" from "bốn mươi ba phẩy mười ba" in 3 of 4 takes and squeezed
"em mờ a xê đê" into 0.65 s — while Whisper's plain transcript still read "43,13%" and "MACD". Whisper infers those
from context, so a plain transcript is no evidence the syllables were spoken. This script listens harder.

2026-10-06 (user, on the 6/10 daily: "The pronounce of the number on this video is not clear … ensure it not happened
again"). The earlier version let unclear figures through: its strict pass also suppressed every token that is a piece
of a figure the reel speaks ("một", "trăm", "mươi" …) and every piece of "Strong"/"Uptrend", so it collapsed into
"!!!!" on nearly every figure sentence; its fallback plain pass then counted digits as the figure heard — Whisper wrote
"1.759" for a take that said "bảy trăm năm chín" — and its prompt carried the reel's own figures. Sentences it could not
resolve were only printed, and a sentence voiced after it last ran was never listened to (6/10: MSB's "mười ba phẩy
bảy"). Measured on the 6/10 takes with this version: the hook's take said "một nghìn bảy trăm năm chín" (no "mươi"), the
flow's take said "… kéo lùi không chấm bốn phẩy tám điểm" — FPT's 0,58 never spoken.

How it listens now, per take:
  words    every digit token suppressed and a neutral primer that writes numbers as words but names none of the
           reel's figures, so a figure has to come back as the words actually said. Figures are judged here only.
  letters  for a sentence that spells a ticker or an acronym (MA50, FTD, RS): the pieces Whisper would write the
           letters with are suppressed too, so each letter comes back as a letter name with its timing.
A figure is every run of two or more number words ("một ngàn bảy trăm năm mươi chín", "không chấm năm tám"), matched
word for word (ngàn = nghìn, chấm = phẩy, lăm = năm, tư = bốn, mốt = một, lẻ = linh, bẩy = bảy). A take is CLEAR when it
has a sane length, ONE of its transcripts holds every figure / ticker / acronym / filter name in the script's order (a
figure said twice heard twice; no syllable glued onto a figure — 6/10 "… bốn hai chân thì …"), no spelled ticker has a
gap inside it, and almost every other word of the script is in the transcript (tone marks ignored). Letter names are
matched the way the southern reference voice says them (rờ = giờ = dờ, xờ = sờ).

Transcripts and verdicts go into .tts-cache/_heard.json, keyed by the take's audio bytes: a take is transcribed once
(TRANSCRIBE_VERSION) and re-judged without listening again when the rule changes (LISTEN_VERSION).
scripts/verify.mjs (check `voice-heard`) and scripts/render.mjs refuse a reel whose tracks hold a sentence take that
was never listened to, is not clear, or is newer than its scene's track (picked but not reassembled).

Which take is kept: takes are tried widest pitch range first (10th–90th percentile of F0; the user 2026-10-01: "no pace
or highlight") and the first CLEAR one is kept, so a lively read wins among clear ones. A key sentence (a figure, a
ticker, a pinned headline, the hook) gets --takes takes up front; any sentence with no clear take gets --takes more per
round, up to --max-takes, before it is reported unresolved (exit 3).

    ../video-factory/.venv/bin/python scripts/tts_takes.py --content=content/review-daily.json --rebuild
    ../video-factory/.venv/bin/python scripts/tts_takes.py --content=<reel> --listen-only   # what the tracks hold now
    ../video-factory/.venv/bin/python scripts/tts_takes.py --dry-run          # listen + rank what exists, record/copy nothing

    --content=<reel.json>  read .tts-cache/manifests/<reel>.json (scripts/voiceover.mjs writes it; default: the
                           latest run's .tts-cache/_sentences.json)
    --takes=6 --max-takes=18   takes per round, and the cap per sentence
    --rebuild              reassemble the scenes whose take changed (voiceover.mjs --reassemble --only=… --retime)
    --only=<scene ids>  --match=<regex on the spoken text>  --fresh (drop the .takeN.wav files first)
    --commas               also require a pause at every comma   --terms=a,b   extra spoken forms that must be heard
    --report=<path.json>   full verdicts   --whisper=<repo>   (default mlx-community/whisper-large-v3-mlx)

Run with the video-factory venv (torch + omnivoice + mlx_whisper + librosa); needs ffmpeg.
"""
from __future__ import annotations

import difflib
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.tts-cache'
LEDGER = CACHE / '_heard.json'
# Bump when what counts as CLEAR changes: verdicts of another version are listened to again (scripts/lib/heard.mjs).
LISTEN_VERSION = 5
WHISPER = 'mlx-community/whisper-large-v3-mlx'

argv = sys.argv[1:]
flag = lambda n: f'--{n}' in argv
def opt(n, d=None):
    hit = next((a for a in argv if a.startswith(f'--{n}=')), None)
    return hit[len(n) + 3:] if hit else d

CONTENT_ARG = opt('content')
TAKES = int(opt('takes', '6'))
MAX_TAKES = int(opt('max-takes', '18'))
DRY = flag('dry-run')
LISTEN_ONLY = flag('listen-only')
FRESH = flag('fresh')
COMMAS = flag('commas')
REBUILD = flag('rebuild')
ONLY = set(filter(None, opt('only', '').split(',')))
REPORT = opt('report')
WHISPER = opt('whisper', WHISPER)
MATCH = opt('match')

low = lambda t: unicodedata.normalize('NFC', t.lower())
words_of = lambda t: re.sub(r'[^\w\s]', ' ', low(t)).split()

def strip_marks(w):
    """A word without tone and vowel marks ('rờ' → 'ro', 'đê' → 'de')."""
    d = unicodedata.normalize('NFD', w.replace('đ', 'd').replace('Đ', 'D'))
    return ''.join(ch for ch in d if unicodedata.category(ch) != 'Mn')

def phon(w):
    """A letter name or syllable as the reference voice (ThanhBinh, southern) says it: r / d / gi one sound, x = s,
    tr = ch, final t = c — Whisper writes 'giờ ét' or 'dờ ét' for its 'rờ ét' (RS) and 'sờ trong' for 'xờ trong'
    (measured 2026-10-06). Used only while no two letter names collide under it (LETTER_KEY)."""
    w = low(w)
    w = re.sub(r'^(gi|r|d)', 'z', w)  # plain d only: 'đ' is another letter
    w = re.sub(r'^x', 's', w)
    w = re.sub(r'^tr', 'ch', w)
    w = strip_marks(w)
    return re.sub(r'(t|ch)$', 'c', w)


# ---------------------------------------------------------------- the reel

def manifest_path():
    latest = CACHE / '_sentences.json'
    if not CONTENT_ARG:
        return latest
    per_reel = CACHE / 'manifests' / f'{Path(CONTENT_ARG).stem}.json'
    if per_reel.exists():
        return per_reel
    if latest.exists() and json.load(open(latest, encoding='utf-8')).get('content') == str(Path(CONTENT_ARG)):
        return latest
    sys.exit(f'{per_reel.relative_to(ROOT)} is missing — run `node scripts/voiceover.mjs --content={CONTENT_ARG}` first '
             '(it writes the manifest before synthesizing anything, and synthesizes nothing that is cached).')

MANIFEST = manifest_path()
if not MANIFEST.exists():
    sys.exit(f'{MANIFEST.relative_to(ROOT)} is missing — run `node scripts/voiceover.mjs --content=<reel>` first.')
manifest = json.load(open(MANIFEST, encoding='utf-8'))
content = ROOT / manifest['content']
reel = json.load(open(content, encoding='utf-8'))
rules_path = ROOT / reel.get('rules', 'src/shared/content-rules.json')
voice_rules = json.load(open(rules_path, encoding='utf-8')).get('voice', {}) or {}
lexicon = {k: v for k, v in (voice_rules.get('lexicon') or {}).items() if not k.startswith('_') and isinstance(v, str)}
letters = {k: v for k, v in (voice_rules.get('letters') or {}).items() if not k.startswith('_') and isinstance(v, str)}
letter_join = voice_rules['letterJoin'] if isinstance(voice_rules.get('letterJoin'), str) else ', '

NUMBER_WORDS = {'không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'bẩy', 'tám', 'chín', 'mười', 'mươi', 'trăm',
                'nghìn', 'ngàn', 'lăm', 'lẻ', 'linh', 'mốt', 'tư', 'phẩy', 'chấm', 'phần'}
# The same number heard either way: the voice says 'ngàn' / 'chấm' / 'lẻ' (voice.lexicon), Whisper may write the other.
CANON = {'bẩy': 'bảy', 'ngàn': 'nghìn', 'lẻ': 'linh', 'chấm': 'phẩy', 'tư': 'bốn', 'lăm': 'năm', 'mốt': 'một'}
canon = lambda w: CANON.get(w, w)

# Required items besides figures, as spoken word lists:
#   letters — a spelled ticker (voice.letters + voice.letterJoin, as scripts/lib/rules.mjs spellerOf builds it) or the
#             letter part of an acronym lexicon term (MA50 → 'em ây'; its 'năm mươi' is a figure).
#   word    — a lexicon term that is a word read in Vietnamese syllables (Strong → 'xờ trong'); Whisper writing the word
#             itself ('Uptrend') is that word heard.
LETTER_ITEMS, WORD_ITEMS = {}, {}
TICKER_RE = re.compile(r'(?<![^\W_])[A-Z]{3}(?![^\W_])')
for written, spoken in lexicon.items():
    ws = words_of(spoken)
    if written == 'phẩy' or not ws or all(w in NUMBER_WORDS for w in ws):
        continue  # a respelling of number words: the figure runs cover it
    if re.fullmatch(r'[A-Z][A-Z0-9]*', written):
        head = []
        for w in ws:
            if w in NUMBER_WORDS:
                break
            head.append(w)
        if head:
            LETTER_ITEMS[re.sub(r'\d', '', written)] = head
    else:
        WORD_ITEMS[written] = ws
if letters:
    for sc in reel.get('scenes', []):
        for tk in TICKER_RE.findall(sc.get('narration') or ''):
            if tk not in lexicon and tk not in LETTER_ITEMS:
                LETTER_ITEMS[tk] = words_of(letter_join.join(letters.get(c, c.lower()) for c in tk))
for extra in filter(None, (opt('terms') or '').split(',')):
    WORD_ITEMS[extra.strip()] = words_of(extra)
# a gap this long inside a spelled ticker (between two of its letters) is the ticker said "separated" (user 2026-10-01)
GAP = 0.15

def items_of(text):
    """The spoken words of a sentence and what in them must be heard: [(pos, kind, label, words)], in order."""
    seq = words_of(text)
    used = [False] * len(seq)
    found = []
    cands = [(lb, ws, 'letters') for lb, ws in LETTER_ITEMS.items()] + [(lb, ws, 'word') for lb, ws in WORD_ITEMS.items()]
    for label, ws, kind in sorted(cands, key=lambda c: -len(c[1])):
        i = 0
        while i <= len(seq) - len(ws):
            if seq[i:i + len(ws)] == ws and not any(used[i:i + len(ws)]):
                found.append((i, kind, label, ws))
                for k in range(i, i + len(ws)):
                    used[k] = True
                i += len(ws)
            else:
                i += 1
    run = []
    for i in range(len(seq) + 1):
        if i < len(seq) and not used[i] and seq[i] in NUMBER_WORDS:
            run.append(i)
            continue
        if len(run) >= 2 and any(seq[k] not in {'một', 'hai', 'năm', 'ba'} for k in run):
            ws = [seq[k] for k in run]
            found.append((run[0], 'figure', ' '.join(ws), ws))
        run = []
    found.sort()
    return seq, found


# ---------------------------------------------------------------- what to listen to

targets = []
for sc in manifest['scenes']:
    if ONLY and sc['id'] not in ONLY:
        continue
    for k, sent in enumerate(sc['sentences']):
        if MATCH and not re.search(MATCH, sent['text']):
            continue
        seq, items = items_of(sent['text'])
        targets.append({'scene': sc['id'], 'n': k + 1, 'wav': sc['wav'], 'text': sent['text'], 'file': sent['file'],
                        'speed': sent.get('speed'), 'key': bool(sent.get('key')) or any(it[1] != 'word' for it in items),
                        'seq': seq, 'items': items})
if not targets:
    sys.exit('nothing to listen to (check --only / --match).')
print(f"{len(targets)} sentence(s) of {content.relative_to(ROOT)} to listen to"
      + (' (current takes only)' if LISTEN_ONLY else ''), flush=True)


# ---------------------------------------------------------------- the ledger

def digest(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()[:16]

def load_ledger():
    try:
        d = json.load(open(LEDGER, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        d = {}
    d.setdefault('clips', {})
    d.setdefault('pitch', {})
    d.setdefault('heard', {})
    return d

LED = load_ledger()

def save_ledger():
    LED['note'] = ('Verdicts of scripts/tts_takes.py, keyed by the first 16 hex of the sha1 of a take\'s audio. '
                   'scripts/lib/heard.mjs (verify voice-heard, render.mjs) reads it.')
    tmp = LEDGER.with_suffix('.part')
    tmp.write_text(json.dumps(LED, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(LEDGER)

def take_paths(base):
    return sorted(glob.glob(base.replace('.wav', '.take*.wav')),
                  key=lambda p: int(re.search(r'take(\d+)', p).group(1)))


# ---------------------------------------------------------------- record

def record(items):
    """One OmniVoice job for every take of this round (the model loads once)."""
    if not items:
        return
    spec = {k: manifest[k] for k in ('model', 'device', 'ref_audio', 'ref_text', 'speed')}
    spec['items'] = items
    spec_path = CACHE / '_takes_items.json'
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"recording {len(items)} take(s) with OmniVoice…", flush=True)
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/tts_omnivoice.py'), str(spec_path)], capture_output=True, text=True)
    ok = sum(l.startswith('OK') for l in r.stdout.splitlines())
    fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
    print(f"  {ok} ok, {len(fails)} failed" + (f"\n  {fails[0]}" if fails else ''), flush=True)
    if not ok and fails:
        sys.exit(1)

def queue_takes(t, upto):
    """Paths for new takes of t so it has `upto` takes in all (base not counted)."""
    have = take_paths(t['file'])
    start = 2 if not have else int(re.search(r'take(\d+)', have[-1]).group(1)) + 1
    return [{'text': t['text'], 'out': t['file'].replace('.wav', f'.take{n}.wav'), 'speed': t.get('speed')}
            for n in range(start, start + max(0, upto - len(have)))]

if FRESH and not (DRY or LISTEN_ONLY):
    for t in targets:
        for p in take_paths(t['file']):
            Path(p).unlink()
# A base take is missing right after the lexicon changed (new spoken form, new cache key): record it with the first
# round so the whole batch is one model load, and voiceover.mjs --reassemble finds it in place.
first = [{'text': t['text'], 'out': t['file'], 'speed': t.get('speed')} for t in targets if not Path(t['file']).exists()]
if first and (DRY or LISTEN_ONLY):
    sys.exit(f"{len(first)} sentence take(s) not recorded yet — run scripts/voiceover.mjs --content={manifest['content']} first.")
if not (DRY or LISTEN_ONLY):
    record(first + [it for t in targets if t['key'] for it in queue_takes(t, TAKES)])


# ---------------------------------------------------------------- listen

import mlx_whisper  # noqa: E402  (slow import, after the cheap exits above)
from mlx_whisper.tokenizer import get_tokenizer  # noqa: E402
import librosa  # noqa: E402
import numpy as np  # noqa: E402

# The prompt of every pass: numbers and a date written as words, so a figure comes back as the words said — but none of
# the sentence's own figures (a prompt holding the expected figure primes Whisper to hear it): each part has an
# alternative for a sentence that says one of its numbers. Measured 2026-10-06 on "Thứ Ba, ngày sáu tháng mười.":
# without the date part Whisper looped ("!!!! Ngày mùng sáu tháng mười.") and lost "Thứ Ba"; with it, all heard.
PRIMER_PARTS = [
    ['Thứ Năm, ngày hai mươi chín tháng hai.', 'Thứ Hai, ngày mười hai tháng tám.'],
    ['Chỉ số đóng cửa một nghìn sáu trăm linh hai điểm,', 'Chỉ số đóng cửa một nghìn ba trăm linh tám điểm,'],
    ['giảm hai phẩy tám lăm phần trăm,', 'giảm bốn phẩy sáu ba phần trăm,'],
    ['có bốn mươi mốt mã tăng.', 'có sáu mươi tư mã tăng.'],
]

def primer_for(t):
    mine = [' '.join(canon(w) for w in ws) for _, kind, _, ws in t['items'] if kind == 'figure']
    def clash(part):
        theirs = [' '.join(canon(w) for w in ws) for _, kind, _, ws in items_of(part)[1] if kind == 'figure']
        return any(a in b or b in a for a in theirs for b in mine)
    return ' '.join(next((p for p in alts if not clash(p)), alts[0]) for alts in PRIMER_PARTS)

TOK = get_tokenizer(multilingual=True, language='vi', task='transcribe')
DEC = lambda i: TOK.encoding.decode([i])
# Text tokens only: a timestamp token decodes to '<|0.00|>' — suppressing those (the earlier version did, 1501 of
# them) leaves the decoder nothing legal where a timestamp is due, so it emits token 0, '!', and loops ("!!!!").
CJK_NUM = set('〇零一二三四五六七八九十百千万萬億')
EN_NUM = {'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
          'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty',
          'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion', 'percent'}
# ... and number words in other scripts: with the digits gone Whisper wrote "S-九 mươi sáu" and "S-Ninety" (2026-10-06).
DIGITS = [i for i in range(TOK.eot) if (lambda s: re.search(r'\d|%', s) or any(c in CJK_NUM for c in s)
                                        or s.strip().lower() in EN_NUM)(DEC(i))]
# Upper-case pieces Whisper writes a spelled item with ('M', 'SB', 'MSB', 'EMA'), suppressed only for a sentence that says it.
PIECE_IDS = {}
_subs = {lb[a:b] for lb in LETTER_ITEMS for a in range(len(lb)) for b in range(a + 1, len(lb) + 1)}
for i in range(TOK.eot):
    s = DEC(i).strip()
    if s in _subs or (len(s) >= 2 and s.upper() in LETTER_ITEMS):
        PIECE_IDS.setdefault(s if s in _subs else s.upper(), []).append(i)

def pitch_range(wav):
    """10th–90th percentile spread of the voiced pitch, in semitones around its median (cached by audio)."""
    h = digest(wav)
    if h in LED['pitch']:
        return LED['pitch'][h]
    y, sr = librosa.load(wav, sr=None)
    f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr, frame_length=2048)
    f = f0[voiced & ~np.isnan(f0)]
    v = 0.0 if len(f) < 10 else round(float(np.percentile(12 * np.log2(f / np.median(f)), 90)
                                            - np.percentile(12 * np.log2(f / np.median(f)), 10)), 2)
    LED['pitch'][h] = v
    return v

def junk(heard, n):
    ws = words_of(heard)
    if len(ws) < 0.6 * n or len(ws) > 1.8 * n + 2 or heard.count('!') > 3 or '$' in heard:
        return True
    run = 1
    for a, b in zip(ws, ws[1:]):
        run = run + 1 if a == b and a not in NUMBER_WORDS else 1  # "bảy trăm bảy mươi bảy" is not a loop
        if run >= 3:
            return True
    return len(ws) > 4 and len(set(ws)) < len(ws) / 2

def transcribe(wav, suppress, prompt, n, temperature):
    # sample_len caps a suppressed decode that starts looping ("!!!!", "$-$-$"): a sentence needs ~2–3 tokens a word.
    r = mlx_whisper.transcribe(wav, path_or_hf_repo=WHISPER, language='vi', word_timestamps=True, initial_prompt=prompt,
                               suppress_tokens=suppress, temperature=temperature, compression_ratio_threshold=None,
                               logprob_threshold=None, no_speech_threshold=None, condition_on_previous_text=False,
                               sample_len=3 * n + 12)
    words = []
    for s in r['segments']:
        for w in s.get('words', []):
            parts = re.findall(r'\w+', low(w['word']))  # "S-X-X" → three timed pieces
            if not parts:
                continue
            step = (float(w['end']) - float(w['start'])) / len(parts)
            for k, p in enumerate(parts):
                words.append((p, float(w['start']) + k * step, float(w['start']) + (k + 1) * step))
    return r['text'].strip(), words

def listen(wav, suppress, prompt, n, temps=(0.0, 0.3, 0.5)):
    """Greedy first; a suppressed decode that loops is retried with a little sampling before it counts as junk."""
    for temp in temps:
        heard, words = transcribe(wav, suppress, prompt, n, temp)
        if not junk(heard, n):
            return ('greedy' if temp == 0.0 else f'temp{temp}'), heard, words
    return 'junk', heard, words

def find(seq, sub, start=0):
    """First match at or after `start` — no wrap-around, so a figure said twice has to be heard twice."""
    for i in range(start, len(seq) - len(sub) + 1):
        if seq[i:i + len(sub)] == sub:
            return i
    return None

def silences(wav):
    e = subprocess.run(['ffmpeg', '-i', wav, '-af', 'silencedetect=noise=-40dB:d=0.06', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    dur = float(re.search(r'Duration: (\d+):(\d+):([\d.]+)', e).group(3))
    sil = [(float(a) - float(b), float(b)) for a, b in re.findall(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', e)]
    return sil, dur

_names = set(x for v in letters.values() for x in words_of(v)) | set(x for ws in LETTER_ITEMS.values() for x in ws)
LETTER_KEY = next((k for k in (phon, strip_marks) if len({k(x) for x in _names}) == len(_names)), lambda w: w)

# Bump when HOW a take is transcribed changes (suppression, primer, passes): cached transcripts are made again. The
# verdict built on them has its own LISTEN_VERSION, so a stricter rule re-scores every take without re-listening.
TRANSCRIBE_VERSION = 1

def transcripts(t, wav, h):
    """The words pass and (for a sentence that spells something) the letters pass of this take, cached by its audio."""
    spelled = [it for it in t['items'] if it[1] == 'letters']
    primer = primer_for(t)
    c = LED['heard'].get(h)
    if c and c.get('tv') == TRANSCRIBE_VERSION and c.get('text') == t['text'] and c.get('prompt') == primer \
            and (c.get('b') is not None or not spelled):
        return c
    n = len(t['seq'])
    a = listen(wav, [-1] + DIGITS, primer, n)
    b = None
    if spelled:
        extra = sorted({i for _, _, lb, _ in spelled for x in range(len(lb)) for y in range(x + 1, len(lb) + 1)
                        for i in PIECE_IDS.get(lb[x:y], [])} | {i for _, _, lb, _ in spelled for i in PIECE_IDS.get(lb, [])})
        prompt_b = primer + ' ' + ' '.join(f"{' '.join(ws).capitalize()} tăng." for _, _, _, ws in spelled)
        # one retry: when the letters pass loops, the words pass still shows the tickers (written, not spelled)
        b = listen(wav, [-1] + DIGITS + extra, prompt_b, n, temps=(0.0, 0.3))
    pack = lambda r: [r[0], r[1], [[w, round(s, 3), round(e, 3)] for w, s, e in r[2]]]
    c = {'tv': TRANSCRIBE_VERSION, 'text': t['text'], 'prompt': primer, 'a': pack(a), 'b': pack(b) if b else None}
    LED['heard'][h] = c
    return c

def align(t, words, mode, sil):
    """Every item of t matched IN SPOKEN ORDER against ONE transcript: a figure said twice has to be heard twice, and a
    repeat cannot be borrowed from the other pass (6/10: "giá trên EMA50, EMA50 trên MA200" said with the second EMA50
    missing passed when each pass lent one "năm mươi")."""
    r = {'found': {}, 'missing': [], 'inferred': [], 'joined': True, 'clarity': 0.0}
    if mode == 'junk' or not words:
        r['missing'] = [label for _, _, label, _ in t['items']]
        return r
    hw = [w for w, _, _ in words]
    can, ph, key, flat = [canon(w) for w in hw], [phon(w) for w in hw], [LETTER_KEY(w) for w in hw], [strip_marks(w) for w in hw]
    spoken = t['seq']
    cur = 0
    for pos, kind, label, ws in t['items']:
        tag = f"{label}@{pos}"
        if kind == 'figure':
            want = [canon(w) for w in ws]
            i = find(can, want, cur)
            if i is None:
                r['missing'].append(label)
                continue
            j = i + len(want)
            cur = j
            # a syllable glued onto the figure is a figure heard wrong: 6/10 "… hai mươi bảy chấm bốn hai chân thì xu
            # hướng gãy" — the script's next word comes one word late, after a word the script does not have
            nxt = spoken[pos + len(ws)] if pos + len(ws) < len(spoken) else None
            prv = spoken[pos - 1] if pos else None
            glued = None
            if nxt and j + 1 < len(hw) and ph[j] != phon(nxt) and ph[j + 1] == phon(nxt):
                glued = hw[j]
            elif prv and i >= 2 and ph[i - 1] != phon(prv) and ph[i - 2] == phon(prv):
                glued = hw[i - 1]
            if glued:
                r['missing'].append(f"{label} (+{glued})")
                continue
            durs = [round(words[k][2] - words[k][1], 2) for k in range(i, j)]
            timed = [d for k, d in zip(range(i, j), durs) if k != 0]  # a clip's opening word gets a ~0 s span
            span = round(words[j - 1][2] - words[i][1], 2)
            r['found'][tag] = {'held': durs, 'span': span, 'rate': round(len(want) / span, 1) if span > 0 else None}
            r['clarity'] += (min(min(timed), 0.2) + min(sum(timed) / len(timed), 0.3) / 2) if timed else 0.1
        elif kind == 'word':
            i, m = find(ph, [phon(w) for w in ws], cur), len(ws)
            if i is None:
                # Whisper writing the word itself ("Uptrend", "Up trend") is the word heard
                glued_word = ''.join(strip_marks(w) for w in words_of(label))
                i, m = next(((k, n) for k in range(cur, len(flat)) for n in (1, 2, 3)
                             if ''.join(flat[k:k + n]) == glued_word), (None, 0))
            if i is None:
                r['missing'].append(label)
                continue
            cur = i + m
            r['found'][tag] = {'heard': True}
        else:
            want = [LETTER_KEY(w) for w in ws]
            i = find(key, want, cur)
            if i is None:
                # the letters written as the acronym itself: heard, but not letter by letter (no timing to judge)
                k = next((k for k in range(cur, len(hw)) if hw[k] == label.lower()), None)
                if k is None:
                    r['missing'].append(label)
                    continue
                cur = k + 1
                r['found'][tag] = {'held': None, 'how': 'written'}
                r['inferred'].append(label)
                r['clarity'] += 0.05
                continue
            j = i + len(want)
            ks = range(i, j)
            durs = [round(words[k][2] - words[k][1], 2) for k in ks]
            timed = [words[k][2] - words[k][1] for k in ks if k != 0]
            gaps = [words[k + 1][1] - words[k][2] for k in ks[:-1] if k != 0]
            lo, hi = (words[i][2] if i != 0 else 0.15), words[j - 1][1]
            inner = max([d for s, d in sil if s >= lo - 0.05 and s + d <= hi + 0.05] or [0.0]) if hi > lo else 0.0
            gap = round(max(gaps + [inner, 0.0]), 2)
            cur = j
            r['found'][tag] = {'held': durs, 'gap': gap, 'how': 'letters'}
            r['joined'] = r['joined'] and gap < GAP
            r['clarity'] += min(min(timed), 0.25) if timed else 0.1
    return r

def features(t, wav, h):
    seq = t['seq']
    n = len(seq)
    c = transcripts(t, wav, h)
    sil, dur = silences(wav)
    passes = [('words', c['a'])] + ([('letters', c['b'])] if c.get('b') else [])
    judged = []
    for name, (mode, heard, words) in passes:
        ws = [(w, s, e) for w, s, e in words]
        judged.append((name, mode, ws, align(t, ws, mode, sil)))
    # the one transcript that hears the most, whole: fewest missing, then fewest only written as an acronym, then clearest
    name, mode, ws, r = min(judged, key=lambda x: (len(x[3]['missing']), len(x[3]['inferred']), -x[3]['clarity']))
    f = {'v': LISTEN_VERSION, 'text': t['text'], 'mode': c['a'][0], 'heard': c['a'][1],
         'mode_letters': c['b'][0] if c.get('b') else None, 'heard_letters': c['b'][1] if c.get('b') else None,
         'judged_on': name, 'items': [[kind, label] for _, kind, label, _ in t['items']],
         'found': r['found'], 'missing': r['missing'], 'inferred': r['inferred'], 'joined': r['joined'],
         'dur': round(dur, 2)}
    # every other word of the script (single number words included), tone marks ignored, heard in either pass
    covered = {k for pos, _, _, its in t['items'] for k in range(pos, pos + len(its))}
    rest = [strip_marks(w) for k, w in enumerate(seq) if k not in covered]
    pool = {strip_marks(w) for _, (m, _, words) in passes if m != 'junk' for w, _, _ in words}
    misses = [w for w in rest if w not in pool]
    f['coverage'] = round(1 - len(misses) / len(rest), 2) if rest else 1.0
    f['misses'] = misses
    f['cov_ok'] = len(misses) <= max(1, int(0.15 * len(rest)))
    pauses = [round(d, 2) for s, d in sil if s > 0.15 and s + d < dur - 0.15 and d >= 0.2]
    f['comma_ok'] = (len(pauses) >= t['text'].count(',')) if COMMAS else True
    rate = n / dur if dur else 0
    f['sane'] = 1.8 <= rate <= 9.0
    f['clarity'] = round(r['clarity'], 3)
    f['ratio'] = round(difflib.SequenceMatcher(None, [strip_marks(w) for w in seq], [strip_marks(w) for w, _, _ in ws]).ratio(), 3)
    f['clear'] = bool(f['sane'] and mode != 'junk' and not f['missing'] and f['joined'] and f['cov_ok'] and f['comma_ok'])
    f['required'] = [label for _, _, label, _ in t['items']]
    f['at'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    return f

def verdict(t, wav):
    """The ledger entry for this take of t, judged now if it has none (or one of another version / text)."""
    h = digest(wav)
    e = LED['clips'].get(h)
    if e and e.get('v') == LISTEN_VERSION and e.get('text') == t['text']:
        return h, e, False
    t0 = time.time()
    e = features(t, wav, h)
    e['pitch'] = pitch_range(wav)
    LED['clips'][h] = e
    save_ledger()
    return h, e, time.time() - t0

def show(e):
    miss = (' missing ' + ', '.join(e['missing'])) if e['missing'] else ''
    inf = (' (written, not spelled: ' + ', '.join(e['inferred']) + ')') if e['inferred'] else ''
    cov = '' if e['cov_ok'] else f" dropped {e['misses']}"
    gap = '' if e['joined'] else ' GAP-in-ticker'
    return f"{'CLEAR' if e['clear'] else 'unclear'}{miss}{cov}{gap}{inf}"

def partial_key(e):
    return (e['clear'], e['sane'], -len(e['missing']), e['joined'], e['cov_ok'], e['mode'] != 'junk',
            round(e['clarity'] * 20) / 20, min(e.get('pitch', 0), 12.0), e['ratio'])


# ---------------------------------------------------------------- pick

chosen, report = {}, []
pending = list(targets)
rnd = 0
while pending:
    rnd += 1
    still = []
    for t in pending:
        base = t['file']
        clips = [base] if LISTEN_ONLY else [base] + take_paths(base)
        uniq, seen = [], set()
        for c in clips:
            h = digest(c)
            if h not in seen:
                seen.add(h)
                uniq.append(c)
        # widest pitch range first: the first CLEAR take in this order is the liveliest clear one
        order = uniq if len(uniq) == 1 else sorted(uniq, key=lambda c: -pitch_range(c))
        rows, best = [], None
        for c in order:
            h, e, took = verdict(t, c)
            rows.append((c, e))
            if took:
                print(f"  {t['scene']}#{t['n']} {Path(c).name:24} {show(e)}  {took:4.0f}s", flush=True)
            if e['clear']:
                best = (c, e)
                break
        if best is None:
            best = max(rows, key=lambda r: partial_key(r[1]))
        chosen[id(t)] = (t, best, rows, len(uniq))
        if not best[1]['clear']:
            still.append(t)
    if LISTEN_ONLY or DRY or not still:
        break
    more = [it for t in still for it in queue_takes(t, min(len(take_paths(t['file'])) + TAKES, MAX_TAKES))]
    if not more:
        break
    print(f"\nround {rnd + 1}: {len(still)} sentence(s) with no clear take yet — more takes", flush=True)
    record(more)
    pending = still

changed, unresolved, soft = {}, [], []
print()
for t in targets:
    t_, (best_clip, e), rows, n_clips = chosen[id(t)]
    label = f"{t['scene']}#{t['n']}"
    print(f"{'✓' if e['clear'] else '✗'} {label:22} {Path(best_clip).name:24} {show(e)}  | {t['text'][:70]}", flush=True)
    if not e['clear']:
        print(f"      heard: {e['heard']}" + (f"\n      letters: {e['heard_letters']}" if e.get('heard_letters') else ''), flush=True)
        (unresolved if e['required'] else soft).append((t, e))
    if not (DRY or LISTEN_ONLY) and digest(best_clip) != digest(t['file']):
        shutil.copyfile(best_clip, t['file'])
        Path(t['file'].replace('.wav', '.trim.wav')).unlink(missing_ok=True)
        changed.setdefault(t['scene'], []).append(Path(best_clip).name)
    report.append({**{k: v for k, v in t.items() if k not in ('seq', 'items')}, 'chosen': best_clip, 'verdict': e,
                   'listened': [{'take': c, **v} for c, v in rows], 'takes': n_clips})

if REPORT:
    Path(REPORT).write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
save_ledger()
print()
clear = sum(1 for t in targets if chosen[id(t)][1][1]['clear'])
print(f"{clear}/{len(targets)} sentence(s) clear", flush=True)
if soft:
    print(f"{len(soft)} sentence(s) without a figure or term not heard whole (a word dropped?) — listen: "
          + '; '.join(f"{t['scene']}#{t['n']}" for t, _ in soft))
if changed:
    ids = ','.join(changed)
    cmd = ['node', 'scripts/voiceover.mjs', f"--content={manifest['content']}", '--reassemble', f'--only={ids}', '--retime']
    print(f"{sum(len(v) for v in changed.values())} take(s) swapped in {len(changed)} scene(s).")
    if REBUILD:
        print('rebuilding: ' + ' '.join(cmd), flush=True)
        if subprocess.run(cmd, cwd=ROOT).returncode:
            sys.exit(1)
    else:
        print('Rebuild their tracks:\n  ' + ' '.join(cmd))
elif not (DRY or LISTEN_ONLY):
    print('no take changed')
if unresolved:
    print(f"\n{len(unresolved)} sentence(s) UNRESOLVED — no clear take in {MAX_TAKES} takes: "
          + '; '.join(f"{t['scene']}#{t['n']} ({', '.join(e['missing']) or 'garbled'})" for t, e in unresolved)
          + "\nShorten the sentence (one or two figures per sentence) or split it, re-voice that scene with "
            "`voiceover.mjs --force --only=<id>`, and run this again. Render stays blocked until then.")
    sys.exit(3)
