// Gateway watchdog: notices when the SDK is stuck in a reconnect loop and asks for a restart.
//
// Observed 2026-10-15: after the chat server was redeployed the SDK kept emitting "WebSocket error" every few
// milliseconds for hours without ever reaching Ready again. Text commands still worked (plain HTTP), voice did not.
// The honest fix is to exit and let Docker (restart: unless-stopped) bring a fresh process up.
//
// Generic on purpose: any bot built on @fluxerjs/core can hand it the client's Ready and Error events.

/**
 * @param {object} options
 * @param {(...args: unknown[]) => void} options.log
 * @param {(reason: string) => void} options.onStuck called once when the connection is judged dead
 * @param {number} [options.errorBurst=20] errors within `windowMs` that count as a storm
 * @param {number} [options.windowMs=60_000]
 * @param {number} [options.recoveryMs=30_000] time a storm gets to produce a Ready before onStuck fires
 * @param {number} [options.logEveryMs=10_000] identical error messages are logged at most this often
 * @param {() => number} [options.now]
 */
export function createGatewayWatchdog({
  log,
  onStuck,
  errorBurst = 20,
  windowMs = 60_000,
  recoveryMs = 30_000,
  logEveryMs = 10_000,
  now = Date.now,
}) {
  let errorTimes = [];
  let suppressed = 0;
  let lastLogged = { message: null, at: 0 };
  let timer = null;
  let stuck = false;

  function noteReady() {
    errorTimes = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
      log('gateway toparlandı, yeniden başlatma iptal');
    }
  }

  function noteError(message) {
    const at = now();
    errorTimes = errorTimes.filter((t) => at - t < windowMs);
    errorTimes.push(at);

    // Same message again within logEveryMs: count it instead of printing it.
    if (lastLogged.message === message && at - lastLogged.at < logEveryMs) {
      suppressed += 1;
    } else {
      log('client error:', message, suppressed ? `(+${suppressed} tekrar)` : '');
      lastLogged = { message, at };
      suppressed = 0;
    }

    if (!timer && !stuck && errorTimes.length >= errorBurst) {
      log(`gateway hata fırtınası (${errorTimes.length} hata / ${windowMs / 1000}s); ${recoveryMs / 1000}s içinde toparlanmazsa yeniden başlıyorum`);
      timer = setTimeout(() => {
        timer = null;
        stuck = true;
        onStuck(`gateway ${recoveryMs / 1000}s içinde toparlanmadı`);
      }, recoveryMs);
      timer.unref?.();
    }
  }

  return { noteReady, noteError, get pending() { return timer !== null; } };
}
