import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("ERC20 Contract", () => {
  async function deployFixture() {
    const [owner, ...otherAccounts] = await ethers.getSigners();

    const tokenContract = await ethers.deployContract("ERC20Contract");
    await tokenContract.waitForDeployment();
    const tokenContractAddress = await tokenContract.getAddress();
    
    return { tokenContract, tokenContractAddress, owner, otherAccounts };
  }

  describe("Mint", () => {
    it("Should mint tokens successfully", async () => {
      const { tokenContract, owner } = await loadFixture(deployFixture);
      
      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);

      expect(Number(await tokenContract.balanceOf(owner.address))).to.equal(amount);
    });
      
    it("Should only allow administrators or authorized minters to mint tokens", async () => {
      const { tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);

      const minterRole = await tokenContract.MINTER();
      await tokenContract.grantRole(minterRole, otherAccounts[0].address)
      await tokenContract.connect(otherAccounts[0]).mint(otherAccounts[0].address, amount);

      await expect(tokenContract.connect(otherAccounts[1]).mint(otherAccounts[1].address, amount)).to.be.rejectedWith("Only administrators and authorized minters are allowed to mint tokens");
    });

    it("Should not allow minting from the zero address", async () => {
      const { tokenContract } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await expect(tokenContract.mint(ethers.ZeroAddress, amount)).to.be.rejectedWith("Mint address cannot be the zero address");
    });

    it("Should not allow minting of zero amount", async () => {
      const { tokenContract, owner } = await loadFixture(deployFixture);

      await expect(tokenContract.mint(owner.address, 0)).to.be.rejectedWith("Mint amount must be greater than zero");
    });

    it("Should not allow minting that would exceed the maximum supply", async () => {
      const { tokenContract, owner } = await loadFixture(deployFixture);

      const maxSupply = Number(await tokenContract.maxSupply());
      await tokenContract.mint(owner.address, maxSupply);

      await expect(tokenContract.mint(owner.address, 1)).to.be.rejectedWith("Maximum token supply exceeded");
    });

    it("Should emit Tokens Minted event with right data when minting", async () => {
      const { tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(otherAccounts[0].address, amount);

      const events = await tokenContract.queryFilter(tokenContract.filters.TokensMinted());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.minter).to.equal(owner.address);
      expect(latestEvent.args.receiver).to.equal(otherAccounts[0].address);
      expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
    });
  });

  describe("Withdraw Native Tokens", () => {
    it("Should withdraw native tokens successfully", async function () {
      const { tokenContract, tokenContractAddress, owner } = await loadFixture(deployFixture);

      const ownerbalanceBefore = await ethers.provider.getBalance(owner.address);

      const sendAmount = ethers.parseEther("1");
      const sendTx = await owner.sendTransaction({
          to: tokenContractAddress,
          value: sendAmount,
      });
      const sendReceipt = await sendTx.wait();
      const sendTxGasUsed = sendReceipt ? sendReceipt.gasUsed * sendReceipt.gasPrice : 0;

      const withdrawTx = await tokenContract.withdrawNativeTokens();
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
      const { tokenContract, tokenContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

      const sendAmount = ethers.parseEther("1");
      await owner.sendTransaction({
          to: tokenContractAddress,
          value: sendAmount,
      });
      await tokenContract.withdrawNativeTokens();

      await expect(tokenContract.connect(otherAccounts[0]).withdrawNativeTokens()).to.be.revertedWith("Only administrators are allowed to withdraw native tokens");
    });

    it("Should revert if the balance is zero to withdraw native tokens", async function () {
      const { tokenContract } = await loadFixture(deployFixture);

      await expect(tokenContract.withdrawNativeTokens()).to.be.revertedWith("Insufficient tokens to withdraw");
    });

    it("Should emit Native Tokens Withdrawn event with right data when withdrawing native tokens", async () => {
      const { tokenContract, tokenContractAddress, owner } = await loadFixture(deployFixture);

      const sendAmount = ethers.parseEther("1");
      await owner.sendTransaction({
          to: tokenContractAddress,
          value: sendAmount,
      });
      await tokenContract.withdrawNativeTokens();

      const events = await tokenContract.queryFilter(tokenContract.filters.NativeTokensWithdrawn());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.receiver).to.equal(owner.address);
      expect(Number(latestEvent.args.amount)).to.equal(Number(sendAmount));
    });
  });

  describe("Withdraw ERC20 Tokens", () => {
    it("Should withdraw ERC20 tokens successfully", async function () {
      const { tokenContract, tokenContractAddress, owner } = await loadFixture(deployFixture);

      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      const amount = 1*(10**2)*(10**6);
      await secondTokenContract.mint(owner.address, amount);

      const ownerbalanceBefore = await secondTokenContract.balanceOf(tokenContractAddress);

      await secondTokenContract.transfer(tokenContractAddress, amount);
      await tokenContract.withdrawTokens(secondTokenContractAddress);

      const ownerBalance = await secondTokenContract.balanceOf(tokenContractAddress);
      const expectedBalanceChange = ethers.parseUnits((BigInt(ownerBalance) - BigInt(ownerbalanceBefore)).toString(), "wei");
      const tokenContractBalance = ethers.parseUnits((await ethers.provider.getBalance(tokenContractAddress)).toString(), "wei");

      expect(Number(expectedBalanceChange)).to.equal(0);
      expect(Number(tokenContractBalance)).to.equal(0);
    });

    it("Should only allow administrators to withdraw ERC20 tokens", async function () {
      const { tokenContract, tokenContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      const amount = 1*(10**2)*(10**6);
      await secondTokenContract.mint(owner.address, amount);
      await secondTokenContract.transfer(tokenContractAddress, amount);
      await tokenContract.withdrawTokens(secondTokenContractAddress);

      await secondTokenContract.mint(owner.address, amount);
      await secondTokenContract.transfer(tokenContractAddress, amount);

      await expect(tokenContract.connect(otherAccounts[0]).withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Only administrators are allowed to withdraw tokens");
    });

    it("Should revert if the token contract address is the zero address when attempting to withdraw ERC20 tokens", async function () {
      const { tokenContract } = await loadFixture(deployFixture);

      await expect(tokenContract.withdrawTokens(ethers.ZeroAddress)).to.be.revertedWith("Token contract address cannot be the zero address"); 
    });

    it("Should revert if there are insufficient tokens to withdraw ERC20 tokens", async function () {
      const { tokenContract } = await loadFixture(deployFixture);

      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();
    
      await expect(tokenContract.withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Insufficient tokens to withdraw");
    });

    it("Should emit Tokens Withdrawn event with right data when withdrawing ERC20 tokens", async () => {
      const { tokenContract, tokenContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      const amount = 1*(10**2)*(10**6);
      await secondTokenContract.mint(owner.address, amount);
      await secondTokenContract.transfer(tokenContractAddress, amount);
      await tokenContract.withdrawTokens(secondTokenContractAddress);

      const events = await tokenContract.queryFilter(tokenContract.filters.TokensWithdrawn());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.token).to.equal(secondTokenContractAddress);
      expect(latestEvent.args.receiver).to.equal(owner.address);
      expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
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

  describe("Decimals", () => {
    it("Should return decimals successfully", async () => {
      const { tokenContract } = await loadFixture(deployFixture);

      expect(Number(await tokenContract.decimals())).to.equal(6);
    });
  });

  describe("Maximum Supply", () => {
    it("Should return the maximum supply successfully", async () => {
      const { tokenContract } = await loadFixture(deployFixture);

      expect(Number(await tokenContract.maxSupply())).to.equal(1*(10**6)*(10**6));
    });
  });
});
