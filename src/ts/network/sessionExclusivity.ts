let sessionDeactivated = false;
let localChannel: BroadcastChannel | null = null;
let localSessionInstalled = false;

export function isSessionDeactivated(): boolean {
  return sessionDeactivated;
}

export function deactivateCurrentSession(onShutdown?: () => void): void {
  if (sessionDeactivated) return;
  sessionDeactivated = true;
  try {
    onShutdown?.();
  } catch {}

  void Promise.all([import("../alert"), import("../../lang")])
    .then(([{ alert }, { language }]) =>
      alert.normalWait(language.activeTabChange),
    )
    .then(() => {
      location.reload();
    });
}

export async function initLocalTabExclusivity(): Promise<void> {
  if (localSessionInstalled) return;
  if (typeof window === "undefined") return;
  const [{ isTauri }, { getNodeClientSessionId }] = await Promise.all([
    import("../platform"),
    import("./nodeClientSession"),
  ]);
  // Detached auxiliary chat windows in Tauri intentionally coexist with the main window.
  if (isTauri) {
    const { parseTauriChatWorkspaceLaunch } = await import(
      "../tauriChatWindows"
    );
    if (parseTauriChatWorkspaceLaunch(window.location?.search ?? "")) {
      return;
    }
  }
  if (localSessionInstalled) return;
  localSessionInstalled = true;
  const sessionId = getNodeClientSessionId();

  if (typeof BroadcastChannel !== "undefined") {
    try {
      localChannel = new BroadcastChannel("risu-active-session");
      localChannel.onmessage = (event: MessageEvent) => {
        const incomingId = event.data?.activeClientId;
        if (
          typeof incomingId === "string" &&
          incomingId.length > 0 &&
          incomingId !== sessionId
        ) {
          deactivateCurrentSession(() => {
            localChannel?.close();
            localChannel = null;
          });
        }
      };
      localChannel.postMessage({ activeClientId: sessionId });
    } catch {
      localChannel = null;
    }
  }
}
