import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("ERC721 Whitelist Contract", () => {
    async function deployFixture() {
        const [owner, ...otherAccounts] = await ethers.getSigners();

        const initialMintPrice = ethers.parseEther("0.01"); 
        const initialMaxMintAmountPerTx = 25;
        const initialMaxMintAmountPerAddress = 10;

        const exampleMerkleData = [[otherAccounts[2].address], [otherAccounts[3].address]];
        const exampleMerkleTree = StandardMerkleTree.of(exampleMerkleData, ["address"]);
        const exampleMerkleRoot = exampleMerkleTree.root;
        const exampleMerkleProofs = {} as { [address: string]: string[] };

        for(let i = 0; i < exampleMerkleData.length; i++) {
            const currentMerkleProof = exampleMerkleTree.getProof(exampleMerkleData[i]);
            const currentAddress = exampleMerkleData[i][0];
            exampleMerkleProofs[currentAddress] = currentMerkleProof;
        }

        const tokenContract = await ethers.deployContract("ERC721WhitelistContract", [
            "Name", 
            "Symbol", 
            otherAccounts[0].address, 
            otherAccounts[1].address,
            initialMintPrice,
            initialMaxMintAmountPerTx,
            initialMaxMintAmountPerAddress,
            exampleMerkleRoot
        ]);
        await tokenContract.waitForDeployment();
        const tokenContractAddress = await tokenContract.getAddress();
      
        return { tokenContract, tokenContractAddress, exampleMerkleProofs, owner, otherAccounts };
    }
  
    describe("Mint", () => {
        it("Should mint tokens successfully", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 1;
            const value = amount * mintPrice;

            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });

            expect(Number(await tokenContract.balanceOf(otherAccounts[2].address))).to.equal(amount);
            expect(Number(await tokenContract.totalSupply())).to.equal(amount);
        });

        it("Should mint tokens if minting is enabled", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            await tokenContract.setMintingEnabled(false);

            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 1;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await expect(tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) })).to.be.revertedWith("Minting is currently disabled");
        });

         it("Should mint tokens if minting amount is more than zero", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 0;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await expect(tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) })).to.be.revertedWith("Not enough amount");
        });

        it("Should mint tokens if balance is more than mint price multiplyed by amount", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            const amount = 1;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await expect(tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: 0 })).to.be.revertedWith("Insufficient funds");
        });

        it("Should mint tokens if max supply limit is not exceeded", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            const maxSupply = Number(await tokenContract.MAX_SUPPLY());
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = maxSupply + 1;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await expect(tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) })).to.be.revertedWith("Max supply limit exceeded");
        });

        it("Should mint tokens if max mint amount per transaction is not exceeded", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 101;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await expect(tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) })).to.be.revertedWith("Max mint amount per transaction exceeded");
        });

        it("Should mint tokens if max mint amount per address is not exceeded", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 11;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await expect(tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) })).to.be.revertedWith("Max mint amount per address exceeded");
        });

        it("Should emit NFT Minted event with right data when minting", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 5;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });

            const events = await tokenContract.queryFilter(tokenContract.filters.NFTMinted());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.minter).to.equal(otherAccounts[2].address);
            expect(latestEvent.args.firstTokenId).to.equal(1);
            expect(latestEvent.args.lastTokenId).to.equal(amount);
            expect(latestEvent.args.amount).to.equal(amount);
        });
    });
  
    describe("Withdraw", () => {
        it("Should withdraw tokens successfully", async () => {
            const { tokenContract, tokenContractAddress, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 5;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];
            
            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });
            
            const teamWalletBalanceBefore = Number(await ethers.provider.getBalance(otherAccounts[0].address));
            const communityWalletBalanceBefore = Number(await ethers.provider.getBalance(otherAccounts[1].address));

            await tokenContract.withdraw();

            expect(Number(await ethers.provider.getBalance(tokenContractAddress))).to.equal(0);
            expect(Number(await ethers.provider.getBalance(otherAccounts[0].address))).to.equal(teamWalletBalanceBefore + (value / 2));
            expect(Number(await ethers.provider.getBalance(otherAccounts[1].address))).to.equal(communityWalletBalanceBefore + (value / 2));
        });

        it("Should only allow administrators to withdraw", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 5;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });

            await expect(tokenContract.connect(otherAccounts[2]).withdraw()).to.be.revertedWith("Only administrators are allowed to withdraw");
        });

        it("Should only withdraw tokens if balance is more than zero", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            await expect(tokenContract.withdraw()).to.be.revertedWith("Not enough balance");
        });

        it("Should emit Withdrawn event with right data when withdrawing", async () => {
            const { tokenContract, exampleMerkleProofs, owner, otherAccounts } = await loadFixture(deployFixture);
            
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 5;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];
            
            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });
            
            await tokenContract.withdraw();

            const events = await tokenContract.queryFilter(tokenContract.filters.Withdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.amount).to.equal(BigInt(value));
            expect(latestEvent.args.teamWallet).to.equal(otherAccounts[0].address);
            expect(latestEvent.args.communityWallet).to.equal(otherAccounts[1].address);
            expect(latestEvent.args.owner).to.equal(owner.address);
        });
    });

    describe("Set Minting Enabled", () => {
        it("Should set minting enabled successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
    
            await tokenContract.setMintingEnabled(true);
            expect(await tokenContract.mintingEnabled()).to.equal(true);
            
            await tokenContract.setMintingEnabled(false);
            expect(await tokenContract.mintingEnabled()).to.equal(false);
        });
    
        it("Should only administrators be able to set minting enabled", async () => {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);
    
            await expect(tokenContract.connect(otherAccounts[0]).setMintingEnabled(true)).to.be.revertedWith("Only administrators are allowed to set minting enabled or disabled");
        });
    
        it("Should emit Minting Enabled event with right data when setting minting enabled", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
    
            await tokenContract.setMintingEnabled(false);
    
            const events = await tokenContract.queryFilter(tokenContract.filters.MintingEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
    
            expect(latestEvent.args.enabled).to.equal(false);
        });
    });

    describe("Set NFT Visibility", () => {
        it("Should set nft visibility successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            await tokenContract.setNFTVisibility(true);
            expect(await tokenContract.nftsRevealed()).to.equal(true);
            
            await tokenContract.setNFTVisibility(false);
            expect(await tokenContract.nftsRevealed()).to.equal(false);
        });
    
        it("Should only administrators be able to set nft visibility", async () => {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);
    
            await expect(tokenContract.connect(otherAccounts[0]).setNFTVisibility(true)).to.be.revertedWith("Only administrators are allowed to set NFTs revealed or hidden");
        });
    
        it("Should emit NFT Visibility Changed event with right data when setting nft visibility", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
    
            await tokenContract.setNFTVisibility(false);
    
            const events = await tokenContract.queryFilter(tokenContract.filters.NFTVisibilityChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
    
            expect(latestEvent.args.revealed).to.equal(false);
        });
    });

    describe("Set Maximum Mint Amount Per Transaction", () => {
        it("Should set maximum mint amount per transaction successfully", async function () {
            const { tokenContract } = await loadFixture(deployFixture);

            const maxMintAmountPerTx = 10;
            await tokenContract.setMaxMintAmountPerTx(maxMintAmountPerTx);

            expect(await tokenContract.maxMintAmountPerTx()).to.equal(maxMintAmountPerTx);
        });

        it("Should only allow administrators to set maximum mint amount per transaction", async function () {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);

            const maxMintAmountPerTx = 10;

            await expect(tokenContract.connect(otherAccounts[0]).setMaxMintAmountPerTx(maxMintAmountPerTx)).to.be.revertedWith("Only administrators are allowed to set max mint amount per transaction");
        });

        it("Should emit Max Mint Amount Per Tx Changed event with right data when setting maximum mint amount per transaction", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            const maxMintAmountPerTx = 10;
            await tokenContract.setMaxMintAmountPerTx(maxMintAmountPerTx);

            const events = await tokenContract.queryFilter(tokenContract.filters.MaxMintAmountPerTxChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.amount).to.equal(maxMintAmountPerTx);
        });
    });

    describe("Set Maximum Mint Amount Per Address", () => {
        it("Should set maximum mint amount per address successfully", async function () {
            const { tokenContract } = await loadFixture(deployFixture);

            const maxMintAmountPerAddress = 10;
            await tokenContract.setMaxMintAmountPerAddress(maxMintAmountPerAddress);

            expect(await tokenContract.maxMintAmountPerAddress()).to.equal(maxMintAmountPerAddress);
        });

        it("Should only allow administrators to set maximum mint amount per address", async function () {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);

            const maxMintAmountPerAddress = 10;

            await expect(tokenContract.connect(otherAccounts[0]).setMaxMintAmountPerAddress(maxMintAmountPerAddress)).to.be.revertedWith("Only administrators are allowed to set max mint amount per address");
        });

        it("Should emit Max Mint Amount Per Address Changed event with right data when setting maximum mint amount per address", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            const maxMintAmountPerAddress = 10;
            await tokenContract.setMaxMintAmountPerAddress(maxMintAmountPerAddress);

            const events = await tokenContract.queryFilter(tokenContract.filters.MaxMintAmountPerAddressChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.amount).to.equal(maxMintAmountPerAddress);
        });
    });

    describe("Set Mint Price", () => {
        it("Should set mint price successfully", async function () {
            const { tokenContract } = await loadFixture(deployFixture);

            const mintPrice = ethers.parseEther("0.025");
            await tokenContract.setMintPrice(mintPrice);

            expect(await tokenContract.mintPrice()).to.equal(mintPrice);
        });

        it("Should only allow administrators to set mint price", async function () {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);

            const mintPrice = ethers.parseEther("0.025");

            await expect(tokenContract.connect(otherAccounts[0]).setMintPrice(mintPrice)).to.be.revertedWith("Only administrators are allowed to set mint price");
        });

        it("Should emit Mint Price Updated event with right data when setting mint price", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            const mintPrice = ethers.parseEther("0.025");
            await tokenContract.setMintPrice(mintPrice);

            const events = await tokenContract.queryFilter(tokenContract.filters.MintPriceUpdated());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.price).to.equal(mintPrice);
        });
    });

    describe("Check Eligibility", () => {
      it("Should check eligibility successfully", async () => {
        const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);
                
        const userProof = exampleMerkleProofs[otherAccounts[2].address];
        
        expect(await tokenContract.checkEligibility(otherAccounts[2].address, userProof)).to.equal(true);
      });
    });

    describe("Token Uri", () => {
        it("Should return the token uri successfully", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            const tokenId = 1;
            const baseUri = await tokenContract.BASE_URI();
            const hiddenUri = await tokenContract.HIDDEN_URI();
            const nftsRevealed = await tokenContract.nftsRevealed();
                
            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 5;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];
            
            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });

            if(nftsRevealed) {
                expect(await tokenContract.tokenURI(tokenId)).to.equal(baseUri + tokenId.toString() + ".json");
            } else {
                expect(await tokenContract.tokenURI(tokenId)).to.equal(hiddenUri);
            }
        });
    });

    describe("Tokens Of Owner", () => {
        it("Should return the tokens of owner successfully", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 2;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });

            const tokensOfOwner = await tokenContract.tokensOfOwner(otherAccounts[2].address, 1, 5);

            expect(tokensOfOwner[0]).to.equal(BigInt(1));
            expect(tokensOfOwner[1]).to.equal(BigInt(2));
        });
    });

    describe("Total Supply", () => {
        it("Should return the total supply successfully", async () => {
            const { tokenContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

            const mintPrice = Number(await tokenContract.mintPrice());
            const amount = 10;
            const value = amount * mintPrice;
            const userProof = exampleMerkleProofs[otherAccounts[2].address];

            await tokenContract.connect(otherAccounts[2]).mint(amount, userProof, { value: BigInt(value) });

            expect(Number(await tokenContract.totalSupply())).to.equal(10);
        });
    });
});