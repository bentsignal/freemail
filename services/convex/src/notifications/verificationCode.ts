const MAX_SEARCHED_LENGTH = 20_000;

const QUALIFIERS =
  "verification|verify|security|confirmation|authentication|auth|access|login|log[- ]?in|sign[- ]?in|one[- ]?time|single[- ]?use|temporary|2fa|two[- ]factor|mfa";
const CODE_PHRASE = `(?:(?:${QUALIFIERS})[- ]+(?:pass)?code|passcode|otp|one[- ]time[- ](?:password|pin))`;
const LOOSE_CODE_PHRASE = `(?:${CODE_PHRASE}|(?:your|the|this)[- ]+code)`;
const NUMBER = String.raw`(?<![\w#$.,:/-])(\d{3}[ -]\d{3}|\d{4,8})(?![\w%]|[.,:/-]\d)`;

const NUMBER_AFTER_PHRASE = new RegExp(
  String.raw`\b${LOOSE_CODE_PHRASE}\b[^\d]{0,80}?${NUMBER}`,
  "giu",
);
// "123456 is your code", and Google's "G-123456 is your verification code".
const NUMBER_BEFORE_PHRASE = new RegExp(
  String.raw`(?<![\w#$.,:/-])(?:[a-z]-)?(\d{3}[ -]\d{3}|\d{4,8})(?![\w%]|[.,:/-]\d)[^\d\n]{0,40}?\b(?:is|as)\s+(?:your|the)\b[^\d\n]{0,40}?\b(?:code|passcode|otp)\b`,
  "giu",
);
const LETTERS_AFTER_PHRASE = new RegExp(
  String.raw`\b${CODE_PHRASE}\b(?:\s+is)?\s*:?\s+([a-z0-9]{4,8})\b`,
  "giu",
);

const NOT_A_SIGN_IN_CODE =
  /\b(?:promo(?:tional)?|discount|coupon|gift|referral|voucher|tracking|zip|postal|redemption)\b/iu;
const YEAR = /^(?:19|20)\d\d$/u;
const LETTERS_AND_DIGITS = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9]+$/u;

function isNumericCode(candidate: string) {
  return !YEAR.test(candidate);
}

function hasLettersAndDigits(candidate: string) {
  return LETTERS_AND_DIGITS.test(candidate);
}

function firstCode(
  text: string,
  pattern: RegExp,
  isCode: (candidate: string) => boolean,
) {
  for (const match of text.matchAll(pattern)) {
    const [matched, code = ""] = match;
    const candidate = code.replace(/[ -]/gu, "");
    if (isCode(candidate) && !NOT_A_SIGN_IN_CODE.test(matched)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Finds a sign-in code so the push can show it: iOS 26+ offers codes from
 * delivered notifications on the keyboard, but only sees what the
 * notification says. Prefers missing a code over offering a wrong one.
 */
export function findVerificationCode(text: string) {
  const searched = text.slice(0, MAX_SEARCHED_LENGTH);
  return (
    firstCode(searched, NUMBER_AFTER_PHRASE, isNumericCode) ??
    firstCode(searched, NUMBER_BEFORE_PHRASE, isNumericCode) ??
    firstCode(searched, LETTERS_AFTER_PHRASE, hasLettersAndDigits)
  );
}
