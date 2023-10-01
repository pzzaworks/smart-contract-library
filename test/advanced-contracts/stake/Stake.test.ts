import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Stake Contract", () => {
    async function deployFixture() {
        const [owner, ...otherAccounts] = await ethers.getSigners();

        const tokenContract = await ethers.deployContract("ERC20Contract");
        await tokenContract.waitForDeployment();
        const tokenContractAddress = await tokenContract.getAddress();

        const initialInterestRate = (10 ** Number(await tokenContract.decimals())) / 2;
        const initialTokenDecimals = Number(await tokenContract.decimals());

        const stakeContract = await ethers.deployContract("Stake", [tokenContractAddress, initialTokenDecimals, initialInterestRate]);
        await stakeContract.waitForDeployment();
        const stakeContractAddress = await stakeContract.getAddress();

        return { stakeContract, stakeContractAddress, tokenContract, tokenContractAddress, owner, otherAccounts };
    }

    describe("Deposit Reward Tokens", () => {
        it("Should deposit reward tokens successfully", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(stakeContract, amount);

            const rewardTokenPoolBalanceBefore = Number(await stakeContract.rewardTokenPoolBalance());
        
            await stakeContract.depositRewardTokens(amount);
      
            expect(Number(await stakeContract.rewardTokenPoolBalance())).to.equal(rewardTokenPoolBalanceBefore + amount);
            expect(Number(await tokenContract.balanceOf(owner.address))).to.equal(0);
        });

        it("Should only allow administrators to deposit reward tokens", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount * 2);
            await tokenContract.approve(stakeContract, amount * 2);

            await stakeContract.depositRewardTokens(amount);
      
            await expect(stakeContract.connect(otherAccounts[0]).depositRewardTokens(amount)).to.be.revertedWith("Only administrators are allowed to deposit reward tokens");
        });

        it("Should only allow deposit reward tokens if the amount is greater than zero", async () => {
            const { stakeContract } = await loadFixture(deployFixture);

            await expect(stakeContract.depositRewardTokens(0)).to.be.revertedWith("Deposit amount must be greater than zero");
        });

        it("Should only allow deposit reward tokens if the token balance is sufficient", async () => {
            const { stakeContract } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);

            await expect(stakeContract.depositRewardTokens(amount)).to.be.revertedWith("Token balance is insufficient for the desired deposit");
        });

        it("Should emit Reward Tokens Deposited event with right data when depositing reward tokens", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(stakeContract, amount);

            const rewardTokenPoolBalanceBefore = Number(await stakeContract.rewardTokenPoolBalance());

            await stakeContract.depositRewardTokens(amount);

            const events = await stakeContract.queryFilter(stakeContract.filters.RewardTokensDeposited());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
        
            expect(latestEvent.args.depositor).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.rewardTokenPoolBalance)).to.equal(rewardTokenPoolBalanceBefore + amount);
        });
    });

    describe("Stake", () => {
        it("Should stake tokens successfully", async () => {
            const { stakeContract, tokenContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount);

            const totalStakedTokenAmountBefore = Number(await stakeContract.totalStakedTokenAmount());
            const interestRate = await stakeContract.interestRate();
            let currentTimestamp = (new Date()).getTime() / 1000;
        
            await stakeContract.connect(otherAccounts[0]).stake(amount);
            
            const stakedTokens = await stakeContract.getStakedToken(otherAccounts[0].address);

            const absoluteDifference = Math.abs(Number(stakedTokens.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
              currentTimestamp = Number(stakedTokens.date);
            }
            
            expect(Number(stakedTokens.date)).to.equal(currentTimestamp);
            expect(Number(stakedTokens.interestRate)).to.equal(interestRate);
            expect(Number(stakedTokens.amount)).to.equal(amount);
            expect(stakedTokens.staked).to.equal(true);

            expect(Number(await stakeContract.totalStakedTokenAmount())).to.equal(totalStakedTokenAmountBefore + amount);
            expect(Number(await stakeContract.totalStakerCount())).to.equal(1);
            expect(Number(await tokenContract.balanceOf(otherAccounts[0].address))).to.equal(0);
        });

        it("Should only allow stake tokens if staking is enabled", async () => {
            const { stakeContract, tokenContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount);

            await stakeContract.setStakingEnabled(false);
        
            await expect(stakeContract.connect(otherAccounts[0]).stake(amount)).to.be.revertedWith("Staking is currently disabled");
        });

        it("Should only allow stake tokens if the amount is greater than zero", async () => {
            const { stakeContract, otherAccounts } = await loadFixture(deployFixture);
        
            await expect(stakeContract.connect(otherAccounts[0]).stake(0)).to.be.revertedWith("Stake amount must be greater than zero");
        });

        it("Should only allow stake tokens if the staker is not already staked", async () => {
            const { stakeContract, tokenContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount);

            await stakeContract.connect(otherAccounts[0]).stake(amount);

            await expect(stakeContract.connect(otherAccounts[0]).stake(amount)).to.be.revertedWith("This address already staked tokens");
        });

        it("Should only allow stake tokens if the staker has enough tokens", async () => {
            const { stakeContract, otherAccounts } = await loadFixture(deployFixture);

            const amount = 1*(10**2)*(10**6);

            await expect(stakeContract.connect(otherAccounts[0]).stake(amount)).to.be.revertedWith("This address does not have enough tokens");
        });

        it("Should emit Staked event with right data when staking tokens", async () => {
            const { stakeContract, tokenContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount);

            const totalStakedTokenAmountBefore = Number(await stakeContract.totalStakedTokenAmount());

            await stakeContract.connect(otherAccounts[0]).stake(amount);

            const events = await stakeContract.queryFilter(stakeContract.filters.Staked());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.staker).to.equal(otherAccounts[0].address);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.totalStakedTokenAmount)).to.equal(totalStakedTokenAmountBefore + amount);
            expect(Number(latestEvent.args.totalStakerCount)).to.equal(1);
        });
    });


    describe("Unstake", () => {
        it("Should unstake tokens successfully", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount * 2);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount * 2);
        
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(stakeContract, amount);
            await stakeContract.depositRewardTokens(amount);

            await stakeContract.connect(otherAccounts[0]).stake(amount);

            const totalStakedTokenAmountBefore = Number(await stakeContract.totalStakedTokenAmount());
            const rewardTokenPoolBalanceBefore = Number(await stakeContract.rewardTokenPoolBalance());
            const balanceBefore = await tokenContract.balanceOf(otherAccounts[0].address);
            const interestRate = await stakeContract.interestRate();
        
            await stakeContract.connect(otherAccounts[0]).unstake();

            const balance = await tokenContract.balanceOf(otherAccounts[0].address);
            const expectedBalanceChange = ethers.parseUnits((BigInt(balance) - BigInt(balanceBefore)).toString(), "wei");
        
            const stakedTokens = await stakeContract.getStakedToken(otherAccounts[0].address);

            expect(Number(stakedTokens.interestRate)).to.equal(interestRate);
            expect(Number(stakedTokens.amount)).to.equal(amount);
            expect(stakedTokens.staked).to.equal(false);

            const rewardAmount = ((amount) * Number(interestRate)) / (100 * (10 ** Number(await tokenContract.decimals())));

            expect(Number(await stakeContract.totalStakedTokenAmount())).to.equal(totalStakedTokenAmountBefore - amount);
            expect(Number(await stakeContract.rewardTokenPoolBalance())).to.equal(rewardTokenPoolBalanceBefore - rewardAmount);
            expect(Number(await stakeContract.totalStakerCount())).to.equal(0);
            expect(expectedBalanceChange).to.equal(BigInt(amount) + BigInt(rewardAmount));
        });

        it("Should only allow unstake tokens if unstaking is enabled", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount * 2);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount * 2);
        
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(stakeContract, amount);
            await stakeContract.depositRewardTokens(amount);

            await stakeContract.connect(otherAccounts[0]).stake(amount);

            await stakeContract.setUnstakingEnabled(false);

            await expect(stakeContract.connect(otherAccounts[0]).unstake()).to.rejectedWith("Unstaking is currently disabled");
        });

        it("Should only allow unstake tokens if the user has staked tokens", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount * 2);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount * 2);
        
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(stakeContract, amount);
            await stakeContract.depositRewardTokens(amount);

            await expect(stakeContract.connect(otherAccounts[0]).unstake()).to.rejectedWith("This address did not stake tokens yet");
        });

        it("Should only allow unstake tokens if the reward tokens pool balance is sufficient", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount * 2);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount * 2);
        
            await stakeContract.connect(otherAccounts[0]).stake(amount);

            await expect(stakeContract.connect(otherAccounts[0]).unstake()).to.rejectedWith("Insufficient reward tokens to claim");
        });

        it("Should emit Unstaked event with right data when unstaking tokens", async () => {
            const { stakeContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount);
        
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(stakeContract, amount);
            await stakeContract.depositRewardTokens(amount);

            await stakeContract.connect(otherAccounts[0]).stake(amount);

            const totalStakedTokenAmountBefore = Number(await stakeContract.totalStakedTokenAmount());

            await stakeContract.connect(otherAccounts[0]).unstake();

            const events = await stakeContract.queryFilter(stakeContract.filters.Unstaked());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.staker).to.equal(otherAccounts[0].address);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.totalStakedTokenAmount)).to.equal(totalStakedTokenAmountBefore - amount);
            expect(Number(latestEvent.args.totalStakerCount)).to.equal(0);
        });
    });

    describe("Withdraw Native Tokens", () => {
        it("Should withdraw native tokens successfully", async function () {
            const { stakeContract, stakeContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

            const ownerbalanceBefore = await ethers.provider.getBalance(owner.address);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: stakeContractAddress,
                value: sendAmount,
            });
            const sendReceipt = await sendTx.wait();
            const sendTxGasUsed = sendReceipt ? sendReceipt.gasUsed * sendReceipt.gasPrice : 0;

            const withdrawTx = await stakeContract.withdrawNativeTokens();
            const withdrawReceipt = await withdrawTx.wait();
            const withdrawTxGasUsed = withdrawReceipt ? withdrawReceipt.gasUsed * withdrawReceipt.gasPrice : 0;

            const totalGasUsed = BigInt(sendTxGasUsed) + BigInt(withdrawTxGasUsed);

            const ownerBalance = await ethers.provider.getBalance(owner.address);
            const expectedBalanceChange = ethers.parseUnits(((BigInt(ownerBalance) + BigInt(totalGasUsed)) - BigInt(ownerbalanceBefore)).toString(), "wei");
            const tokenContractBalance = ethers.parseUnits((await ethers.provider.getBalance(tokenContractAddress)).toString(), "wei");
            
            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(tokenContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw native tokens", async function () {
            const { stakeContract, stakeContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            await owner.sendTransaction({
                to: stakeContractAddress,
                value: sendAmount,
            });
            await stakeContract.withdrawNativeTokens();

            await expect(stakeContract.connect(otherAccounts[0]).withdrawNativeTokens()).to.be.revertedWith("Only administrators are allowed to withdraw native tokens");
        });

        it("Should revert if the balance is zero when withdrawing native tokens", async function () {
            const { stakeContract } = await loadFixture(deployFixture);

            await expect(stakeContract.withdrawNativeTokens()).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Native Tokens Withdrawn event with right data when withdrawing native tokens", async () => {
            const { stakeContract, stakeContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: stakeContractAddress,
                value: sendAmount,
            });
            await sendTx.wait();

            await stakeContract.withdrawNativeTokens();

            const events = await stakeContract.queryFilter(stakeContract.filters.NativeTokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(sendAmount));
        });
    });

    describe("Withdraw ERC20 Tokens", () => {
        it("Should withdraw ERC20 tokens successfully", async function () {
            const { stakeContract, stakeContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            const balanceBefore = await secondTokenContract.balanceOf(stakeContractAddress);

            await secondTokenContract.transfer(stakeContractAddress, amount);
            await stakeContract.withdrawTokens(secondTokenContractAddress);

            const balance = await secondTokenContract.balanceOf(stakeContractAddress);
            const expectedBalanceChange = ethers.parseUnits((BigInt(balance) - BigInt(balanceBefore)).toString(), "wei");
            const stakeContractBalance = ethers.parseUnits((await ethers.provider.getBalance(stakeContractAddress)).toString(), "wei");

            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(stakeContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw ERC20 tokens", async function () {
            const { stakeContract, stakeContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);
            await secondTokenContract.transfer(stakeContractAddress, amount);

            await expect(stakeContract.connect(otherAccounts[0]).withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Only administrators are allowed to withdraw tokens");
        });

        it("Should revert if the token contract address is the zero address when withdrawing ERC20 tokens", async function () {
            const { stakeContract } = await loadFixture(deployFixture);

            await expect(stakeContract.withdrawTokens(ethers.ZeroAddress)).to.be.revertedWith("Token contract address cannot be the zero address"); 
        });

        it("Should revert if the token contract address is same as the locked token address", async function () {
          const { stakeContract, tokenContractAddress } = await loadFixture(deployFixture);
    
          await expect(stakeContract.withdrawTokens(tokenContractAddress)).to.be.revertedWith("Cannot withdraw the staked tokens");
        });


        it("Should revert if there are insufficient tokens to withdraw ERC20 tokens", async function () {
            const { stakeContract } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            await expect(stakeContract.withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Tokens Withdrawn event with right data when withdrawing ERC20 tokens", async () => {
            const { stakeContract, stakeContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            await secondTokenContract.transfer(stakeContractAddress, amount);
            await stakeContract.withdrawTokens(secondTokenContractAddress);

            const events = await stakeContract.queryFilter(stakeContract.filters.TokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.token).to.equal(secondTokenContractAddress);
            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
        });
    });

    describe("Set Interest Rate", () => {
        it("Should set interest rate enabled successfully", async function () {
            const { stakeContract, tokenContract } = await loadFixture(deployFixture);

            const interestRate = (10 ** Number(await tokenContract.decimals())) / 5;
            await stakeContract.setInterestRate(interestRate);

            expect(await stakeContract.interestRate()).to.equal(interestRate);
        });

        it("Should only allow administrators to set interest rate", async function () {
            const { stakeContract, tokenContract, otherAccounts } = await loadFixture(deployFixture);

            const interestRate = (10 ** Number(await tokenContract.decimals())) / 5;

            await expect(stakeContract.connect(otherAccounts[0]).setInterestRate(interestRate)).to.be.revertedWith("Only administrators are allowed to set the interest rate");
        });

        it("Should emit Interest Rate Changed event with right data when setting interest rate set", async () => {
            const { stakeContract, tokenContract } = await loadFixture(deployFixture);

            const interestRate = (10 ** Number(await tokenContract.decimals())) / 5;
            await stakeContract.setInterestRate(interestRate);

            const events = await stakeContract.queryFilter(stakeContract.filters.InterestRateChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.interestRate).to.equal(interestRate);
        });
    });

    describe("Set Staking Enabled", () => {
        it("Should set staking enabled successfully", async function () {
            const { stakeContract } = await loadFixture(deployFixture);

            await stakeContract.setStakingEnabled(false);
            expect(await stakeContract.stakingEnabled()).to.equal(false);

            await stakeContract.setStakingEnabled(true);
            expect(await stakeContract.stakingEnabled()).to.equal(true);
        });

        it("Should only allow administrators to enable or disable staking", async function () {
            const { stakeContract, otherAccounts } = await loadFixture(deployFixture);

            await expect(stakeContract.connect(otherAccounts[0]).setStakingEnabled(false)).to.be.revertedWith("Only administrators are allowed to set staking enabled or disabled");
        });

        it("Should emit Staking Enabled event with right data when setting staking enabled", async () => {
            const { stakeContract } = await loadFixture(deployFixture);

            await stakeContract.setStakingEnabled(false);

            const events = await stakeContract.queryFilter(stakeContract.filters.StakingEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.enabled).to.equal(false);
        });
    });

    describe("Set Unstaking Enabled", () => {
        it("Should set unstaking enabled successfully", async function () {
            const { stakeContract } = await loadFixture(deployFixture);

            await stakeContract.setUnstakingEnabled(false);
            expect(await stakeContract.unstakingEnabled()).to.equal(false);

            await stakeContract.setUnstakingEnabled(true);
            expect(await stakeContract.unstakingEnabled()).to.equal(true);
        });

        it("Should only allow administrators to enable or disable unstaking", async function () {
            const { stakeContract, otherAccounts } = await loadFixture(deployFixture);

            await expect(stakeContract.connect(otherAccounts[0]).setUnstakingEnabled(false)).to.be.revertedWith("Only administrators are allowed to set unstaking enabled or disabled");
        });

        it("Should emit Unstaking Enabled event with right data when setting unstaking enabled", async () => {
            const { stakeContract } = await loadFixture(deployFixture);

            await stakeContract.setUnstakingEnabled(false);

            const events = await stakeContract.queryFilter(stakeContract.filters.UnstakingEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.enabled).to.equal(false);
        });
    });

    describe("Get Staked Token", () => {
        it("Should return staked token successfully", async function () {
            const { stakeContract, tokenContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(stakeContract, amount);

            const interestRate = await stakeContract.interestRate();
            let currentTimestamp = (new Date()).getTime() / 1000;
        
            await stakeContract.connect(otherAccounts[0]).stake(amount);

            const stakedTokens = await stakeContract.getStakedToken(otherAccounts[0].address);

            const absoluteDifference = Math.abs(Number(stakedTokens.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
              currentTimestamp = Number(stakedTokens.date);
            }
            
            expect(Number(stakedTokens.date)).to.equal(currentTimestamp);
            expect(Number(stakedTokens.interestRate)).to.equal(interestRate);
            expect(Number(stakedTokens.amount)).to.equal(amount);
            expect(stakedTokens.staked).to.equal(true);
        });
    });  
});