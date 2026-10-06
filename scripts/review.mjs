#!/usr/bin/env node
/**
 * Prints the review sheet a person reads before approving a reel.
 *
 *   npm run review -- Channel              by composition id (src/Root.tsx)
 *   node scripts/review.mjs content/channel.json
 *
 * Markdown, so it can be pasted straight into the reply: one row per scene
 * (role · panel · act · headlines · word count), then every scene's narration
 * with its headlines and panel text, then the whole `unsupported` list. It does
 * not grade anything — that is verify's job — it only lays the words out so
 * the reviewer never has to open the JSON.
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reels} from './lib/reels.mjs';
import {roleOf as roleIn} from './lib/roles.mjs';
import {loadRules} from './lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!arg) {
  console.error(`Usage: npm run review -- <id | content/<name>.json>   (${[...reels(ROOT).keys()].join(' | ')})`);
  process.exit(2);
}
const REG = reels(ROOT);
const path = arg.endsWith('.json') ? arg : REG.get(arg);
if (!path) {
  console.error(`No reel "${arg}". Registered: ${[...REG.keys()].join(', ')}`);
  process.exit(2);
}
const reel = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const R = loadRules(ROOT, {reel});
const id = arg.endsWith('.json') ? [...REG].find(([, p]) => p === arg)?.[0] ?? '(unregistered)' : arg;

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
/** The scene's `role`, or for older scaffolds the role named in its id (scripts/lib/roles.mjs). */
const roleOf = (scene) => roleIn(R, scene);
const headline = (b) => [b.line1, b.line2].filter(Boolean).join(' / ');
const cell = (s) => String(s).replace(/\|/g, '\\|');

const panelText = (v) => {
  switch (v.type) {
    case 'outro': return [v.brand, v.pill, v.line];
    default: return [];
  }
};

const total = reel.scenes.reduce((a, s) => a + (s.duration ?? 0), 0);
const out = [];
out.push(`## ${reel.title}`);
out.push(`${id} · status **${reel.status ?? 'hand-authored'}** · ${reel.scenes.length} scenes · ~${Math.round(total)}s estimated · ${reel.brief ?? ''}`);
out.push('');
out.push('| # | scene | role · panel | act | headlines | words |');
out.push('|---|---|---|---|---|---|');
reel.scenes.forEach((s, i) => {
  const hl = s.beats.map((b) => cell(headline(b))).join(' → ');
  out.push(`| ${i + 1} | ${s.id} | ${roleOf(s)} · ${s.visual.type} | ${s.act} | ${hl} | ${words(s.narration)} |`);
});
out.push('');
out.push('### Lời đọc từng scene');
reel.scenes.forEach((s, i) => {
  out.push('');
  out.push(`**${String(i + 1).padStart(2, '0')} · ${s.id}** — ${s.eyebrow || '(no eyebrow)'}`);
  out.push(`> ${s.narration ?? '(no narration)'}`);
  s.beats.forEach((b, k) => out.push(`- headline ${k + 1}${b.atSentence != null ? ` (câu ${b.atSentence + 1})` : ''}: **${headline(b)}** · ${b.accent ?? 'gold'}`));
  for (const line of panelText(s.visual).filter(Boolean)) out.push(`- panel: ${line}`);
});
out.push('');
out.push('### Ý đồ mà fact pack không đỡ được (`unsupported`)');
if (reel.unsupported?.length) for (const u of reel.unsupported) out.push(`- **${u.id}**: ${u.why}`);
else out.push('- (không có)');
console.log(out.join('\n'));
