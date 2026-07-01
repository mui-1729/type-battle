import type { MistakeSample, ProgressState } from "./typing-progress";

export type RomajiTypingUnit = {
  hiragana: string;
  guide: string;
  accepted: string[];
};

export type RomajiTypingPlan = {
  guide: string;
  units: RomajiTypingUnit[];
};

export type RomajiProgressUpdate = {
  progress: ProgressState;
  mistakeSamples: MistakeSample[];
};

const BASIC_KANA_MAP: Record<string, { guide: string; accepted: string[] }> = {
  あ: { guide: "a", accepted: ["a"] },
  い: { guide: "i", accepted: ["i"] },
  う: { guide: "u", accepted: ["u"] },
  え: { guide: "e", accepted: ["e"] },
  お: { guide: "o", accepted: ["o"] },
  か: { guide: "ka", accepted: ["ka"] },
  き: { guide: "ki", accepted: ["ki"] },
  く: { guide: "ku", accepted: ["ku"] },
  け: { guide: "ke", accepted: ["ke"] },
  こ: { guide: "ko", accepted: ["ko"] },
  さ: { guide: "sa", accepted: ["sa"] },
  し: { guide: "shi", accepted: ["shi", "si"] },
  す: { guide: "su", accepted: ["su"] },
  せ: { guide: "se", accepted: ["se"] },
  そ: { guide: "so", accepted: ["so"] },
  た: { guide: "ta", accepted: ["ta"] },
  ち: { guide: "chi", accepted: ["chi", "ti"] },
  つ: { guide: "tsu", accepted: ["tsu", "tu"] },
  て: { guide: "te", accepted: ["te"] },
  と: { guide: "to", accepted: ["to"] },
  な: { guide: "na", accepted: ["na"] },
  に: { guide: "ni", accepted: ["ni"] },
  ぬ: { guide: "nu", accepted: ["nu"] },
  ね: { guide: "ne", accepted: ["ne"] },
  の: { guide: "no", accepted: ["no"] },
  は: { guide: "ha", accepted: ["ha"] },
  ひ: { guide: "hi", accepted: ["hi"] },
  ふ: { guide: "fu", accepted: ["fu", "hu"] },
  へ: { guide: "he", accepted: ["he"] },
  ほ: { guide: "ho", accepted: ["ho"] },
  ま: { guide: "ma", accepted: ["ma"] },
  み: { guide: "mi", accepted: ["mi"] },
  む: { guide: "mu", accepted: ["mu"] },
  め: { guide: "me", accepted: ["me"] },
  も: { guide: "mo", accepted: ["mo"] },
  や: { guide: "ya", accepted: ["ya"] },
  ゆ: { guide: "yu", accepted: ["yu"] },
  よ: { guide: "yo", accepted: ["yo"] },
  ら: { guide: "ra", accepted: ["ra"] },
  り: { guide: "ri", accepted: ["ri"] },
  る: { guide: "ru", accepted: ["ru"] },
  れ: { guide: "re", accepted: ["re"] },
  ろ: { guide: "ro", accepted: ["ro"] },
  わ: { guide: "wa", accepted: ["wa"] },
  を: { guide: "wo", accepted: ["wo", "o"] },
  ん: { guide: "n", accepted: ["n"] },
  が: { guide: "ga", accepted: ["ga"] },
  ぎ: { guide: "gi", accepted: ["gi"] },
  ぐ: { guide: "gu", accepted: ["gu"] },
  げ: { guide: "ge", accepted: ["ge"] },
  ご: { guide: "go", accepted: ["go"] },
  ざ: { guide: "za", accepted: ["za"] },
  じ: { guide: "ji", accepted: ["ji", "zi"] },
  ず: { guide: "zu", accepted: ["zu"] },
  ぜ: { guide: "ze", accepted: ["ze"] },
  ぞ: { guide: "zo", accepted: ["zo"] },
  だ: { guide: "da", accepted: ["da"] },
  ぢ: { guide: "ji", accepted: ["ji", "di"] },
  づ: { guide: "zu", accepted: ["zu", "du"] },
  で: { guide: "de", accepted: ["de"] },
  ど: { guide: "do", accepted: ["do"] },
  ば: { guide: "ba", accepted: ["ba"] },
  び: { guide: "bi", accepted: ["bi"] },
  ぶ: { guide: "bu", accepted: ["bu"] },
  べ: { guide: "be", accepted: ["be"] },
  ぼ: { guide: "bo", accepted: ["bo"] },
  ぱ: { guide: "pa", accepted: ["pa"] },
  ぴ: { guide: "pi", accepted: ["pi"] },
  ぷ: { guide: "pu", accepted: ["pu"] },
  ぺ: { guide: "pe", accepted: ["pe"] },
  ぽ: { guide: "po", accepted: ["po"] },
  ぁ: { guide: "xa", accepted: ["xa", "la"] },
  ぃ: { guide: "xi", accepted: ["xi", "li"] },
  ぅ: { guide: "xu", accepted: ["xu", "lu"] },
  ぇ: { guide: "xe", accepted: ["xe", "le"] },
  ぉ: { guide: "xo", accepted: ["xo", "lo"] },
  ゃ: { guide: "xya", accepted: ["xya", "lya"] },
  ゅ: { guide: "xyu", accepted: ["xyu", "lyu"] },
  ょ: { guide: "xyo", accepted: ["xyo", "lyo"] },
  ゎ: { guide: "xwa", accepted: ["xwa", "lwa"] },
  ゕ: { guide: "xka", accepted: ["xka", "lka"] },
  ゖ: { guide: "xke", accepted: ["xke", "lke"] }
};

