import { useQuery } from "@tanstack/react-query";
import { callCapabilitiesSchema } from "@shared/call-calendar-contract";
import { calendarJson } from "@/lib/call-calendar-api";
import { useAuth } from "@/lib/auth";

export function useCallCapabilities() {
  const { user, isImpersonating } = useAuth();
  const query = useQuery({
    queryKey: ["/api/calls/capabilities", user?.id, isImpersonating],
    queryFn: async () => {
      const data = await calendarJson("/api/calls/capabilities", callCapabilitiesSchema);
      if (data.userId !== user?.id) throw new Error("Calendar access could not be verified.");
      return data;
    },
    enabled: !!user, staleTime: 0,
  });
  return { ...query, canRead: !!query.data?.canRead,
    canMutate: !!query.data?.canMutate && !isImpersonating,
    canManage: !!query.data?.canManage };
}
