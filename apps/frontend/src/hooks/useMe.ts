import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "../api/auth";
import { getAuthToken } from "../lib/auth";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: Boolean(getAuthToken()),
    retry: false
  });
}
