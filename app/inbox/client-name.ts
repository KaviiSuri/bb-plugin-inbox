// Names the client a Verification or Later was made on. No user identity
// reaches a plugin (ADR 0007), so a sign-off records the device instead.

export function describeClient(userAgent: string): string {
  const device = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Macintosh|Mac OS X/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Unknown device";
  const app = /Electron/.test(userAgent) ? "bb desktop" : "browser";
  return `${device} · ${app}`;
}

export function currentClient(): string {
  return typeof navigator === "undefined"
    ? "Unknown device"
    : describeClient(navigator.userAgent);
}
