import { AccountBalance } from "../../../generated/schema";
import { ethereum } from "@graphprotocol/graph-ts";
import { SECONDS_PER_DAY } from "../common/constants";

export function TokenId(
  tokenNFTContractAddress: string,
  tokenId: string
): string {
  return tokenNFTContractAddress + "-" + tokenId;
}

export function AttributeId(
  tokenId: string,
  trait: string
): string {
  return tokenId + "-" + trait;
}

export function AccountBalanceId(
  account: string,
  nftContract: string
): string {
  return account + "-" + nftContract;
}

export function TokenBalanceId(
  account: string,
  nftContract: string,
  tokenId: string,
): string {
  return account + "-" + nftContract + "-" + tokenId;
}

export function SnapshotId(
  balance: AccountBalance,
  block: ethereum.Block
): string {
  return balance.account +
    "-" +
    balance.nftContract +
    "-" +
    (block.timestamp.toI64() / SECONDS_PER_DAY).toString();
}

export function TransferId(
  address: string,
  txHash: string,
  logIndex: string
): string {
  return address +
    "-" +
    txHash +
    "-" +
    logIndex;
}
