import type { SseEvent } from "@mobileclient/shared-types";
import { logOut } from "../logger";

const encoder = new TextEncoder();

export class SseService {
  private readonly clients = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

  register(userGuid: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    let set = this.clients.get(userGuid);
    if (!set) {
      set = new Set();
      this.clients.set(userGuid, set);
    }
    set.add(controller);
    logOut("SseService", `Client connected for user ${userGuid} (total: ${set.size})`);
  }

  unregister(userGuid: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    const set = this.clients.get(userGuid);
    if (!set) return;
    set.delete(controller);
    if (set.size === 0) this.clients.delete(userGuid);
    logOut("SseService", `Client disconnected for user ${userGuid}`);
  }

  broadcast(event: SseEvent): void {
    const set = this.clients.get(event.userGuid);
    if (!set || set.size === 0) {
      logOut("SseService", `broadcast(${event.type}) to ${event.userGuid}: no clients connected`);
      return;
    }
    logOut("SseService", `broadcast(${event.type}) to ${event.userGuid}: ${set.size} client(s)`);

    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
    const bytes = encoder.encode(frame);

    for (const controller of set) {
      try {
        controller.enqueue(bytes);
      } catch {
        set.delete(controller);
      }
    }
  }

  heartbeat(userGuid: string): void {
    const set = this.clients.get(userGuid);
    if (!set) return;
    const bytes = encoder.encode(": ping\n\n");
    for (const controller of set) {
      try {
        controller.enqueue(bytes);
      } catch {
        set.delete(controller);
      }
    }
  }
}
