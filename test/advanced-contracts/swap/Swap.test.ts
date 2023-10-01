import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MaxUint256, getBigInt, toBigInt } from "ethers";

describe("Swap Contract", () => {
    async function deployFixture() {
        const [owner, royaltyFeeWallet, ...otherAccounts] = await ethers.getSigners();

        const tokenOneContract = await ethers.deployContract("ERC20Contract");
        await tokenOneContract.waitForDeployment();
        const tokenOneContractAddress = await tokenOneContract.getAddress();

        const tokenTwoContract = await ethers.deployContract("ERC20Contract");
        await tokenTwoContract.waitForDeployment();
        const tokenTwoContractAddress = await tokenTwoContract.getAddress();

        const tokenOnePoolContract = await ethers.deployContract("Pool", [tokenOneContractAddress]);
        await tokenOnePoolContract.waitForDeployment();
        const tokenOnePoolContractAddress = await tokenOnePoolContract.getAddress();

        const tokenTwoPoolContract = await ethers.deployContract("Pool", [tokenTwoContractAddress]);
        await tokenTwoPoolContract.waitForDeployment();
        const tokenTwoPoolContractAddress = await tokenTwoPoolContract.getAddress();

        const initialRoyaltyFeePercentage = (10 ** Number(await tokenOneContract.decimals())) / 2;
        
        const swapContract = await ethers.deployContract("Swap", [royaltyFeeWallet.address, initialRoyaltyFeePercentage]);
        await swapContract.waitForDeployment();
        const swapContractAddress = await swapContract.getAddress();

        return { 
            swapContract, 
            swapContractAddress, 
            tokenOneContract, 
            tokenOneContractAddress, 
            tokenTwoContract, 
            tokenTwoContractAddress, 
            tokenOnePoolContract, 
            tokenOnePoolContractAddress, 
            tokenTwoPoolContract, 
            tokenTwoPoolContractAddress, 
            royaltyFeeWallet,
            owner, 
            otherAccounts
        };
    }

    describe("Swap Tokens", () => {
        it("Should swap tokens successfully", async function () {
            const { 
                swapContract, 
                swapContractAddress, 
                tokenOneContract, 
                tokenOneContractAddress, 
                tokenTwoContract, 
                tokenTwoContractAddress, 
                tokenOnePoolContract, 
                tokenOnePoolContractAddress, 
                tokenTwoPoolContract, 
                tokenTwoPoolContractAddress,
                royaltyFeeWallet,
                owner, 
                otherAccounts
            } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());
            const amount = 1*(10**2)*(10**6);

            await tokenOneContract.mint(owner.address, amount * 10**2);
            await tokenOneContract.approve(tokenOnePoolContractAddress, amount * 10**2);
            await tokenOnePoolContract.deposit(amount * 10**2);

            await tokenTwoContract.mint(owner.address, amount * 10**2);
            await tokenTwoContract.approve(tokenTwoPoolContractAddress, amount * 10**2);
            await tokenTwoPoolContract.deposit(amount * 10**2);

            await tokenOneContract.mint(otherAccounts[1].address, amount);
            await tokenOneContract.connect(otherAccounts[1]).approve(swapContractAddress, amount);

            const tokenOnePoolContractDepositorRole = await tokenOnePoolContract.DEPOSITOR();
            const tokenOnePoolContractWithdrawerRole = await tokenOnePoolContract.WITHDRAWER();

            await tokenOnePoolContract.grantRole(tokenOnePoolContractDepositorRole, swapContractAddress);
            await tokenOnePoolContract.grantRole(tokenOnePoolContractWithdrawerRole, swapContractAddress);

            const tokenTwoPoolContractDepositorRole = await tokenTwoPoolContract.DEPOSITOR();
            const tokenTwoPoolContractWithdrawerRole = await tokenTwoPoolContract.WITHDRAWER();

            await tokenTwoPoolContract.grantRole(tokenTwoPoolContractDepositorRole, swapContractAddress);
            await tokenTwoPoolContract.grantRole(tokenTwoPoolContractWithdrawerRole, swapContractAddress);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);
            await swapContract.setTokenPoolAddress(tokenTwoContractAddress, tokenTwoPoolContractAddress);

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(tokenOneDecimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), tokenOneDecimals));

            let tokenTwoAmount = BigInt(BigInt(amount) * (BigInt(parsedTokenRatio)) / BigInt(10 ** tokenOneDecimals));

            const royaltyFeePercentage = await swapContract.royaltyFeePercentage();
            const royaltyFeeAmount = BigInt(tokenTwoAmount * royaltyFeePercentage) / BigInt(100 * (10 ** tokenOneDecimals));
            
            tokenTwoAmount = tokenTwoAmount - royaltyFeeAmount;

            await swapContract.setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio);

            await swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenTwoContractAddress, amount);

            expect(Number(await tokenOneContract.balanceOf(otherAccounts[1].address))).to.equal(0);
            expect(Number(await tokenOneContract.balanceOf(tokenOnePoolContractAddress))).to.equal(BigInt(amount * 10**2) + BigInt(amount) - royaltyFeeAmount);
            expect(Number(await tokenOneContract.balanceOf(royaltyFeeWallet.address))).to.equal(royaltyFeeAmount);
            expect(Number(await tokenTwoContract.balanceOf(otherAccounts[1].address))).to.equal(tokenTwoAmount);
        });

        it("Should only swap tokens if swapping is enabled", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress, otherAccounts } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());
            const amount = 1*(10**2)*(10**6);

            await swapContract.setSwapEnabled(false);

            await expect(swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenTwoContractAddress, amount)).to.be.revertedWith("Swapping is currently disabled");
        });

        it("Should only swap tokens if token one and token two are different", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, otherAccounts } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());
            const amount = 1*(10**2)*(10**6);

            await expect(swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenOneContractAddress, amount)).to.be.revertedWith("Tokens must be different");
        });

        it("Should only swap tokens if token one amount is greater than zero", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress, otherAccounts } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());

            await expect(swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenTwoContractAddress, 0)).to.be.revertedWith("Not enough token one amount");
        });

        it("Should only swap tokens if token one balance is sufficient", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress, otherAccounts } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());
            const amount = 1*(10**2)*(10**6);

            await expect(swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenTwoContractAddress, amount)).to.be.revertedWith("This address does not have enough tokens");
        });

        it("Should only swap tokens if token one pool has enough tokens", async function () {
            const { 
                swapContract, 
                swapContractAddress, 
                tokenOneContract, 
                tokenOneContractAddress, 
                tokenTwoContractAddress, 
                tokenOnePoolContract, 
                tokenOnePoolContractAddress, 
                tokenTwoPoolContract, 
                tokenTwoPoolContractAddress,
                otherAccounts
            } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());
            const amount = 1*(10**2)*(10**6);

            await tokenOneContract.mint(otherAccounts[1].address, amount);
            await tokenOneContract.connect(otherAccounts[1]).approve(swapContractAddress, amount);

            const tokenOnePoolContractDepositorRole = await tokenOnePoolContract.DEPOSITOR();
            const tokenOnePoolContractWithdrawerRole = await tokenOnePoolContract.WITHDRAWER();

            await tokenOnePoolContract.grantRole(tokenOnePoolContractDepositorRole, swapContractAddress);
            await tokenOnePoolContract.grantRole(tokenOnePoolContractWithdrawerRole, swapContractAddress);

            const tokenTwoPoolContractDepositorRole = await tokenTwoPoolContract.DEPOSITOR();
            const tokenTwoPoolContractWithdrawerRole = await tokenTwoPoolContract.WITHDRAWER();

            await tokenTwoPoolContract.grantRole(tokenTwoPoolContractDepositorRole, swapContractAddress);
            await tokenTwoPoolContract.grantRole(tokenTwoPoolContractWithdrawerRole, swapContractAddress);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);
            await swapContract.setTokenPoolAddress(tokenTwoContractAddress, tokenTwoPoolContractAddress);

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(tokenOneDecimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), tokenOneDecimals));

            let tokenTwoAmount = BigInt(BigInt(amount) * (BigInt(parsedTokenRatio)) / BigInt(10 ** tokenOneDecimals));

            const royaltyFeePercentage = await swapContract.royaltyFeePercentage();
            const royaltyFeeAmount = BigInt(tokenTwoAmount * royaltyFeePercentage) / BigInt(100 * (10 ** tokenOneDecimals));
            
            tokenTwoAmount = tokenTwoAmount - royaltyFeeAmount;

            await swapContract.setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio);

            await expect(swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenTwoContractAddress, amount)).to.be.revertedWith("The token one pool has not enough tokens to exchange");
        });

        it("Should emit Swapped event with right data when swapping tokens", async () => {
            const { 
                swapContract, 
                swapContractAddress, 
                tokenOneContract, 
                tokenOneContractAddress, 
                tokenTwoContract, 
                tokenTwoContractAddress, 
                tokenOnePoolContract, 
                tokenOnePoolContractAddress, 
                tokenTwoPoolContract, 
                tokenTwoPoolContractAddress,
                royaltyFeeWallet,
                owner, 
                otherAccounts
            } = await loadFixture(deployFixture);

            const tokenOneDecimals = Number(await tokenOneContract.decimals());
            const amount = 1*(10**2)*(10**6);

            await tokenOneContract.mint(owner.address, amount * 10**2);
            await tokenOneContract.approve(tokenOnePoolContractAddress, amount * 10**2);
            await tokenOnePoolContract.deposit(amount * 10**2);

            await tokenTwoContract.mint(owner.address, amount * 10**2);
            await tokenTwoContract.approve(tokenTwoPoolContractAddress, amount * 10**2);
            await tokenTwoPoolContract.deposit(amount * 10**2);

            await tokenOneContract.mint(otherAccounts[1].address, amount);
            await tokenOneContract.connect(otherAccounts[1]).approve(swapContractAddress, amount);

            const tokenOnePoolContractDepositorRole = await tokenOnePoolContract.DEPOSITOR();
            const tokenOnePoolContractWithdrawerRole = await tokenOnePoolContract.WITHDRAWER();

            await tokenOnePoolContract.grantRole(tokenOnePoolContractDepositorRole, swapContractAddress);
            await tokenOnePoolContract.grantRole(tokenOnePoolContractWithdrawerRole, swapContractAddress);

            const tokenTwoPoolContractDepositorRole = await tokenTwoPoolContract.DEPOSITOR();
            const tokenTwoPoolContractWithdrawerRole = await tokenTwoPoolContract.WITHDRAWER();

            await tokenTwoPoolContract.grantRole(tokenTwoPoolContractDepositorRole, swapContractAddress);
            await tokenTwoPoolContract.grantRole(tokenTwoPoolContractWithdrawerRole, swapContractAddress);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);
            await swapContract.setTokenPoolAddress(tokenTwoContractAddress, tokenTwoPoolContractAddress);

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(tokenOneDecimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), tokenOneDecimals));

            let tokenTwoAmount = BigInt(BigInt(amount) * (BigInt(parsedTokenRatio)) / BigInt(10 ** tokenOneDecimals));

            const royaltyFeePercentage = await swapContract.royaltyFeePercentage();
            const royaltyFeeAmount = BigInt(tokenTwoAmount * royaltyFeePercentage) / BigInt(100 * (10 ** tokenOneDecimals));
            
            tokenTwoAmount = tokenTwoAmount - royaltyFeeAmount;

            await swapContract.setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio);

            let currentTimestamp = (new Date()).getTime() / 1000;

            await swapContract.connect(otherAccounts[1]).swapTokens(tokenOneContractAddress, tokenOneDecimals, tokenTwoContractAddress, amount);

            const events = await swapContract.queryFilter(swapContract.filters.Swapped());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            const absoluteDifference = Math.abs(Number(latestEvent.args.date) - currentTimestamp);
            if(absoluteDifference <= 60) {
              currentTimestamp = Number(latestEvent.args.date);
            }

            expect(latestEvent.args.caller).to.equal(otherAccounts[1].address);
            expect(latestEvent.args.date).to.equal(currentTimestamp);
            expect(latestEvent.args.tokenOneAddress).to.equal(tokenOneContractAddress);
            expect(latestEvent.args.tokenTwoAddress).to.equal(tokenTwoContractAddress);
            expect(latestEvent.args.tokenOneAmount).to.equal(amount);
            expect(latestEvent.args.tokenTwoAmount).to.equal(tokenTwoAmount);
            expect(latestEvent.args.royaltyFeeAmount).to.equal(royaltyFeeAmount);
        });
    });

    describe("Withdraw Native Tokens", () => {
        it("Should withdraw native tokens successfully", async function () {
            const { swapContract, swapContractAddress, tokenOneContractAddress, owner } = await loadFixture(deployFixture);

            const ownerbalanceBefore = await ethers.provider.getBalance(owner.address);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: swapContractAddress,
                value: sendAmount,
            });
            const sendReceipt = await sendTx.wait();
            const sendTxGasUsed = sendReceipt ? sendReceipt.gasUsed * sendReceipt.gasPrice : 0;

            const withdrawTx = await swapContract.withdrawNativeTokens();
            const withdrawReceipt = await withdrawTx.wait();
            const withdrawTxGasUsed = withdrawReceipt ? withdrawReceipt.gasUsed * withdrawReceipt.gasPrice : 0;

            const totalGasUsed = BigInt(sendTxGasUsed) + BigInt(withdrawTxGasUsed);

            const ownerBalance = await ethers.provider.getBalance(owner.address);
            const expectedBalanceChange = ethers.parseUnits(((BigInt(ownerBalance) + BigInt(totalGasUsed)) - BigInt(ownerbalanceBefore)).toString(), "wei");
            const tokenContractBalance = ethers.parseUnits((await ethers.provider.getBalance(tokenOneContractAddress)).toString(), "wei");
            
            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(tokenContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw native tokens", async function () {
            const { swapContract, swapContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            await owner.sendTransaction({
                to: swapContractAddress,
                value: sendAmount,
            });
            await swapContract.withdrawNativeTokens();

            await expect(swapContract.connect(otherAccounts[0]).withdrawNativeTokens()).to.be.revertedWith("Only administrators are allowed to withdraw native tokens");
        });

        it("Should revert if the balance is zero when withdrawing native tokens", async function () {
            const { swapContract } = await loadFixture(deployFixture);

            await expect(swapContract.withdrawNativeTokens()).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Native Tokens Withdrawn event with right data when withdrawing native tokens", async () => {
            const { swapContract, swapContractAddress, tokenOneContractAddress, owner } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: swapContractAddress,
                value: sendAmount,
            });
            await sendTx.wait();

            await swapContract.withdrawNativeTokens();

            const events = await swapContract.queryFilter(swapContract.filters.NativeTokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(sendAmount));
        });
    });

    describe("Withdraw ERC20 Tokens", () => {
        it("Should withdraw ERC20 tokens successfully", async function () {
            const { swapContract, swapContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            const balanceBefore = await secondTokenContract.balanceOf(swapContractAddress);

            await secondTokenContract.transfer(swapContractAddress, amount);
            await swapContract.withdrawTokens(secondTokenContractAddress);

            const balance = await secondTokenContract.balanceOf(swapContractAddress);
            const expectedBalanceChange = ethers.parseUnits((BigInt(balance) - BigInt(balanceBefore)).toString(), "wei");
            const swapContractBalance = ethers.parseUnits((await ethers.provider.getBalance(swapContractAddress)).toString(), "wei");

            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(swapContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw ERC20 tokens", async function () {
            const { swapContract, swapContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);
            await secondTokenContract.transfer(swapContractAddress, amount);

            await expect(swapContract.connect(otherAccounts[0]).withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Only administrators are allowed to withdraw tokens");
        });

        it("Should revert if the token contract address is the zero address when withdrawing ERC20 tokens", async function () {
            const { swapContract } = await loadFixture(deployFixture);

            await expect(swapContract.withdrawTokens(ethers.ZeroAddress)).to.be.revertedWith("Token contract address cannot be the zero address"); 
        });


        it("Should revert if there are insufficient tokens to withdraw ERC20 tokens", async function () {
            const { swapContract } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            await expect(swapContract.withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Tokens Withdrawn event with right data when withdrawing ERC20 tokens", async () => {
            const { swapContract, swapContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            await secondTokenContract.transfer(swapContractAddress, amount);
            await swapContract.withdrawTokens(secondTokenContractAddress);

            const events = await swapContract.queryFilter(swapContract.filters.TokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.token).to.equal(secondTokenContractAddress);
            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
        });
    });

    describe("Set Swaping Enabled", () => {
        it("Should set swaping enabled successfully", async function () {
            const { swapContract } = await loadFixture(deployFixture);

            await swapContract.setSwapEnabled(false);
            expect(await swapContract.swapEnabled()).to.equal(false);

            await swapContract.setSwapEnabled(true);
            expect(await swapContract.swapEnabled()).to.equal(true);
        });

        it("Should only allow administrators to enable or disable swaping", async function () {
            const { swapContract, otherAccounts } = await loadFixture(deployFixture);

            await expect(swapContract.connect(otherAccounts[0]).setSwapEnabled(false)).to.be.revertedWith("Only administrators are allowed to set swap enabled or disabled");
        });

        it("Should emit Swaping Enabled event with right data when setting swaping enabled", async () => {
            const { swapContract } = await loadFixture(deployFixture);

            await swapContract.setSwapEnabled(false);

            const events = await swapContract.queryFilter(swapContract.filters.SwapEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.enabled).to.equal(false);
        });
    });

    describe("Set Token Pool Address", () => {
        it("Should set token pool address enabled successfully", async function () {
            const { swapContract, tokenOneContractAddress, tokenOnePoolContractAddress } = await loadFixture(deployFixture);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);

            expect(await swapContract.getTokenPoolAddress(tokenOneContractAddress)).to.equal(tokenOnePoolContractAddress);
        });

        it("Should only allow administrators to set token pool address", async function () {
            const { swapContract, tokenOneContractAddress, tokenOnePoolContractAddress, otherAccounts } = await loadFixture(deployFixture);

            await expect(swapContract.connect(otherAccounts[1]).setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress)).to.be.revertedWith("Only administrators are allowed to set the token pool address");
        });

        it("Should swap contract token allowance for token pool address set successfully to Max Uint256", async function () {
            const { swapContract, swapContractAddress, tokenOneContract, tokenOneContractAddress, tokenOnePoolContractAddress } = await loadFixture(deployFixture);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);

            expect(await tokenOneContract.allowance(swapContractAddress, tokenOnePoolContractAddress)).to.equal(MaxUint256);
        });

        it("Should emit Token Pool Address Changed event with right data when setting token pool", async () => {
            const { swapContract, tokenOneContractAddress, tokenOnePoolContractAddress } = await loadFixture(deployFixture);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);

            const events = await swapContract.queryFilter(swapContract.filters.TokenPoolAddressChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.tokenAddress).to.equal(tokenOneContractAddress);
            expect(latestEvent.args.tokenPoolAddress).to.equal(tokenOnePoolContractAddress);
        });
    });

    describe("Set Royalty Fee Percentage", () => {
        it("Should set interest rate enabled successfully", async function () {
            const { swapContract, tokenOneContract } = await loadFixture(deployFixture);

            const royaltyFeePercentage = (10 ** Number(await tokenOneContract.decimals())) / 5;
            await swapContract.setRoyaltyFeePercentage(royaltyFeePercentage);

            expect(await swapContract.royaltyFeePercentage()).to.equal(royaltyFeePercentage);
        });

        it("Should only allow administrators to set interest rate", async function () {
            const { swapContract, tokenOneContract, otherAccounts } = await loadFixture(deployFixture);

            const royaltyFeePercentage = (10 ** Number(await tokenOneContract.decimals())) / 5;

            await expect(swapContract.connect(otherAccounts[0]).setRoyaltyFeePercentage(royaltyFeePercentage)).to.be.revertedWith("Only administrators are allowed to set the royalty fee percentage");
        });

        it("Should emit Interest Rate Changed event with right data when setting interest rate", async () => {
            const { swapContract, tokenOneContract } = await loadFixture(deployFixture);

            const royaltyFeePercentage = (10 ** Number(await tokenOneContract.decimals())) / 5;
            await swapContract.setRoyaltyFeePercentage(royaltyFeePercentage);

            const events = await swapContract.queryFilter(swapContract.filters.RoyaltyFeePercentageChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.royaltyFeePercentage).to.equal(royaltyFeePercentage);
        });
    });

    describe("Set Token Ratio", () => {
        it("Should set token pool address enabled successfully", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress } = await loadFixture(deployFixture);

            const decimals = Number(await tokenOneContract.decimals());

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(decimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), decimals));

            await swapContract.setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio);

            expect(await swapContract.getTokenRatio(tokenOneContractAddress, tokenTwoContractAddress)).to.equal(parsedTokenRatio);
        });

        it("Should only allow administrators to set token pool address", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress, otherAccounts } = await loadFixture(deployFixture);

            const decimals = Number(await tokenOneContract.decimals());

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(decimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), decimals));

            await expect(swapContract.connect(otherAccounts[1]).setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio)).to.be.revertedWith("Only administrators are allowed to set the token ratio");
        });

        it("Should emit Token Ratio Changed event with right data when setting token ratio", async () => {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress } = await loadFixture(deployFixture);

            const decimals = Number(await tokenOneContract.decimals());

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(decimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), decimals));

            await swapContract.setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio);

            const events = await swapContract.queryFilter(swapContract.filters.TokenRatioChanged());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.tokenOneAddress).to.equal(tokenOneContractAddress);
            expect(latestEvent.args.tokenTwoAddress).to.equal(tokenTwoContractAddress);
            expect(latestEvent.args.tokenRatio).to.equal(parsedTokenRatio);
        });
    });

    describe("Get Token Ratio", () => {
        it("Should return token ratio successfully", async function () {
            const { swapContract, tokenOneContract, tokenOneContractAddress, tokenTwoContractAddress } = await loadFixture(deployFixture);

            const decimals = Number(await tokenOneContract.decimals());

            const tokenOnePrice = ethers.parseEther("0.1");
            const tokenTwoPrice = ethers.parseEther("0.05");

            let tokenRatio = (Number(tokenOnePrice) / Number(tokenTwoPrice)).toFixed(decimals);
            const parsedTokenRatio = Number(ethers.parseUnits(tokenRatio.toString(), decimals));

            await swapContract.setTokenRatio(tokenOneContractAddress, tokenTwoContractAddress, parsedTokenRatio);

            expect(Number(await swapContract.getTokenRatio(tokenOneContractAddress, tokenTwoContractAddress))).to.equal(parsedTokenRatio);
        });
    });  

    describe("Get Token Pool Address", () => {
        it("Should return token pool address successfully", async function () {
            const { swapContract, tokenOneContractAddress, tokenOnePoolContractAddress } = await loadFixture(deployFixture);

            await swapContract.setTokenPoolAddress(tokenOneContractAddress, tokenOnePoolContractAddress);

            expect(await swapContract.getTokenPoolAddress(tokenOneContractAddress)).to.equal(tokenOnePoolContractAddress);
        });
    });  
});