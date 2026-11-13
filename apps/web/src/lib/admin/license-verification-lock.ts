// Synchronous guard as well as disabled controls: React state alone is not a lock.
export function createLicenseVerificationLock() {
  let running = false;
  return {
    isRunning: () => running,
    start: () => {
      if (running) return false;
      running = true;
      return true;
    },
    finish: () => { running = false; },
  };
}
