import { store, Bytes, ethereum } from "@graphprotocol/graph-ts";

import {
  TransferSingle as TransferSingleEvent,
  TransferBatch as TransferBatchEvent,
  ERC1155,
} from "../../../generated/ERC1155/ERC1155";
import {
  NFTContract,
  NFTContractDailySnapshot,
  Transfer,
  AccountBalance,
  NonNFTContract,
  Token,
} from "../../../generated/schema";

import {
  BIGINT_ZERO,
  BIGINT_ONE,
  GENESIS_ADDRESS,
  SECONDS_PER_DAY,
} from "../common/constants";
import {
  getOrCreateAccount,
  getOrCreateAccountBalance,
  updateAccountBalanceDailySnapshot,
} from "./account";
import { normalize, getOrCreate1155Token, updateTokenMetadata } from "./token";

export function handleTransferSingle(event: TransferSingleEvent): void {
  let from = event.params.from.toHex();
  let to = event.params.to.toHex();
  if (from == GENESIS_ADDRESS && to == GENESIS_ADDRESS) {
    // skip if the transfer is from zero address to zero address
    return;
  }

  // determine whether this transfer is related with ERC721 nftContract
  let tokenId = event.params.id;
  let id = event.address.toHex() + "-" + tokenId.toString();
  let nftContractId = event.address.toHex();
  let contract = ERC1155.bind(event.address);
  let tokenNFTContract = NFTContract.load(nftContractId);
  if (tokenNFTContract == null) {
    // check whether this nftContract has already been verified to be non-ERC721 contract to avoid to make contract calls again.
    let previousNonNFTContract = NonNFTContract.load(nftContractId);
    if (previousNonNFTContract != null) {
      return;
    }

    if (!isERC1155Supported(contract)) {
      let newNonNFTContract = new NonNFTContract(nftContractId);
      newNonNFTContract.save();
      return;
    }

    tokenNFTContract = getOrCreateNFTContract(
      contract,
      nftContractId,
    );
  }

  // update metrics on the sender side
  let currentOwner = getOrCreateAccount(from);
  if (from == GENESIS_ADDRESS) {
    // mint a new token
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.plus(BIGINT_ONE);
  } else {
    // transfer an existing token from non-zero address
    let currentAccountBalanceId = from + "-" + nftContractId;
    let currentAccountBalance = AccountBalance.load(currentAccountBalanceId);
    if (currentAccountBalance != null) {
      currentAccountBalance.tokenCount = currentAccountBalance.tokenCount.minus(
        BIGINT_ONE
      );
      currentAccountBalance.blockNumber = event.block.number;
      currentAccountBalance.timestamp = event.block.timestamp;
      currentAccountBalance.save();

      if (currentAccountBalance.tokenCount.equals(BIGINT_ZERO)) {
        tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.minus(
          BIGINT_ONE
        );
      }

      // provide information about evolution of account balances
      updateAccountBalanceDailySnapshot(currentAccountBalance, event);
    }

    if (currentOwner != null) {
      currentOwner.tokenCount = currentOwner.tokenCount.minus(BIGINT_ONE);
    }
  }
  currentOwner.save();

  // update metrics on the receiver side
  if (to == GENESIS_ADDRESS) {
    // burn an existing token

    // TODO: deduct total
    store.remove("Token", id);
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.minus(BIGINT_ONE);
  } else {
    // transfer a new or existing token to non-zero address
    let newOwner = getOrCreateAccount(to);
    newOwner.tokenCount = newOwner.tokenCount.plus(BIGINT_ONE);
    newOwner.save();

    let token = getOrCreate1155Token(
      contract,
      tokenNFTContract,
      tokenId,
      event.block.timestamp,
      event.block.number
    );
    token.owner = newOwner.id;
    token.save();

    let newAccountBalance = getOrCreateAccountBalance(to, nftContractId, event.block.number);
    newAccountBalance.tokenCount = newAccountBalance.tokenCount.plus(
      BIGINT_ONE
    );
    newAccountBalance.blockNumber = event.block.number;
    newAccountBalance.timestamp = event.block.timestamp;
    newAccountBalance.save();

    if (newAccountBalance.tokenCount.equals(BIGINT_ONE)) {
      tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.plus(BIGINT_ONE);
    }

    // provide information about evolution of account balances
    updateAccountBalanceDailySnapshot(newAccountBalance, event);
  }

  // update aggregate data for sender and receiver
  tokenNFTContract.transferCount = tokenNFTContract.transferCount.plus(
    BIGINT_ONE
  );

  if (tokenNFTContract.supportsERC721Metadata) {
    let existingToken = Token.load(tokenNFTContract.id + "-" + tokenId.toString());
    if (existingToken == null) {
      // Store metadata for the specific tokenId.
      let currentToken = getOrCreate1155Token(contract, tokenNFTContract, tokenId, event.block.timestamp, event.block.number);
      let newOwner = getOrCreateAccount(to);
      currentToken.owner = newOwner.id;
      currentToken.save();

      tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.plus(BIGINT_ONE);
      tokenNFTContract.save();
    } else {
      // previousToken isn't null which means the metadata for the tokenId was stored before.
      // So check whether the tokenURI has changed to decide whether the metadata need to be updated.
      let metadataURI = contract.try_uri(tokenId);
      if (!metadataURI.reverted) {
        let tokenURI = normalize(metadataURI.value);
        if (tokenURI.length > 0 && tokenURI != existingToken.tokenURI) {
          tokenNFTContract.tokenURIUpdated = true;
          tokenNFTContract.save();

          existingToken.tokenURI = tokenURI;
          existingToken = updateTokenMetadata(event, existingToken);
          existingToken.blockNumber = event.block.number;
          existingToken.timestamp = event.block.timestamp;
          existingToken.owner = to;
          existingToken.save();
        }
      }
    }

    
  }

  tokenNFTContract.save();

  let dailySnapshot = getOrCreateNFTContractDailySnapshot(
    tokenNFTContract,
    event.block
  );
  dailySnapshot.dailyTransferCount += 1;
  dailySnapshot.save();

  createTransfer(event).save();
}

