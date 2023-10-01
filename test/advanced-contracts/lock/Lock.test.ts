import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Lock Contract", () => {
    async function deployFixture() {
        const [owner, ...otherAccounts] = await ethers.getSigners();

        const tokenContract = await ethers.deployContract("ERC20Contract");
        await tokenContract.waitForDeployment();
        const tokenContractAddress = await tokenContract.getAddress();

        const lockContract = await ethers.deployContract("Lock", [tokenContractAddress]);
        await lockContract.waitForDeployment();
        const lockContractAddress = await lockContract.getAddress();

        return { lockContract, lockContractAddress, tokenContract, tokenContractAddress, owner, otherAccounts };
    }

    describe("Lock", () => {
        it("Should lock tokens successfully", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);

            const totalLockedTokenAmountBefore = Number(await lockContract.totalLockedTokenAmount());
        
            await lockContract.lock(otherAccounts[0].address, amount);
      
            let currentTimestamp = (new Date()).getTime() / 1000;
        
            const lockedToken = await lockContract.getLockedToken(otherAccounts[0].address);
            expect(lockedToken.locked).to.equal(true);
            expect(lockedToken.claimed).to.equal(false);
            expect(lockedToken.amount).to.equal(amount);

            const absoluteDifference = Math.abs(Number(lockedToken.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
                currentTimestamp = Number(lockedToken.date);
            }
            expect(lockedToken.date).to.equal(currentTimestamp);

            expect(Number(await lockContract.totalLockedTokenAmount())).to.equal(totalLockedTokenAmountBefore + amount);
        });
    
        it("Should only allow administrators to lock tokens", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
            await lockContract.lock(otherAccounts[0].address, amount);

            await expect(lockContract.connect(otherAccounts[1]).lock(otherAccounts[1].address, amount)).to.be.revertedWith("Only administrators are allowed to lock tokens");
        });
    
        it("Should not allow locking if the lock amount is zero", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);

            await expect(lockContract.lock(otherAccounts[0].address, 0)).to.be.revertedWith("Lock amount must be greater than zero");
        });
    
        it("Should not allow locking if the claimer address is the zero address", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);

            await expect(lockContract.lock(ethers.ZeroAddress, amount)).to.be.revertedWith("Claimer address cannot be the zero address");
        });
    
        it("Should not allow locking if the claimer address is already locked", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
            await lockContract.lock(otherAccounts[0].address, amount);

            await expect(lockContract.lock(otherAccounts[0].address, amount)).to.be.revertedWith("Claimer address tokens are already locked");
        });
    
        it("Should not allow locking if the claimer address does not have enough tokens", async () => {
            const { lockContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await expect(lockContract.lock(otherAccounts[0].address, amount)).to.be.revertedWith("This address does not have enough tokens");
        });

        it("Should emit Locked event with right data when locking", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);

            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);

            const totalLockedTokenAmount = Number(await lockContract.totalLockedTokenAmount());

            await lockContract.lock(otherAccounts[0].address, amount);

            let currentTimestamp = (new Date()).getTime() / 1000;
    
            const events = await lockContract.queryFilter(lockContract.filters.Locked());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
        
            const absoluteDifference = Math.abs(Number(latestEvent.args.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
                currentTimestamp = Number(latestEvent.args.date);
            }
        
            expect(latestEvent.args.claimer).to.equal(otherAccounts[0].address);
            expect(Number(latestEvent.args.date)).to.equal(currentTimestamp);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.totalLockedTokenAmount)).to.equal(totalLockedTokenAmount + amount);
        });
    });

    describe("Unlock", () => {
        it("Should unlock tokens successfully", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
        
            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.unlock(otherAccounts[0].address);
        
            const lockedToken = await lockContract.getLockedToken(otherAccounts[0].address);
            expect(lockedToken.locked).to.equal(false);
            expect(lockedToken.claimed).to.equal(false);
            expect(lockedToken.amount).to.equal(amount);
        });
    
        it("Should only allow administrators to unlock tokens", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount * 2);
            await tokenContract.approve(lockContract, amount * 2);
        
            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.lock(otherAccounts[1].address, amount);

            await lockContract.unlock(otherAccounts[0].address);
        
            await expect(lockContract.connect(otherAccounts[0]).unlock(otherAccounts[0].address)).to.be.revertedWith("Only administrators are allowed to unlock tokens");
        });
    
        it("Should not allow unlocking if the claimer address is the zero address", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
        
            await lockContract.lock(otherAccounts[0].address, amount);
        
            await expect(lockContract.unlock(ethers.ZeroAddress)).to.be.revertedWith("Claimer address cannot be the zero address");
        });
    
        it("Should not allow unlocking if the claimer address has not locked tokens", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
        
            await expect(lockContract.unlock(otherAccounts[0].address)).to.be.revertedWith("Claimer address tokens are not locked");
        });

        it("Should emit Unlocked event with right data when unlocking", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);

            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);

            const totalLockedTokenAmount = Number(await lockContract.totalLockedTokenAmount());

            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.unlock(otherAccounts[0].address);

            let currentTimestamp = (new Date()).getTime() / 1000;
    
            const events = await lockContract.queryFilter(lockContract.filters.Unlocked());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
        
            const absoluteDifference = Math.abs(Number(latestEvent.args.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
                currentTimestamp = Number(latestEvent.args.date);
            }
        
            expect(latestEvent.args.claimer).to.equal(otherAccounts[0].address);
            expect(Number(latestEvent.args.date)).to.equal(currentTimestamp);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.totalLockedTokenAmount)).to.equal(totalLockedTokenAmount + amount);
        });
    });

    describe("Claim", () => {
        it("Should claim tokens successfully", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
      
            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.unlock(otherAccounts[0].address);

            const balanceBefore = Number(await tokenContract.balanceOf(otherAccounts[0].address));
            const totalLockedTokenAmountBefore = Number(await lockContract.totalLockedTokenAmount());

            await lockContract.connect(otherAccounts[0]).claim();
      
            const lockedToken = await lockContract.getLockedToken(otherAccounts[0].address);
            expect(lockedToken.locked).to.equal(false);
            expect(lockedToken.claimed).to.equal(true);
            expect(lockedToken.amount).to.equal(0);

            expect(Number(await tokenContract.balanceOf(otherAccounts[0].address))).to.equal(balanceBefore + amount);
            expect(Number(await lockContract.totalLockedTokenAmount())).to.equal(totalLockedTokenAmountBefore - amount);
        });
        
        it("Should not allow claiming if claiming is disabled", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
      
            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.unlock(otherAccounts[0].address);

            await lockContract.setClaimingEnabled(false);

            await expect(lockContract.connect(otherAccounts[0]).claim()).to.be.revertedWith("Claiming is currently disabled");

            expect(await lockContract.claimingEnabled()).to.equal(false);
        });
        
        it("Should not allow claiming if the claimer address has already claimed", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
      
            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.unlock(otherAccounts[0].address);

            await lockContract.connect(otherAccounts[0]).claim();

            await expect(lockContract.connect(otherAccounts[0]).claim()).to.be.revertedWith("Claimer address already claimed tokens");
        });
        
        it("Should not allow claiming if the claimer address has not locked tokens", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
      
            await lockContract.lock(otherAccounts[0].address, amount);

            await expect(lockContract.connect(otherAccounts[0]).claim()).to.be.revertedWith("Claimer address tokens are not unlocked yet");
        });

        it("Should emit Claimed event with right data when claiming", async () => {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);
      
            await lockContract.lock(otherAccounts[0].address, amount);
            await lockContract.unlock(otherAccounts[0].address);

            const totalLockedTokenAmount = Number(await lockContract.totalLockedTokenAmount());

            await lockContract.connect(otherAccounts[0]).claim();

            let currentTimestamp = (new Date()).getTime() / 1000;
    
            const events = await lockContract.queryFilter(lockContract.filters.Claimed());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
        
            const absoluteDifference = Math.abs(Number(latestEvent.args.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
                currentTimestamp = Number(latestEvent.args.date);
            }

            expect(latestEvent.args.claimer).to.equal(otherAccounts[0].address);
            expect(Number(latestEvent.args.date)).to.equal(currentTimestamp);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.totalLockedTokenAmount)).to.equal(totalLockedTokenAmount - amount);
        });
    });

    describe("Withdraw Native Tokens", () => {
        it("Should withdraw native tokens successfully", async function () {
            const { lockContract, lockContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

            const balanceBefore = await ethers.provider.getBalance(owner.address);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: lockContractAddress,
                value: sendAmount,
            });
            const sendReceipt = await sendTx.wait();
            const sendTxGasUsed = sendReceipt ? sendReceipt.gasUsed * sendReceipt.gasPrice : 0;

            const withdrawTx = await lockContract.withdrawNativeTokens();
            const withdrawReceipt = await withdrawTx.wait();
            const withdrawTxGasUsed = withdrawReceipt ? withdrawReceipt.gasUsed * withdrawReceipt.gasPrice : 0;

            const totalGasUsed = BigInt(sendTxGasUsed) + BigInt(withdrawTxGasUsed);

            const balance = await ethers.provider.getBalance(owner.address);
            const expectedBalanceChange = ethers.parseUnits(((BigInt(balance) + BigInt(totalGasUsed)) - BigInt(balanceBefore)).toString(), "wei");
            const tokenContractBalance = ethers.parseUnits((await ethers.provider.getBalance(tokenContractAddress)).toString(), "wei");
            
            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(tokenContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw native tokens", async function () {
            const { lockContract, lockContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            await owner.sendTransaction({
                to: lockContractAddress,
                value: sendAmount,
            });
            await lockContract.withdrawNativeTokens();

            await expect(lockContract.connect(otherAccounts[0]).withdrawNativeTokens()).to.be.revertedWith("Only administrators are allowed to withdraw native tokens");
            });

            it("Should revert if the balance is zero when withdrawing native tokens", async function () {
            const { lockContract } = await loadFixture(deployFixture);

        await expect(lockContract.withdrawNativeTokens()).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Native Tokens Withdrawn event with right data when withdrawing native tokens", async () => {
            const { lockContract, lockContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: lockContractAddress,
                value: sendAmount,
            });
            await sendTx.wait();

            await lockContract.withdrawNativeTokens();

            const events = await lockContract.queryFilter(lockContract.filters.NativeTokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(sendAmount));
        });
    });

    describe("Withdraw ERC20 Tokens", () => {
        it("Should withdraw ERC20 tokens successfully", async function () {
            const { lockContract, lockContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            const balanceBefore = await secondTokenContract.balanceOf(lockContractAddress);

            await secondTokenContract.transfer(lockContractAddress, amount);
            await lockContract.withdrawTokens(secondTokenContractAddress);

            const balance = await secondTokenContract.balanceOf(lockContractAddress);
            const expectedBalanceChange = ethers.parseUnits((BigInt(balance) - BigInt(balanceBefore)).toString(), "wei");
            const lockContractBalance = ethers.parseUnits((await ethers.provider.getBalance(lockContractAddress)).toString(), "wei");

            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(lockContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw ERC20 tokens", async function () {
            const { lockContract, lockContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            await secondTokenContract.transfer(lockContractAddress, amount);

            await expect(lockContract.connect(otherAccounts[0]).withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Only administrators are allowed to withdraw tokens");
        });

        it("Should revert if the token contract address is the zero address when withdrawing ERC20 tokens", async function () {
            const { lockContract } = await loadFixture(deployFixture);

            await expect(lockContract.withdrawTokens(ethers.ZeroAddress)).to.be.revertedWith("Token contract address cannot be the zero address"); 
        });

        it("Should revert if the token contract address is same as the locked token address", async function () {
          const { lockContract, tokenContractAddress } = await loadFixture(deployFixture);
    
          await expect(lockContract.withdrawTokens(tokenContractAddress)).to.be.revertedWith("Cannot withdraw the locked tokens");
        });

        it("Should revert if there are insufficient tokens to withdraw ERC20 tokens", async function () {
            const { lockContract } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            await expect(lockContract.withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Tokens Withdrawn event with right data when withdrawing ERC20 tokens", async () => {
            const { lockContract, lockContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            await secondTokenContract.transfer(lockContractAddress, amount);
            await lockContract.withdrawTokens(secondTokenContractAddress);

            const events = await lockContract.queryFilter(lockContract.filters.TokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.token).to.equal(secondTokenContractAddress);
            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
        });
    });

    describe("Set Claiming Enabled", () => {
        it("Should set claiming enabled successfully", async function () {
            const { lockContract } = await loadFixture(deployFixture);

            await lockContract.setClaimingEnabled(false);
            expect(await lockContract.claimingEnabled()).to.equal(false);

            await lockContract.setClaimingEnabled(true);
            expect(await lockContract.claimingEnabled()).to.equal(true);
        });

        it("Should only allow administrators to enable or disable claiming", async function () {
            const { lockContract, otherAccounts } = await loadFixture(deployFixture);

            await expect(lockContract.connect(otherAccounts[0]).setClaimingEnabled(false)).to.be.revertedWith("Only administrators are authorized to enable or disable claiming");
        });

        it("Should emit Claiming Enabled event with right data when setting claiming enabled", async () => {
            const { lockContract } = await loadFixture(deployFixture);

            await lockContract.setClaimingEnabled(false);

            const events = await lockContract.queryFilter(lockContract.filters.ClaimingEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.enabled).to.equal(false);
        });
    });

    describe("Get Locked Token", () => {
        it("Should return locked token successfully", async function () {
            const { lockContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(lockContract, amount);

            let currentTimestamp = (new Date()).getTime() / 1000;
        
            await lockContract.lock(otherAccounts[0].address, amount);

            const lockedToken = await lockContract.getLockedToken(otherAccounts[0].address);
            expect(lockedToken.locked).to.equal(true);
            expect(lockedToken.claimed).to.equal(false);
            expect(lockedToken.amount).to.equal(amount);

            const absoluteDifference = Math.abs(Number(lockedToken.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
                currentTimestamp = Number(lockedToken.date);
            }
            expect(lockedToken.date).to.equal(currentTimestamp);
        });
    });  
});