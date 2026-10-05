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

const APPROVAL_PUNCTUATION_RE = /[^\w'\s]/g;
const QUESTION_MARK_CHARS = new Set(['?', '？', '¿', '؟', '⸮', '‽']);

/** True only for a short affirmation that unlocks mutating tools for one plan-mode turn. */
export function isApproval(text: string): boolean {
  const normalized = stripAccents(text ?? '').replace(/\u2019/g, "'");
  if ([...normalized].some((char) => QUESTION_MARK_CHARS.has(char))) {
    return false;
  }
  const words = normalized.replace(APPROVAL_PUNCTUATION_RE, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_APPROVAL_WORDS) {
    return false;
  }
  return approvePhraseLength(words, 0) > 0 && onlyApprovalWords(words);
}

function stripAccents(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('đ', 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
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
