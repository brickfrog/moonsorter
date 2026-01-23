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

export async function updateScores(
  token: string,
  updates: Array<{ mediaId: number; score: number }>,
): Promise<void> {
  for (const update of updates) {
    await updateScore(token, update.mediaId, update.score);
  }
}

export type { AniListEntry, ScoreFormat, MediaType };
