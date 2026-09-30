import * as z from 'zod';

const PathsSchema = z.object({
  auth: z.object({
    signIn: z.string().min(1),
    signUp: z.string().min(1),
    verifyMfa: z.string().min(1),
    callback: z.string().min(1),
    passwordReset: z.string().min(1),
    passwordUpdate: z.string().min(1),
    completeProfile: z.string().min(1),
  }),
  app: z.object({
    home: z.string().min(1),
    admin: z.string().min(1),
    personalAccountSettings: z.string().min(1),
    personalAccountBilling: z.string().min(1),
    personalAccountBillingReturn: z.string().min(1),
    accountHome: z.string().min(1),
    accountSettings: z.string().min(1),
    accountBilling: z.string().min(1),
    accountMembers: z.string().min(1),
    accountBillingReturn: z.string().min(1),
    accountProfileSettings: z.string().min(1),
    accountAssociationSettings: z.string().min(1),
    accountVillaSettings: z.string().min(1),
    accountVillaBookings: z.string().min(1),
    accountVillaCalendar: z.string().min(1),
    accountVillaExpenses: z.string().min(1),
    createTeam: z.string().min(1),
    joinTeam: z.string().min(1),
  }),
});

const pathsConfig = PathsSchema.parse({
  auth: {
    signIn: '/auth/sign-in',
    signUp: '/auth/sign-up',
    verifyMfa: '/auth/verify',
    callback: '/auth/callback',
    passwordReset: '/auth/password-reset',
    passwordUpdate: '/update-password',
    completeProfile: '/auth/complete-profile',
  },
  app: {
    home: '/home',
    admin: '/admin',
    personalAccountSettings: '/home/settings',
    personalAccountBilling: '/home/billing',
    personalAccountBillingReturn: '/home/billing/return',
    accountHome: '/home/[account]',
    accountSettings: `/home/[account]/settings`,
    accountBilling: `/home/[account]/billing`,
    accountMembers: `/home/[account]/members`,
    accountBillingReturn: `/home/[account]/billing/return`,
    accountProfileSettings: `/home/[account]/settings/profile`,
    accountAssociationSettings: `/home/[account]/settings/association`,
    accountVillaSettings: `/home/[account]/villa-settings`,
    accountVillaBookings: `/home/[account]/bookings`,
    accountVillaCalendar: `/home/[account]/calendar`,
    accountVillaExpenses: `/home/[account]/villa-expenses`,
    createTeam: '/home/create-team',
    joinTeam: '/join',
  },
} satisfies z.output<typeof PathsSchema>);

export default pathsConfig;
