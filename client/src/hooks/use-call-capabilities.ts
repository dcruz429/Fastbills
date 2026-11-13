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
    enabled: !!user, staleTime: 0, refetchInterval: 5000, refetchOnWindowFocus: true,
  });
  const canRead = !!query.data?.canRead && !query.error;
  const canMutate = canRead && !!query.data?.canMutate && !isImpersonating;
  const canManage = canRead && !!query.data?.canManage;
  const supervisedEmployees = canRead && !isImpersonating ? query.data?.supervisedEmployees ?? [] : [];
  const canViewCall = (call: { assignedUserId?: number | null; clinic?: string | null; department?: string | null }) =>
    canRead && (canManage || call.assignedUserId === user?.id ||
      (supervisedEmployees.some(employee => employee.id === call.assignedUserId) &&
        !!query.data?.clinics.some(c => c.name === call.clinic?.trim().toLowerCase()) &&
        !!query.data?.departments.includes(call.department as any)));
  return { ...query, canRead, canMutate, canManage, supervisedEmployees, canViewCall,
    visibilityKey: JSON.stringify([user?.id, isImpersonating, query.data]),
    canMutateCall: (call: { assignedUserId?: number | null }) =>
      canMutate && (canManage || call.assignedUserId === user?.id),
  };
}
