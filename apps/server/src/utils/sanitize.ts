/**
 * Input Sanitization Utility
 * ==========================
 * Sanitizes user input to prevent XSS and injection attacks.
 *
 * USAGE:
 * const cleanNotes = sanitizeText(userInput, 2000);
 */

/**
 * Characters and patterns that should be stripped from user input.
 */
const DANGEROUS_PATTERNS = [
  // HTML tags
  /<[^>]*>/g,
  // JavaScript protocol
  /javascript:/gi,
  // Data protocol (can embed scripts)
  /data:/gi,
  // VBScript protocol
  /vbscript:/gi,
  // Event handlers
  /on\w+\s*=/gi,
  // Expression (IE)
  /expression\s*\(/gi,
  // Embedded scripts
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  // Style with expressions
  /style\s*=\s*["'][^"']*expression\s*\([^"']*["']/gi,
];

/**
 * HTML entities to encode
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Sanitize text input by removing dangerous content.
 *
 * This is a defense-in-depth measure. Output encoding should also be used
 * when rendering user content.
 *
 * @param input - Raw user input
 * @param maxLength - Maximum allowed length (default: 2000)
 * @returns Sanitized string
 *
 * @example
 * const notes = sanitizeText(userNotes, 2000);
 */
export function sanitizeText(input: string | null | undefined, maxLength: number = 2000): string {
  if (!input) return '';

  let sanitized = input;

  // Truncate to max length first
  sanitized = sanitized.slice(0, maxLength);

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Encode HTML entities to prevent XSS when rendering.
 * Use this when outputting user content to HTML.
 *
 * @param input - String to encode
 * @returns HTML-encoded string
 *
 * @example
 * const safeHtml = encodeHtml(userInput);
 */
export function encodeHtml(input: string | null | undefined): string {
  if (!input) return '';

  return input.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize and encode in one step.
 * Use for maximum safety when storing user input that will be rendered as HTML.
 *
 * @param input - Raw user input
 * @param maxLength - Maximum allowed length
 * @returns Sanitized and encoded string
 */
export function sanitizeAndEncode(input: string | null | undefined, maxLength: number = 2000): string {
  return encodeHtml(sanitizeText(input, maxLength));
}

/**
 * Validate that a string contains only allowed characters.
 * Useful for IDs, usernames, etc.
 *
 * @param input - String to validate
 * @param pattern - Regex pattern of allowed characters
 * @returns Whether the string is valid
 */
export function isValidFormat(input: string, pattern: RegExp): boolean {
  return pattern.test(input);
}

/**
 * Common validation patterns
 */
export const VALIDATION_PATTERNS = {
  /** nanoid format (21 chars, alphanumeric + _-) */
  NANOID: /^[A-Za-z0-9_-]{21}$/,
  /** UUID v4 format */
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /** Alphanumeric only */
  ALPHANUMERIC: /^[A-Za-z0-9]+$/,
  /** Safe filename (no path traversal) */
  SAFE_FILENAME: /^[A-Za-z0-9_.-]+$/,
} as const;
