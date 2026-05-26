import { getDb } from "@mobileclient/db";
import { AuthService } from "./services/auth-service";
import { ContactService } from "./services/contact-service";
import { MessagesRepository } from "./services/messages-repository";
import { MessagingService } from "./services/messaging-service";
import { SseService } from "./services/sse-service";
import { TranscriptionsRepository } from "./services/transcriptions-repository";
import { TwilioNumberService } from "./services/twilio-number-service";
import { UserService } from "./services/user-service";
import { VideoInvitesRepository } from "./services/video-invites-repository";
import { VideoService } from "./services/video-service";
import { VoiceService } from "./services/voice-service";
import { WebhookService } from "./services/webhook-service";

export interface Services {
  userService: UserService;
  messagesRepo: MessagesRepository;
  transcriptionsRepo: TranscriptionsRepository;
  sseService: SseService;
  contactService: ContactService;
  twilioNumberService: TwilioNumberService;
  authService: AuthService;
  voiceService: VoiceService;
  messagingService: MessagingService;
  webhookService: WebhookService;
  videoInvitesRepo: VideoInvitesRepository;
  videoService: VideoService;
}

const globalForServices = globalThis as unknown as { __services?: Services };

function buildServices(): Services {
  const db = getDb();

  const userService = new UserService(db);
  const messagesRepo = new MessagesRepository(db);
  const transcriptionsRepo = new TranscriptionsRepository(db);
  const sseService = new SseService();

  const contactService = new ContactService(db, messagesRepo, sseService);
  const twilioNumberService = new TwilioNumberService(userService);
  const authService = new AuthService(db, userService, twilioNumberService);
  const voiceService = new VoiceService(userService);
  const messagingService = new MessagingService(
    contactService,
    userService,
    messagesRepo,
    sseService,
  );
  const webhookService = new WebhookService(
    contactService,
    userService,
    sseService,
    messagesRepo,
    messagingService,
    transcriptionsRepo,
  );
  const videoInvitesRepo = new VideoInvitesRepository(db);
  const videoService = new VideoService(
    userService,
    videoInvitesRepo,
    transcriptionsRepo,
    contactService,
    messagingService,
    sseService,
  );

  return {
    userService,
    messagesRepo,
    transcriptionsRepo,
    sseService,
    contactService,
    twilioNumberService,
    authService,
    voiceService,
    messagingService,
    webhookService,
    videoInvitesRepo,
    videoService,
  };
}

export function getServices(): Services {
  globalForServices.__services ??= buildServices();
  return globalForServices.__services;
}
