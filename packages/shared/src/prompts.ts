import type { DeviceKind, Prompt, PromptCategory } from "./game-state.js";

export const PROMPTS: Prompt[] = [
  {
    id: "s1",
    text: "集中",
    category: "short",
    typing: {
      romaji: "shuuchuu",
      hiragana: "しゅうちゅう"
    }
  },
  {
    id: "s2",
    text: "正確に",
    category: "short",
    typing: {
      romaji: "seikakuni",
      hiragana: "せいかくに"
    }
  },
  {
    id: "s3",
    text: "深呼吸",
    category: "short",
    typing: {
      romaji: "shinkokyuu",
      hiragana: "しんこきゅう"
    }
  },
  {
    id: "s4",
    text: "落ち着いて",
    category: "short",
    typing: {
      romaji: "ochitsuite",
      hiragana: "おちついて"
    }
  },
  {
    id: "s5",
    text: "一歩ずつ",
    category: "short",
    typing: {
      romaji: "ippozutsu",
      hiragana: "いっぽずつ"
    }
  },
  {
    id: "s6",
    text: "準備完了",
    category: "short",
    typing: {
      romaji: "junbikanryou",
      hiragana: "じゅんびかんりょう"
    }
  },
  {
    id: "s7",
    text: "もう一回",
    category: "short",
    typing: {
      romaji: "mouikkai",
      hiragana: "もういっかい"
    }
  },
  {
    id: "s8",
    text: "手元を見て",
    category: "short",
    typing: {
      romaji: "temotowomite",
      hiragana: "てもとをみて"
    }
  },
  {
    id: "s9",
    text: "丁寧に",
    category: "short",
    typing: {
      romaji: "teineini",
      hiragana: "ていねいに"
    }
  },
  {
    id: "s10",
    text: "最後まで",
    category: "short",
    typing: {
      romaji: "saigomade",
      hiragana: "さいごまで"
    }
  },
  {
    id: "s11",
    text: "落ち着こう",
    category: "short",
    typing: {
      romaji: "ochitsukou",
      hiragana: "おちつこう"
    }
  },
  {
    id: "s12",
    text: "今のままで",
    category: "short",
    typing: {
      romaji: "imanomamade",
      hiragana: "いまのままで"
    }
  },
  {
    id: "s13",
    text: "次へ進む",
    category: "short",
    typing: {
      romaji: "tsugihesusumu",
      hiragana: "つぎへすすむ"
    }
  },
  {
    id: "s14",
    text: "迷わない",
    category: "short",
    typing: {
      romaji: "mayowanai",
      hiragana: "まよわない"
    }
  },
  {
    id: "standard-1",
    text: "速さよりも正確さを意識すると、自然にリズムが整います",
    category: "standard",
    typing: {
      romaji: "hayasayorimoseikakusawoishikisuruto,shizennirizumugatotonoimasu",
      hiragana: "はやさよりもせいかくさをいしきすると、しぜんにりずむがととのいます"
    }
  },
  {
    id: "standard-2",
    text: "落ち着いて一文字ずつ進めば、接戦でもミスを減らせます",
    category: "standard",
    typing: {
      romaji: "ochitsuitehitomojizutsususumeba,sessendemomisuwoherasemasu",
      hiragana: "おちついてひともじずつすすめば、せっせんでもみすをへらせます"
    }
  },
  {
    id: "standard-3",
    text: "迷ったら、いったん落ち着いてから次の文字に進みましょう",
    category: "standard",
    typing: {
      romaji: "mayottara,ittannochitsuitekaratsuginomojinisusumimashou",
      hiragana: "まよったら、いったんおちついてからつぎのもじにすすみましょう"
    }
  },
  {
    id: "standard-4",
    text: "少し速くなっても、呼吸を崩さずに打ち続けると安定します",
    category: "standard",
    typing: {
      romaji: "sukoshihayakunattemo,kokyuuwokuzusazuniuchitsuzukerutoanteishimasu",
      hiragana: "すこしはやくなっても、こきゅうをくずさずにうちつづけるとあんていします"
    }
  },
  {
    id: "standard-5",
    text: "画面の端まで視線を送ると、次の文字を拾いやすくなります",
    category: "standard",
    typing: {
      romaji: "gamennohashimadeshisenwookuruto,tsuginomojiwohiroiyasukunarimasu",
      hiragana: "がめんのはしまでしせんをおくると、つぎのもじをひろいやすくなります"
    }
  },
  {
    id: "standard-6",
    text: "一度ミスしても、流れを切らずに打ち直せば十分立て直せます",
    category: "standard",
    typing: {
      romaji: "ichidomisushitemo,nagarewokirazuniuchinaosebajuubuntatenaosemasu",
      hiragana: "いちどみすしても、ながれをきらずにうちなおせばじゅうぶんたてなおせます"
    }
  },
  {
    id: "standard-7",
    text: "余計な力を抜くと、入力の乱れも自然に減っていきます",
    category: "standard",
    typing: {
      romaji: "yokeinachikarawonukuto,nyuuryokunomidaremoshizennihetteikimasu",
      hiragana: "よけいなちからをぬくと、にゅうりょくのみだれもしぜんにへっていきます"
    }
  },
  {
    id: "standard-8",
    text: "文の区切りを意識すると、視線の移動が少し楽になります",
    category: "standard",
    typing: {
      romaji: "bunnokugiriwoishikisuruto,shisennoidougasukoshirakuninarimasu",
      hiragana: "ぶんのくぎりをいしきすると、しせんのいどうがすこしらくになります"
    }
  },
  {
    id: "standard-9",
    text: "余白を残して打つと、次の文字を追いやすくなります",
    category: "standard",
    typing: {
      romaji: "yohakuwonokoshiteutsuto,tsuginomojiwooiyasukunarimasu",
      hiragana: "よはくをのこしてうつと、つぎのもじをおいやすくなります"
    }
  },
  {
    id: "standard-10",
    text: "速さよりも安定を優先すると、最後まで崩れにくくなります",
    category: "standard",
    typing: {
      romaji: "hayasayorimoanteiwoyuusensuruto,saigomadekuzurenikukunarimasu",
      hiragana: "はやさよりもあんていをゆうせんすると、さいごまでくずれにくくなります"
    }
  },
  {
    id: "standard-11",
    text: "落ち着いて、次の一手に集中しましょう",
    category: "standard",
    typing: {
      romaji: "ochitsuite,tsuginoittenishuuchuushimashou",
      hiragana: "おちついて、つぎのいってにしゅうちゅうしましょう"
    }
  },
  {
    id: "standard-12",
    text: "キーを強く押しすぎず、指先を軽く動かすと整います",
    category: "standard",
    typing: {
      romaji: "ki-wotsuyokuoshisugizu,yubisakiwokarukuugokasutototonoimasu",
      hiragana: "きーをつよくおしすぎず、ゆびさきをかるくうごかすとととのいます"
    }
  },
  {
    id: "long-1",
    text: "長い文章では、最初から飛ばしすぎず、呼吸を整えながら一定のペースで打ち続けることが大切です焦らずに画面を見て、次の文字を確実に入力しましょう",
    category: "long",
    typing: {
      romaji:
        "nagaibunshoudeha,saishokaratobashisugizu,kokyuuwototonoenagaraitteinope-sudeuchitsuzukerukotogataisetsudesuaserazunigamenwomite,tsuginomojiwokakujitsuninyuuryokushimashou",
      hiragana:
        "ながいぶんしょうでは、さいしょからとばしすぎず、こきゅうをととのえながらいっていのぺーすでうちつづけることがたいせつですあせらずにがめんをみて、つぎのもじをかくじつににゅうりょくしましょう"
    }
  },
  {
    id: "long-2",
    text: "長い課題文では、最初に力を入れすぎないことが重要です途中で少し乱れても、焦らずに姿勢を整えれば、最後までペースを保ちやすくなります",
    category: "long",
    typing: {
      romaji:
        "nagaikadaibundeha,saishonichikarawoiresuginaikotogajuuyoudesutochuudesukoshimidaretemo,aserazunishiseiwototonoereba,saigomadepe-suwotamochiyasukunarimasu",
      hiragana:
        "ながいかだいぶんでは、さいしょにちからをいれすぎないことがじゅうようですとちゅうですこしみだれても、あせらずにしせいをととのえれば、さいごまでぺーすをたもちやすくなります"
    }
  },
  {
    id: "long-3",
    text: "長文では、最初から飛ばしすぎず、途中で少し遅れても、そのまま一定のリズムを守ることが大切です視線を先に置いて、手元は落ち着いて追いかけましょう",
    category: "long",
    typing: {
      romaji:
        "choubundeha,saishokaratobashisugizu,tochuudesukoshiokuretemo,sonomamaitteinorizumuwomamorukotogataisetsudesushisenwosakinioite,temotohaochitsuiteoikakemashou",
      hiragana:
        "ちょうぶんでは、さいしょからとばしすぎず、とちゅうですこしおくれても、そのままいっていのりずむをまもることがたいせつですしせんをさきにおいて、てもとはおちついておいかけましょう"
    }
  },
  {
    id: "long-4",
    text: "長い課題文を打つときは、呼吸を整えながら、言葉を追うリズムを崩さないことが重要ですミスをしても止まりすぎず、次の流れへ自然に戻していくと安定します",
    category: "long",
    typing: {
      romaji:
        "nagaikadaibunwoutsutokiha,kokyuuwototonoenagara,kotobawoourizumuwokuzusanaikotogajuuyoudesumisuwoshitemotomarisugizu,tsuginonagareheshizennimodoshiteikutoanteishimasu",
      hiragana:
        "ながいかだいぶんをうつときは、こきゅうをととのえながら、ことばをおうりずむをくずさないことがじゅうようですみすをしてもとまりすぎず、つぎのながれへしぜんにもどしていくとあんていします"
    }
  },
  {
    id: "long-5",
    text: "長い文ほど、最初の一打に気持ちを乗せすぎず、淡々としたペースを保つと後半も安定します視線の移動を小さくして、次の文字を先読みする感覚で進めましょう",
    category: "long",
    typing: {
      romaji:
        "nagaibunhodo,saishonoichidanikimochiwonosesugizu,tantantoshitape-suwotamotsutokouhanmoanteishimasushisennoidouwochiisakushite,tsuginomojiwosakiyomisurukankakudesusumemashou",
      hiragana:
        "ながいぶんほど、さいしょのいちだにきもちをのせすぎず、たんたんとしたぺーすをたもつとこうはんもあんていしますしせんのいどうをちいさくして、つぎのもじをさきよみするかんかくですすめましょう"
    }
  }
];