function getOrCreateNFTContract(
  contract: ERC1155,
  NFTContractAddress: string,
): NFTContract {
  let previousTokenNFTContract = NFTContract.load(NFTContractAddress);

  if (previousTokenNFTContract != null) {
    return previousTokenNFTContract as NFTContract;
  }

  let tokenNFTContract = new NFTContract(NFTContractAddress);
  tokenNFTContract.supportsERC721Metadata = false;
  tokenNFTContract.tokenURIUpdated = false;
  tokenNFTContract.tokenCount = BIGINT_ZERO;
  tokenNFTContract.ownerCount = BIGINT_ZERO;
  tokenNFTContract.transferCount = BIGINT_ZERO;

  tokenNFTContract.nftType = "1155";

  return tokenNFTContract;
}

function getOrCreateNFTContractDailySnapshot(
  nftContract: NFTContract,
  block: ethereum.Block
): NFTContractDailySnapshot {
  let snapshotId =
    nftContract.id +
    "-" +
    (block.timestamp.toI64() / SECONDS_PER_DAY).toString();
  let previousSnapshot = NFTContractDailySnapshot.load(snapshotId);

  if (previousSnapshot != null) {
    return previousSnapshot as NFTContractDailySnapshot;
  }

  let newSnapshot = new NFTContractDailySnapshot(snapshotId);
  newSnapshot.nftContract = nftContract.id;
  newSnapshot.tokenCount = nftContract.tokenCount;
  newSnapshot.ownerCount = nftContract.ownerCount;
  newSnapshot.dailyTransferCount = 0;
  newSnapshot.blockNumber = block.number;
  newSnapshot.timestamp = block.timestamp;

  return newSnapshot;
}

function createTransfer(event: TransferSingleEvent): Transfer {
  let transfer = new Transfer(
    event.address.toHex() +
      "-" +
      event.transaction.hash.toHex() +
      "-" +
      event.logIndex.toString()
  );
  transfer.hash = event.transaction.hash.toHex();
  transfer.logIndex = event.logIndex.toI32();
  transfer.nftContract = event.address.toHex();
  transfer.nonce = event.transaction.nonce.toI32();
  transfer.tokenId = event.params.id;
  transfer.from = event.params.from.toHex();
  transfer.to = event.params.to.toHex();
  transfer.value = event.params.value;
  transfer.operator = event.params.operator.toHex();
  transfer.blockNumber = event.block.number;
  transfer.timestamp = event.block.timestamp;

  return transfer;
}


function createTransferFromBatch(event: TransferBatchEvent): Transfer {
  for(let i = 0; i < event.params.ids.length; i++) {
    let transfer = new Transfer(
      event.address.toHex() +
        "-" +
        event.transaction.hash.toHex() +
        "-" +
        event.logIndex.toString()
    );
    transfer.hash = event.transaction.hash.toHex();
    transfer.logIndex = event.logIndex.toI32();
    transfer.nftContract = event.address.toHex();
    transfer.nonce = event.transaction.nonce.toI32();
    transfer.tokenId = event.params.id;
    transfer.from = event.params.from.toHex();
    transfer.to = event.params.to.toHex();
    transfer.value = event.params.value;
    transfer.operator = event.params.operator.toHex();
    transfer.blockNumber = event.block.number;
    transfer.timestamp = event.block.timestamp;
  
    return transfer;
  }
  
  let transfer = new Transfer(
    event.address.toHex() +
      "-" +
      event.transaction.hash.toHex() +
      "-" +
      event.logIndex.toString()
  );
  transfer.hash = event.transaction.hash.toHex();
  transfer.logIndex = event.logIndex.toI32();
  transfer.nftContract = event.address.toHex();
  transfer.nonce = event.transaction.nonce.toI32();
  transfer.tokenId = event.params.id;
  transfer.from = event.params.from.toHex();
  transfer.to = event.params.to.toHex();
  transfer.value = event.params.value;
  transfer.operator = event.params.operator.toHex();
  transfer.blockNumber = event.block.number;
  transfer.timestamp = event.block.timestamp;

  return transfer;
}


function supportsInterface(
  contract: ERC1155,
  interfaceId: string,
  expected: boolean = true
): boolean {
  let supports = contract.try_supportsInterface(
    Bytes.fromHexString(interfaceId)
  );
  return !supports.reverted && supports.value == expected;
}

function isERC1155Supported(contract: ERC1155): boolean {
  let supportsERC165Identifier = supportsInterface(contract, "01ffc9a7");
  if (!supportsERC165Identifier) {
    return false;
  }

  let supportsERC1155Identifier = supportsInterface(contract, "d9b67a26");
  if (!supportsERC1155Identifier) {
    return false;
  }

  let supportsNullIdentifierFalse = supportsInterface(
    contract,
    "00000000",
    false
  );
  if (!supportsNullIdentifierFalse) {
    return false;
  }

  return true;
}
