"use client";

import type {
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteVideoTrack,
  Room,
} from "twilio-video";

/**
 * Singleton-per-tab wrapper around Twilio Video SDK Room. Mirrors the
 * Strict-Mode latch pattern from device-service.ts: synchronously latch
 * connectPromise before any await so React's double-mount can't open
 * two rooms.
 *
 * The SDK is loaded lazily on first connect() so SSR + initial JS
 * payload aren't burdened by the ~600KB Twilio Video bundle.
 */

export interface VideoConnectOpts {
  token: string;
  roomName: string;
  /** Pass through to Room.connect — true persists `room.on('transcription')`. */
  receiveTranscriptions?: boolean;
}

export interface RemoteVideoState {
  participantSid: string;
  identity: string;
  videoTrack: RemoteVideoTrack | null;
  audioTrack: RemoteAudioTrack | null;
}

type Listener = () => void;

class VideoDeviceService {
  private room: Room | null = null;
  private localAudio: LocalAudioTrack | null = null;
  private localVideo: LocalVideoTrack | null = null;
  private remote: RemoteVideoState | null = null;
  private listeners = new Set<Listener>();
  private connectPromise: Promise<Room> | null = null;
  private transcriptionHandler: ((evt: unknown) => void) | null = null;

  getRoom(): Room | null {
    return this.room;
  }

  getLocalVideoTrack(): LocalVideoTrack | null {
    return this.localVideo;
  }

  getLocalAudioTrack(): LocalAudioTrack | null {
    return this.localAudio;
  }

  getRemote(): RemoteVideoState | null {
    return this.remote;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Set before connect() to capture transcription events from the SDK. */
  setTranscriptionHandler(fn: ((evt: unknown) => void) | null): void {
    this.transcriptionHandler = fn;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  async connect(opts: VideoConnectOpts): Promise<Room> {
    if (this.room) return this.room;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect(opts);
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async doConnect(opts: VideoConnectOpts): Promise<Room> {
    const Video = await import("twilio-video");
    if (this.room) return this.room;

    const [localAudio, localVideo] = await Promise.all([
      Video.createLocalAudioTrack(),
      Video.createLocalVideoTrack({ width: 640, height: 480 }),
    ]);
    this.localAudio = localAudio;
    this.localVideo = localVideo;

    const room = await Video.connect(opts.token, {
      name: opts.roomName,
      tracks: [localAudio, localVideo],
      ...(opts.receiveTranscriptions ? { receiveTranscriptions: true } : {}),
    });
    this.room = room;

    for (const participant of room.participants.values()) {
      this.attachRemote(participant);
    }
    room.on("participantConnected", (p) => this.attachRemote(p));
    room.on("participantDisconnected", () => {
      this.remote = null;
      this.emit();
    });
    room.on("disconnected", () => {
      this.cleanupAfterDisconnect();
      this.emit();
    });
    if (this.transcriptionHandler) {
      room.on("transcription", this.transcriptionHandler);
    }
    this.emit();
    return room;
  }

  private attachRemote(participant: RemoteParticipant): void {
    const state: RemoteVideoState = {
      participantSid: participant.sid,
      identity: participant.identity,
      videoTrack: null,
      audioTrack: null,
    };
    for (const pub of participant.tracks.values()) {
      if (pub.isSubscribed && pub.track) {
        if (pub.track.kind === "video") state.videoTrack = pub.track;
        if (pub.track.kind === "audio") state.audioTrack = pub.track;
      }
    }
    this.remote = state;

    participant.on("trackSubscribed", (track: RemoteTrack) => {
      if (!this.remote || this.remote.participantSid !== participant.sid) return;
      if (track.kind === "video") this.remote.videoTrack = track;
      if (track.kind === "audio") this.remote.audioTrack = track;
      this.emit();
    });
    participant.on("trackUnsubscribed", (track: RemoteTrack) => {
      if (!this.remote || this.remote.participantSid !== participant.sid) return;
      if (track.kind === "video" && this.remote.videoTrack === track) this.remote.videoTrack = null;
      if (track.kind === "audio" && this.remote.audioTrack === track) this.remote.audioTrack = null;
      this.emit();
    });
    this.emit();
  }

  setMuted(muted: boolean): void {
    if (!this.localAudio) return;
    if (muted) this.localAudio.disable();
    else this.localAudio.enable();
    this.emit();
  }

  setCameraOff(off: boolean): void {
    if (!this.localVideo) return;
    if (off) this.localVideo.disable();
    else this.localVideo.enable();
    this.emit();
  }

  isMuted(): boolean {
    return this.localAudio ? !this.localAudio.isEnabled : false;
  }

  isCameraOff(): boolean {
    return this.localVideo ? !this.localVideo.isEnabled : false;
  }

  private cleanupAfterDisconnect(): void {
    if (this.localAudio) {
      try {
        this.localAudio.stop();
      } catch {
        /* ignore */
      }
      this.localAudio = null;
    }
    if (this.localVideo) {
      try {
        this.localVideo.stop();
      } catch {
        /* ignore */
      }
      this.localVideo = null;
    }
    this.remote = null;
    this.room = null;
  }

  disconnect(): void {
    if (!this.room) return;
    try {
      this.room.disconnect();
    } catch {
      /* ignore */
    }
    this.cleanupAfterDisconnect();
    this.emit();
  }
}

const globalForVideo = globalThis as unknown as { __videoDeviceService?: VideoDeviceService };

export function getVideoDeviceService(): VideoDeviceService {
  globalForVideo.__videoDeviceService ??= new VideoDeviceService();
  return globalForVideo.__videoDeviceService;
}

export type VideoDeviceServiceInstance = ReturnType<typeof getVideoDeviceService>;
