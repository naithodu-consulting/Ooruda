import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import { LoadingOverlay } from '@kit/ui/loading-overlay';

export function RolesDataProvider(props: {
  maxRoleHierarchy: number;
  children: (roles: string[]) => React.ReactNode;
}) {
  const rolesQuery = useFetchRoles(props);

  if (rolesQuery.isLoading) {
    return <LoadingOverlay fullPage={false} />;
  }

  if (rolesQuery.isError) {
    return null;
  }

  return <>{props.children(rolesQuery.data ?? [])}</>;
}

function useFetchRoles(props: { maxRoleHierarchy: number }) {
  const supabase = useSupabase();

  return useQuery({
    queryKey: ['roles', props.maxRoleHierarchy],
    queryFn: async () => {
      const { error, data } = await supabase
        .from('roles')
        .select('name, hierarchy_level, product_type')
        .gte('hierarchy_level', props.maxRoleHierarchy)
        .order('hierarchy_level', { ascending: true });

      if (error) {
        throw error;
      }

      // Roles belong to a product (association or villa), and a membership
      // can only hold a role of its account's product (enforced by a DB
      // trigger). Offer only roles of the same product as the viewer's own
      // role, so an association admin is never offered villa roles.
      // If the viewer's level matches no role, fall back to the association
      // product rather than offering every product's roles.
      const product =
        data.find((item) => item.hierarchy_level === props.maxRoleHierarchy)
          ?.product_type ?? 'association';

      return data
        .filter((item) => item.product_type === product)
        .map((item) => item.name);
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
