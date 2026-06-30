import { UserRole } from '@prisma/client';

/**
 * Determines whether a given requester is allowed to view an uploaded document.
 * Non-employees (evaluators, admins) can always view; employees can only view
 * documents they own or that are linked to their profile.
 */
export function canViewUploadedDocument(args: {
  requesterRole: UserRole;
  requesterUserId: string;
  ownerUserId: string | null;
  profileCreatedByUserId: string | null;
}) {
  if (args.requesterRole !== UserRole.EMPLOYEE) {
    return true;
  }

  return args.ownerUserId === args.requesterUserId || args.profileCreatedByUserId === args.requesterUserId;
}
