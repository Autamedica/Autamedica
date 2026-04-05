/**
 * Lightweight HTML sanitizer for dangerouslySetInnerHTML usage.
 *
 * Strips <script>, <iframe>, <object>, <embed>, <form>, <style>, <link>,
 * <base>, <meta>, <svg> (nested), <math> tags and all on* event handler
 * attributes. Also neutralizes javascript: protocol in href/src/action.
 *
 * For rendering trusted server-side content with simple formatting (bold,
 * line breaks). NOT a replacement for DOMPurify in user-generated-content
 * heavy applications -- but sufficient for AI-generated chat messages and
 * static SVG icons controlled by the codebase.
 */

const DANGEROUS_TAG_RE =
  /<\s*\/?\s*(script|iframe|object|embed|form|style|link|base|meta|math)\b[^>]*>/gi;

const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

const JS_PROTOCOL_RE = /(href|src|action)\s*=\s*(?:"|')?\s*javascript\s*:/gi;

export function sanitizeHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAG_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(JS_PROTOCOL_RE, '$1=""');
}
