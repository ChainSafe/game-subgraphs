import { NFTContract } from "../../../generated/schema";
import { GENESIS_ADDRESS } from "../common/constants";

export function CheckTransferType(
  to: string,
  from: string
): "mint" | "burn" | "transfer" | "invalid" {
  if (from == GENESIS_ADDRESS && to == GENESIS_ADDRESS) {
    // skip if the transfer is from zero address to zero address
    return "invalid";
  }

  if (from == GENESIS_ADDRESS) {
    return "mint";
  }

  if (to == GENESIS_ADDRESS) {
    return "burn"
  }

  return "transfer"
}

export function ProcessMint(
  tokenNFTContract: NFTContract,

  tokenId: string
) {
  // ge
}

export function ProcessBurn() {

}


export function ProcessTransfer() {
  
}
