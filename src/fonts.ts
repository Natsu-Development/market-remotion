import {loadFont as loadSans} from '@remotion/google-fonts/BeVietnamPro';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

// The vietnamese subset carries the stacked diacritics (Ổ, Ữ, Ặ …). Without it
// the headline silently falls back and the tone marks drift off the cap height.
const sans = loadSans('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin', 'latin-ext', 'vietnamese'],
});

const mono = loadMono('normal', {
  weights: ['400', '500', '700'],
  subsets: ['latin', 'latin-ext', 'vietnamese'],
});

export const FONTS = {
  /** Headlines and big numbers, at weight 800. */
  display: sans.fontFamily,
  /** Eyebrows, list rows, body copy. */
  text: sans.fontFamily,
  /** Chart furniture: axis labels, ticker strings, annotations. */
  mono: mono.fontFamily,
} as const;
