import type { RomajiTypingPlan } from "./romaji-typing.js";

export function getCanonicalProgressForRomajiGuide(
  plan: RomajiTypingPlan,
  progressIndex: number,
  loop = false
): number {
  const guideLength = plan.guide.length;
  const canonicalLength = plan.units.reduce(
    (total, unit) => total + Array.from(unit.hiragana).length,
    0
  );

  if (guideLength <= 0 || progressIndex <= 0) {
    return 0;
  }

  const cycles = loop ? Math.floor(progressIndex / guideLength) : 0;
  const localProgress = loop ? progressIndex % guideLength : Math.min(progressIndex, guideLength);
  let guideCursor = 0;
  let canonicalCursor = 0;

  for (const unit of plan.units) {
    const nextGuideCursor = guideCursor + unit.guide.length;

    if (localProgress < nextGuideCursor) {
      break;
    }

    guideCursor = nextGuideCursor;
    canonicalCursor += Array.from(unit.hiragana).length;
  }

  return cycles * canonicalLength + canonicalCursor;
}
