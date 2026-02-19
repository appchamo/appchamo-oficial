/**
 * Normalize string: lowercase, remove accents, remove special chars
 */
export const normalize = (str: string) =>
  str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "");

/**
 * Simple fuzzy match: checks if characters of query appear in order within target,
 * allowing for typos by also checking substring inclusion and edit distance.
 */
export const fuzzyMatch = (query: string, target: string): boolean => {
  const q = normalize(query);
  const t = normalize(target);
  
  // Exact substring match
  if (t.includes(q)) return true;
  
  // Token-based: all tokens must appear
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every(tok => t.includes(tok))) return true;
  
  // Fuzzy: allow 1-2 character difference per token
  if (tokens.every(tok => fuzzyTokenMatch(tok, t))) return true;
  
  return false;
};

/**
 * Check if a single token fuzzy-matches anywhere in the target string
 */
const fuzzyTokenMatch = (token: string, target: string): boolean => {
  if (target.includes(token)) return true;
  if (token.length <= 2) return false;
  
  // Check all substrings of target with similar length
  const maxDist = token.length <= 4 ? 1 : 2;
  const words = target.split(" ");
  
  for (const word of words) {
    if (word.includes(token) || token.includes(word)) return true;
    if (levenshtein(token, word) <= maxDist) return true;
    // Check if token is a prefix with small distance
    if (word.length >= token.length) {
      const sub = word.slice(0, token.length + 1);
      if (levenshtein(token, sub) <= maxDist) return true;
    }
  }
  return false;
};

/**
 * Levenshtein distance between two strings
 */
const levenshtein = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
};
