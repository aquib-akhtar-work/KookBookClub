import type {
  Club,
  CookbookSearchResult,
  Feedback,
  InviteCode,
  MediaPost,
  Meeting,
  Member,
  Poll,
  Recipe,
  User
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8080" : "")).replace(
  /\/$/,
  ""
);
const TOKEN_KEY = "cookbookclub.token";
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function mediaUrl(url: string): string {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${API_BASE}${url}`;
  }
  return `${API_BASE}/${url}`;
}

interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

function buildHeaders(includeJSON: boolean, skipAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJSON) {
    headers["Content-Type"] = "application/json";
  }
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...buildHeaders(!(options.body instanceof FormData), Boolean(options.skipAuth)),
        ...(options.headers ?? {})
      }
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Request timed out. Please try again.", 0);
    }
    throw err instanceof Error ? err : new Error("Network request failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep fallback.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export function register(payload: {
  email: string;
  username: string;
  display_name: string;
  password: string;
}) {
  return request<{ user: User; token: string; expires_at: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true
  });
}

export function login(payload: { identity: string; password: string }) {
  return request<{ user: User; token: string; expires_at: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true
  });
}

export function logout() {
  return request<{ status: string }>("/api/auth/logout", {
    method: "POST"
  });
}

export function getMe() {
  return request<{ user: User }>("/api/me");
}

export function getClubs() {
  return request<{ clubs: Club[] }>("/api/clubs");
}

export function searchCookbooks(query: string, limit = 8) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit)
  });
  return request<{ query: string; cached: boolean; results: CookbookSearchResult[] }>(
    `/api/cookbooks/search?${params.toString()}`
  );
}

export function getClub(clubId: number) {
  return request<{ club: Club }>(`/api/clubs/${clubId}`);
}

export function createClub(payload: { name: string; description: string }) {
  return request<{ club: Club; invite_code: InviteCode }>("/api/clubs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function joinClub(payload: { code: string }) {
  return request<{ club: Club }>("/api/clubs/join", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getClubMembers(clubId: number) {
  return request<{ members: Member[] }>(`/api/clubs/${clubId}/members`);
}

export function getInviteCodes(clubId: number) {
  return request<{ invite_codes: InviteCode[] }>(`/api/clubs/${clubId}/invite-codes`);
}

export function createInviteCode(clubId: number, payload: { expires_in_days: number; max_uses: number }) {
  return request<{ invite_code: InviteCode }>(`/api/clubs/${clubId}/invite-codes`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMeetings(clubId: number) {
  return request<{ meetings: Meeting[] }>(`/api/clubs/${clubId}/meetings`);
}

export function getMeeting(meetingId: number) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}`);
}

export function createMeeting(
  clubId: number,
  payload: {
    title: string;
    address: string;
    scheduled_at: string;
    cookbook: string;
    cookbook_key?: string;
    cookbook_author?: string;
    cookbook_cover_url?: string;
    cookbook_first_publish_year?: number;
    host_user_id: number;
    notes: string;
  }
) {
  return request<{ meeting: Meeting }>(`/api/clubs/${clubId}/meetings`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateMeeting(
  meetingId: number,
  payload: {
    title: string;
    address: string;
    scheduled_at: string;
    cookbook: string;
    cookbook_key?: string;
    cookbook_author?: string;
    cookbook_cover_url?: string;
    cookbook_first_publish_year?: number;
    host_user_id: number;
    notes: string;
  }
) {
  return request<{ meeting: Meeting }>(`/api/meetings/${meetingId}/update`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function endMeeting(meetingId: number) {
  return request<{ meeting: Meeting; already_ended: boolean }>(`/api/meetings/${meetingId}/end`, {
    method: "POST"
  });
}

export function getRecipes(meetingId: number) {
  return request<{ recipes: Recipe[] }>(`/api/meetings/${meetingId}/recipes`);
}

export function addRecipe(
  meetingId: number,
  payload: {
    title: string;
    notes: string;
    source_url: string;
  }
) {
  return request<{ recipe: Recipe }>(`/api/meetings/${meetingId}/recipes`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMedia(meetingId: number) {
  return request<{ media: MediaPost[] }>(`/api/meetings/${meetingId}/media`);
}

export function addMediaUrl(
  meetingId: number,
  payload: {
    media_type: "image" | "video";
    media_url: string;
    caption: string;
  }
) {
  return request<{ media: MediaPost }>(`/api/meetings/${meetingId}/media`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function addMediaFile(
  meetingId: number,
  payload: {
    file: File;
    media_type: "image" | "video";
    caption: string;
  }
) {
  const body = new FormData();
  body.append("file", payload.file);
  body.append("media_type", payload.media_type);
  body.append("caption", payload.caption);

  return request<{ media: MediaPost }>(`/api/meetings/${meetingId}/media`, {
    method: "POST",
    body
  });
}

export function getPolls(meetingId: number) {
  return request<{ polls: Poll[] }>(`/api/meetings/${meetingId}/polls`);
}

export function createPoll(
  meetingId: number,
  payload: {
    question: string;
    options: string[];
    closes_at: string;
  }
) {
  return request<{ poll: Poll }>(`/api/meetings/${meetingId}/polls`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function voteOnPoll(pollId: number, optionId: number) {
  return request<{ poll: Poll }>(`/api/polls/${pollId}/vote`, {
    method: "POST",
    body: JSON.stringify({ option_id: optionId })
  });
}

export function getFeedback(meetingId: number) {
  return request<{ feedback: Feedback[] }>(`/api/meetings/${meetingId}/feedback`);
}

export function saveFeedback(
  meetingId: number,
  payload: {
    rating: number;
    comment: string;
  }
) {
  return request<{ status: string }>(`/api/meetings/${meetingId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
