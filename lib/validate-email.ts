/**
 * Email validation for registration flow.
 * Centralized function that determines whether to block, confirm, or warn.
 */

export interface EmailValidationResult {
  /** Whether the email format is structurally valid */
  isValidFormat: boolean;
  /** Whether the email looks suspicious (possible typo) */
  isSuspicious: boolean;
  /** Hebrew message to display to the user */
  message: string;
  /** Optional suggestion (e.g., "did you mean gmail.com?") */
  suggestion?: string;
  /** If true, block registration entirely (show inline error) */
  shouldBlock: boolean;
  /** If true, show confirmation/warning modal before proceeding */
  shouldShowConfirmModal: boolean;
}

// Common domain typos → correct domain
const DOMAIN_TYPOS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotamil.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outlok.co.il": "outlook.co.il",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "walla.co": "walla.co.il",
  "wallla.co.il": "walla.co.il" };

// Allowlist of valid TLDs — any TLD not in this list will trigger a warning.
// This covers the most common TLDs used in Israel and worldwide.
const VALID_TLDS = new Set([
  // Generic
  "com", "net", "org", "info", "biz", "name", "pro", "mobi", "app", "dev",
  "io", "co", "me", "tv", "cc", "xyz", "online", "site", "tech", "store",
  "shop", "cloud", "ai", "email", "live", "edu", "gov", "mil", "int",
  // Country codes (common)
  "il", "us", "uk", "de", "fr", "es", "it", "nl", "be", "at", "ch",
  "au", "ca", "br", "ru", "cn", "jp", "kr", "in", "za", "mx", "ar",
  "pl", "se", "no", "dk", "fi", "pt", "ie", "nz", "sg", "hk", "tw",
  "th", "ph", "my", "id", "vn", "ua", "cz", "ro", "hu", "bg", "hr",
  "sk", "si", "lt", "lv", "ee", "gr", "tr", "eg", "ae", "sa", "qa",
  "kw", "om", "bh", "jo", "lb", "ps", "iq", "ir",
]);

// Valid compound TLDs (two-part country-specific TLDs)
const VALID_COMPOUND_TLDS = new Set([
  "co.il", "org.il", "net.il", "ac.il", "gov.il", "muni.il",
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "edu.au",
  "co.nz", "org.nz",
  "com.br", "org.br",
  "co.in", "org.in", "net.in",
  "co.za", "org.za",
  "com.mx", "org.mx",
  "co.jp", "or.jp", "ne.jp",
  "co.kr", "or.kr",
  "com.cn", "net.cn", "org.cn",
  "com.sg", "org.sg",
  "com.hk", "org.hk",
  "com.tw", "org.tw",
  "co.th", "or.th",
  "com.tr", "org.tr",
  "com.ar", "org.ar",
  "com.ua", "org.ua",
  "co.id", "or.id",
]);

/**
 * Check if the domain has a valid TLD.
 * Supports both single TLDs (com, net) and compound TLDs (co.il, co.uk).
 */
function hasValidTld(domain: string): boolean {
  const parts = domain.split(".");

  // Check compound TLD first (last two parts, e.g., "co.il")
  if (parts.length >= 3) {
    const compoundTld = parts.slice(-2).join(".");
    if (VALID_COMPOUND_TLDS.has(compoundTld)) {
      return true;
    }
  }

  // Check single TLD (last part)
  const lastPart = parts[parts.length - 1];
  return VALID_TLDS.has(lastPart);
}

/**
 * Validate an email address for registration.
 * Returns structured result indicating whether to block, show confirmation, or show warning.
 */
export function validateEmailForRegistration(email: string): EmailValidationResult {
  const trimmed = email.trim();

  // === STATE A: Definitely invalid — BLOCK ===

  // Empty
  if (!trimmed) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // Contains spaces
  if (/\s/.test(trimmed)) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // Missing @
  if (!trimmed.includes("@")) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  const [localPart, ...domainParts] = trimmed.split("@");
  const domain = domainParts.join("@");

  // No local part (before @)
  if (!localPart || localPart.length === 0) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // No domain (after @)
  if (!domain || domain.length === 0) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // Domain has no dot (e.g., yosef@gmail or yosef@gmailcom)
  if (!domain.includes(".")) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // Domain starts or ends with dot
  if (domain.startsWith(".") || domain.endsWith(".")) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // TLD too short (must be at least 2 chars)
  const tldParts = domain.split(".");
  const lastPart = tldParts[tldParts.length - 1];
  if (lastPart.length < 2) {
    return {
      isValidFormat: false,
      isSuspicious: false,
      message: "The email address does not look valid. Make sure it has @, a dot, and no spaces.",
      shouldBlock: true,
      shouldShowConfirmModal: false };
  }

  // === STATE C: Suspicious — WARN ===

  const domainLower = domain.toLowerCase();

  // Check for known domain typos
  if (DOMAIN_TYPOS[domainLower]) {
    const correctDomain = DOMAIN_TYPOS[domainLower];
    return {
      isValidFormat: true,
      isSuspicious: true,
      message: `This is the email you entered for registration:\n${trimmed}\n\nThe address looks a bit unusual.\nThere might be a small typo in the domain or extension.\nIf the address is correct — you can continue.\nIf there is a mistake — it is best to fix it now so the verification email reaches you.`,
      suggestion: `Did you mean ${localPart}@${correctDomain}?`,
      shouldBlock: false,
      shouldShowConfirmModal: true };
  }

  // Check TLD against allowlist — any TLD NOT in the list is suspicious
  if (!hasValidTld(domainLower)) {
    return {
      isValidFormat: true,
      isSuspicious: true,
      message: `This is the email you entered for registration:\n${trimmed}\n\nThe email domain extension is not recognized.\nThere might be a typo in the extension (e.g., .coms instead of .com).\nIf the address is correct — you can continue.\nIf there is a mistake — it is best to fix it now so the verification email reaches you.`,
      shouldBlock: false,
      shouldShowConfirmModal: true };
  }

  // === STATE B: Valid — CONFIRM ===
  return {
    isValidFormat: true,
    isSuspicious: false,
    message: `This is the email you entered for registration:\n${trimmed}\n\nA verification email will be sent to this address.\nPlease make sure there are no typos before continuing.`,
    shouldBlock: false,
    shouldShowConfirmModal: true };
}
