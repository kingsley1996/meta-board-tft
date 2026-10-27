// Helpers for reading Coach AI answers aloud. Server synthesis (Aura-2 for
// English, Flux/VieNeu for Vietnamese) caps the text length, so the client chunks
// the answer at sentence boundaries and streams one chunk while the next is
// synthesized.

const maxSpokenCharacters = 500;
export const maxSpeechChunkCharacters = 180;

// Answers are written for reading: markdown, emoji, arrows, and star ratings
// would be read aloud as symbols or rejected by the speech limit. Reduce them
// to plain spoken prose and cut at a sentence boundary; the full answer stays
// readable in the chat bubble.
export function spokenText(answer: string, limit = maxSpokenCharacters): string {
  const plain = answer
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    // Markdown table separator rows (|---|---|) carry no spoken content.
    .replace(/^\s*[\p{Pd}:|\s]+$/gmu, ' ')
    .replace(/(\*\*\*|\*\*|__|\*|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(
      /[\p{Extended_Pictographic}\u{2022}\u{2023}\u{2043}\u{2190}-\u{21FF}\u{2500}-\u{25FF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{00A9}\u{00AE}]/gu,
      ' '
    )
    .replace(/[*_~#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  const boundary = Math.max(
    plain.lastIndexOf('.', limit),
    plain.lastIndexOf('!', limit),
    plain.lastIndexOf('?', limit)
  );
  return plain.slice(0, boundary > limit * 0.6 ? boundary + 1 : limit).trim();
}

export function chunkForSpeech(text: string, maxChars = maxSpeechChunkCharacters): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.match(/[^.!?…]+[.!?…]*\s*/gu) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      flush();
      chunks.push(...splitLongPiece(piece, maxChars));
      continue;
    }
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= maxChars) current += ` ${piece}`;
    else {
      flush();
      current = piece;
    }
  }
  flush();
  return chunks;
}

function splitLongPiece(piece: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = piece;
  while (rest.length > maxChars) {
    const punctuation = Math.max(
      rest.lastIndexOf(',', maxChars),
      rest.lastIndexOf(';', maxChars),
      rest.lastIndexOf(':', maxChars)
    );
    const space = rest.lastIndexOf(' ', maxChars);
    const cut =
      punctuation > maxChars * 0.5 ? punctuation + 1 : space > maxChars * 0.5 ? space : maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}
