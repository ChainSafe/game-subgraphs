import { ethereum, BigInt } from "@graphprotocol/graph-ts";

import {
  Account,
  AccountBalance,
  TokenBalance,
} from "../../../generated/schema";
import { BIGINT_ZERO } from "../common/constants";
import { AccountBalanceId, TokenBalanceId, TokenId } from "./ids";

export function getOrCreateAccount(accountAddress: string): Account {
  let existingAccount = Account.load(accountAddress);

  if (existingAccount != null) {
    return existingAccount as Account;
  }

  let newAccount = new Account(accountAddress);
  newAccount.tokenCount = BIGINT_ZERO;

  return newAccount;
}

export function getOrCreateAccountBalance(
  account: string,
  nftContract: string,
  blockNumber: BigInt
): AccountBalance {
  let balanceId = AccountBalanceId(account, nftContract);
  let previousBalance = AccountBalance.load(balanceId);

  if (previousBalance != null) {
    return previousBalance as AccountBalance;
  }

  let newBalance = new AccountBalance(balanceId);
  newBalance.account = account;
  newBalance.nftContract = nftContract;
  newBalance.tokenCount = BIGINT_ZERO;
  newBalance.blockNumber = blockNumber;

  return newBalance;
}

export function getOrCreateTokenBalance(
  account: string,
  nftContractAddress: string,
  rawTokenId: string,
): TokenBalance {
  let balanceId = TokenBalanceId(account, nftContractAddress, rawTokenId);
  let previousBalance = TokenBalance.load(balanceId);

  if (previousBalance != null) {
    return previousBalance as TokenBalance;
  }

  let newBalance = new TokenBalance(balanceId);
  newBalance.id = balanceId;
  newBalance.accountBalance = AccountBalanceId(account, nftContractAddress);
  newBalance.balance = BIGINT_ZERO;
  newBalance.token = TokenId(nftContractAddress, rawTokenId);
  newBalance.nftContract = nftContractAddress;

  return newBalance;
}