const DIGRAPH_MAP: Record<string, { guide: string; accepted: string[] }> = {
  きゃ: { guide: "kya", accepted: ["kya"] },
  きゅ: { guide: "kyu", accepted: ["kyu"] },
  きょ: { guide: "kyo", accepted: ["kyo"] },
  しゃ: { guide: "sha", accepted: ["sha", "sya", "shya"] },
  しゅ: { guide: "shu", accepted: ["shu", "syu", "shyu"] },
  しょ: { guide: "sho", accepted: ["sho", "syo", "shyo"] },
  ちゃ: { guide: "cha", accepted: ["cha", "tya", "cya", "chya"] },
  ちゅ: { guide: "chu", accepted: ["chu", "tyu", "cyu", "chyu"] },
  ちょ: { guide: "cho", accepted: ["cho", "tyo", "cyo", "chyo"] },
  にゃ: { guide: "nya", accepted: ["nya"] },
  にゅ: { guide: "nyu", accepted: ["nyu"] },
  にょ: { guide: "nyo", accepted: ["nyo"] },
  ひゃ: { guide: "hya", accepted: ["hya"] },
  ひゅ: { guide: "hyu", accepted: ["hyu"] },
  ひょ: { guide: "hyo", accepted: ["hyo"] },
  みゃ: { guide: "mya", accepted: ["mya"] },
  みゅ: { guide: "myu", accepted: ["myu"] },
  みょ: { guide: "myo", accepted: ["myo"] },
  りゃ: { guide: "rya", accepted: ["rya"] },
  りゅ: { guide: "ryu", accepted: ["ryu"] },
  りょ: { guide: "ryo", accepted: ["ryo"] },
  ぎゃ: { guide: "gya", accepted: ["gya"] },
  ぎゅ: { guide: "gyu", accepted: ["gyu"] },
  ぎょ: { guide: "gyo", accepted: ["gyo"] },
  じゃ: { guide: "ja", accepted: ["ja", "jya", "zya"] },
  じゅ: { guide: "ju", accepted: ["ju", "jyu", "zyu"] },
  じょ: { guide: "jo", accepted: ["jo", "jyo", "zyo"] },
  ぢゃ: { guide: "ja", accepted: ["ja", "dya", "jya", "zya"] },
  ぢゅ: { guide: "ju", accepted: ["ju", "dyu", "jyu", "zyu"] },
  ぢょ: { guide: "jo", accepted: ["jo", "dyo", "jyo", "zyo"] },
  びゃ: { guide: "bya", accepted: ["bya"] },
  びゅ: { guide: "byu", accepted: ["byu"] },
  びょ: { guide: "byo", accepted: ["byo"] },
  ぴゃ: { guide: "pya", accepted: ["pya"] },
  ぴゅ: { guide: "pyu", accepted: ["pyu"] },
  ぴょ: { guide: "pyo", accepted: ["pyo"] },
  ふぁ: { guide: "fa", accepted: ["fa", "hwa"] },
  ふぃ: { guide: "fi", accepted: ["fi", "hwi"] },
  ふぇ: { guide: "fe", accepted: ["fe", "hwe"] },
  ふぉ: { guide: "fo", accepted: ["fo", "hwo"] },
  てぃ: { guide: "ti", accepted: ["ti", "thi"] },
  でぃ: { guide: "di", accepted: ["di", "dhi"] },
  しぇ: { guide: "she", accepted: ["she", "sye", "shye"] },
  ちぇ: { guide: "che", accepted: ["che", "tye", "cye", "chie"] },
  じぇ: { guide: "je", accepted: ["je", "jye", "zye"] },
  つぁ: { guide: "tsa", accepted: ["tsa"] },
  つぃ: { guide: "tsi", accepted: ["tsi"] },
  つぇ: { guide: "tse", accepted: ["tse"] },
  つぉ: { guide: "tso", accepted: ["tso"] },
  うぃ: { guide: "wi", accepted: ["wi"] },
  うぇ: { guide: "we", accepted: ["we"] },
  うぉ: { guide: "wo", accepted: ["wo"] }
};

