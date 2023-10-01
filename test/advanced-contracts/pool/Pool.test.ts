import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Pool Contract", () => {
    async function deployFixture() {
        const [owner, ...otherAccounts] = await ethers.getSigners();

        const tokenContract = await ethers.deployContract("ERC20Contract");
        await tokenContract.waitForDeployment();
        const tokenContractAddress = await tokenContract.getAddress();

        const poolContract = await ethers.deployContract("Pool", [tokenContractAddress]);
        await poolContract.waitForDeployment();
        const poolContractAddress = await poolContract.getAddress();

        return { poolContract, poolContractAddress, tokenContract, tokenContractAddress, owner, otherAccounts };
    }

    describe("Deposit", () => {
        it("Should deposit tokens successfully", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            const poolBalanceBefore = Number(await poolContract.poolBalance());
        
            await poolContract.deposit(amount);
      
            expect(Number(await poolContract.poolBalance())).to.equal(poolBalanceBefore + amount);
            expect(Number(await tokenContract.balanceOf(owner.address))).to.equal(0);
        });

        it("Should only allow administrators and authorized depositors to deposit", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.deposit(amount);
            
            const depositorRole = await poolContract.DEPOSITOR();
            await poolContract.grantRole(depositorRole, otherAccounts[0].address);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(poolContract, amount);

            await poolContract.connect(otherAccounts[0]).deposit(amount);
      
            await expect(poolContract.connect(otherAccounts[1]).deposit(amount)).to.be.revertedWith("Only administrators and authorized depositors are allowed to deposit tokens");
        });

        it("Should only allow deposits if depositing is enabled", async () => {
            const { poolContract, tokenContract, owner } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.setDepositingEnabled(false);
      
            await expect(poolContract.deposit(amount)).to.be.revertedWith("Depositing is currently disabled");
        });

        it("Should only allow deposits if the deposit amount is greater than zero", async () => {
            const { poolContract } = await loadFixture(deployFixture);
        
            await expect(poolContract.deposit(0)).to.be.revertedWith("Deposit amount must be greater than zero");
        });

        it("Should only allow deposits if the token balance is sufficient", async () => {
            const { poolContract } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);

            await expect(poolContract.deposit(amount)).to.be.revertedWith("Token balance is insufficient for the desired deposit");
        });

        it("Should emit Deposited event with right data when depositing", async () => {
            const { poolContract, tokenContract, owner } = await loadFixture(deployFixture);

            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            const poolBalanceBefore = Number(await poolContract.poolBalance());

            await poolContract.deposit(amount);

            const events = await poolContract.queryFilter(poolContract.filters.Deposited());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
        
            expect(latestEvent.args.depositor).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.poolBalance)).to.equal(poolBalanceBefore + amount);
        });
    });

    describe("Withdraw", () => {
        it("Should withdraw tokens successfully", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.deposit(amount);

            const poolBalanceBefore = Number(await poolContract.poolBalance());
            
            await poolContract.withdraw(otherAccounts[0].address, amount);
      
            expect(Number(await poolContract.poolBalance())).to.equal(poolBalanceBefore - amount);
            expect(Number(await tokenContract.balanceOf(otherAccounts[0].address))).to.equal(amount);
        });

        it("Should only allow administrators and authorized depositors to deposit", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.deposit(amount);
            
            const depositorRole = await poolContract.DEPOSITOR();
            await poolContract.grantRole(depositorRole, otherAccounts[0].address);
            await tokenContract.mint(otherAccounts[0].address, amount);
            await tokenContract.connect(otherAccounts[0]).approve(poolContract, amount);

            await poolContract.connect(otherAccounts[0]).deposit(amount);
      
            await expect(poolContract.connect(otherAccounts[1]).deposit(amount)).to.be.revertedWith("Only administrators and authorized depositors are allowed to deposit tokens");
        });

        it("Should only allow administrators and authorized withdrawers to withdraw", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);
            await poolContract.deposit(amount);
            await poolContract.withdraw(otherAccounts[0].address, amount);

            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);
            await poolContract.deposit(amount);
            
            const withdrawerRole = await poolContract.WITHDRAWER();
            await poolContract.grantRole(withdrawerRole, otherAccounts[0].address);
            await poolContract.connect(otherAccounts[0]).withdraw(otherAccounts[0].address, amount);

            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);
            await poolContract.deposit(amount);
      
            await expect(poolContract.connect(otherAccounts[1]).withdraw(otherAccounts[1].address, amount)).to.be.revertedWith("Only administrators and authorized withdrawers are allowed to withdraw tokens");
        });

        it("Should only allow withdrawals if the wallet address is not the zero address", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.deposit(amount);

            await expect(poolContract.withdraw(ethers.ZeroAddress, amount)).to.be.revertedWith("Withdraw address cannot be the zero address");
        });

        it("Should only allow withdrawals if the withdrawal amount is greater than zero", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.deposit(amount);

            await expect(poolContract.withdraw(otherAccounts[0].address, 0)).to.be.revertedWith("Withdraw amount must be greater than zero");
        });

        it("Should only allow withdrawals if the token balance is sufficient", async () => {
            const { poolContract, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await expect(poolContract.withdraw(otherAccounts[0].address, amount)).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Withdrawn event with right data when withdrawing", async () => {
            const { poolContract, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
        
            const amount = 1*(10**2)*(10**6);
            await tokenContract.mint(owner.address, amount);
            await tokenContract.approve(poolContract, amount);

            await poolContract.deposit(amount);

            const poolBalanceBefore = Number(await poolContract.poolBalance());

            await poolContract.withdraw(otherAccounts[0].address, amount);

            const events = await poolContract.queryFilter(poolContract.filters.Withdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];
        
            expect(latestEvent.args.receiver).to.equal(otherAccounts[0].address);
            expect(Number(latestEvent.args.amount)).to.equal(amount);
            expect(Number(latestEvent.args.poolBalance)).to.equal(poolBalanceBefore - amount);
        });
    });

    describe("Withdraw Native Tokens", () => {
        it("Should withdraw native tokens successfully", async function () {
            const { poolContract, poolContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

            const ownerbalanceBefore = await ethers.provider.getBalance(owner.address);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: poolContractAddress,
                value: sendAmount,
            });
            const sendReceipt = await sendTx.wait();
            const sendTxGasUsed = sendReceipt ? sendReceipt.gasUsed * sendReceipt.gasPrice : 0;

            const withdrawTx = await poolContract.withdrawNativeTokens();
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
            const { poolContract, poolContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            await owner.sendTransaction({
                to: poolContractAddress,
                value: sendAmount,
            });
            await poolContract.withdrawNativeTokens();

            await expect(poolContract.connect(otherAccounts[0]).withdrawNativeTokens()).to.be.revertedWith("Only administrators are allowed to withdraw native tokens");
        });

        it("Should revert if the balance is zero when withdrawing native tokens", async function () {
            const { poolContract } = await loadFixture(deployFixture);

            await expect(poolContract.withdrawNativeTokens()).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should emit Native Tokens Withdrawn event with right data when withdrawing native tokens", async () => {
            const { poolContract, poolContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

            const sendAmount = ethers.parseEther("1");
            const sendTx = await owner.sendTransaction({
                to: poolContractAddress,
                value: sendAmount,
            });
            await sendTx.wait();

            await poolContract.withdrawNativeTokens();

            const events = await poolContract.queryFilter(poolContract.filters.NativeTokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(sendAmount));
        });
    });

    describe("Withdraw ERC20 Tokens", () => {
        it("Should withdraw ERC20 tokens successfully", async function () {
            const { poolContract, poolContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            const balanceBefore = await secondTokenContract.balanceOf(poolContractAddress);

            await secondTokenContract.transfer(poolContractAddress, amount);
            await poolContract.withdrawTokens(secondTokenContractAddress);

            const balance = await secondTokenContract.balanceOf(poolContractAddress);
            const expectedBalanceChange = ethers.parseUnits((BigInt(balance) - BigInt(balanceBefore)).toString(), "wei");
            const poolContractBalance = ethers.parseUnits((await ethers.provider.getBalance(poolContractAddress)).toString(), "wei");

            expect(Number(expectedBalanceChange)).to.equal(0);
            expect(Number(poolContractBalance)).to.equal(0);
        });

        it("Should only allow administrators to withdraw ERC20 tokens", async function () {
            const { poolContract, poolContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            await secondTokenContract.transfer(poolContractAddress, amount);

            await expect(poolContract.connect(otherAccounts[0]).withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Only administrators are allowed to withdraw tokens");
        });

        it("Should revert if the token contract address is the zero address when withdrawing ERC20 tokens", async function () {
            const { poolContract } = await loadFixture(deployFixture);

            await expect(poolContract.withdrawTokens(ethers.ZeroAddress)).to.be.revertedWith("Token contract address cannot be the zero address"); 
        });

        it("Should revert if there are insufficient tokens to withdraw ERC20 tokens", async function () {
            const { poolContract } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            await expect(poolContract.withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Insufficient tokens to withdraw");
        });

        it("Should revert if the token contract address is same as the pool token address", async function () {
          const { poolContract, tokenContractAddress } = await loadFixture(deployFixture);
    
          await expect(poolContract.withdrawTokens(tokenContractAddress)).to.be.revertedWith("Cannot withdraw the pool tokens");
        });

        it("Should emit Tokens Withdrawn event with right data when withdrawing ERC20 tokens", async () => {
            const { poolContract, poolContractAddress, owner } = await loadFixture(deployFixture);
      
            const secondTokenContract = await ethers.deployContract("ERC20Contract");
            await secondTokenContract.waitForDeployment();
            const secondTokenContractAddress = await secondTokenContract.getAddress();

            const amount = 1*(10**2)*(10**6);
            await secondTokenContract.mint(owner.address, amount);

            await secondTokenContract.transfer(poolContractAddress, amount);
            await poolContract.withdrawTokens(secondTokenContractAddress);

            const events = await poolContract.queryFilter(poolContract.filters.TokensWithdrawn());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.token).to.equal(secondTokenContractAddress);
            expect(latestEvent.args.receiver).to.equal(owner.address);
            expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
        });
    });

    describe("Set Depositing Enabled", () => {
        it("Should set depositing enabled successfully", async function () {
            const { poolContract } = await loadFixture(deployFixture);

            await poolContract.setDepositingEnabled(false);
            expect(await poolContract.depositingEnabled()).to.equal(false);

            await poolContract.setDepositingEnabled(true);
            expect(await poolContract.depositingEnabled()).to.equal(true);
        });

        it("Should only allow administrators to enable or disable depositing", async function () {
            const { poolContract, otherAccounts } = await loadFixture(deployFixture);

            await expect(poolContract.connect(otherAccounts[0]).setDepositingEnabled(false)).to.be.revertedWith("Only administrators are allowed to set depositing enabled or disabled");
        });

        it("Should emit Depositing Enabled event with right data when setting depositing enabled", async () => {
            const { poolContract } = await loadFixture(deployFixture);

            await poolContract.setDepositingEnabled(false);

            const events = await poolContract.queryFilter(poolContract.filters.DepositingEnabled());
            expect(events.length).to.be.greaterThan(0);
            const latestEvent = events[events.length - 1];

            expect(latestEvent.args.enabled).to.equal(false);
        });
    });
});