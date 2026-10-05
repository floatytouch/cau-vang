const APPROVE_PHRASES = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'ok',
  'oke',
  'okay',
  'okie',
  'sure',
  'agreed',
  'agree',
  'approved',
  'approve',
  'go',
  'go ahead',
  'go on',
  'do it',
  'do that',
  'go for it',
  'sounds good',
  'looks good',
  'lgtm',
  'proceed',
  'green light',
  'ship it',
  "let's do it",
  'lets do it',
  "let's do this",
  'lets do this',
  "let's go",
  'lets go',
  'start it',
  'kick it off',
  'apply it',
  'restart it',
  'make it so',
  'continue',
  'alright',
  'all right',
  'fine',
  'perfect',
  'u',
  'uk',
  'dong y',
  'lam di',
  'lam luon',
  'duoc',
  'duoc roi',
  'chot',
  'tien hanh',
  'trien khai',
  'duyet',
  'chien',
] as const;

const APPROVE_PHRASE_WORDS = APPROVE_PHRASES.map((phrase) => phrase.split(' ')).sort(
  (left, right) => right.length - left.length,
);

const APPROVAL_FILLER_WORDS = new Set([
  'please',
  'then',
  'now',
  'thanks',
  'well',
  'oh',
  'di',
  'nhe',
  'nha',
  'luon',
  'a',
  'em',
  'anh',
  'roi',
]);

export const MAX_APPROVAL_WORDS = 8;

// Unicode-aware so a word in any script (`ok нет`, `ok 不要`) survives as a non-approval word.
const APPROVAL_PUNCTUATION_RE = /[^\p{L}\p{N}_'\s]/gu;
// Every code point whose Unicode name contains QUESTION MARK or INTERROBANG, plus U+2048.
const QUESTION_MARK_RE =
  /[\u003F\u00BF\u037E\u055E\u061F\u1367\u1945\u203D\u2047-\u2049\u2753\u2754\u2A7B\u2A7C\u2CFA\u2CFB\u2E18\u2E2E\u2E54\uA60F\uA6F7\uFE16\uFE56\uFF1F\u{11143}\u{1E95F}\u{1F679}-\u{1F67B}\u{1FBC4}\u{E003F}]/u;

/** True only for a short affirmation that unlocks mutating tools for one plan-mode turn. */
export function isApproval(text: string): boolean {
  const raw = text ?? '';
  // Checked before NFD: NFD folds U+037E GREEK QUESTION MARK into a plain semicolon.
  if (QUESTION_MARK_RE.test(raw)) {
    return false;
  }
  const normalized = stripAccents(raw).replace(/\u2019/g, "'");
  const words = normalized.replace(APPROVAL_PUNCTUATION_RE, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_APPROVAL_WORDS) {
    return false;
  }
  return approvePhraseLength(words, 0) > 0 && onlyApprovalWords(words);
}

function stripAccents(text: string): string {
  return text.toLowerCase().replaceAll('đ', 'd').normalize('NFD').replace(/\p{M}/gu, '');
}

function approvePhraseLength(words: string[], start: number): number {
  for (const phrase of APPROVE_PHRASE_WORDS) {
    if (phrase.every((word, index) => words[start + index] === word)) {
      return phrase.length;
    }
  }
  return 0;
}

function onlyApprovalWords(words: string[]): boolean {
  let position = 0;
  while (position < words.length) {
    const phraseLength = approvePhraseLength(words, position);
    if (phraseLength > 0) {
      position += phraseLength;
      continue;
    }
    if (APPROVAL_FILLER_WORDS.has(words[position]!)) {
      position += 1;
      continue;
    }
    return false;
  }
  return true;
}
