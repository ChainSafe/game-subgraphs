import { ethereum, BigInt } from "@graphprotocol/graph-ts";

import {
  Account,
  AccountBalance,
  AccountBalanceDailySnapshot,
  TokenBalance,
} from "../../../generated/schema";
import { BIGINT_ZERO, SECONDS_PER_DAY } from "../common/constants";

export function getOrCreateAccount(accountAddress: string): Account {
  let existingAccount = Account.load(accountAddress);

  if (existingAccount != null) {
    return existingAccount as Account;
  }

  let newAccount = new Account(accountAddress);
  newAccount.tokenCount = BIGINT_ZERO;
  newAccount.balances = [];

  return newAccount;
}

export function getOrCreateAccountBalance(
  account: string,
  nftContract: string,
  blockNumber: BigInt
): AccountBalance {
  let balanceId = account + "-" + nftContract;
  let previousBalance = AccountBalance.load(balanceId);

  if (previousBalance != null) {
    return previousBalance as AccountBalance;
  }

  let newBalance = new AccountBalance(balanceId);
  newBalance.account = account;
  newBalance.nftContract = nftContract;
  newBalance.tokenCount = BIGINT_ZERO;
  newBalance.blockNumber = blockNumber;
  newBalance.tokenBalances = []

  return newBalance;
}

export function getOrCreateTokenBalance(
  account: string,
  nftContract: string,
  tokenId: string,
): TokenBalance {
  let balanceId = account + "-" + nftContract + "-" + tokenId;
  let previousBalance = TokenBalance.load(balanceId);

  if (previousBalance != null) {
    return previousBalance as TokenBalance;
  }

  let newBalance = new TokenBalance(balanceId);
  newBalance.id = balanceId;
  newBalance.balance = BIGINT_ZERO;

  return newBalance;
}

export function updateAccountBalanceDailySnapshot(
  balance: AccountBalance,
  event: ethereum.Event
): void {
  let snapshot = getOrCreateAccountBalanceDailySnapshot(balance, event.block);

  snapshot.tokenCount = balance.tokenCount;
  snapshot.blockNumber = event.block.number;
  snapshot.timestamp = event.block.timestamp;

  snapshot.save();
}

function getOrCreateAccountBalanceDailySnapshot(
  balance: AccountBalance,
  block: ethereum.Block
): AccountBalanceDailySnapshot {
  let snapshotId =
    balance.account +
    "-" +
    balance.nftContract +
    "-" +
    (block.timestamp.toI64() / SECONDS_PER_DAY).toString();
  let previousSnapshot = AccountBalanceDailySnapshot.load(snapshotId);

  if (previousSnapshot != null) {
    return previousSnapshot as AccountBalanceDailySnapshot;
  }

  let newSnapshot = new AccountBalanceDailySnapshot(snapshotId);
  newSnapshot.account = balance.account;
  newSnapshot.nftContract = balance.nftContract;
  newSnapshot.tokenCount = balance.tokenCount;

  return newSnapshot;
}
