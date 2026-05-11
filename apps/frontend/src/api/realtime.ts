import { apiGet } from "../lib/http";

type RealtimeTokenResponse = {
  data: {
    accessToken: string;
  };
};

export async function fetchRealtimeAccessToken() {
  const response = await apiGet<RealtimeTokenResponse>("/auth/realtime-token");
  return response.data.accessToken;
}
