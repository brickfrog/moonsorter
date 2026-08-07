const API_URL = 'https://graphql.anilist.co';

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type AniListTitle = {
  romaji?: string;
  english?: string;
  native?: string;
};

type AniListMedia = {
  id: number;
  title: AniListTitle;
  coverImage?: { medium?: string };
};

type AniListEntry = {
  mediaId: number;
  score: number;
  title: string;
  coverImage?: string;
  airedYear?: number;
  seasonYear?: number;
  startedAtYear?: number;
  completedAtYear?: number;
  updatedAtYear?: number;
};

type ScoreFormat =
  | 'POINT_100'
  | 'POINT_10_DECIMAL'
  | 'POINT_10'
  | 'POINT_5'
  | 'POINT_3';
type MediaType = 'ANIME' | 'MANGA';

/**
 * HTTP-level AniList failure. Carries the status and any `Retry-After` header
 * so callers can back off intelligently; the message is unchanged from the
 * plain `Error` this used to throw.
 */
export class AniListHttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, retryAfterSeconds: number | null, message: string) {
    super(message);
    this.name = 'AniListHttpError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** AniList sends `Retry-After` as whole seconds; anything else is ignored. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function fetchGraphQL<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new AniListHttpError(
      response.status,
      parseRetryAfter(response.headers.get('Retry-After')),
      response.status === 429
        ? 'AniList rate limit reached. Wait a minute and try again.'
        : `AniList request failed: ${response.status}`,
    );
  }
  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors && payload.errors.length) {
    throw new Error(payload.errors.map((err) => err.message).join(', '));
  }
  if (!payload.data) {
    throw new Error('AniList returned no data');
  }
  return payload.data;
}

function pickTitle(title: AniListTitle): string {
  return title.english || title.romaji || title.native || 'Untitled';
}

export async function fetchViewer(
  token: string,
): Promise<{ id: number; name: string; scoreFormat?: ScoreFormat }> {
  const query = `query {
    Viewer { id name mediaListOptions { scoreFormat } }
  }`;
  const data = await fetchGraphQL<{
    Viewer: {
      id: number;
      name: string;
      mediaListOptions?: { scoreFormat?: ScoreFormat };
    };
  }>(
    token,
    query,
  );
  return {
    id: data.Viewer.id,
    name: data.Viewer.name,
    scoreFormat: data.Viewer.mediaListOptions?.scoreFormat,
  };
}

export async function fetchMediaList(
  token: string,
  mediaType: MediaType,
): Promise<{ entries: AniListEntry[]; scoreFormat?: ScoreFormat }> {
  const viewer = await fetchViewer(token);
  const query = `query ($userId: Int, $mediaType: MediaType) {
    MediaListCollection(userId: $userId, type: $mediaType, status_in: [COMPLETED, CURRENT]) {
      lists {
        entries {
          score
          startedAt { year }
          completedAt { year }
          updatedAt
          media {
            id
            title { romaji english native }
            coverImage { medium }
            startDate { year }
            seasonYear
          }
        }
      }
    }
  }`;

  const data = await fetchGraphQL<{
    MediaListCollection: {
      lists: Array<{
        entries: Array<{
          score: number;
          startedAt?: { year?: number | null } | null;
          completedAt?: { year?: number | null } | null;
          updatedAt?: number | null;
          media: AniListMedia & {
            startDate?: { year?: number | null } | null;
            seasonYear?: number | null;
          };
        }>;
      }>;
    };
  }>(token, query, { userId: viewer.id, mediaType });

  const entries: AniListEntry[] = [];
  for (const list of data.MediaListCollection.lists) {
    for (const entry of list.entries) {
      const updatedAt =
        typeof entry.updatedAt === 'number' ? entry.updatedAt : undefined;
      const updatedAtYear =
        updatedAt != null
          ? new Date(updatedAt * 1000).getUTCFullYear()
          : undefined;
      entries.push({
        mediaId: entry.media.id,
        score: entry.score || 0,
        title: pickTitle(entry.media.title),
        coverImage: entry.media.coverImage?.medium,
        airedYear: entry.media.startDate?.year ?? undefined,
        seasonYear: entry.media.seasonYear ?? undefined,
        startedAtYear: entry.startedAt?.year ?? undefined,
        completedAtYear: entry.completedAt?.year ?? undefined,
        updatedAtYear,
      });
    }
  }
  return { entries, scoreFormat: viewer.scoreFormat };
}

export async function updateScore(
  token: string,
  mediaId: number,
  score: number,
): Promise<void> {
  const mutation = `mutation ($mediaId: Int!, $score: Float!) {
    SaveMediaListEntry(mediaId: $mediaId, score: $score) { id score }
  }`;
  await fetchGraphQL(token, mutation, { mediaId, score });
}

/**
 * Gap between mutations. AniList allows roughly 90 requests/minute; 700 ms
 * keeps a bulk upload comfortably under that even with clock skew.
 */
const UPLOAD_DELAY_MS = 700;
/** Attempts per item, including the first. Only 429s are retried. */
const UPLOAD_MAX_ATTEMPTS = 3;
/** Used when a 429 arrives without a usable `Retry-After`. */
const FALLBACK_RETRY_AFTER_SECONDS = 60;

export type UpdateScoresOptions = {
  /** Called after each mutation lands, with the running count. */
  onProgress?: (done: number, total: number) => void;
  /** Checked between items; aborting stops the upload where it stands. */
  signal?: AbortSignal;
};

/**
 * Sleeps for `ms`, returning early if `signal` aborts meanwhile.
 *
 * Deliberately not `Promise.withResolvers`: that needs Chrome 119 / Safari
 * 17.4, and this is a static public site with no polyfill.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Seconds to wait before retrying, or null if the error is not a 429. */
function retryDelaySeconds(error: unknown): number | null {
  if (!(error instanceof AniListHttpError) || error.status !== 429) return null;
  return error.retryAfterSeconds ?? FALLBACK_RETRY_AFTER_SECONDS;
}

function cancelled(done: number, total: number): Error {
  const error = new Error(`Upload cancelled after ${done} of ${total}.`);
  error.name = 'AbortError';
  return error;
}

/**
 * Writes scores back one at a time, paced under AniList's rate limit.
 *
 * A bulk upload is not atomic: if it dies partway, the account already holds
 * the prefix that landed. Every failure path therefore names the count that
 * succeeded so the user knows what to re-send.
 */
export async function updateScores(
  token: string,
  updates: Array<{ mediaId: number; score: number }>,
  options: UpdateScoresOptions = {},
): Promise<void> {
  const { onProgress, signal } = options;
  const total = updates.length;
  let done = 0;

  for (const [index, update] of updates.entries()) {
    if (index > 0) await sleep(UPLOAD_DELAY_MS, signal);
    if (signal?.aborted) throw cancelled(done, total);

    for (let attempt = 1; ; attempt += 1) {
      try {
        await updateScore(token, update.mediaId, update.score);
        break;
      } catch (error) {
        const retryAfter = retryDelaySeconds(error);
        if (retryAfter == null || attempt >= UPLOAD_MAX_ATTEMPTS) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Uploaded ${done} of ${total} before failing: ${reason}`);
        }
        await sleep(retryAfter * 1000, signal);
        if (signal?.aborted) throw cancelled(done, total);
      }
    }

    done += 1;
    onProgress?.(done, total);
  }
}

export type { AniListEntry, ScoreFormat, MediaType };
