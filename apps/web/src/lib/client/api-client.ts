import type {
  Activity,
  CompleteAuthRequest,
  CompleteAuthResponse,
  Contact,
  CreateContactRequest,
  GuestTokenRequest,
  GuestTokenResponse,
  MainListRow,
  SendMessageRequest,
  SendMessageResponse,
  SendOtpRequest,
  SendOtpResponse,
  StartVideoRequest,
  StartVideoResponse,
  ThreadHydrationResponse,
  UpdateContactRequest,
  User,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from "@mobileclient/shared-types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let payload: { error?: string; details?: Record<string, unknown> } = {};
    try {
      payload = await res.json();
    } catch {
      // non-JSON body
    }
    throw new ApiError(payload.error ?? `Request failed: ${res.status}`, res.status, payload.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const usersApi = {
  get: (userGuid: string) =>
    request<User>(`/api/users/${encodeURIComponent(userGuid)}`),
};

export const mainListApi = {
  get: (userGuid: string) =>
    request<MainListRow[]>(`/api/main-list/${encodeURIComponent(userGuid)}`),
};

export const contactsApi = {
  list: (userGuid: string) =>
    request<Contact[]>(`/api/contacts/${encodeURIComponent(userGuid)}`),
  get: (userGuid: string, contactGuid: string) =>
    request<Contact>(
      `/api/contacts/${encodeURIComponent(userGuid)}/${encodeURIComponent(contactGuid)}`,
    ),
  create: (userGuid: string, body: CreateContactRequest) =>
    request<Contact>(`/api/contacts/${encodeURIComponent(userGuid)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (userGuid: string, contactGuid: string, body: UpdateContactRequest) =>
    request<Contact>(
      `/api/contacts/${encodeURIComponent(userGuid)}/${encodeURIComponent(contactGuid)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    ),
  delete: (userGuid: string, contactGuid: string) =>
    request<void>(
      `/api/contacts/${encodeURIComponent(userGuid)}/${encodeURIComponent(contactGuid)}`,
      { method: "DELETE" },
    ),
};

export const activitiesApi = {
  list: (userGuid: string) =>
    request<Activity[]>(`/api/activities/${encodeURIComponent(userGuid)}`),
  byContact: (userGuid: string, contactGuid: string) =>
    request<Activity[]>(
      `/api/activities/${encodeURIComponent(userGuid)}/by-contact/${encodeURIComponent(contactGuid)}`,
    ),
  byIdentity: (userGuid: string, identityValue: string) =>
    request<Activity[]>(
      `/api/activities/${encodeURIComponent(userGuid)}/by-identity/${encodeURIComponent(identityValue)}`,
    ),
};

export const messagingApi = {
  getThread: (userGuid: string, to: string) =>
    request<ThreadHydrationResponse>(
      `/api/messaging/thread/${encodeURIComponent(userGuid)}?to=${encodeURIComponent(to)}`,
    ),
  send: (body: SendMessageRequest) =>
    request<SendMessageResponse>("/api/messaging/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  markRead: (userGuid: string, threadId: string) =>
    request<{ markedCount: number }>(
      `/api/messaging/thread/${encodeURIComponent(userGuid)}/${encodeURIComponent(threadId)}/read`,
      { method: "POST" },
    ),
};

export const videoApi = {
  start: (body: StartVideoRequest) =>
    request<StartVideoResponse>("/api/video/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  guestToken: (body: GuestTokenRequest) =>
    request<GuestTokenResponse>("/api/video/guest-token", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const authApi = {
  sendOtp: (body: SendOtpRequest) =>
    request<SendOtpResponse>("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyOtp: (body: VerifyOtpRequest) =>
    request<VerifyOtpResponse>("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  complete: (body: CompleteAuthRequest) =>
    request<CompleteAuthResponse>("/api/auth/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
