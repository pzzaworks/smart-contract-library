import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("ERC1155 Contract", () => {
    async function deployFixture() {
        const [owner, ...otherAccounts] = await ethers.getSigners();

        const initialMintPrices = [ethers.parseEther("0.01"), ethers.parseEther("0.025"), ethers.parseEther("0.05")]; 
        const initialMintingsEnabled = [true, true, true];
        const initialMaxSupplies = [1000, 1000, 1000];
        const initialMaxMintAmountsPerTx = [25, 50, 75];
        const initialMaxMintAmountsPerAddress = [10, 20, 30];

        const tokenContract = await ethers.deployContract("ERC1155Contract", [
            otherAccounts[0].address, 
            otherAccounts[1].address,
            initialMintPrices,
            initialMintingsEnabled,
            initialMaxSupplies,
            initialMaxMintAmountsPerTx,
            initialMaxMintAmountsPerAddress
        ]);
        await tokenContract.waitForDeployment();
        const tokenContractAddress = await tokenContract.getAddress();
        
        return { tokenContract, tokenContractAddress, owner, otherAccounts };
    }
  
    describe("Mint", () => {
        it("Should mint tokens successfully", async () => {
            const { tokenContract, owner } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1;
            const value = amount * mintPrice;

            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });
    
            expect(Number(await tokenContract.balanceOf(owner.address, tokenId))).to.equal(amount);
            expect(Number(await tokenContract.addressMintAmount(owner.address, tokenId))).to.equal(amount);
            expect(Number(await tokenContract.totalSupply())).to.equal(amount);
        });

        it("Should mint tokens if token is exist", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 4;
            await expect(tokenContract.mintPrice(tokenId)).to.be.revertedWith("Token does not exist");
            const mintPrice = Number(ethers.parseEther("0.01"));
            const amount = 1;
            const value = amount * mintPrice;
    
            await expect(tokenContract.mint(tokenId, amount, { value: BigInt(value) })).to.be.revertedWith("Token does not exist");
        });

        it("Should only be able to mint if minting is enabled", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1;
            const value = amount * mintPrice;
    
            await tokenContract.setMintingEnabled(tokenId, false);

            await expect(tokenContract.mint(tokenId, amount, { value: BigInt(value) })).to.be.revertedWith("Minting is currently disabled");
        });

        it("Should only be able to mint if amount is greater than zero", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 0;
            const value = amount * mintPrice;
    
            await expect(tokenContract.mint(tokenId, amount, { value: BigInt(value) })).to.be.revertedWith("Not enough amount");
        });

        it("Should only be able to mint if value is greater than zero", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 1;

            await expect(tokenContract.mint(tokenId, amount, { value: 0 })).to.be.revertedWith("Insufficient funds");
        });

        it("Should mint tokens if max supply limit is not exceeded", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1001;
            const value = amount * mintPrice;
            
            await expect(tokenContract.mint(tokenId, amount, { value: BigInt(value) })).to.be.revertedWith("Max supply limit exceeded");
        });

        it("Should mint tokens if max mint amount per transaction is not exceeded", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 100;
            const value = amount * mintPrice;
            
            await expect(tokenContract.mint(tokenId, amount, { value: BigInt(value) })).to.be.revertedWith("Max mint amount per transaction exceeded");
        });

        it("Should mint tokens if max mint amount per address is not exceeded", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 20;
            const value = amount * mintPrice;
            
            await expect(tokenContract.mint(tokenId, amount, { value: BigInt(value) })).to.be.revertedWith("Max mint amount per address exceeded");
        });

        it("Should emit NFT Minted event with right data when minting", async () => {
            const { tokenContract, owner } = await loadFixture(deployFixture);
                
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 5;
            const value = amount * mintPrice;

            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });
    
            const events = await tokenContract.queryFilter(tokenContract.filters.NFTMinted());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
    
            expect(latestEvent.args.tokenId).to.equal(tokenId);
            expect(latestEvent.args.amount).to.equal(amount);
            expect(latestEvent.args.minter).to.equal(owner.address);
        });
    });
  
    describe("Withdraw", () => {
        it("Should withdraw tokens successfully", async () => {
            const { tokenContract, tokenContractAddress, otherAccounts } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1;
            const value = amount * mintPrice;

            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });
            
            const teamWalletBalanceBefore = Number(await ethers.provider.getBalance(otherAccounts[0].address));
            const communityWalletBalanceBefore = Number(await ethers.provider.getBalance(otherAccounts[1].address));

            await tokenContract.withdraw();

            expect(Number(await ethers.provider.getBalance(tokenContractAddress))).to.equal(0);
            expect(Number(await ethers.provider.getBalance(otherAccounts[0].address))).to.equal(teamWalletBalanceBefore + (value / 2));
            expect(Number(await ethers.provider.getBalance(otherAccounts[1].address))).to.equal(communityWalletBalanceBefore + (value / 2));
        });

        it("Should only allow administrators to withdraw", async () => {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1;
            const value = amount * mintPrice;

            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });

            await expect(tokenContract.connect(otherAccounts[2]).withdraw()).to.be.revertedWith("Only administrators are allowed to withdraw");
        });

        it("Should only withdraw tokens if balance is more than zero", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            await expect(tokenContract.withdraw()).to.be.revertedWith("Not enough balance");
        });

        it("Should emit Withdrawn event with right data when withdrawing", async () => {
            const { tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1;
            const value = amount * mintPrice;

            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });
            
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
    
            const tokenId = 1;

            await tokenContract.setMintingEnabled(tokenId, true);
            expect(await tokenContract.mintingEnabled(tokenId)).to.equal(true);
            
            await tokenContract.setMintingEnabled(tokenId, false);
            expect(await tokenContract.mintingEnabled(tokenId)).to.equal(false);
        });
    
        it("Should only administrators be able to set minting enabled", async () => {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);
    
            const tokenId = 1;
            
            await expect(tokenContract.connect(otherAccounts[0]).setMintingEnabled(tokenId, true)).to.be.revertedWith("Only administrators are allowed to set minting enabled or disabled");
        });
    
        it("Should emit Minting Enabled event with right data when setting minting enabled", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            await tokenContract.setMintingEnabled(tokenId, false);
    
            const events = await tokenContract.queryFilter(tokenContract.filters.MintingEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
    
            expect(latestEvent.args.tokenId).to.equal(tokenId);
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
        it("Should set maximum mint amount per transaction successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 30;

            await tokenContract.setMaxMintAmountPerTx(tokenId, amount);
            expect(await tokenContract.maxMintAmountPerTx(tokenId)).to.equal(amount);
            
            await tokenContract.setMaxMintAmountPerTx(tokenId, amount * 2);
            expect(await tokenContract.maxMintAmountPerTx(tokenId)).to.equal(amount * 2);
        });
    
        it("Should only administrators be able to set maximum mint amount per transaction", async () => {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 30;
    
            await expect(tokenContract.connect(otherAccounts[0]).setMaxMintAmountPerTx(tokenId, amount)).to.be.revertedWith("Only administrators are allowed to set max mint amount per transaction");
        });
    
        it("Should emit Maximum Mint Amount Per Transaction Changed event with right data when setting maximum mint amount per transaction", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 30;
    
            await tokenContract.setMaxMintAmountPerTx(tokenId, amount);
    
            const events = await tokenContract.queryFilter(tokenContract.filters.MaxMintAmountPerTxChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
    
            expect(latestEvent.args.tokenId).to.equal(tokenId);
            expect(latestEvent.args.amount).to.equal(amount);
        });
    });

    describe("Set Maximum Mint Amount Address", () => {
        it("Should set maximum mint amount per address successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 15;

            await tokenContract.setMaxMintAmountPerAddress(tokenId, amount);
            expect(await tokenContract.maxMintAmountPerAddress(tokenId)).to.equal(amount);
            
            await tokenContract.setMaxMintAmountPerAddress(tokenId, amount * 2);
            expect(await tokenContract.maxMintAmountPerAddress(tokenId)).to.equal(amount * 2);
        });
    
        it("Should only administrators be able to set maximum mint amount per address", async () => {
            const { tokenContract, otherAccounts } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 15;
    
            await expect(tokenContract.connect(otherAccounts[0]).setMaxMintAmountPerAddress(tokenId, amount)).to.be.revertedWith("Only administrators are allowed to set max mint amount per address");
        });
    
        it("Should emit Maximum Mint Amount Address Changed event with right data when setting maximum mint amount per address", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 15;
    
            await tokenContract.setMaxMintAmountPerAddress(tokenId, amount);
    
            const events = await tokenContract.queryFilter(tokenContract.filters.MaxMintAmountPerAddressChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
    
            expect(latestEvent.args.tokenId).to.equal(tokenId);
            expect(latestEvent.args.amount).to.equal(amount);
        });
    });

    describe("Set Mint Price", () => {
      it("Should set mint price successfully", async function () {
        const { tokenContract } = await loadFixture(deployFixture);

        const tokenId = 1;
        const mintPrice = ethers.parseEther("0.025");
        await tokenContract.setMintPrice(tokenId, mintPrice);
  
        expect(await tokenContract.mintPrice(tokenId)).to.equal(mintPrice);
      });
  
      it("Should only allow administrators to set mint price", async function () {
        const { tokenContract, otherAccounts } = await loadFixture(deployFixture);

        const tokenId = 1;
        const mintPrice = ethers.parseEther("0.025");
  
        await expect(tokenContract.connect(otherAccounts[0]).setMintPrice(tokenId, mintPrice)).to.be.revertedWith("Only administrators are allowed to set mint price");
      });
  
      it("Should emit Mint Price Updated event with right data when setting mint price", async () => {
        const { tokenContract } = await loadFixture(deployFixture);

        const tokenId = 1;
        const mintPrice = ethers.parseEther("0.025");
        await tokenContract.setMintPrice(tokenId, mintPrice);
  
        const events = await tokenContract.queryFilter(tokenContract.filters.MintPriceUpdated());
        expect(events.length).to.be.greaterThan(0);
        const latestEvent = events[events.length - 1];
  
        expect(latestEvent.args.price).to.equal(mintPrice);
      });
    });

    describe("Mint Price", () => {
        it("Should return the mint price successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
    
            const tokenId = 1;
            const mintPrice = ethers.parseEther("0.025");
            await tokenContract.setMintPrice(tokenId, mintPrice);
      
            expect(await tokenContract.mintPrice(tokenId)).to.equal(mintPrice);
        });
    });

    describe("Mint Enabled", () => {
        it("Should return the mint enabled successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
    
            const tokenId = 1;

            await tokenContract.setMintingEnabled(tokenId, false);
            expect(await tokenContract.mintingEnabled(tokenId)).to.equal(false);
        });
    });
    
    describe("Address Mint Amount", () => {
        it("Should return the address mint amount successfully", async () => {
            const { tokenContract, owner } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 1;
            const value = amount * mintPrice;

            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });
            
            expect(await tokenContract.addressMintAmount(owner.address, tokenId)).to.equal(amount);
        });
    });
    
    describe("Maximum Supply", () => {
        it("Should return the maximum supply successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 1000;

            expect(await tokenContract.maxSupply(tokenId)).to.equal(amount);
        });
    });

    describe("Maximum Mint Amount Per Transaction", () => {
        it("Should return the maximum mint amount per transaction successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 30;

            await tokenContract.setMaxMintAmountPerTx(tokenId, amount);
            expect(await tokenContract.maxMintAmountPerTx(tokenId)).to.equal(amount);
        });
    });

    describe("Maximum Mint Amount Per Address", () => {
        it("Should return the maximum mint amount per address successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
            
            const tokenId = 1;
            const amount = 30;

            await tokenContract.setMaxMintAmountPerAddress(tokenId, amount);
            expect(await tokenContract.maxMintAmountPerAddress(tokenId)).to.equal(amount);
        });
    });

    describe("Token Uri", () => {
        it("Should return the token uri successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);
        
            const tokenId = 1;
            const baseUri = await tokenContract.BASE_URI();
            const hiddenUri = await tokenContract.HIDDEN_URI();
            const nftsRevealed = await tokenContract.nftsRevealed();
                
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 5;
            const value = amount * mintPrice;
            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });
        
            if(nftsRevealed) {
                expect(await tokenContract.uri(tokenId)).to.equal(baseUri + tokenId.toString() + ".json");
            } else {
                expect(await tokenContract.uri(tokenId)).to.equal(hiddenUri);
            }
        });
    });

    describe("Token Supply", () => {
        it("Should return the token supply successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 10;
            const value = amount * mintPrice;
            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });

            expect(Number(await tokenContract.tokenSupply(tokenId))).to.equal(10);
        });
    });

    describe("Total Supply", () => {
        it("Should return the total supply successfully", async () => {
            const { tokenContract } = await loadFixture(deployFixture);

            const tokenId = 1;
            const mintPrice = Number(await tokenContract.mintPrice(tokenId));
            const amount = 10;
            const value = amount * mintPrice;
            await tokenContract.mint(tokenId, amount, { value: BigInt(value) });

            expect(Number(await tokenContract.totalSupply())).to.equal(10);
        });
    });
});