const MIN_PROMPT_TEXT_LENGTH = 2;
const MAX_PROMPT_TEXT_LENGTH = 240;
const MIN_GUIDE_LENGTH = 2;
const MAX_GUIDE_LENGTH = 320;

export function validatePrompt(prompt: Prompt): string | null {
  if (!prompt.id.trim()) {
    return "prompt id を入力してください。";
  }

  if (prompt.enabled === false) {
    return "課題文は無効化されています。";
  }

  if (!prompt.text.trim()) {
    return "課題文を入力してください。";
  }

  const textLength = prompt.text.trim().length;

  if (textLength < MIN_PROMPT_TEXT_LENGTH) {
    return `課題文は${MIN_PROMPT_TEXT_LENGTH}文字以上にしてください。`;
  }

  if (textLength > MAX_PROMPT_TEXT_LENGTH) {
    return `課題文は${MAX_PROMPT_TEXT_LENGTH}文字以内にしてください。`;
  }

  if (hasControlCharacters(prompt.text)) {
    return "課題文に改行や制御文字を含めないでください。";
  }

  if (!prompt.typing.romaji.trim() || !prompt.typing.hiragana.trim()) {
    return "入力ガイドを入力してください。";
  }

  const romajiLength = prompt.typing.romaji.trim().length;
  const hiraganaLength = prompt.typing.hiragana.trim().length;

  if (romajiLength < MIN_GUIDE_LENGTH || hiraganaLength < MIN_GUIDE_LENGTH) {
    return `入力ガイドは${MIN_GUIDE_LENGTH}文字以上にしてください。`;
  }

  if (romajiLength > MAX_GUIDE_LENGTH || hiraganaLength > MAX_GUIDE_LENGTH) {
    return `入力ガイドは${MAX_GUIDE_LENGTH}文字以内にしてください。`;
  }

  if (hasControlCharacters(prompt.typing.romaji) || hasControlCharacters(prompt.typing.hiragana)) {
    return "入力ガイドに改行や制御文字を含めないでください。";
  }

  return null;
}

