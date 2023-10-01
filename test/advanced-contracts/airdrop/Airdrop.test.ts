import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("Airdrop Contract", () => {
  async function deployFixture() {
    const [owner, ...otherAccounts] = await ethers.getSigners();

    const tokenContract = await ethers.deployContract("ERC20Contract");
    await tokenContract.waitForDeployment();
    const tokenContractAddress = await tokenContract.getAddress();

    const initialAirdropAmountPerAddress  = 1*(10**2)*(10**6);
    
    const exampleMerkleData = [[otherAccounts[0].address, initialAirdropAmountPerAddress], [otherAccounts[1].address, initialAirdropAmountPerAddress]];
    const exampleMerkleTree = StandardMerkleTree.of(exampleMerkleData, ["address", "uint256"]);
    const exampleMerkleRoot = exampleMerkleTree.root;
    const exampleMerkleProofs = {} as { [address: string]: string[] };

    for(let i = 0; i < exampleMerkleData.length; i++) {
      const currentMerkleProof = exampleMerkleTree.getProof(exampleMerkleData[i]);
      const currentAddress = exampleMerkleData[i][0];
      exampleMerkleProofs[currentAddress] = currentMerkleProof;
    }

    const airdropContract = await ethers.deployContract("Airdrop", [
      tokenContractAddress,
      owner.address,
      exampleMerkleRoot,
      initialAirdropAmountPerAddress
    ]);
    await airdropContract.waitForDeployment();
    const airdropContractAddress = await airdropContract.getAddress();

    return { airdropContract, airdropContractAddress, tokenContract, tokenContractAddress, exampleMerkleRoot, exampleMerkleProofs, owner, otherAccounts };
  }
  
  describe("Deposit", () => {
    it("Should deposit tokens successfully", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, owner } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);

      await airdropContract.deposit(amount);

      expect(Number(await airdropContract.airdropPoolBalance())).to.equal(amount);
      expect(Number(await tokenContract.balanceOf(airdropContractAddress))).to.equal(amount);
      expect(Number(await tokenContract.balanceOf(owner.address))).to.equal(0);
    });

    it("Should only allow administrators and authorized depositors to deposit", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      await tokenContract.mint(otherAccounts[0].address, amount);
      await tokenContract.connect(otherAccounts[0]).approve(airdropContractAddress, amount);
      const depositorRole = await airdropContract.DEPOSITOR();
      await airdropContract.grantRole(depositorRole, otherAccounts[0]);
      await airdropContract.connect(otherAccounts[0]).deposit(amount);

      await tokenContract.mint(otherAccounts[1].address, amount);
      await tokenContract.connect(otherAccounts[1]).approve(airdropContractAddress, amount);
      await expect(airdropContract.connect(otherAccounts[1]).deposit(amount)).to.be.revertedWith("Only administrators and authorized depositors are allowed to deposit tokens");
    });

    it("Should not allow depositing tokens if depositing is disabled", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, owner } = await loadFixture(deployFixture);
    
      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);

      await airdropContract.setDepositingEnabled(false);

      await expect(airdropContract.deposit(amount)).to.be.revertedWith("Depositing is currently disabled");
    });

    it("Should only allow depositing tokens greater than zero", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, owner } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);

      await expect(airdropContract.deposit(0)).to.be.revertedWith("Deposit amount must be greater than zero");
    });

    it("Should not allow depositing ERC20 tokens if the contract balance is zero", async () => {
      const { airdropContract } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await expect(airdropContract.deposit(amount)).to.be.revertedWith("Insufficient token balance, need more tokens to perform this deposit");
    });

    it("Should emit Deposited event with right data when depositing", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, owner } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);

      const airdropContractBalance = ethers.parseUnits((await tokenContract.balanceOf(airdropContractAddress)).toString(), "wei");

      await airdropContract.deposit(amount);

      const events = await airdropContract.queryFilter(airdropContract.filters.Deposited());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.depositor).to.equal(owner.address);
      expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
      expect(Number(latestEvent.args.airdropPoolBalance)).to.equal(Number(airdropContractBalance) + amount);
    });
  });
  
  describe("Claim", () => {
    it("Should claim tokens successfully", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, exampleMerkleProofs, owner, otherAccounts } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      const userProof = exampleMerkleProofs[otherAccounts[0].address];
      expect(await airdropContract.checkAirdropEligibility(otherAccounts[0].address, userProof)).to.equal(true);

      await airdropContract.connect(otherAccounts[0]).claim(userProof);
      const userBalance = await tokenContract.balanceOf(otherAccounts[0].address);
      const airdropAmountPerAddress = await airdropContract.airdropAmountPerAddress();
      expect(userBalance).to.equal(airdropAmountPerAddress);
    });

    it("Should not allow claiming tokens if claiming is disabled", async function () {
      const { airdropContract, airdropContractAddress, tokenContract, exampleMerkleProofs, owner, otherAccounts } = await loadFixture(deployFixture);
      
      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      const userProof = exampleMerkleProofs[otherAccounts[0].address];
      expect(await airdropContract.checkAirdropEligibility(otherAccounts[0].address, userProof)).to.equal(true);

      await airdropContract.setClaimingEnabled(false); 
      await expect(airdropContract.connect(otherAccounts[0]).claim(userProof)).to.be.revertedWith("Claiming is currently disabled");
    });

    it("Should not allow claiming tokens if address already claimed", async function () {
      const { airdropContract, airdropContractAddress, tokenContract, exampleMerkleProofs, owner, otherAccounts } = await loadFixture(deployFixture);
      
      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      const userProof = exampleMerkleProofs[otherAccounts[0].address];
      expect(await airdropContract.checkAirdropEligibility(otherAccounts[0].address, userProof)).to.equal(true);
      await airdropContract.connect(otherAccounts[0]).claim(userProof);

      await expect(airdropContract.connect(otherAccounts[0]).claim(userProof)).to.be.revertedWith("This address already claimed airdrop before");
    });

    it("Should not allow claiming tokens if insufficient tokens in the airdrop pool", async function () {
      const { airdropContract, exampleMerkleProofs, otherAccounts } = await loadFixture(deployFixture);

      const userProof = exampleMerkleProofs[otherAccounts[0].address];
      expect(await airdropContract.checkAirdropEligibility(otherAccounts[0].address, userProof)).to.equal(true);

      await expect(airdropContract.connect(otherAccounts[0]).claim(userProof)).to.be.revertedWith("Unable to claim airdrop, insufficient tokens in the airdrop pool");
    });

    it("Should not allow claiming tokens if not eligible", async function () {
      const { airdropContract, airdropContractAddress, tokenContract, owner, otherAccounts } = await loadFixture(deployFixture);
      
      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      await expect(airdropContract.connect(otherAccounts[2]).claim([])).to.be.revertedWith("You are not eligible for this airdrop");
    });

    it("Should emit Claimed event with right data when claiming", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, exampleMerkleProofs, owner, otherAccounts } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      const userProof = exampleMerkleProofs[otherAccounts[0].address];
      expect(await airdropContract.checkAirdropEligibility(otherAccounts[0].address, userProof)).to.equal(true);

      const airdropContractBalance = ethers.parseUnits((await tokenContract.balanceOf(airdropContractAddress)).toString(), "wei");
      const airdropAmountPerAddress = await airdropContract.airdropAmountPerAddress();
      let currentTimestamp = (new Date()).getTime() / 1000;

      await airdropContract.connect(otherAccounts[0]).claim(userProof);

      const events = await airdropContract.queryFilter(airdropContract.filters.Claimed());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      const absoluteDifference = Math.abs(Number(latestEvent.args.date) - currentTimestamp);
      if(absoluteDifference <= 60) {
        currentTimestamp = Number(latestEvent.args.date);
      }

      expect(latestEvent.args.receiver).to.equal(otherAccounts[0].address);
      expect(Number(latestEvent.args.date)).to.equal(currentTimestamp);
      expect(Number(latestEvent.args.airdropPoolBalance)).to.equal(Number(airdropContractBalance) - Number(airdropAmountPerAddress));
    });
  });

  describe("Withdraw Native Tokens", () => {
    it("Should withdraw native tokens successfully", async function () {
      const { airdropContract, airdropContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

      const balanceBefore = await ethers.provider.getBalance(owner.address);

      const sendAmount = ethers.parseEther("1");
      const sendTx = await owner.sendTransaction({
          to: airdropContractAddress,
          value: sendAmount,
      });
      const sendReceipt = await sendTx.wait();
      const sendTxGasUsed = sendReceipt ? sendReceipt.gasUsed * sendReceipt.gasPrice : 0;

      const withdrawTx = await airdropContract.withdrawNativeTokens();
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
      const { airdropContract, airdropContractAddress, owner, otherAccounts } = await loadFixture(deployFixture);

      const sendAmount = ethers.parseEther("1");
      await owner.sendTransaction({
          to: airdropContractAddress,
          value: sendAmount,
      });
      await airdropContract.withdrawNativeTokens();

      await expect(airdropContract.connect(otherAccounts[0]).withdrawNativeTokens()).to.be.revertedWith("Only administrators are allowed to withdraw native tokens");
    });

    it("Should revert if the balance is zero when withdrawing native tokens", async function () {
      const { airdropContract } = await loadFixture(deployFixture);

      await expect(airdropContract.withdrawNativeTokens()).to.be.revertedWith("Insufficient tokens to withdraw");
    });

    it("Should emit Native Tokens Withdrawn event with right data when withdrawing native tokens", async () => {
      const { airdropContract, airdropContractAddress, tokenContractAddress, owner } = await loadFixture(deployFixture);

      const sendAmount = ethers.parseEther("1");
      const sendTx = await owner.sendTransaction({
          to: airdropContractAddress,
          value: sendAmount,
      });
      await sendTx.wait();

      await airdropContract.withdrawNativeTokens();

      const events = await airdropContract.queryFilter(airdropContract.filters.NativeTokensWithdrawn());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.receiver).to.equal(owner.address);
      expect(Number(latestEvent.args.amount)).to.equal(Number(sendAmount));
    });
  });

  describe("Withdraw ERC20 Tokens", () => {
    it("Should withdraw ERC20 tokens successfully", async function () {
      const { airdropContract, airdropContractAddress, owner } = await loadFixture(deployFixture);

      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      const amount = 1*(10**2)*(10**6);
      await secondTokenContract.mint(owner.address, amount);

      const balanceBefore = await secondTokenContract.balanceOf(airdropContractAddress);

      await secondTokenContract.transfer(airdropContractAddress, amount);
      await airdropContract.withdrawTokens(secondTokenContractAddress);

      const balance = await secondTokenContract.balanceOf(airdropContractAddress);
      const expectedBalanceChange = ethers.parseUnits((BigInt(balance) - BigInt(balanceBefore)).toString(), "wei");
      const airdropContractBalance = ethers.parseUnits((await ethers.provider.getBalance(airdropContractAddress)).toString(), "wei");

      expect(Number(expectedBalanceChange)).to.equal(0);
      expect(Number(airdropContractBalance)).to.equal(0);
    });

    it("Should only allow administrators to withdraw ERC20 tokens", async function () {
      const { airdropContract, otherAccounts } = await loadFixture(deployFixture);
      
      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      await expect(airdropContract.connect(otherAccounts[0]).withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Only administrators are allowed to withdraw tokens");
    });

    it("Should revert if the token contract address is the zero address when withdrawing ERC20 tokens", async function () {
      const { airdropContract } = await loadFixture(deployFixture);

      await expect(airdropContract.withdrawTokens(ethers.ZeroAddress)).to.be.revertedWith("Token contract address cannot be the zero address"); 
    });

    it("Should revert if the token contract address is same as the airdrop token address", async function () {
      const { airdropContract, tokenContractAddress } = await loadFixture(deployFixture);

      await expect(airdropContract.withdrawTokens(tokenContractAddress)).to.be.revertedWith("Cannot withdraw the airdrop tokens");
    });

    it("Should revert if there are insufficient tokens to withdraw ERC20 tokens", async function () {
      const { airdropContract, } = await loadFixture(deployFixture);
      
      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      await expect(airdropContract.withdrawTokens(secondTokenContractAddress)).to.be.revertedWith("Insufficient tokens to withdraw");
    });

    it("Should emit Tokens Withdrawn event with right data when withdrawing ERC20 tokens", async () => {
      const { airdropContract, airdropContractAddress, owner } = await loadFixture(deployFixture);

      const secondTokenContract = await ethers.deployContract("ERC20Contract");
      await secondTokenContract.waitForDeployment();
      const secondTokenContractAddress = await secondTokenContract.getAddress();

      const amount = 1*(10**2)*(10**6);
      await secondTokenContract.mint(owner.address, amount);

      await secondTokenContract.transfer(airdropContractAddress, amount);
      await airdropContract.withdrawTokens(secondTokenContractAddress);

      const events = await airdropContract.queryFilter(airdropContract.filters.TokensWithdrawn());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.token).to.equal(secondTokenContractAddress);
      expect(latestEvent.args.receiver).to.equal(owner.address);
      expect(Number(latestEvent.args.amount)).to.equal(Number(amount));
    });
  });

  describe("Check Eligibility", () => {
    it("Should check eligibility successfully", async () => {
      const { airdropContract, airdropContractAddress, tokenContract, exampleMerkleProofs, owner, otherAccounts } = await loadFixture(deployFixture);

      const amount = 1*(10**2)*(10**6);
      await tokenContract.mint(owner.address, amount);
      await tokenContract.approve(airdropContractAddress, amount);
      await airdropContract.deposit(amount);

      const userProof = exampleMerkleProofs[otherAccounts[0].address];
      expect(await airdropContract.checkAirdropEligibility(otherAccounts[0].address, userProof)).to.equal(true);
    });
  });

  describe("Set Claiming Enabled", () => {
    it("Should enable or disable claiming successfully", async () => {
      const { airdropContract } = await loadFixture(deployFixture);

      await airdropContract.setClaimingEnabled(true);
      expect(await airdropContract.claimingEnabled()).to.equal(true);

      await airdropContract.setClaimingEnabled(false);
      expect(await airdropContract.claimingEnabled()).to.equal(false);
    });

    it("Should only allow administrators to enable or disable claiming", async () => {
      const { airdropContract, otherAccounts } = await loadFixture(deployFixture);

      await airdropContract.setClaimingEnabled(false);
      expect(await airdropContract.claimingEnabled()).to.equal(false);

      await expect(airdropContract.connect(otherAccounts[0]).setClaimingEnabled(true)).to.be.revertedWith("Only administrators are authorized to enable or disable claiming");
    });

    it("Should emit Claiming Enabled event with right data when setting claiming enabled", async () => {
      const { airdropContract } = await loadFixture(deployFixture);

      await airdropContract.setClaimingEnabled(false);

      const events = await airdropContract.queryFilter(airdropContract.filters.ClaimingEnabled());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.enabled).to.equal(false);
    });
  });

  describe("Set Depositing Enabled", () => {
    it("Should enable or disable depositing successfully", async () => {
      const { airdropContract } = await loadFixture(deployFixture);

      await airdropContract.setDepositingEnabled(true);
      expect(await airdropContract.depositingEnabled()).to.equal(true);

      await airdropContract.setDepositingEnabled(false);
      expect(await airdropContract.depositingEnabled()).to.equal(false);
    });

    it("Should only allow administrators to enable or disable depositing", async () => {
      const { airdropContract, otherAccounts } = await loadFixture(deployFixture);

      await expect(airdropContract.connect(otherAccounts[0]).setDepositingEnabled(false)).to.be.revertedWith("Only administrators are authorized to enable or disable depositing");
    });

    it("Should emit Depositing Enabled event with right data when setting depositing enabled", async () => {
      const { airdropContract } = await loadFixture(deployFixture);

      await airdropContract.setDepositingEnabled(false);

      const events = await airdropContract.queryFilter(airdropContract.filters.DepositingEnabled());
      expect(events.length).to.be.greaterThan(0);
      const latestEvent = events[events.length - 1];

      expect(latestEvent.args.enabled).to.equal(false);
    });
  });
});