const PUNCTUATION_MAP: Record<string, { guide: string; accepted: string[] }> = {
  "、": { guide: ",", accepted: [",", "、"] },
  "。": { guide: ".", accepted: [".", "。"] },
  ",": { guide: ",", accepted: [",", "、"] },
  ".": { guide: ".", accepted: [".", "。"] },
  "，": { guide: ",", accepted: [",", "，"] },
  "．": { guide: ".", accepted: [".", "．"] },
  "！": { guide: "!", accepted: ["!", "！"] },
  "？": { guide: "?", accepted: ["?", "？"] },
  "!": { guide: "!", accepted: ["!", "！"] },
  "?": { guide: "?", accepted: ["?", "？"] },
  " ": { guide: " ", accepted: [" "] },
  "ー": { guide: "-", accepted: ["-", "ー"] },
  "-": { guide: "-", accepted: ["-", "ー"] }
};

const SOKUON_ACCEPTED = ["xtu", "ltsu"];
const INITIAL_VOWELS_AND_Y = new Set(["a", "i", "u", "e", "o", "y"]);

export function buildRomajiTypingPlan(hiragana: string): RomajiTypingPlan {
  const glyphs = tokenizeHiragana(hiragana);
  const units = glyphs.map((glyph, index) => buildTypingUnit(glyph, glyphs[index + 1]));

  return {
    guide: units.map((unit) => unit.guide).join(""),
    units
  };
}

export function advanceRomajiProgressByText(
  previous: ProgressState,
  plan: RomajiTypingPlan,
  typedText: string
): ProgressState {
  return Array.from(typedText).reduce(
    (progress, typedChar) => advanceRomajiProgress(progress, plan, typedChar),
    previous
  );
}

export function advanceRomajiProgressWithMistakes(
  previous: ProgressState,
  plan: RomajiTypingPlan,
  typedText: string
): RomajiProgressUpdate {
  return Array.from(typedText).reduce<RomajiProgressUpdate>(
    (state, typedChar) => {
      const unitIndex = findCurrentUnitIndex(plan, state.progress.progressIndex);
      const unit = plan.units[unitIndex];

      if (!unit) {
        return state;
      }

      const nextProgress = advanceRomajiProgress(state.progress, plan, typedChar);

      if (nextProgress.mistakes > state.progress.mistakes) {
        state.mistakeSamples.push({
          expectedChar: unit.hiragana,
          typedChar
        });
      }

      state.progress = nextProgress;
      return state;
    },
    {
      progress: previous,
      mistakeSamples: []
    }
  );
}

export function getRomajiTypingUnitIndex(plan: RomajiTypingPlan, progressIndex: number): number {
  let cursor = 0;

  for (let index = 0; index < plan.units.length; index += 1) {
    const unit = plan.units[index]!;
    cursor += unit.guide.length;

    if (progressIndex < cursor) {
      return index;
    }
  }

  return plan.units.length;
}

export function pickRomajiDisplayCandidate(unit: RomajiTypingUnit, pendingInput: string): string {
  const matches = unit.accepted.filter((candidate) => candidate.startsWith(pendingInput));

  if (matches.length === 0) {
    return unit.guide;
  }

  if (matches.includes(unit.guide)) {
    return unit.guide;
  }

  return matches.sort((a, b) => a.length - b.length)[0] ?? unit.guide;
}

