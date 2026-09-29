# remotion-market

Vertical (1080×1920) market-analysis reels in the style of a Vietnamese finance
channel: dark editorial background, a data panel in the middle, a two-line
headline underneath that escalates while the panel holds still.

The whole video is described by **one JSON file**. Code renders it; content
drives it.

```
content/channel.json          ← reel "Channel": VNINDEX monthly channel, 4-year cycle, MACD
content/vnindex-monthly.json  ← the price series every chart is drawn from
```

Each content file is registered as its own composition in `src/Root.tsx` and
shares the same code, layout and voice. Add another by dropping a JSON file
next to it and adding one row to `REELS`.

---

## The workflow

```bash
npm install
npm run build          # voiceover + render -> out/channel.mp4
```

`npm run build` runs three steps, each of which you can also run alone:

| Step | Command | What it does |
|---|---|---|
| 0. Market data | `node scripts/fetch-market.mjs --symbol=VNINDEX --signals` | Pulls price history and RSI-divergence signals from **[zionle.io.vn](https://zionle.io.vn)**, the project's source of record (1,492 tickers). Needs a `config_id` — see below. |
| 1. Long series | `node scripts/fetch-market.mjs --symbol=VNINDEX --source=ssi --replace-series` | Real monthly VNINDEX since 2013 from SSI iBoard (no auth), plus a `.meta.json` with provenance. `--source=entrade` is the alternate. `scripts/make-series.mjs` is the old reconstruction, offline use only. |
| 2. Voice | `npm run voiceover` | Speaks each scene's `narration` into `public/voiceover/` with **OmniVoice**, cloning the reference in `assets/voices/`. Writes the `audio` path back into the content file. |
| 3. Render | `npm run render` | Renders `out/channel.mp4`. |

While designing, skip the render loop entirely:

```bash
npm run studio         # live preview, scrub the timeline, edit props
```

### Useful variations

```bash
npm run build -- --id=<Id>       # another registered reel: its content, its output file
npm run build -- --retime        # stretch/shrink each scene to fit its narration
npm run build -- --no-voice      # silent render
npm run build -- --revoice       # re-synthesize the voice first (narration changed); --revoice=<sceneId,...> for some scenes
npm run build -- --frames=0-450  # render one scene while iterating
npm run review-page -- Channel   # review page + stills → out/review/channel/, published as an Artifact for approval
npm run voiceover -- --force     # re-synthesize after editing narration text
npm run voiceover -- --force --only=channel-evidence-4   # ...only that scene; the rest keep their track
npm run voiceover -- --voice=Linh --rate=150
```

**Bring your own voice.** `scripts/voiceover.mjs` never overwrites a file that
already exists. Drop `public/voiceover/03-momentum.wav` from ElevenLabs, a
recording, or anything else, and that take is used instead. Only missing files
get synthesized.

**Timing.** By default the authored `duration` of each scene wins and the
script warns if narration would be cut off. With `--retime` the voice wins:
each scene shrinks or grows to fit its track.

**Keeping the headline on the word.** Give a beat an `atSentence` index and the
script overwrites its `at` with the measured start of that narration sentence,
so the headline turns exactly as the voice reaches it:

```jsonc
"narration": "Năm 2018… Năm 2022… Và bây giờ, đỉnh 1933.",
"beats": [
  {"atSentence": 0, "at": 0.25,  "line1": "2018", "line2": "Chạm biên trên"},
  {"atSentence": 1, "at": 5.47,  "line1": "2022", "line2": "Từ 1500 về 900"},
  {"atSentence": 2, "at": 10.07, "line1": "2026", "line2": "Đỉnh 1933"}
]
```

The `at` values are outputs, not inputs — the script measures each trimmed
sentence and writes the offsets to `scene.sentenceStarts` so the sync is
auditable. Pinned beats are exempt from `--retime`'s proportional rescale,
since a beat already on the right word must not be moved off it. A beat without
`atSentence` keeps the old behaviour.

---

## Market data — zionle.io.vn

The project's source of record is the user's own **VN Trading Terminal** at
<https://zionle.io.vn>. `scripts/fetch-market.mjs` reads it; the full API contract is in
[`.claude/skills/market-video/reference.md`](.claude/skills/market-video/reference.md).

Every data endpoint needs a `config_id`, which the web app mints per browser and keeps in
localStorage under `trading-app_config-id`. Copy it out of DevTools and put it in
`.zionle-config` (gitignored) or `$ZIONLE_CONFIG_ID`. Sending none returns
`400 {"error":"config_id is required"}`; sending a stale one returns
`404 {"error":"configuration not found"}` — that second one reads like a bad path rather than a
bad credential. The script only ever issues GETs; it will not create a config on the service.

```bash
node scripts/fetch-market.mjs --probe --symbol=VNINDEX    # print the real response shape
node scripts/fetch-market.mjs --symbol=FPT --signals      # daily bars → monthly candles
```

## The skill

`/market-video` — or just "make me a video about RSI" — loads
[`.claude/skills/market-video/SKILL.md`](.claude/skills/market-video/SKILL.md), which carries the
whole process: pull the numbers, write the content JSON, voice it, render it, and the four
manual checks nothing in the pipeline enforces. It is written in Vietnamese to match the
sibling `video-factory` repo.

---

## Anatomy of a scene

Every scene is the same frame — eyebrow, panel, headline — which is most of why
the reel reads as one piece.

```jsonc
{
  "id": "history",
  "eyebrow": "Lịch sử đã lặp lại",   // small tracked label under the gold rule
  "act": "blue",                      // background mood: blue | maroon | amber | navy
  "duration": 19.4,                   // seconds
  "narration": "Năm hai nghìn mười tám…",

  // The panel holds still; the claim underneath escalates.
  // `at` is seconds from the start of THIS scene.
  "beats": [
    {"at": 0.4,   "line1": "2018", "line2": "Chạm biên trên", "accent": "gold"},
    {"at": 5.86,  "line1": "2022", "line2": "Từ 1500 về 900", "accent": "red"},
    {"at": 12.63, "line1": "2026", "line2": "Đỉnh 1933",      "accent": "red"}
  ],

  // What goes in the panel. The visual also reacts to the active beat —
  // here, the highlighted year moves 2018 → 2022 → 2026.
  "visual": {
    "type": "candles",
    "bands": [
      {"year": "2018", "label": "1204", "accent": "gold"},
      {"year": "2022", "label": "1528", "accent": "gold", "drop": true},
      {"year": "2026", "label": "1933", "accent": "red"}
    ]
  }
}
```

`act` shifts the background base colour. The reel walks through four moods:
cool while it is still analysis, maroon once it turns into a warning, warm for
the call to action, navy for the sign-off.

### Panel types

| `visual.type` | Shows | Key fields |
|---|---|---|
| `candles` | Monthly candlesticks in a log price channel | `touches`, `bands` (`drop: true` adds a measured drawdown arrow), `caption` |
| `macd` | MACD(12,26,9) computed from the same series | `caption`, `note`, `peakLabel` |
| `rsi` | Price over a bounded 0-100 oscillator with the 70/30 thresholds | `highlightZone`, `marks`, `divergence`, `note` |
| `pictogram` | "95 out of 100 people", as a grid you can count | `rows`, `columns`, `filledPercent` |
| `bars` | Labelled bars racing to their share | `bars[]` |
| `list` | Icon-chip rows revealing in sequence | `items[]`, `chipShape` |
| `cards` | Side-by-side warning cards | `cards[]` |
| `zigzag` | Distribution as a staircase of hope and hesitation | `steps`, `upLabel`, `downLabel` |
| `riskReward` | What being right pays vs. what being wrong costs | `left`, `right` |
| `outro` | Sign-off card: mark, pill, one line | `brand`, `pill`, `line`, `logo` |

Icons (`list`, `cards`) are drawn as SVG, not typed: `check`, `warning`,
`cross`, `up`, `down`. Symbol glyphs like ✓ are missing from several weights of
the Vietnamese subsets and silently fall back to another face.

Accents are `gold`, `red`, `green`, `white`.

---

## Making it yours

- **Branding.** `content/channel.json` ships with the placeholder brand
  `Kênh của bạn` and a generated monogram. Put your mark in `public/` and set
  `visual.logo` on the outro scene — the monogram and the duplicate brand line
  both disappear in favour of your image.
- **Real prices.** `content/vnindex-monthly.json` is real SSI iBoard data (daily
  bars since 2013-01, merged into months, `{t, o, h, l, c, v}` with `t` as
  `YYYY-MM`); `.meta.json` records source and fetch time, and the footer names
  the source from it. Refresh with step 1 above. `scripts/make-series.mjs` is the
  old reconstruction, offline only. `src/lib/series.ts` fits the channel through
  the months in `series.peakMonths` / `series.troughMonths` of
  `src/shared/content-rules.json`.
- **Music.** Add `"music": "bed.mp3"` (a path under `public/`) and optionally
  `"musicVolume": 0.1` at the top level of the content file.
- **A new panel type.** Add a variant to `Visual` in `src/types.ts`, write the
  component in `src/scenes/`, and add one branch to `src/scenes/index.tsx`.
  Nothing else changes.

---

## Layout

`src/theme.ts` holds every measurement, taken from the reference and scaled to
1080×1920. Change it there and the whole series moves together.

```
y 379   gold rule       (54 × 4)
y 446   eyebrow baseline
y 640   panel top       (880 × 560, 100px gutters)
y 1419  headline line 1 baseline
y 1545  headline line 2 baseline
```

Headlines auto-fit: 78px unless the line is too long for the 880px column, in
which case it shrinks. Baselines are anchored explicitly rather than by box, so
a shrunk line still sits on the same optical line. A scene can override the
whole block via `headline` — the outro does, because it carries a disclaimer.

Type is **Be Vietnam Pro** (800 for headlines, 400–600 for copy) and
**JetBrains Mono** for chart furniture, both loaded with the `vietnamese`
subset so stacked diacritics (Ổ, Ữ, Ặ) keep their cap height.

---

## Voice

Two engines, selected with `--engine`:

| | | |
|---|---|---|
| `omnivoice` | default | [k2-fsa/OmniVoice](https://huggingface.co/k2-fsa/OmniVoice) (Apache-2.0) running locally on the GPU, cloning the 4.4s clip in `assets/voices/`. Natural Vietnamese; ~2.7× realtime on an M4. |
| `say` | fallback | macOS speech synthesis. No model, no GPU, audibly robotic. |

```bash
npm run voiceover                      # OmniVoice
npm run voiceover -- --engine=say      # fallback
npm run voiceover -- --speed=1.05      # atempo; past 1.15 it sounds synthetic
```

**Changing the voice** means replacing `assets/voices/ref_ThanhBinh_khac_24k.wav`
with 3–10s of one speaker, no music, and putting that clip's exact words in the
matching `.txt`. Two constraints, both inherited from `video-factory` where they
cost real debugging time:

- The reference sentence must **not** be how any narration line starts. On
  overlap the model treats that span as already spoken and drops it.
- Inference is **fp32 only**. fp16 on MPS emits garbage tokens and never stops —
  it looks like a hang, not an error. `scripts/tts_omnivoice.py` pins this.

Synthesis is per sentence and content-addressed in `.tts-cache/`, so editing one
line of narration re-reads that line alone. The whole job loads the model once.

## Requirements

- Node 18+
- `ffmpeg` / `ffprobe` on PATH (`brew install ffmpeg`)
- For `--engine=omnivoice`: a Python with `torch`, `soundfile` and `omnivoice`.
  That environment is ~4GB, so rather than duplicate it the script defaults to
  the sibling `../video-factory/.venv`. Point elsewhere with `--python=<path>`
  or `TTS_PYTHON`.
- For `--engine=say`: macOS with the **Linh** Vietnamese voice (*System Settings
  → Accessibility → Spoken Content → System Voice → Manage Voices*).
