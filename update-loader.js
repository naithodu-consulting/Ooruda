const fs = require('fs');
const path = require('path');
const p = path.resolve('apps/web/app/[locale]/home/[account]/_lib/server/team-account-workspace.loader.ts');
let content = fs.readFileSync(p, 'utf8');

const newLogic = `async function workspaceLoader(accountSlug: string) {
  const client = getSupabaseServerClient();
  const api = createTeamAccountsApi(client);

  const [workspace, user, { data: isSuperAdmin }] = await Promise.all([
    api.getAccountWorkspace(accountSlug),
    requireUserInServerComponent(),
    client.rpc('is_super_admin')
  ]);

  if (isSuperAdmin) {
    if (!workspace.data?.account) {
      // Super admin isn't a member, so fetch account directly
      const { data: rawAccount } = await client
        .from('accounts')
        .select('id, name, picture_url, slug, primary_owner_user_id')
        .eq('slug', accountSlug)
        .single();
        
      if (!rawAccount) return redirect(pathsConfig.app.home);
      
      const { data: accounts } = await client.from('user_accounts').select('*');
      
      workspace.data = {
        account: {
          ...rawAccount,
          role: 'assoc_admin',
          role_hierarchy_level: 1,
          subscription_status: 'active',
          permissions: [],
        },
        accounts: accounts ?? [],
      };
    } else {
      // Super admin is a member, but upgrade role for UI full access
      workspace.data.account.role = 'assoc_admin';
    }
  } else if (!workspace.data?.account) {
    return redirect(pathsConfig.app.home);
  }

  return {
    ...workspace.data,
    user,
  };
}`;

content = content.replace(/async function workspaceLoader[\s\S]*$/, newLogic);
fs.writeFileSync(p, content, 'utf8');