export function advanceRomajiProgress(
  previous: ProgressState,
  plan: RomajiTypingPlan,
  typedChar: string
): ProgressState {
  const normalized = typedChar.length === 1 ? typedChar.toLowerCase() : typedChar;
  const unitIndex = findCurrentUnitIndex(plan, previous.progressIndex);
  const unit = plan.units[unitIndex];

  if (!unit) {
    return previous;
  }

  const nextPendingInput = `${previous.pendingInput}${normalized}`;
  const isPrefix = unit.accepted.some((candidate) => candidate.startsWith(nextPendingInput));

  if (!isPrefix) {
    return {
      ...previous,
      totalTypedCharacters: previous.totalTypedCharacters + 1,
      mistakes: previous.mistakes + 1,
      currentStreak: 0,
      pendingInput: ""
    };
  }

  const isComplete = unit.accepted.includes(nextPendingInput);
  const nextCurrentStreak = previous.currentStreak + 1;

  return {
    ...previous,
    progressIndex: isComplete ? previous.progressIndex + unit.guide.length : previous.progressIndex,
    correctCharacters: previous.correctCharacters + 1,
    totalTypedCharacters: previous.totalTypedCharacters + 1,
    currentStreak: nextCurrentStreak,
    maxStreak: Math.max(previous.maxStreak, nextCurrentStreak),
    pendingInput: isComplete ? "" : nextPendingInput
  };
}

function tokenizeHiragana(hiragana: string): string[] {
  const glyphs = Array.from(hiragana);
  const units: string[] = [];

  for (let index = 0; index < glyphs.length; index += 1) {
    const current = glyphs[index];
    const next = glyphs[index + 1];
    const pair = next ? `${current}${next}` : "";

    if (pair && DIGRAPH_MAP[pair]) {
      units.push(pair);
      index += 1;
      continue;
    }

    units.push(current!);
  }

  return units;
}

function buildTypingUnit(glyph: string, nextGlyph?: string): RomajiTypingUnit {
  if (glyph === "っ") {
    return buildSokuonUnit(nextGlyph);
  }

  if (glyph === "ん") {
    return buildNUnit(nextGlyph);
  }

  return buildCanonicalTypingUnit(glyph);
}

function buildCanonicalTypingUnit(glyph: string): RomajiTypingUnit {
  const typing = getTypingOptions(glyph);

  return {
    hiragana: glyph,
    guide: typing.guide,
    accepted: dedupeStrings(typing.accepted)
  };
}

function buildSokuonUnit(nextGlyph?: string): RomajiTypingUnit {
  const nextTyping = nextGlyph ? getTypingOptions(nextGlyph) : null;
  const leadChars = nextTyping ? dedupeStrings(nextTyping.accepted.map((candidate) => candidate[0] ?? "")).filter(isLeadCharacter) : [];
  const guide = leadChars[0] ?? "xtu";
  const accepted = dedupeStrings([guide, ...leadChars, ...SOKUON_ACCEPTED]);

  return {
    hiragana: "っ",
    guide,
    accepted
  };
}

function buildNUnit(nextGlyph?: string): RomajiTypingUnit {
  const nextTyping = nextGlyph ? getTypingOptions(nextGlyph) : null;
  const nextGuide = nextTyping?.guide ?? "";
  const nextInitial = nextGuide[0];
  const shouldDouble = nextInitial !== undefined && INITIAL_VOWELS_AND_Y.has(nextInitial);
  const accepted = shouldDouble ? ["nn", "xn", "n'"] : ["n", "xn", "n'"];

  return {
    hiragana: "ん",
    guide: shouldDouble ? "nn" : "n",
    accepted
  };
}

function getTypingOptions(glyph: string): { guide: string; accepted: string[] } {
  return DIGRAPH_MAP[glyph] ?? BASIC_KANA_MAP[glyph] ?? PUNCTUATION_MAP[glyph] ?? { guide: glyph, accepted: [glyph] };
}

function findCurrentUnitIndex(plan: RomajiTypingPlan, progressIndex: number): number {
  return getRomajiTypingUnitIndex(plan, progressIndex);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isLeadCharacter(value: string): boolean {
  return value.length === 1 && /[a-z]/.test(value);
}