export function getPromptsByCategory(category: PromptCategory, prompts: Prompt[] = PROMPTS): Prompt[] {
  return prompts.filter((prompt) => prompt.category === category && validatePrompt(prompt) === null);
}

export function pickPrompt(
  category: PromptCategory = "standard",
  seed = Date.now(),
  excludedPromptIds: string[] = [],
  prompts: Prompt[] = PROMPTS
): Prompt {
  const validPrompts = getPromptsByCategory(category, prompts);
  const availablePrompts = validPrompts.filter((prompt) => !excludedPromptIds.includes(prompt.id));
  const pool = availablePrompts.length > 0 ? availablePrompts : validPrompts;

  if (pool.length === 0) {
    const fallbackPrompts = getPromptsByCategory("standard", prompts);

    if (fallbackPrompts.length === 0) {
      throw new Error("有効な課題文がありません。");
    }

    const fallbackIndex = Math.abs(seed) % fallbackPrompts.length;
    return fallbackPrompts[fallbackIndex] ?? fallbackPrompts[0]!;
  }

  const index = Math.abs(seed) % pool.length;
  return pool[index] ?? pool[0]!;
}

export type DailyChallengeInfo = {
  challengeKey: string;
  seed: number;
  timezone: "Asia/Tokyo";
  nextChallengeAt: number;
};

