import type {
  Message,
  MessageStatus,
  Thread,
} from "@mobileclient/shared-types";
import { env } from "../env";
import { NotFoundError, ValidationError } from "../errors";
import { logOut } from "../logger";
import { getTwilioClient } from "../twilio-client";
import type { ContactService } from "./contact-service";
import type { MessagesRepository } from "./messages-repository";
import type { SseService } from "./sse-service";
import type { UserService } from "./user-service";

function normalisePhone(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function toE164(s: string): string {
  const digits = normalisePhone(s);
  return digits ? `+${digits}` : s;
}

export interface SendMessageInput {
  userGuid: string;
  remoteAddress: string;
  body: string;
  contactGuid?: string;
}

export interface SendMessageResult {
  threadId: string;
  messageSid: string;
  status: MessageStatus;
}

export interface EnsureThreadInput {
  userGuid: string;
  remoteAddress: string;
  contactGuid?: string;
}

export interface ThreadHydration {
  threadId?: string;
  messages: Message[];
}

export class MessagingService {
  constructor(
    private readonly contactService: ContactService,
    private readonly userService: UserService,
    private readonly messagesRepo: MessagesRepository,
    private readonly sseService: SseService,
  ) {}

  resolveContactGuid(userGuid: string, remoteAddress: string): string | undefined {
    const target = normalisePhone(remoteAddress);
    if (!target) return undefined;
    const contacts = this.contactService.getContacts(userGuid);
    for (const contact of contacts) {
      for (const identity of contact.identities) {
        if (normalisePhone(identity.value) === target) return contact.contactGuid;
      }
    }
    return undefined;
  }

  ensureThread(input: EnsureThreadInput): Thread {
    const user = this.userService.getUser(input.userGuid);
    if (!user) throw new NotFoundError(`User not found: ${input.userGuid}`);
    const proxyAddress = user.twilioNumber;
    if (!proxyAddress) {
      throw new ValidationError(`User ${input.userGuid} has no twilio_number configured`);
    }

    const existing = this.messagesRepo.findThreadByPair(input.userGuid, proxyAddress, input.remoteAddress);
    if (existing) return existing;

    const resolvedContactGuid =
      input.contactGuid ?? this.resolveContactGuid(input.userGuid, input.remoteAddress);
    logOut(
      "MessagingService",
      `Creating thread for ${input.userGuid}: ${proxyAddress} <-> ${input.remoteAddress}`,
    );
    return this.messagesRepo.insertThread({
      userGuid: input.userGuid,
      contactGuid: resolvedContactGuid ?? null,
      remoteAddress: input.remoteAddress,
      proxyAddress,
    });
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (!input.userGuid || !input.remoteAddress || !input.body) {
      throw new ValidationError("Missing required fields: userGuid, remoteAddress, body");
    }

    const normalisedRemote = toE164(input.remoteAddress);
    const thread = this.ensureThread({
      userGuid: input.userGuid,
      remoteAddress: normalisedRemote,
      contactGuid: input.contactGuid,
    });

    logOut(
      "MessagingService",
      `Sending SMS from ${thread.proxyAddress} → ${thread.remoteAddress}`,
    );

    const createArgs: Parameters<
      ReturnType<typeof getTwilioClient>["messages"]["create"]
    >[0] = {
      to: thread.remoteAddress,
      from: thread.proxyAddress,
      body: input.body,
      statusCallback: `${env.SERVER_BASE_URL.replace(/\/$/, "")}/api/webhooks/messaging/status`,
    };

    const message = await getTwilioClient().messages.create(createArgs);
    const status = (message.status ?? "queued") as MessageStatus;

    const datetime = message.dateCreated
      ? new Date(message.dateCreated).toISOString()
      : new Date().toISOString();

    const inserted = this.messagesRepo.insertMessageIfAbsent({
      messageSid: message.sid,
      threadId: thread.threadId,
      direction: "outbound",
      author: thread.proxyAddress,
      body: input.body,
      datetime,
      index: null,
      status,
    });

    if (inserted && !thread.activityId) {
      const activity = this.contactService.addActivity(input.userGuid, {
        type: "Message",
        datetime,
        duration: 0,
        identityValue: thread.remoteAddress,
        contactGuid: thread.contactGuid ?? null,
      });
      this.messagesRepo.setThreadActivity(thread.threadId, activity.id);
    }

    if (inserted) {
      this.sseService.broadcast({
        type: "message.added",
        userGuid: input.userGuid,
        payload: {
          messageSid: message.sid,
          threadId: thread.threadId,
          direction: "outbound",
          author: thread.proxyAddress,
          body: input.body,
          datetime,
          status,
        },
      });
    }

    return { threadId: thread.threadId, messageSid: message.sid, status };
  }

  getThread(userGuid: string, remoteAddress: string): ThreadHydration {
    if (!userGuid || !remoteAddress) return { messages: [] };
    const normalisedRemote = toE164(remoteAddress);
    const thread = this.messagesRepo.findThreadByUserAndRemote(userGuid, normalisedRemote);
    if (!thread) return { messages: [] };
    return {
      threadId: thread.threadId,
      messages: this.messagesRepo.getMessages(thread.threadId),
    };
  }
}
