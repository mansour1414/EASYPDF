/**
 * Minimal self-contained Arabic text shaper for PDF text drawing.
 *
 * WHY THIS EXISTS:
 * pdf-lib (@cantoo/pdf-lib) maps each Unicode codepoint directly to a glyph
 * when embedding custom fonts — it performs NO OpenType shaping and NO
 * bidirectional reordering. Raw Arabic strings would therefore render as
 * disconnected, left-to-right isolate glyphs. This module implements the two
 * transformations needed to produce correct *visual* output with fonts that
 * include the legacy "Arabic Presentation Forms-B" range (U+FE70–U+FEFF),
 * which Amiri (SIL OFL, bundled under public/fonts/) fully covers:
 *
 *   1. Contextual glyph-form selection (isolated / initial / medial / final)
 *      based on standard Unicode joining rules (dual-joining, right-joining,
 *      non-joining), including transparent (combining mark) skipping and the
 *      mandatory lam-alef ligatures (U+FEF5–U+FEFC).
 *   2. Visual reordering: the shaped logical string is reversed so it renders
 *      right-to-left, while contiguous runs of LTR characters (Latin letters,
 *      digits, common punctuation) are kept left-to-right so numbers, emails,
 *      and English fragments inside Arabic text remain readable. Mirror pairs
 *      (parentheses/brackets/braces) are swapped so they visually face the
 *      correct way after reversal.
 *
 * This is intentionally a lightweight approximation (no full UAX #9 bidi, no
 * harakat positioning). It is scoped strictly to /api/pdf/edit-text rendering.
 */

type JoinType = 'D' | 'R' | 'U';

// [isolated, final, initial, medial] presentation-form codepoints (Forms B).
// A value of 0 means that form does not exist for the letter (e.g. alef has
// no initial/medial because it only joins to the right).
const FORMS: Record<number, [number, number, number, number]> = {
  0x0621: [0xfe80, 0, 0, 0],             // hamza
  0x0622: [0xfe81, 0xfe82, 0, 0],        // alef madda (R)
  0x0623: [0xfe83, 0xfe84, 0, 0],        // alef hamza above (R)
  0x0624: [0xfe85, 0xfe86, 0, 0],        // waw hamza (R)
  0x0625: [0xfe87, 0xfe88, 0, 0],        // alef hamza below (R)
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // yeh hamza (D)
  0x0627: [0xfe8d, 0xfe8e, 0, 0],        // alef (R)
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // beh (D)
  0x0629: [0xfe93, 0xfe94, 0, 0],        // teh marbuta (R)
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], // teh (D)
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // theh (D)
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // jeem (D)
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], // hah (D)
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], // khah (D)
  0x062f: [0xfea9, 0xfeaa, 0, 0],        // dal (R)
  0x0630: [0xfeab, 0xfeac, 0, 0],        // thal (R)
  0x0631: [0xfead, 0xfeae, 0, 0],        // reh (R)
  0x0632: [0xfeaf, 0xfeb0, 0, 0],        // zain (R)
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // seen (D)
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // sheen (D)
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // sad (D)
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], // dad (D)
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], // tah (D)
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], // zah (D)
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], // ain (D)
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0], // ghain (D)
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // tatweel: same glyph all forms (D)
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], // feh (D)
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], // qaf (D)
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], // kaf (D)
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], // lam (D)
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], // meem (D)
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8], // noon (D)
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], // heh (D)
  0x0648: [0xfeed, 0xfeee, 0, 0],        // waw (R)
  0x0649: [0xfeef, 0xfef0, 0, 0],        // alef maksura (R)
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4], // yeh (D)
};

// Mandatory lam-alef ligatures: [alefBase -> [isolatedLigature, finalLigature]]
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc],
};

// Combining marks are transparent for joining purposes and pass through
// unchanged (they carry their own codepoints, which Amiri contains).
function isTransparent(cp: number): boolean {
  return (
    (cp >= 0x064b && cp <= 0x065f) || // harakat + small Quranic marks
    cp === 0x0670 ||                   // superscript alef
    cp === 0x06d6 || cp === 0x06d7 || cp === 0x06d8 ||
    cp === 0x06d9 || cp === 0x06da || cp === 0x06db || cp === 0x06dc
  );
}

function joinTypeOf(cp: number): JoinType {
  const entry = FORMS[cp];
  if (!entry) return 'U';
  return entry[2] !== 0 ? 'D' : 'R';
}