export function getDailyChallengeInfo(date = new Date()): DailyChallengeInfo {
  const challengeKey = formatTokyoDateKey(date);

  return {
    challengeKey,
    seed: hashString(challengeKey),
    timezone: "Asia/Tokyo",
    nextChallengeAt: getNextTokyoMidnight(date).getTime()
  };
}

export function pickDailyChallengePrompt(date = new Date()): Prompt {
  const { seed } = getDailyChallengeInfo(date);
  return pickPrompt("standard", seed);
}

export function getTypingText(prompt: Prompt, deviceKind: DeviceKind = "desktop"): string {
  return deviceKind === "mobile" ? prompt.typing.hiragana : prompt.typing.romaji;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function formatTokyoDateKey(date: Date): string {
  const tokyoDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return tokyoDate.toISOString().slice(0, 10);
}

function getNextTokyoMidnight(date: Date): Date {
  const tokyoDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const nextTokyoMidnightUtc = Date.UTC(
    tokyoDate.getUTCFullYear(),
    tokyoDate.getUTCMonth(),
    tokyoDate.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );

  return new Date(nextTokyoMidnightUtc - 9 * 60 * 60 * 1000);
}

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;

    if (codePoint <= 0x1f || codePoint === 0x7f || codePoint === 0x2028 || codePoint === 0x2029) {
      return true;
    }
  }

  return false;
}
