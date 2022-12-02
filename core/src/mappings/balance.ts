import { NFTContract } from "../../../generated/schema";
import { GENESIS_ADDRESS } from "../common/constants";

export const transferType = ["mint", "burn", "transfer", "invalid"]

export function CheckTransferType(
  to: string,
  from: string
): string {
  if (from == GENESIS_ADDRESS && to == GENESIS_ADDRESS) {
    // skip if the transfer is from zero address to zero address
    return transferType[3];
  }

  if (from == GENESIS_ADDRESS) {
    return transferType[0];
  }

  if (to == GENESIS_ADDRESS) {
    return transferType[1]
  }

  return transferType[2]
}

// export function ProcessMint(
//   tokenNFTContract: NFTContract,

//   tokenId: string
// ) {
//   // ge
// }

// export function ProcessBurn() {

// }


// export function ProcessTransfer() {
  
// }
