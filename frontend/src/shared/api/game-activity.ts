import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from "./http";

export type GameCatalogEntry = {
  exe: string;
  title: string;
};

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : "REQUEST_FAILED";
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export async function fetchGameCatalog(): Promise<GameCatalogEntry[]> {
  const res = await authenticatedFetch(apiUrl("/api/v1/game-activity/catalog"));
  const data = await parseEnvelope<{ schema_version: number; games: GameCatalogEntry[] }>(res);
  return Array.isArray(data.games) ? data.games : [];
}
