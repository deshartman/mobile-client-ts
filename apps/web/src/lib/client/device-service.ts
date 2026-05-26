"use client";

import { Call, Device } from "@twilio/voice-sdk";

/**
 * Thin browser-only wrapper around Twilio Voice SDK Device.
 *
 * Singleton-per-tab — the Voice SDK doesn't support multiple Device
 * registrations under the same identity, so we guard setup() to only
 * construct one. Components consume this via the useVoiceDevice hook
 * which subscribes to call lifecycle changes.
 */

export type OutgoingParams = {
  userGuid: string;
  To: string;
  destinationType?: "phone" | "assistant" | "flex" | "custom";
  [key: string]: string | undefined;
};

type Listener = () => void;

class DeviceService {
  private device: Device | null = null;
  private call: Call | null = null;
  private isReady = false;
  private listeners = new Set<Listener>();
  private fetchToken: (() => Promise<string>) | null = null;
  // Latched synchronously on the first setup() call so Strict-Mode double-
  // mounts don't each construct their own Device (which would open two
  // WebSockets + register twice + then fight over the outbound call,
  // producing a "Call is already active" toast and an instant teardown).
  private setupPromise: Promise<void> | null = null;
  // Same story for dial: both mounts hit makeCall() synchronously, then
  // the second device.connect() is rejected with "Call is already active".
  private dialPromise: Promise<Call> | null = null;

  getCall(): Call | null {
    return this.call;
  }

  isDeviceReady(): boolean {
    return this.isReady;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  async setup(fetchToken: () => Promise<string>): Promise<void> {
    this.fetchToken = fetchToken;
    // Already constructed — nothing to do.
    if (this.device) return;
    // Setup in flight — reuse the in-progress promise. Critical for
    // Strict-Mode double-mount: both calls hit setup() before the first
    // has awaited its first tick, so without this latch they'd both
    // construct a Device.
    if (this.setupPromise) return this.setupPromise;

    this.setupPromise = this.doSetup(fetchToken);
    try {
      await this.setupPromise;
    } finally {
      this.setupPromise = null;
    }
  }

  private async doSetup(fetchToken: () => Promise<string>): Promise<void> {
    const token = await fetchToken();
    if (this.device) return; // raced with a fast-path; bail
    this.device = new Device(token, {
      codecPreferences: ["opus" as Call.Codec, "pcmu" as Call.Codec],
      logLevel: 1,
    });

    this.device.on("registered", () => {
      this.isReady = true;
      this.emit();
    });
    this.device.on("error", (err: Error) => {
      console.error("[DeviceService] device error:", err);
      this.emit();
    });
    this.device.on("incoming", (incoming: Call) => {
      this.call = incoming;
      incoming.on("disconnect", () => {
        this.call = null;
        this.emit();
      });
      incoming.on("cancel", () => {
        this.call = null;
        this.emit();
      });
      incoming.on("reject", () => {
        this.call = null;
        this.emit();
      });
      this.emit();
    });
    this.device.on("tokenWillExpire", () => {
      void this.refreshToken();
    });

    await this.device.register();
  }

  private async refreshToken(): Promise<void> {
    if (!this.device || !this.fetchToken) return;
    try {
      const fresh = await this.fetchToken();
      this.device.updateToken(fresh);
    } catch (err) {
      console.error("[DeviceService] token refresh failed:", err);
    }
  }

  async makeCall(params: OutgoingParams): Promise<Call> {
    if (!this.device || !this.isReady) throw new Error("Device not ready");
    // If there's already a call (live or in-flight), return it instead of
    // placing a second one. Twilio rejects the second dial with "Call is
    // already active" which cascades into the first being torn down.
    if (this.call) return this.call;
    if (this.dialPromise) return this.dialPromise;

    const stringParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string") stringParams[k] = v;
    }
    this.dialPromise = this.device.connect({ params: stringParams }).then((call) => {
      this.call = call;
      call.on("accept", () => this.emit());
      call.on("disconnect", () => {
        this.call = null;
        this.emit();
      });
      call.on("error", () => this.emit());
      call.on("mute", () => this.emit());
      this.emit();
      return call;
    });
    try {
      return await this.dialPromise;
    } finally {
      this.dialPromise = null;
    }
  }

  async answer(): Promise<void> {
    if (!this.call) return;
    await this.call.accept();
    this.emit();
  }

  async reject(): Promise<void> {
    if (!this.call) return;
    this.call.reject();
    this.call = null;
    this.emit();
  }

  async endCall(): Promise<void> {
    if (!this.call) return;
    this.call.disconnect();
    this.call = null;
    this.emit();
  }

  setMuted(muted: boolean): void {
    if (!this.call) return;
    this.call.mute(muted);
    this.emit();
  }

  /**
   * Send DTMF digits on the active call. Used by the in-call keypad for
   * IVR prompts and similar.
   */
  sendDigits(digits: string): void {
    if (!this.call) return;
    this.call.sendDigits(digits);
  }

  /**
   * Cycle the active audio output among enumerated devices. On iOS Safari
   * setSinkId is a no-op (WebRTC audio is platform-locked to the speaker),
   * so this will silently have no effect — not a bug, a documented iOS
   * limitation. Users who want earpiece mode on iOS need headphones.
   *
   * Returns the device id we tried to switch to, or null if none available.
   */
  async cycleSpeaker(): Promise<string | null> {
    const audio = this.device?.audio;
    if (!audio) return null;
    const available = Array.from(audio.availableOutputDevices.keys());
    if (available.length === 0) return null;
    const current = Array.from(audio.speakerDevices.get()).map((d) => d.deviceId);
    const currentIdx = current.length > 0 ? available.indexOf(current[0]!) : -1;
    const nextId = available[(currentIdx + 1) % available.length]!;
    await audio.speakerDevices.set([nextId]);
    return nextId;
  }

  async destroy(): Promise<void> {
    if (this.call) {
      try {
        this.call.disconnect();
      } catch {
        // ignore
      }
      this.call = null;
    }
    if (this.device) {
      try {
        this.device.destroy();
      } catch {
        // ignore
      }
      this.device = null;
    }
    this.isReady = false;
    this.emit();
  }
}

const globalForDevice = globalThis as unknown as { __deviceService?: DeviceService };

export function getDeviceService(): DeviceService {
  globalForDevice.__deviceService ??= new DeviceService();
  return globalForDevice.__deviceService;
}

export type { Call };
