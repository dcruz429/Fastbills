import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { TRANSFER_DESTINATIONS } from "@shared/productivity-transfers";

const TRANSFER_API_ROUTES: Record<string, string> = {
  Verification: "/api/tasks", Billing: "/api/tasks", Posting: "/api/postings",
  Collections: "/api/collections", Denials: "/api/denials", Arbitration: "/api/arbitrations",
  RTP: "/api/closed",
};

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  if (method === "PATCH" && /^\/api\/(tasks|collections|denials|arbitrations|postings|checks|closed)\/\d+$/.test(url)
    && data && typeof data === "object" && "outcome" in data && typeof data.outcome === "string") {
    const destination = TRANSFER_DESTINATIONS[data.outcome];
    const destinationApi = typeof destination === "string" ? TRANSFER_API_ROUTES[destination]
      : data.outcome === "Send to Closed" ? "/api/closed" : undefined;
    if (destinationApi) {
      // Destination lists otherwise stay cached indefinitely after a transfer.
      // Source lists are invalidated by their existing mutation callbacks.
      void queryClient.invalidateQueries({ queryKey: [destinationApi] });
      void queryClient.invalidateQueries({ queryKey: ["patient-overview"] });
    }
  }
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
