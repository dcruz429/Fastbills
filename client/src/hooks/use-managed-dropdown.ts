import { useQuery } from "@tanstack/react-query";
import type { DropdownOption } from "@shared/schema";
import { dropdownValues } from "@/lib/managed-dropdowns";

export function useManagedDropdown(category: string) {
  const query = useQuery<DropdownOption[]>({
    queryKey: ["/api/dropdown-options", category],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  return { ...query, values: dropdownValues(query.data) };
}
