'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Check,
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
  Shield,
  User,
  Users,
} from 'lucide-react';

import { usePersonalAccountData } from '@kit/accounts/hooks/use-personal-account-data';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { JWTUserData } from '@kit/supabase/types';
import { CreateTeamAccountDialog } from '@kit/team-accounts/components';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { If } from '@kit/ui/if';
import { SubMenuModeToggle } from '@kit/ui/mode-toggle';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import { useSidebar } from '@kit/ui/sidebar';
import { Trans } from '@kit/ui/trans';

import featuresFlagConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';

export type AccountModel = {
  label: string | null;
  value: string | null;
  image: string | null;
};

interface WorkspaceDropdownProps {
  user: JWTUserData;
  accounts: AccountModel[];
  selectedAccount?: string;
  workspace?: {
    id: string | null;
    name: string | null;
    picture_url: string | null;
  };
  role?: string | null;
}

export function WorkspaceDropdown({
  user,
  accounts,
  selectedAccount,
  workspace,
  role,
}: WorkspaceDropdownProps) {
  const router = useRouter();
  const { open: isSidebarOpen } = useSidebar();
  const signOutMutation = useSignOut();

  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const collapsed = !isSidebarOpen;
  const isTeamContext = !!selectedAccount;

  const { data: personalAccountData } = usePersonalAccountData(
    user.id,
    workspace,
  );

  const displayName = personalAccountData?.name ?? user.email ?? '';
  const userEmail = user.email ?? '';

  const currentTeam = accounts.find((a) => a.value === selectedAccount);

  const currentLabel = isTeamContext
    ? (currentTeam?.label ?? selectedAccount)
    : displayName;

  const currentAvatar = isTeamContext
    ? (currentTeam?.image ?? null)
    : (personalAccountData?.picture_url ?? null);

  const settingsPath = selectedAccount
    ? pathsConfig.app.accountSettings.replace('[account]', selectedAccount)
    : pathsConfig.app.personalAccountSettings;

  const switchToPersonal = () => {
    if (!featuresFlagConfig.enableTeamsOnly) {
      router.replace(pathsConfig.app.home);
    }
  };

  const switchToTeam = (slug: string) => {
    router.replace(pathsConfig.app.accountHome.replace('[account]', slug));
  };

  return (
    <div className="min-w-0 flex-1">
      <DropdownMenu>
        {collapsed ? (
          <div className="flex flex-col items-center justify-center">
            <DropdownMenuTrigger
              render={
                <Button
                  data-test="workspace-dropdown-trigger"
                  variant="secondary"
                  size="icon"
                  className="border-border hover:shadow"
                >
                  <Avatar className="size-8">
                    <AvatarImage
                      className="rounded-md!"
                      src={currentAvatar ?? undefined}
                      alt={currentLabel ?? ''}
                    />
                    <AvatarFallback>
                      {isTeamContext ? (
                        (currentLabel ?? '').charAt(0).toUpperCase()
                      ) : (
                        <User className="text-secondary-foreground size-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
          </div>
        ) : (
          <DropdownMenuTrigger
            render={
              <Button
                data-test="workspace-dropdown-trigger"
                variant="ghost"
                className="hover:bg-accent/40 active:bg-accent border-border/50! hover:border-border h-11 w-full justify-start gap-x-1 rounded-md border px-1 transition-colors hover:shadow-xs"
              >
                <span className="flex aspect-square size-8 items-center justify-center">
                  <Avatar className="size-6">
                    <AvatarImage
                      src={currentAvatar ?? undefined}
                      alt={currentLabel ?? ''}
                    />
                    <AvatarFallback>
                      {isTeamContext ? (
                        (currentLabel ?? '').charAt(0).toUpperCase()
                      ) : (
                        <User className="size-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </span>

                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="max-w-md truncate">{currentLabel}</span>
                </span>

                <ChevronsUpDown className="ml-auto size-4 transition-opacity duration-300" />
              </Button>
            }
          />
        )}

        <DropdownMenuContent
          className="min-w-60!"
          align="center"
          side={isSidebarOpen ? 'bottom' : 'inline-end'}
          sideOffset={4}
          alignOffset={8}
        >
          <div className="flex items-center justify-start gap-2 py-1.5">
            <div className="w-2/12">
              <ProfileAvatar
                className="size-6"
                displayName={displayName}
                pictureUrl={personalAccountData?.picture_url}
              />
            </div>

            <div className="flex w-10/12 flex-col text-left text-sm">
              <span
                className="max-w-max truncate font-medium"
                data-test="account-dropdown-display-name"
              >
                {displayName}
              </span>

              <span className="text-muted-foreground max-w-max truncate text-xs">
                {userEmail}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          <If condition={featuresFlagConfig.enableTeamAccounts}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-test="workspace-switch-submenu">
                <Users className="size-4" />
                <span>
                  <Trans i18nKey={'teams.switchWorkspace'} />
                </span>
              </DropdownMenuSubTrigger>

              <DropdownMenuSubContent
                className="max-h-[50vh] overflow-y-auto"
                data-test="workspace-switch-content"
              >
                <If condition={!featuresFlagConfig.enableTeamsOnly}>
                  <DropdownMenuItem
                    data-test="personal-workspace-item"
                    className="flex gap-2"
                    onClick={switchToPersonal}
                  >
                    <div className="flex size-8 items-center justify-center rounded-sm border">
                      <User className="size-4" />
                    </div>

                    <span className="flex-1">
                      <Trans i18nKey={'teams.personalAccount'} />
                    </span>

                    {!isTeamContext && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                </If>

                {accounts.length > 0 && (
                  <>
                    <If condition={!featuresFlagConfig.enableTeamsOnly}>
                      <DropdownMenuSeparator />
                    </If>

                    {accounts.map((account) => (
                      <DropdownMenuItem
                        key={account.value}
                        data-test="workspace-team-item"
                        data-name={account.label}
                        data-slug={account.value}
                        className="flex gap-2"
                        onClick={() => {
                          if (
                            account.value &&
                            account.value !== selectedAccount
                          ) {
                            switchToTeam(account.value);
                          }
                        }}
                      >
                        <Avatar className="size-8">
                          <AvatarImage
                            className="rounded-md!"
                            src={account.image ?? undefined}
                            alt={account.label ?? ''}
                          />
                          <AvatarFallback className="rounded-md! text-xs">
                            {(account.label ?? '').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1">
                          <div className="font-medium">{account.label}</div>
                        </div>

                        {selectedAccount === account.value && (
                          <Check className="ml-auto size-4" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                <If
                  condition={
                    featuresFlagConfig.enableTeamCreation && user.is_superadmin
                  }
                >
                  <DropdownMenuItem
                    onClick={() => setIsCreatingTeam(true)}
                    data-test="create-team-trigger"
                    className="bg-background/50 sticky bottom-0 mt-1 flex h-10 w-full gap-2 border backdrop-blur-lg"
                  >
                    <Plus className="size-4" />

                    <span>
                      <Trans i18nKey={'teams.createTeam'} />
                    </span>
                  </DropdownMenuItem>
                </If>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
          </If>

          <If
            condition={
              !isTeamContext || user.is_superadmin || role === 'assoc_admin'
            }
          >
            <DropdownMenuItem
              render={
                <Link
                  className="flex items-center gap-x-2"
                  href={settingsPath}
                  data-test="workspace-settings-link"
                >
                  <Settings className="size-4" />

                  <span>
                    <Trans i18nKey={'common.routes.settings'} />
                  </span>
                </Link>
              }
            />
          </If>

          <If condition={user.is_superadmin}>
            <DropdownMenuItem
              render={
                <Link
                  className="flex items-center gap-x-2 text-yellow-700 hover:text-yellow-600 dark:text-yellow-500"
                  href="/admin"
                  data-test="workspace-admin-link"
                >
                  <Shield className="size-4" />

                  <span>Super Admin</span>
                </Link>
              }
            />
          </If>

          <DropdownMenuSeparator />

          <If condition={featuresFlagConfig.enableThemeToggle}>
            <SubMenuModeToggle />

            <DropdownMenuSeparator />
          </If>

          <DropdownMenuItem
            disabled={signOutMutation.isPending}
            className="flex items-center gap-x-2"
            data-test="workspace-sign-out"
            onClick={() => signOutMutation.mutate()}
          >
            <LogOut className="size-4" />

            <span>
              <Trans i18nKey={'auth.signOut'} />
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <If
        condition={featuresFlagConfig.enableTeamCreation && user.is_superadmin}
      >
        <CreateTeamAccountDialog
          isOpen={isCreatingTeam}
          setIsOpen={setIsCreatingTeam}
        />
      </If>
    </div>
  );
}
