// One guild's song list and loop mode. Pure: no timers, no I/O.

/** @typedef {'off'|'song'|'queue'} LoopMode */

export class SongQueue {
  constructor() {
    /** @type {object|null} */
    this.current = null;
    /** @type {object[]} */
    this.upcoming = [];
    /** @type {LoopMode} */
    this.loop = 'off';
  }

  get size() {
    return (this.current ? 1 : 0) + this.upcoming.length;
  }

  /**
   * Appends songs. If nothing is current the first one becomes current.
   * @returns {number} 1-based position of the first added song (1 = playing now)
   */
  add(songs) {
    const list = Array.isArray(songs) ? songs : [songs];
    if (list.length === 0) return 0;
    let position;
    if (!this.current) {
      this.current = list[0];
      position = 1;
      this.upcoming.push(...list.slice(1));
    } else {
      position = this.upcoming.length + 2;
      this.upcoming.push(...list);
    }
    return position;
  }

  /**
   * Moves to the next song after the current one finished or was skipped.
   * Song loop repeats only on natural finish; a skip always moves on.
   * @param {{skipped?: boolean, failed?: boolean}} how
   * @returns {object|null} the new current song
   */
  advance({ skipped = false, failed = false } = {}) {
    const finished = this.current;
    if (finished && this.loop === 'song' && !skipped && !failed) return finished;
    if (finished && this.loop === 'queue' && !failed) this.upcoming.push(finished);
    this.current = this.upcoming.shift() ?? null;
    return this.current;
  }

  clear() {
    this.current = null;
    this.upcoming = [];
  }

  toggleLoop() {
    this.loop = this.loop === 'song' ? 'off' : 'song';
    return this.loop === 'song';
  }

  toggleQueueLoop() {
    this.loop = this.loop === 'queue' ? 'off' : 'queue';
    return this.loop === 'queue';
  }
}
