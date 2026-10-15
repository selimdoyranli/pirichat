// A thin WebSocket subclass handed to @fluxerjs/core. It
//  - rewrites the Identify frame (e2ee_capable: false, see protocol.js), and
//  - lets us see Opcode 12 (refused voice join), which the SDK only logs.
// The connection is uncompressed JSON (the SDK sends ?v=1&encoding=json), so frames are strings.

import { patchIdentifyFrame } from './protocol.js';

/**
 * @param {typeof WebSocket} Base
 * @param {(data: unknown) => void} onFrame called for every incoming frame
 */
export function makeWebSocketClass(Base, onFrame) {
  return class PirichatWebSocket extends Base {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (event) => {
        try {
          onFrame(event.data);
        } catch {
          // observing must never break the SDK's own handling
        }
      });
    }

    send(data) {
      super.send(patchIdentifyFrame(data));
    }
  };
}
