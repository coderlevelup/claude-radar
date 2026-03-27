// Escape HTML and render a safe subset of markdown for message text.
export function escAndFormat(text) {
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Code blocks before inline code so backticks inside fences don't double-process
  s = s.replace(/```(?:\w*)\n([\s\S]*?)```/g, '<pre>$1</pre>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold before italic so ** isn't misread as two *
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return s;
}

// Extract the primary display arg from a tool_use input object.
// Matches Claude Code's convention: Bash shows command, file tools show path.
export function toolArg(name, input) {
  if (!input || typeof input !== 'object') return '';
  const n = (name || '').toLowerCase();
  if (n === 'bash') return input.command || '';
  if (['edit', 'write', 'read', 'multiedit', 'notebookedit'].includes(n)) return input.file_path || '';
  if (n === 'glob') return input.pattern || '';
  if (n === 'grep') return input.pattern || '';
  if (n === 'websearch') return input.query || '';
  if (n === 'webfetch') return input.url || '';
  // Generic fallback: first string value
  const first = Object.values(input).find(v => typeof v === 'string');
  return first || '';
}

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
