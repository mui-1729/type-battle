const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const MAX_NICKNAME_LENGTH = 18;

const URL_OR_CONTACT_PATTERN =
  /(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/|\S+@\S+\.\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|jp|io|dev)(?:\/|\b))/iu;

const RESERVED_NICKNAME_KEYS = new Set([
  "admin",
  "administrator",
  "moderator",
  "official",
  "運営",
  "管理者",
  "公式",
  "typebattle",
  "typebattle運営",
  "typebattle管理者",
  "typebattle公式",
]);

const BLOCKED_NICKNAME_KEYS = new Set([
  "死ね",
  "しね",
  "殺す",
  "ころす",
  "fuckyou",
  "killyourself",
]);

export function normalizeNickname(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateNickname(value: string): string | null {
  if (containsUnsafeNicknameCharacter(value)) {
    return "表示に使用できない文字が含まれています。";
  }

  const nickname = normalizeNickname(value);

  if (nickname.length < 1) {
    return "ニックネームを入力してください。";
  }

  if (URL_OR_CONTACT_PATTERN.test(nickname)) {
    return "URLや連絡先はニックネームに使用できません。";
  }

  if (Array.from(nickname).length > MAX_NICKNAME_LENGTH) {
    return `ニックネームは${MAX_NICKNAME_LENGTH}文字以内にしてください。`;
  }

  const moderationKey = createNicknameModerationKey(nickname);
  if (RESERVED_NICKNAME_KEYS.has(moderationKey) || BLOCKED_NICKNAME_KEYS.has(moderationKey)) {
    return "このニックネームは使用できません。";
  }

  return null;
}

export function createGuestId(): string {
  return `guest_${cryptoRandomString(16).toLowerCase()}`;
}

export function createRoomCode(): string {
  return cryptoRandomString(ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET);
}

export function isValidRoomCode(value: string): boolean {
  const roomCode = value.trim().toUpperCase();

  if (roomCode.length !== ROOM_CODE_LENGTH) {
    return false;
  }

  return [...roomCode].every((character) => ROOM_CODE_ALPHABET.includes(character));
}

export function validateRoomCode(value: string): string | null {
  if (!isValidRoomCode(value)) {
    return "ルームコードの形式が正しくありません。";
  }

  return null;
}

function containsUnsafeNicknameCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && isUnsafeNicknameCodePoint(codePoint);
  });
}

function isUnsafeNicknameCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x00ad ||
    codePoint === 0x061c ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    codePoint === 0xfeff
  );
}

function createNicknameModerationKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function cryptoRandomString(length: number, alphabet = "abcdef0123456789"): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
