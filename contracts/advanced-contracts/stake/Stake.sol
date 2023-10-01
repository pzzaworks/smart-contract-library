// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Stake Contract
 * @notice This contract allows users to stake tokens and earn rewards based on the interest rate
 * @dev Berke (pzzaworks) - pzza.works
 */
contract Stake is AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");

    address private immutable tokenAddress;
    uint256 private immutable tokenDecimals;

    struct StakedToken {        
        uint256 date;
        uint256 interestRate;
        uint256 amount; 
        bool staked;       
    }

    uint256 public totalStakerCount;
    uint256 public totalStakedTokenAmount;
    uint256 public rewardTokenPoolBalance;
    uint256 public interestRate;

    bool public stakingEnabled;
    bool public unstakingEnabled;

    mapping(address => StakedToken) private stakedTokens;

    event StakingEnabled(bool enabled);
    event UnstakingEnabled(bool enabled);
    event InterestRateChanged(uint256 interestRate);
    event Staked(address indexed staker, uint256 date, uint256 amount, uint256 totalStakerCount, uint256 totalStakedTokenAmount);
    event Unstaked(address indexed staker, uint256 date, uint256 amount, uint256 totalStakerCount, uint256 totalStakedTokenAmount);
    event RewardTokensDeposited(address indexed depositor, uint256 amount, uint256 rewardTokenPoolBalance);
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);

    receive() external payable {}
    fallback() external payable {}
    
    /**
     * @notice Constructor for initializing the contract
     * @param initialTokenAddress The ERC20 token contract address
     * @param initialTokenDecimals The ERC20 token decimals
     * @param initialInterestRate The initial interest rate
     */
    constructor(address initialTokenAddress, uint256 initialTokenDecimals, uint256 initialInterestRate) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);
        
        tokenAddress = initialTokenAddress;        
        tokenDecimals = initialTokenDecimals;
        interestRate = initialInterestRate;
        stakingEnabled = true;
        unstakingEnabled = true;
    }    

    /**
     * @notice Deposit reward tokens into the pool
     * @param amount The amount of reward tokens to deposit
     */
    function depositRewardTokens(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to deposit reward tokens");
        require(amount > 0, "Deposit amount must be greater than zero");

        IERC20 token = IERC20(tokenAddress);
        
        uint256 balance = token.balanceOf(msg.sender); 
        require(balance >= amount, "Token balance is insufficient for the desired deposit");

        rewardTokenPoolBalance += amount;

        emit RewardTokensDeposited(msg.sender, amount, rewardTokenPoolBalance);

        bool depositedSuccessfully = token.transferFrom(msg.sender, address(this), amount);
        require(depositedSuccessfully, "Deposit reward tokens failed");
    }

    /**
     * @notice Stake tokens
     * @param amount The amount of tokens to stake
     */
    function stake(uint256 amount) public {
        require(stakingEnabled, "Staking is currently disabled");
        require(amount > 0, "Stake amount must be greater than zero");
        require(!stakedTokens[msg.sender].staked, "This address already staked tokens");

        IERC20 token = IERC20(tokenAddress);

        uint256 balance = token.balanceOf(address(msg.sender)); 
        require(balance >= amount, "This address does not have enough tokens");

        totalStakerCount += 1;
        totalStakedTokenAmount += amount;

        stakedTokens[msg.sender] = StakedToken({                
            date: block.timestamp,
            interestRate: interestRate,
            amount: amount,
            staked: true
        });

        emit Staked(msg.sender, block.timestamp, amount, totalStakerCount, totalStakedTokenAmount);

        bool stakedSuccessfully = token.transferFrom(msg.sender, address(this), amount);
        require(stakedSuccessfully, "Stake failed");
    }    

    /**
     * @notice Unstake tokens and claim rewards
     */
    function unstake() public {
        require(unstakingEnabled, "Unstaking is currently disabled");
        require(stakedTokens[msg.sender].staked, "This address did not stake tokens yet");
        require(stakedTokens[msg.sender].amount > 0, "This address did not stake any tokens before");

        IERC20 token = IERC20(tokenAddress);

        uint256 balance = token.balanceOf(address(this)); 
        require(balance >= stakedTokens[msg.sender].amount && totalStakedTokenAmount >= stakedTokens[msg.sender].amount, "Insufficient tokens to unstake");

        uint256 stakeAmount = stakedTokens[msg.sender].amount;
        uint256 stakerInterestRate = stakedTokens[msg.sender].interestRate;

        uint256 rewardAmount = (stakeAmount * stakerInterestRate) / (100 * (10 ** tokenDecimals));
        
        totalStakerCount -= 1;
        totalStakedTokenAmount -= stakeAmount;
        stakedTokens[msg.sender].staked = false;

        require(rewardTokenPoolBalance >= rewardAmount, "Insufficient reward tokens to claim");

        rewardTokenPoolBalance -= rewardAmount;

        emit Unstaked(msg.sender, block.timestamp, stakeAmount, totalStakerCount, totalStakedTokenAmount);

        bool unstakedSuccessfully = token.transfer(msg.sender, stakeAmount);
        require(unstakedSuccessfully, "Unstake failed");
        
        bool claimedSuccessfully = token.transfer(msg.sender, rewardAmount); 
        require(claimedSuccessfully, "Claim reward failed");
    }

    /**
     * @notice Withdraw native tokens
     */
    function withdrawNativeTokens() public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw native tokens");

        uint256 balance = address(this).balance;
        require(balance > 0, "Insufficient tokens to withdraw");

        emit NativeTokensWithdrawn(msg.sender, balance);
    
        (bool nativeTokensWithdrawnSuccessfully, ) = payable(msg.sender).call{value: balance}("");
        require(nativeTokensWithdrawnSuccessfully, "Withdraw native tokens failed");
    }
        
    /**
     * @notice Withdraw ERC20 tokens from the contract
     * @param tokenToWithdrawAddress The ERC20 token address to withdraw
     */
    function withdrawTokens(address tokenToWithdrawAddress) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw tokens");
        require(tokenToWithdrawAddress != address(0), "Token contract address cannot be the zero address");
        require(tokenToWithdrawAddress != tokenAddress, "Cannot withdraw the staked tokens");

        IERC20 tokenToWithdraw = IERC20(tokenToWithdrawAddress);
        
        uint256 balance = tokenToWithdraw.balanceOf(address(this)); 
        require(balance > 0, "Insufficient tokens to withdraw");

        emit TokensWithdrawn(tokenToWithdrawAddress, msg.sender, balance);

        bool tokensWithdrawnSuccessfully = tokenToWithdraw.transfer(msg.sender, balance);
        require(tokensWithdrawnSuccessfully, "Withdraw tokens failed");
    }
    
    /**
     * @notice Set the interest rate
     * @param newInterestRate The new interest rate
     */
    function setInterestRate(uint256 newInterestRate) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set the interest rate");

        interestRate = newInterestRate;
        
        emit InterestRateChanged(newInterestRate);
    }

    /**
     * @notice Set staking enabled
     * @param enabled Whether staking is enabled or not
     */
    function setStakingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set staking enabled or disabled");
        
        stakingEnabled = enabled;
        
        emit StakingEnabled(enabled);
    }

    /**
     * @notice Set unstaking enabled
     * @param enabled Whether unstaking is enabled or not
     */
    function setUnstakingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set unstaking enabled or disabled");
        
        unstakingEnabled = enabled;
        
        emit UnstakingEnabled(enabled);
    }

    /**
     * @notice Get staked tokens for a user
     * @param user The address of the user
     * @return The staked tokens for the user
     */
    function getStakedToken(address user) public view returns (StakedToken memory) {
        return stakedTokens[user];
    }
}