import { EXTEND_ORBES, MEET_ORBES, ORB_COP_VALUE, ROOM_ORBES } from "./constants";
import { splitOrbes, type Split } from "./bonuses";
import { db } from "./db";

export function splitPaidBeat(orbes: number): Split {
  if (orbes === 1) {
    return { original: 1, percent: 0, userPays: 1, platformFee: 0, kittyNet: 1, valid: true };
  }
  return splitOrbes(orbes, 0);
}

type Tx = {
  wallet: typeof db.wallet;
  orbeTransaction: typeof db.orbeTransaction;
};

export async function chargeUserPayKitty(
  tx: Tx,
  args: {
    userWalletId: string;
    kittyUserId: string;
    split: Split;
    spendNote: string;
    earnNote: string;
    meta: Record<string, unknown>;
  },
) {
  await tx.wallet.update({
    where: { id: args.userWalletId },
    data: { balance: { decrement: args.split.userPays } },
  });
  await tx.orbeTransaction.create({
    data: {
      walletId: args.userWalletId,
      type: "SPEND",
      orbes: -args.split.userPays,
      copValue: args.split.userPays * ORB_COP_VALUE,
      note: args.spendNote,
      meta: JSON.stringify(args.meta),
    },
  });

  let kittyWallet = await tx.wallet.findUnique({ where: { userId: args.kittyUserId } });
  if (!kittyWallet) {
    kittyWallet = await tx.wallet.create({ data: { userId: args.kittyUserId, balance: 0 } });
  }
  if (args.split.kittyNet > 0) {
    await tx.wallet.update({
      where: { id: kittyWallet.id },
      data: { balance: { increment: args.split.kittyNet } },
    });
    await tx.orbeTransaction.create({
      data: {
        walletId: kittyWallet.id,
        type: "EARN",
        orbes: args.split.kittyNet,
        copValue: args.split.kittyNet * ORB_COP_VALUE,
        note: args.earnNote,
        meta: JSON.stringify(args.meta),
      },
    });
  }
}

export const BEATS = {
  meet: () => splitPaidBeat(MEET_ORBES),
  room: () => splitPaidBeat(ROOM_ORBES),
  extend: () => splitPaidBeat(EXTEND_ORBES),
};
