import { makeKey, normalizeCheckpointPrefix, normalizeLookupText, normalizeText } from './utils.js';

export class MappingService {
  constructor(cache = {}) { this.load(cache); }
  load(cache = {}) {
    if (Array.isArray(cache)) cache = { ios: cache, android: cache };
    this.cache = {
      ios: cache.ios || [],
      android: cache.android || []
    };
    this.setPlatform('ios');
  }
  setPlatform(platform) {
    this.platform = platform === 'android' ? 'android' : 'ios';
    const rows = this.cache[this.platform] || [];
    this.rows = rows;
    this.index = new Map(rows.map((row) => [makeKey(row.checkpoint, row.description), row]));
    this.byDescription = new Map();
    rows.forEach((row) => {
      const description = normalizeLookupText(row.description);
      this.byDescription.set(description, [...(this.byDescription.get(description) || []), row]);
    });
  }
  find(checkpoint, description) {
    const exact = this.index.get(makeKey(checkpoint, description));
    if (exact) return exact;
    const auditorCheckpoint = normalizeCheckpointPrefix(checkpoint);
    const candidates = this.byDescription.get(normalizeLookupText(description)) || [];
    if (!auditorCheckpoint && candidates.length) return candidates[0];
    const checkpointMatch = candidates
      .filter((row) => auditorCheckpoint.startsWith(normalizeCheckpointPrefix(row.checkpoint)))
      .sort((a, b) => normalizeCheckpointPrefix(b.checkpoint).length - normalizeCheckpointPrefix(a.checkpoint).length)[0];
    return checkpointMatch || candidates[0] || null;
  }
  search(query) {
    const term = normalizeText(query);
    return !term ? this.rows.slice(0, 8) : this.rows.filter((row) => normalizeText(`${row.checkpoint} ${row.description}`).includes(term)).slice(0, 8);
  }
}
