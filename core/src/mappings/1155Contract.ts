import { store, Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  TransferSingle as TransferSingleEvent,
  TransferBatch as TransferBatchEvent,
  ERC1155,
} from "../../../generated/ERC1155/ERC1155";
import {
  NFTContract,
  Transfer,
  NonNFTContract,
  Token,
} from "../../../generated/schema";

import {
  BIGINT_ONE,
  BIGINT_ZERO,
} from "../common/constants";
import {
  getOrCreateAccount,
  getOrCreateAccountBalance,
  getOrCreateTokenBalance,
} from "./account";
import { CheckTransferType } from "./balance";
import { TokenId } from "./ids";
import { normalize, getOrCreate1155Token, updateTokenMetadata } from "./token";

export function handleTransferSingle(event: TransferSingleEvent): void {
  let from = event.params.from.toHex();
  let to = event.params.to.toHex();
  let value = event.params.value

  let transferEvent = createTransfer(event);
  transferEvent.save();

  let transferType = CheckTransferType(
    to,
    from
  )
  
  if (transferType == "invalid") {
    // skip if the transfer is from zero address to zero address
    return;
  }

  // determine whether this transfer is related with ERC1155 nftContract
  let rawTokenId = event.params.id;
  
  // Checking if transfer came from an NFT contract 
  let nftContractAddress = event.address.toHex();
  let contract = ERC1155.bind(event.address);
  let tokenNFTContract = NFTContract.load(nftContractAddress);
  if (tokenNFTContract == null) {
    // check whether this nftContract has already been verified to be non-ERC721 contract to avoid to make contract calls again.
    let previousNonNFTContract = NonNFTContract.load(nftContractAddress);
    if (previousNonNFTContract != null) {
      return;
    }

    if (!isERC1155Supported(contract)) {
      let newNonNFTContract = new NonNFTContract(nftContractAddress);
      newNonNFTContract.save();
      return;
    }

    tokenNFTContract = getOrCreateNFTContract(
      nftContractAddress,
    );
  }

  // Collect entities 
  let existingToken = Token.load(TokenId(nftContractAddress, rawTokenId.toString()))
  if (existingToken != null) {
    // So check whether the tokenURI has changed to decide whether the metadata need to be updated.
    // previousToken isn't null which means the metadata for the tokenId was stored before.
    let metadataURI = contract.try_uri(rawTokenId);
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

  let token = getOrCreate1155Token(
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
      "1155"
    )
    // Meta changes
    token.amount = token.amount.plus(value);
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.plus(value)

    // Balance changes 
    if (toTokenBalance.balance.equals(BIGINT_ZERO)) { 
      tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.plus(BIGINT_ONE)
    }
    toTokenBalance.balance = toTokenBalance.balance.plus(value)

    // Account balance changes 
    toAccountBalance.blockNumber = event.block.number

    toAccountBalance.timestamp = event.block.timestamp

    toAccountBalance.tokenCount = toAccountBalance.tokenCount.plus(value)

    // Account changes 
    toAccount.tokenCount = toAccount.tokenCount.plus(value)
    
    toAccount.save()
    toAccountBalance.save()
    toTokenBalance.save()
    // updateAccountBalanceDailySnapshot(toAccountBalance, event);

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
      "1155"
    )

    // Meta changes
    token.amount = token.amount.minus(value);
    tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.minus(value)
    
    // Balance changes 
    fromTokenBalance.balance = fromTokenBalance.balance.minus(value)

    // Account balance changes 
    fromAccountBalance.blockNumber = event.block.number

    fromAccountBalance.timestamp = event.block.timestamp

    fromAccountBalance.tokenCount = fromAccountBalance.tokenCount.minus(value)

    // Account changes 
    fromAccount.tokenCount = fromAccount.tokenCount.minus(value)
    
    if (fromTokenBalance.balance.equals(BIGINT_ZERO)) {
      // TODO: remove from Account & AccountBalance
      // TODO: check if need to remove
      tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.minus(BIGINT_ONE)
      store.remove("TokenBalance", fromTokenBalance.id);
    } else {
      fromTokenBalance.save()
    }

    fromAccount.save()
    fromAccountBalance.save()
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
      "1155"
    )

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
      "1155"
    )

    // Meta changes

    // Balance changes 

    if (toTokenBalance.balance.equals(BIGINT_ZERO)) { 
      tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.plus(BIGINT_ONE)
    }
    fromTokenBalance.balance = fromTokenBalance.balance.minus(value)
    toTokenBalance.balance = toTokenBalance.balance.plus(value)

    // Account balance changes 

    fromAccountBalance.blockNumber = event.block.number
    toAccountBalance.blockNumber = event.block.number

    fromAccountBalance.timestamp = event.block.timestamp
    toAccountBalance.timestamp = event.block.timestamp

    fromAccountBalance.tokenCount = fromAccountBalance.tokenCount.minus(value)
    toAccountBalance.tokenCount = toAccountBalance.tokenCount.plus(value)

    // Account changes 
    fromAccount.tokenCount = fromAccount.tokenCount.minus(value)
    toAccount.tokenCount = toAccount.tokenCount.plus(value)

    if (fromTokenBalance.balance.equals(BIGINT_ZERO)) {
      // TODO: check if need to remove
      store.remove("TokenBalance", fromTokenBalance.id);
      tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.minus(BIGINT_ONE)
    } else {
      fromTokenBalance.save()
    }
 
    toAccount.save()
    toAccountBalance.save()
    toTokenBalance.save()

    fromAccount.save()
    fromAccountBalance.save()
  }
  
  token.save()
  tokenNFTContract.transferCount = tokenNFTContract.transferCount.plus(BIGINT_ONE)
  tokenNFTContract.save();
}

