import type { DeviceKind, Prompt, PromptCategory } from "./game-state.js";

export const PROMPTS: Prompt[] = [
  {
    id: "s1",
    text: "集中。",
    category: "short",
    typing: {
      romaji: "shuuchuu.",
      hiragana: "しゅうちゅう。"
    }
  },
  {
    id: "s2",
    text: "正確に。",
    category: "short",
    typing: {
      romaji: "seikakuni.",
      hiragana: "せいかくに。"
    }
  },
  {
    id: "standard-1",
    text: "速さよりも正確さを意識すると、自然にリズムが整います。",
    category: "standard",
    typing: {
      romaji: "hayasayorimoseikakusawoishikisuruto,shizennirizumugatotonoimasu.",
      hiragana: "はやさよりもせいかくさをいしきすると、しぜんにりずむがととのいます。"
    }
  },
  {
    id: "standard-2",
    text: "落ち着いて一文字ずつ進めば、接戦でもミスを減らせます。",
    category: "standard",
    typing: {
      romaji: "ochitsuitehitomojizutsususumeba,sessendemisuwoherasemasu.",
      hiragana: "おちついてひともじずつすすめば、せっせんでもみすをへらせます。"
    }
  },
  {
    id: "long-1",
    text: "長い文章では、最初から飛ばしすぎず、呼吸を整えながら一定のペースで打ち続けることが大切です。焦らずに画面を見て、次の文字を確実に入力しましょう。",
    category: "long",
    typing: {
      romaji:
        "nagaibunshoudeha,saishokaratobashisugizu,kokyuuwototonoenagaraitteinopesudeuchitsuzukerukotogataisetsudesu.aserazunigamenomite,tsuginomojiokakujitsuninyuuryokushimashou.",
      hiragana:
        "ながいぶんしょうでは、さいしょからとばしすぎず、こきゅうをととのえながらいっていのぺーすでうちつづけることがたいせつです。あせらずにがめんをみて、つぎのもじをかくじつににゅうりょくしましょう。"
    }
  }
];

export function pickPrompt(category: PromptCategory = "standard", seed = Date.now()): Prompt {
  const filtered = PROMPTS.filter((p) => p.category === category);
  const index = Math.abs(seed) % filtered.length;
  return filtered[index] ?? PROMPTS[0]!;
}

export function getTypingText(prompt: Prompt, deviceKind: DeviceKind = "desktop"): string {
  return deviceKind === "mobile" ? prompt.typing.hiragana : prompt.typing.romaji;
}