export function needsArabicShaping(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

interface ShapeItem {
  cp: number;        // base codepoint after lam-alef folding (or original char)
  lig?: [number, number]; // present => item is a lam-alef ligature
  type: JoinType;
  transparent: boolean;
  original: boolean; // false => produced by folding, must not re-fold
}

/** Returns the visual-order string to hand to pdf-lib's drawText(). */
export function shapeArabicText(input: string): string {
  if (!needsArabicShaping(input)) return input;

  // ---- 1. Tokenize --------------------------------------------------------
  const items: ShapeItem[] = [];
  for (const ch of input) {
    let cp = ch.codePointAt(0)!;
    if ((cp & 0xffff0000) !== 0) { items.push({ cp, type: 'U', transparent: false, original: true }); continue; }
    if (cp >= 0xfb50 && cp <= 0xfdff) { items.push({ cp, type: 'U', transparent: false, original: true }); continue; } // already a presentation form
    if (cp >= 0xfe70 && cp <= 0xfeff) { items.push({ cp, type: 'U', transparent: false, original: true }); continue; }
    items.push({ cp, type: joinTypeOf(cp), transparent: isTransparent(cp), original: true });
  }

  // ---- 2. Fold mandatory lam-alef ligatures -------------------------------
  const folded: ShapeItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.cp === 0x0644 && it.original) {
      // find next non-transparent
      let j = i + 1;
      while (j < items.length && items[j].transparent) j++;
      const nxt = items[j];
      if (nxt && nxt.original && !nxt.transparent && LAM_ALEF[nxt.cp]) {
        folded.push({
          cp: nxt.cp,
          lig: LAM_ALEF[nxt.cp],
          type: 'D',            // lam side joins backward like lam
          transparent: false,
          original: false,
        });
        i = j; // consume the alef too
        continue;
      }
    }
    folded.push(it);
  }

  // ---- 3. Choose contextual form per item ---------------------------------
  const out: number[] = [];
  const resolved: Array<{ out: number; ltrRun: boolean }> = [];
  for (let i = 0; i < folded.length; i++) {
    const cur = folded[i];
    if (cur.transparent) { resolved.push({ out: cur.cp, ltrRun: false }); continue; }

    let p = i - 1;
    while (p >= 0 && folded[p].transparent) p--;
    let n = i + 1;
    while (n < folded.length && folded[n].transparent) n++;
    const prev = p >= 0 ? folded[p] : null;
    const next = n < folded.length ? folded[n] : null;

    const joinedPrev = !!prev && prev.type === 'D' && cur.type !== 'U';
    const canJoinNext = !!next && cur.type === 'D' && next.type !== 'U';

    let emitted: number;
    if (cur.lig) {
      // Ligature exists only in isolated/final variants.
      emitted = joinedPrev ? cur.lig[1] : cur.lig[0];
    } else if (!FORMS[cur.cp]) {
      emitted = cur.cp; // not an Arabic shaping letter — passthrough
    } else {
      const f = FORMS[cur.cp];
      if (joinedPrev && canJoinNext) emitted = f[3] || f[1];
      else if (joinedPrev) emitted = f[1] || f[0];
      else if (canJoinNext) emitted = f[2] || f[0];
      else emitted = f[0];
    }
    resolved.push({ out: emitted, ltrRun: isLtrChar(cur.cp) });
  }

  // ---- 4. Visual reordering ----------------------------------------------
  // Base direction is RTL: the whole run SEQUENCE is reversed so the first
  // logical segment lands rightmost on the page, while
  //   - LTR segments (digits/Latin/punct) keep their internal left-to-right
  //     order (standard Unicode bidi embedding behavior), and
  //   - RTL segments get their characters reversed (already shaped above),
  //     with mirror-pair punctuation swapped so brackets face correctly.
  // Previously only the characters inside RTL runs were reversed while the
  // run ORDER stayed logical — which placed the sentence's first word
  // leftmost instead of rightmost and scrambled embedded numbers/Latin.
  const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

  // Split resolved items into contiguous directional runs.
  type Run = { ltr: boolean; items: Array<{ out: number }> };
  const runs: Run[] = [];
  for (const r of resolved) {
    const last = runs[runs.length - 1];
    if (!last || last.ltr !== r.ltrRun) {
      runs.push({ ltr: r.ltrRun, items: [{ out: r.out }] });
    } else {
      last.items.push({ out: r.out });
    }
  }

  // Emit runs in reverse order (RTL base); within each run preserve/flip
  // according to its direction.
  for (let ri = runs.length - 1; ri >= 0; ri--) {
    const run = runs[ri];
    if (run.ltr) {
      for (const it of run.items) out.push(it.out);
    } else {
      for (let k = run.items.length - 1; k >= 0; k--) {
        const s = String.fromCodePoint(run.items[k].out);
        out.push(MIRROR[s] ? MIRROR[s].codePointAt(0)! : run.items[k].out);
      }
    }
  }

  return String.fromCodePoint(...out);
}

function isLtrChar(cp: number): boolean {
  return (
    (cp >= 0x0030 && cp <= 0x0039) || // 0-9
    (cp >= 0x0041 && cp <= 0x005a) || // A-Z
    (cp >= 0x0061 && cp <= 0x007a) || // a-z
    cp === 0x0020 || cp === 0x0040 || cp === 0x0023 ||
    cp === 0x0025 || cp === 0x002b || cp === 0x002d ||
    cp === 0x002e || cp === 0x002c || cp === 0x003a ||
    cp === 0x003b || cp === 0x002f || cp === 0x005f
  );
}