function getOrCreateNFTContract(
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
  transfer.isBatch = false;

  return transfer;
}

export function handleTransferBatch(event: TransferBatchEvent): void {
  let from = event.params.from.toHex();
  let to = event.params.to.toHex();
  let values = event.params.values;
  let rawTokenIds = event.params.ids;
  let transferEvent = createTransferFromBatch(event);
  transferEvent.save();

  for(let i = 0; i < values.length; i++) {
    let transferType = CheckTransferType(
      to,
      from
    )
    
    if (transferType == "invalid") {
      // skip if the transfer is from zero address to zero address
      return;
    }
  
    // determine whether this transfer is related with ERC1155 nftContract
    
    // Checking if transfer came from an NFT contract 
    let nftContractAddress = event.address.toHex();
    let contract = ERC1155.bind(event.address);
    let tokenNFTContract = NFTContract.load(nftContractAddress);
    if (tokenNFTContract == null) {
      // check whether this nftContract has already been verified to be non-ERC721 contract to avoid to make contract calls again.
      let previousNonNFTContract = NonNFTContract.load(nftContractAddress);
      if (previousNonNFTContract != null) {
        return;
      }
  
      if (!isERC1155Supported(contract)) {
        let newNonNFTContract = new NonNFTContract(nftContractAddress);
        newNonNFTContract.save();
        return;
      }
  
      tokenNFTContract = getOrCreateNFTContract(
        nftContractAddress,
      );
    }
  
    // Collect entities 
    let existingToken = Token.load(TokenId(nftContractAddress, rawTokenIds[i].toString()))
    if (existingToken != null) {
      // So check whether the tokenURI has changed to decide whether the metadata need to be updated.
      // previousToken isn't null which means the metadata for the tokenId was stored before.
      let metadataURI = contract.try_uri(rawTokenIds[i]);
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
  
    let token = getOrCreate1155Token(
      contract,
      tokenNFTContract,
      rawTokenIds[i],
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
        rawTokenIds[i].toString(),
        "1155"
      )
      // Meta changes
      token.amount = token.amount.plus(values[i]);
      tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.plus(values[i])
  
      // Balance changes 
      if (toTokenBalance.balance.equals(BIGINT_ZERO)) { 
        tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.plus(BIGINT_ONE)
      }
      toTokenBalance.balance = toTokenBalance.balance.plus(values[i])
  
      // Account balance changes 
      toAccountBalance.blockNumber = event.block.number
  
      toAccountBalance.timestamp = event.block.timestamp
  
      toAccountBalance.tokenCount = toAccountBalance.tokenCount.plus(values[i])
  
      // Account changes 
      toAccount.tokenCount = toAccount.tokenCount.plus(values[i])
      
      toAccount.save()
      toAccountBalance.save()
      toTokenBalance.save()
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
        rawTokenIds[i].toString(),
        "1155"
      )
  
      // Meta changes
      token.amount = token.amount.minus(values[i]);
      tokenNFTContract.tokenCount = tokenNFTContract.tokenCount.minus(values[i])
      
      // Balance changes 
      fromTokenBalance.balance = fromTokenBalance.balance.minus(values[i])
  
      // Account balance changes 
      fromAccountBalance.blockNumber = event.block.number
  
      fromAccountBalance.timestamp = event.block.timestamp
  
      fromAccountBalance.tokenCount = fromAccountBalance.tokenCount.minus(values[i])
  
      // Account changes 
      fromAccount.tokenCount = fromAccount.tokenCount.minus(values[i])
      
      if (fromTokenBalance.balance.equals(BIGINT_ZERO)) {
        tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.minus(BIGINT_ONE)
        store.remove("TokenBalance", fromTokenBalance.id);
      } else {
        fromTokenBalance.save()
      }
  
      fromAccount.save()
      fromAccountBalance.save()
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
        rawTokenIds[i].toString(),
        "1155"
      )
  
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
        rawTokenIds[i].toString(),
        "1155"
      )
  
      // Meta changes
  
      // Balance changes 
  
      if (toTokenBalance.balance.equals(BIGINT_ZERO)) { 
        tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.plus(BIGINT_ONE)
      }
      fromTokenBalance.balance = fromTokenBalance.balance.minus(values[i])
      toTokenBalance.balance = toTokenBalance.balance.plus(values[i])
  
      // Account balance changes 
  
      fromAccountBalance.blockNumber = event.block.number
      toAccountBalance.blockNumber = event.block.number
  
      fromAccountBalance.timestamp = event.block.timestamp
      toAccountBalance.timestamp = event.block.timestamp
  
      fromAccountBalance.tokenCount = fromAccountBalance.tokenCount.minus(values[i])
      toAccountBalance.tokenCount = toAccountBalance.tokenCount.plus(values[i])
  
      // Account changes 
      fromAccount.tokenCount = fromAccount.tokenCount.minus(values[i])
      toAccount.tokenCount = toAccount.tokenCount.plus(values[i])
  
      if (fromTokenBalance.balance.equals(BIGINT_ZERO)) {
        store.remove("TokenBalance", fromTokenBalance.id);
        tokenNFTContract.ownerCount = tokenNFTContract.ownerCount.minus(BIGINT_ONE)
      } else {
        fromTokenBalance.save()
      }
   
      toAccount.save()
      toAccountBalance.save()
      toTokenBalance.save()
  
      fromAccount.save()
      fromAccountBalance.save()
    }
    
    token.save()
    tokenNFTContract.transferCount = tokenNFTContract.transferCount.plus(BIGINT_ONE)
    tokenNFTContract.save();
  }
}

function createTransferFromBatch(event: TransferBatchEvent): Transfer {
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
  transfer.tokenIds = event.params.ids;
  transfer.from = event.params.from.toHex();
  transfer.to = event.params.to.toHex();
  transfer.values = event.params.values;
  transfer.operator = event.params.operator.toHex();
  transfer.blockNumber = event.block.number;
  transfer.timestamp = event.block.timestamp;
  transfer.isBatch = true;

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
