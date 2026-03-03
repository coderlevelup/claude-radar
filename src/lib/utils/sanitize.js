// Mask sequences of 13-19 digits that could be payment card numbers (PANs).
// Matches with or without separators (spaces, hyphens, dots).
// Preserves first 6 and last 4 digits (BIN + last4 is standard PCI masking).
const PAN_RE = /\b(\d[ \-.]?){12,18}\d\b/g;

export function maskPANs(text) {
  if (!text) return text;
  return text.replace(PAN_RE, (match) => {
    const digits = match.replace(/[ \-.]/g, '');
    if (digits.length < 13 || digits.length > 19) return match;
    // Rebuild with masking, preserving original separators
    const first6 = digits.slice(0, 6);
    const last4 = digits.slice(-4);
    const masked = first6 + '*'.repeat(digits.length - 10) + last4;
    // If original had separators, try to preserve grouping
    if (match.includes(' ') || match.includes('-') || match.includes('.')) {
      // Reformat as grouped with original separator
      const sep = match.includes(' ') ? ' ' : match.includes('-') ? '-' : '.';
      return masked.replace(/(.{4})/g, '$1' + sep).trim().replace(new RegExp('\\' + sep + '$'), '');
    }
    return masked;
  });
}
