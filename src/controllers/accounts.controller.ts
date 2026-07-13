import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { AuditLogAction, UserRole } from '@prisma/client';

export const listAccounts = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      accountActive: true,
      createdAt: true,
      _count: {
        select: {
          profiles: true,
          documents: true,
          predictions: true,
          trainingItems: true,
        },
      },
    },
  });

  return res.json({
    accounts: users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      accountActive: user.accountActive,
      createdAt: user.createdAt,
      counts: {
        profiles: user._count.profiles,
        documents: user._count.documents,
        predictions: user._count.predictions,
        trainingItems: user._count.trainingItems,
      },
    })),
  });
};

async function assertNotLastManager(targetUserId: string, targetRole: UserRole) {
  if (targetRole !== UserRole.EVALUATOR && targetRole !== UserRole.ADMIN) {
    return;
  }

  const remainingManagers = await prisma.user.count({
    where: {
      role: { in: [UserRole.EVALUATOR, UserRole.ADMIN] },
      accountActive: true,
      id: { not: targetUserId },
    },
  });

  if (remainingManagers === 0) {
    const error = new Error('Cannot remove the last active evaluator/admin account - no one would be able to manage the system');
    (error as { status?: number }).status = 409;
    throw error;
  }
}

export const deactivateAccount = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (userId === req.user!.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return res.status(404).json({ error: 'Account not found' });
  }

  if (!target.accountActive) {
    return res.status(409).json({ error: 'Account is already deactivated' });
  }

  try {
    await assertNotLastManager(userId, target.role);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return res.status(status).json({ error: (error as Error).message });
  }

  await prisma.user.update({ where: { id: userId }, data: { accountActive: false } });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.ACCOUNT_DEACTIVATED,
      userId: req.user!.id,
      targetId: userId,
      details: { targetEmail: target.email, targetRole: target.role },
    },
  });

  return res.json({ deactivated: true, accountId: userId });
};

export const reactivateAccount = async (req: Request, res: Response) => {
  const { userId } = req.params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return res.status(404).json({ error: 'Account not found' });
  }

  if (target.accountActive) {
    return res.status(409).json({ error: 'Account is already active' });
  }

  await prisma.user.update({ where: { id: userId }, data: { accountActive: true } });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.ACCOUNT_REACTIVATED,
      userId: req.user!.id,
      targetId: userId,
      details: { targetEmail: target.email, targetRole: target.role },
    },
  });

  return res.json({ reactivated: true, accountId: userId });
};

export const deleteAccount = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (userId === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return res.status(404).json({ error: 'Account not found' });
  }

  try {
    await assertNotLastManager(userId, target.role);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return res.status(status).json({ error: (error as Error).message });
  }

  await prisma.user.delete({ where: { id: userId } });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.ACCOUNT_DELETED,
      userId: req.user!.id,
      targetId: userId,
      details: { targetEmail: target.email, targetRole: target.role, targetFullName: target.fullName },
    },
  });

  return res.json({
    deleted: true,
    accountId: userId,
    message: `${target.fullName} (${target.email}) was deleted. Their uploaded documents, profiles, and predictions remain but are no longer linked to an account.`,
  });
};
