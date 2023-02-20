import { store, Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  Transfer as TransferEvent,
  ERC721,
} from "../../../generated/ERC721/ERC721";
import {
  NFTContract,
  Transfer,
  NonNFTContract,
  Token,
} from "../../../generated/schema";

import {
  BIGINT_ZERO,
  BIGINT_ONE,
  SECONDS_PER_DAY,
} from "../common/constants";
import {
  getOrCreateAccount,
  getOrCreateAccountBalance,
  getOrCreateTokenBalance,
} from "./account";
import { CheckTransferType } from "./balance";
import { TokenId } from "./ids";
import { normalize, getOrCreate721Token, updateTokenMetadata } from "./token";

export function handleTransfer(event: TransferEvent): void {
  let from = event.params.from.toHex();
  let to = event.params.to.toHex();

  let transferEvent = createTransfer(event)
  transferEvent.save();

  let transferType = CheckTransferType(
    to,
    from
  )
  
  if (transferType == "invalid") {
    // skip if the transfer is from zero address to zero address
    return;
  }

  // determine whether this transfer is related with ERC721 nftContract
  let rawTokenId = event.params.id;

  let nftContractAddress = event.address.toHex();
  let contract = ERC721.bind(event.address);

  let tokenNFTContract = NFTContract.load(nftContractAddress);
  if (tokenNFTContract == null) {
    // check whether this nftContract has already been verified to be non-ERC721 contract to avoid to make contract calls again.
    let previousNonNFTContract = NonNFTContract.load(nftContractAddress);
    if (previousNonNFTContract != null) {
      return;
    }

    if (!isERC721Supported(contract)) {
      let newNonNFTContract = new NonNFTContract(nftContractAddress);
      newNonNFTContract.save();
      return;
    }

    let supportsERC721Metadata = supportsInterface(contract, "5b5e139f");
    tokenNFTContract = getOrCreateNFTContract(
      contract,
      nftContractAddress,
      supportsERC721Metadata
    );
  }

  // Collect entities 
  let existingToken = Token.load(TokenId(nftContractAddress, rawTokenId.toString()))
  if (existingToken != null) {
    // So check whether the tokenURI has changed to decide whether the metadata need to be updated.
    // previousToken isn't null which means the metadata for the tokenId was stored before.
    let metadataURI = contract.try_tokenURI(rawTokenId);
    if (!metadataURI.reverted) {
      let tokenURI = normalize(metadataURI.value);
      if (tokenURI.length > 0 && tokenURI != existingToken.tokenURI) {
        tokenNFTContract.tokenURIUpdated = true;
        tokenNFTContract.save();

        existingToken.tokenURI = tokenURI;
        existingToken = updateTokenMetadata(event, existingToken);
        existingToken.blockNumber = event.block.number;
        existingToken.timestamp = event.block.timestamp;

        existingToken.save();
      }
    }
  }

  let token = getOrCreate721Token(
    contract,
    tokenNFTContract,
    rawTokenId,
    event.block.timestamp,
    event.block.number
  )

  if (transferType == "mint") {
    // Get To Account 
    let toAccount = getOrCreateAccount(to);
    let toAccountBalance = getOrCreateAccountBalance(
      toAccount.id,
      nftContractAddress,
      event.block.number
    )
    let toTokenBalance = getOrCreateTokenBalance(
      toAccount.id,
      nftContractAddress,
      rawTokenId.toString(),
      "721"
    )
    // Meta changes
    token.amount = token.amount.plus(BIGINT_ONE);
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.plus(BIGINT_ONE)
    tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.plus(BIGINT_ONE)

    // Balance changes 
    toTokenBalance.balance = toTokenBalance.balance.plus(BIGINT_ONE)

    // Account balance changes 
    toAccountBalance.blockNumber = event.block.number

    toAccountBalance.timestamp = event.block.timestamp

    toAccountBalance.tokenCount = toAccountBalance.tokenCount.plus(BIGINT_ONE)

    // Account changes 
    toAccount.tokenCount = toAccount.tokenCount.plus(BIGINT_ONE)
   
    toAccount.save()
    toAccountBalance.save()
    toTokenBalance.save()
    // updateAccountBalanceDailySnapshot(toAccountBalance, event);
    token.save()

  } else if (transferType == "burn") {
    // Get From Account
    let fromAccount = getOrCreateAccount(from);
    let fromAccountBalance = getOrCreateAccountBalance(
      fromAccount.id,
      nftContractAddress,
      event.block.number
    )
    let fromTokenBalance = getOrCreateTokenBalance(
      fromAccount.id,
      nftContractAddress,
      rawTokenId.toString(),
      "721"
    )

    // Meta changes

    // TODO Could nuke these at this point
    token.amount = token.amount.minus(BIGINT_ONE);
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.minus(BIGINT_ONE)
    
    // Balance changes 
    fromTokenBalance.balance = fromTokenBalance.balance.minus(BIGINT_ONE)

    // Account balance changes 
    fromAccountBalance.blockNumber = event.block.number

    fromAccountBalance.timestamp = event.block.timestamp

    fromAccountBalance.tokenCount = fromAccountBalance.tokenCount.minus(BIGINT_ONE)

    // Account changes 
    fromAccount.tokenCount = fromAccount.tokenCount.minus(BIGINT_ONE)

    // TODO: remove from Account & AccountBalance
    // TODO: check if need to remove
    store.remove("TokenBalance", fromTokenBalance.id);
    store.remove("Token", token.id)
    tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.minus(BIGINT_ONE)
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.minus(BIGINT_ONE)

    fromAccount.save()
    fromAccountBalance.save()
    // updateAccountBalanceDailySnapshot(fromAccountBalance, event);

  } else {
    // Get From Account
    let fromAccount = getOrCreateAccount(from);
    let fromAccountBalance = getOrCreateAccountBalance(
      fromAccount.id,
      nftContractAddress,
      event.block.number
    )
    let fromTokenBalance = getOrCreateTokenBalance(
      fromAccount.id,
      nftContractAddress,
      rawTokenId.toString(),
      "721"
    )

    // Get To Account 
    let toAccount = getOrCreateAccount(from);
    let toAccountBalance = getOrCreateAccountBalance(
      toAccount.id,
      nftContractAddress,
      event.block.number
    )
    let toTokenBalance = getOrCreateTokenBalance(
      toAccount.id,
      nftContractAddress,
      rawTokenId.toString(),
      "721"
    )

    // Meta changes

    // Balance changes 

    toTokenBalance.balance = toTokenBalance.balance.plus(BIGINT_ONE)

    // Account balance changes 

    fromAccountBalance.blockNumber = event.block.number
    toAccountBalance.blockNumber = event.block.number

    fromAccountBalance.timestamp = event.block.timestamp
    toAccountBalance.timestamp = event.block.timestamp

    fromAccountBalance.tokenCount = fromAccountBalance.tokenCount.minus(BIGINT_ONE)
    toAccountBalance.tokenCount = toAccountBalance.tokenCount.plus(BIGINT_ONE)

    // Account changes 
    fromAccount.tokenCount = fromAccount.tokenCount.minus(BIGINT_ONE)
    toAccount.tokenCount = toAccount.tokenCount.plus(BIGINT_ONE)
    
    store.remove("TokenBalance", fromTokenBalance.id);

    toAccount.save()
    toAccountBalance.save()
    toTokenBalance.save()

    // TODO: Check of AccountBalance still holds tokens in NFT contract, if so, decrease ownerTotal
    fromAccount.save()
    fromAccountBalance.save()
    token.save()
  }
  tokenNFTContract.transferCount = tokenNFTContract.transferCount.plus(BIGINT_ONE)
  tokenNFTContract.save();
}

