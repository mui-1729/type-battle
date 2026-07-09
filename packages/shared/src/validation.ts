const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const MAX_NICKNAME_LENGTH = 18;

export function normalizeNickname(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NICKNAME_LENGTH);
}

export function validateNickname(value: string): string | null {
  const nickname = normalizeNickname(value);

  if (nickname.length < 1) {
    return "ニックネームを入力してください。";
  }

  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return `ニックネームは${MAX_NICKNAME_LENGTH}文字以内にしてください。`;
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

function cryptoRandomString(length: number, alphabet = "abcdef0123456789"): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
