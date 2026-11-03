/**
 * utils/cache.util.js
 *
 * In-memory cache with fixed TTL expiry from original insertion time
 * and strict maximum capacity limit with FIFO eviction.
 *
 * Design principles:
 *  - Fixed TTL: Expiration timestamp is calculated once at insertion.
 *    Accessing a key via get() does NOT extend its TTL.
 *  - Capacity control: Prevents memory leaks by evicting oldest keys
 *    when maxSize is reached.
 *  - Isolation: Providers instantiate separate cache instances.
 */

'use strict';

class SimpleTtlCache {
  /**
   * @param {Object} options
   * @param {number} [options.defaultTtlMs=900000] - 15 minutes default
   * @param {number} [options.maxSize=100] - Maximum entries before eviction
   */
  constructor(options = {}) {
    this.defaultTtlMs = options.defaultTtlMs || 15 * 60 * 1000;
    this.maxSize = options.maxSize || 100;
    this.store = new Map();
  }

  /**
   * Store a value with fixed TTL.
   *
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs] - Optional custom TTL for this entry
   */
  set(key, value, ttlMs) {
    if (!key) return;

    // Evict oldest entry if capacity reached and key is new
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const duration = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : this.defaultTtlMs;
    const expiresAt = Date.now() + duration;

    this.store.set(key, {
      value,
      expiresAt,
      insertedAt: Date.now(),
    });
  }

  /**
   * Retrieve a value if not expired.
   * Does NOT extend TTL (fixed expiration).
   *
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Check if a non-expired entry exists.
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete an entry.
   *
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get current active count (prunes expired on inspection).
   *
   * @returns {number}
   */
  size() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }
}

module.exports = SimpleTtlCache;