function getOrCreateNFTContract(
  contract: ERC721,
  NFTContractAddress: string,
  supportsERC721Metadata: boolean
): NFTContract {
  let previousTokenNFTContract = NFTContract.load(NFTContractAddress);

  if (previousTokenNFTContract != null) {
    return previousTokenNFTContract as NFTContract;
  }

  let tokenNFTContract = new NFTContract(NFTContractAddress);
  tokenNFTContract.supportsERC721Metadata = supportsERC721Metadata;
  tokenNFTContract.tokenURIUpdated = false;
  tokenNFTContract.tokenCount = BIGINT_ZERO;
  tokenNFTContract.ownerCount = BIGINT_ZERO;
  tokenNFTContract.transferCount = BIGINT_ZERO;
  tokenNFTContract.nftType = "721";

  let name = contract.try_name();
  if (!name.reverted) {
    tokenNFTContract.name = normalize(name.value);
  }
  let symbol = contract.try_symbol();
  if (!symbol.reverted) {
    tokenNFTContract.symbol = normalize(symbol.value);
  }

  return tokenNFTContract;
}

function createTransfer(event: TransferEvent): Transfer {
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
  transfer.blockNumber = event.block.number;
  transfer.timestamp = event.block.timestamp;
  transfer.value = BIGINT_ONE;
  transfer.isBatch = false;

  return transfer;
}


function supportsInterface(
  contract: ERC721,
  interfaceId: string,
  expected: boolean = true
): boolean {
  let supports = contract.try_supportsInterface(
    Bytes.fromHexString(interfaceId)
  );
  return !supports.reverted && supports.value == expected;
}

function isERC721Supported(contract: ERC721): boolean {
  let supportsERC165Identifier = supportsInterface(contract, "01ffc9a7");
  if (!supportsERC165Identifier) {
    return false;
  }

  let supportsERC721Identifier = supportsInterface(contract, "80ac58cd");
  if (!supportsERC721Identifier) {
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
