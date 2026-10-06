"""OmniVoice worker — runs as its OWN PROCESS, driven by scripts/voiceover.mjs.

Ported from video-factory/steps/tts_omnivoice.py. Two things that repo paid for in
wasted hours, kept verbatim here because they are not discoverable from the API:

1. dtype MUST be float32. float16 on MPS emits garbage tokens and never reaches a
   stop condition — it looks exactly like a hang, not like an error.
2. `ref_text` must be a sentence that does NOT appear at the start of the text being
   spoken. When it overlaps, the model treats that part as already said and skips it.

Separate process because OmniVoice pulls torch + transformers (~3-4GB on MPS) into
memory. The model is loaded ONCE for the whole job: the caller batches every line it
needs into one spec file and invokes this once.

Usage:  python scripts/tts_omnivoice.py <spec.json>
spec.json: {"model":…, "device":…, "ref_audio":…, "ref_text":…, "speed":1.0,
            "items":[{"text":…, "out":…}, …]}
Prints "OK <out> <secs>" or "FAIL <out> <reason>" per line; exit 0 when nothing failed.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

SAMPLE_RATE = 24000


def main() -> int:
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    import numpy as np
    import soundfile as sf
    import torch
    from omnivoice import OmniVoice

    device = spec.get("device") or ("mps" if torch.backends.mps.is_available() else "cpu")
    t0 = time.time()
    model = OmniVoice.from_pretrained(
        spec.get("model") or "k2-fsa/OmniVoice", device_map=device, dtype=torch.float32
    )
    print(f"INFO model loaded in {time.time() - t0:.0f}s on {device}", flush=True)

    ref_audio, ref_text = spec["ref_audio"], spec["ref_text"]
    speed = float(spec.get("speed") or 1.0)
    failed = 0
    # Speed is the model's own factor (an item's "speed" overrides the spec's); 1.0 is left to the
    # model's estimate. Earlier builds stretched with ffmpeg atempo, which past 1.15 sounded synthetic.

    for it in spec["items"]:
        out = Path(it["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            t = time.time()
            sp = float(it.get("speed") or speed)
            audio = model.generate(
                text=it["text"], ref_audio=ref_audio, ref_text=ref_text,
                speed=None if abs(sp - 1.0) < 1e-3 else sp,
            )
            wav = np.asarray(
                audio[0] if hasattr(audio, "__len__") else audio, dtype="float32"
            ).squeeze()
            tmp = out.with_suffix(".part.wav")
            sf.write(str(tmp), wav, SAMPLE_RATE)
            tmp.replace(out)
            print(f"OK {out} {len(wav) / SAMPLE_RATE:.1f}s/{time.time() - t:.1f}s", flush=True)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL {out} {type(e).__name__}: {str(e)[:140]}", flush=True)

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
