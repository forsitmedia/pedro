/**
 * Names are shown to strangers in the lobby and the ranking, so the worst words are filtered out.
 * Letters are compared after undoing the usual tricks (accents, 0→o, 1→i, $→s…).
 */
const BLOCKED = [
  // English
  'fuck', 'shit', 'cunt', 'bitch', 'dick', 'cock', 'pussy', 'whore', 'slut', 'rape', 'nigg', 'fag', 'retard', 'nazi', 'hitler', 'porn', 'penis', 'vagina', 'asshole',
  // Spanish / Argentina
  'puta', 'puto', 'pija', 'concha', 'verga', 'culiad', 'pelotud', 'boludo', 'forro', 'mierda', 'coño', 'chupala', 'trolo', 'maric', 'negr',
  // Italian / Portuguese
  'cazzo', 'stronz', 'troia', 'vaffan', 'caralho', 'porra', 'buceta',
];

function squash(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4|@/g, 'a')
    .replace(/5|\$/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-zñ]/g, '');
}

export function isRudeName(name: string): boolean {
  const s = squash(name);
  return BLOCKED.some((w) => s.includes(w.normalize('NFD').replace(/[̀-ͯ]/g, '')));
}

/** A safe display name: no control characters, at most 16 characters, nothing rude. */
export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '';
  if (!name || isRudeName(name)) return 'Player';
  return name;
}
