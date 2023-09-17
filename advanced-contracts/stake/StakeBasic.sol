// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import IERC20 and Ownable from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// @dev Interface for the Stake Reward Pool contract
interface IStakeRewardPool {
    function claimReward(address receiver, uint256 amount) external;
}

contract StakeBasic is Ownable {
    // @dev Token contract interface
    IERC20 immutable private token;
    
    // @dev Stake Reward Pool contract interface
    IStakeRewardPool immutable private stakeRewardPool;

    // @dev Struct representing a staked token
    struct StakedToken {        
        uint256 date;
        uint256 interestRate;
        uint256 amount; 
        bool staked;       
    }

    // @dev Total count of stakers
    uint256 public totalStakerCount;

    // @dev Total amount of staked tokens
    uint256 public totalStakedTokenAmount;

    // @dev Interest rate for staking rewards
    uint256 public interestRate;

    // @dev Enable/disable staking
    bool public stakingEnabled = false;

    // @dev Enable/disable unstaking;
    bool public unstakingEnabled = false;

    // @dev Mapping to store staked tokens for each address
    mapping(address => StakedToken) public stakedTokens;

    // @dev Event emitted when staking is enabled or disabled
    event StakingEnabled(bool enabled);

    // @dev Event emitted when unstaking is enabled or disabled
    event UnstakingEnabled(bool enabled);

    // @dev Event emitted when the interest rate is changed
    event InterestRateChanged(uint256 newInterestRate);

    // @dev Event emitted when tokens are staked
    event Staked(address indexed staker, uint256 date, uint256 amount, uint256 totalStakerCount, uint256 totalStakedTokenAmount);

    // @dev Event emitted when tokens are unstaked
    event Unstaked(address indexed staker, uint256 date, uint256 amount, uint256 totalStakerCount, uint256 totalStakedTokenAmount);
    
    // @dev Constructor function that sets the token contract, stake reward pool contract and initial interest rate for the pool
    constructor(IERC20 tokenContract, IStakeRewardPool stakeRewardPoolContract, uint256 initialInterestRate) {
        token = tokenContract;        
        stakeRewardPool = stakeRewardPoolContract;
        interestRate = initialInterestRate;
    }    

    // @dev Function to stake tokens
    function stake(uint256 amount) public {
        // @dev Check if staking is currently enabled
        require(stakingEnabled, "Staking is currently disabled");

        // @dev Check if the stake amount is greater than zero
        require(amount > 0, "Stake amount must be greater than zero");

        // @dev Check if tokens are not already staked by the address
        require(!stakedTokens[msg.sender].staked, "This address already staked tokens");

        // @dev Check if the address has enough tokens to stake
        uint256 balance = token.balanceOf(address(msg.sender)); 
        require(balance >= amount, "This address doesn't have enough tokens");

        // @dev Increment the total staker count
        totalStakerCount += 1;

        // @dev Increase the total staked token amount
        totalStakedTokenAmount += amount;

        // @dev Store staked token information for the sender's address
        stakedTokens[msg.sender] = StakedToken({                
            date: block.timestamp,
            interestRate: interestRate,
            amount: amount,
            staked: true
        });

        // @dev Event emitted when tokens are staked
        emit Staked(msg.sender, block.timestamp, amount, totalStakerCount, totalStakedTokenAmount);

        // @dev Check if the transfer was successful
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Stake failed");
    }    

    // @dev Function to unstake tokens with reward
    function unstake() public {
        // @dev Check if unstaking is currently enabled
        require(unstakingEnabled, "Unstaking is currently disabled");

        // @dev Check if the address has staked tokens
        require(stakedTokens[msg.sender].staked, "This address did not stake tokens yet");

        // @dev Check if the address has staked any tokens before
        require(stakedTokens[msg.sender].amount > 0, "This address did not stake any tokens before");

        // @dev Retrieve the stake amount for the address
        uint256 stakeAmount = stakedTokens[msg.sender].amount;

        // @dev Retrieve the interest rate for the address
        uint256 stakerInterestRate = stakedTokens[msg.sender].interestRate;

        // @dev Calculate the reward amount based on the stake amount and interest rate
        uint256 rewardAmount = (stakeAmount * stakerInterestRate) / 100;

        // @dev Decreases the total number of stakers by 1
        totalStakerCount -= 1;

        // @dev Decreases the total amount of staked tokens by the amount being unstaked
        totalStakedTokenAmount -= stakeAmount;

        // @dev Sets the staked status of the sender's tokens to false
        stakedTokens[msg.sender].staked = false;

        // @dev Event emitted when tokens are unstaked
        emit Unstaked(msg.sender, block.timestamp, stakeAmount, totalStakerCount, totalStakedTokenAmount);

        // @dev Check if the transfer was successful
        bool success = token.transfer(msg.sender, stakeAmount);
        require(success, "Unstake failed");

        // @dev Calls the claimReward function of the stake reward pool contract to distribute any earned rewards to the sender's address
        stakeRewardPool.claimReward(msg.sender, rewardAmount);
    }

    // @dev Function to unstake tokens without reward
    function unstakeWithoutReward() public {
        // @dev Check if unstaking is currently enabled
        require(unstakingEnabled, "Unstaking is currently disabled");

        // @dev Check if the address has staked tokens
        require(stakedTokens[msg.sender].staked, "This address did not stake tokens yet");

        // @dev Check if the address has staked any tokens before
        require(stakedTokens[msg.sender].amount > 0, "This address did not stake any tokens before");

        // @dev Retrieve the stake amount for the address
        uint256 stakeAmount = stakedTokens[msg.sender].amount;

        // @dev Decreases the total number of stakers by 1
        totalStakerCount -= 1;

        // @dev Decreases the total amount of staked tokens by the amount being unstaked
        totalStakedTokenAmount -= stakeAmount;

        // @dev Sets the staked status of the sender's tokens to false
        stakedTokens[msg.sender].staked = false;

        // @dev Event emitted when tokens are unstaked
        emit Unstaked(msg.sender, block.timestamp, stakeAmount, totalStakerCount, totalStakedTokenAmount);

        // @dev Check if the transfer was successful
        bool success = token.transfer(msg.sender, stakeAmount);
        require(success, "Unstake failed");
    }

    // @dev Function to set the interest rate
    function setInterestRate(uint256 newInterestRate) public onlyOwner {
        interestRate = newInterestRate;
        
        emit InterestRateChanged(newInterestRate);
    }

    // @dev Function to enable or disable staking
    function setStakingEnabled(bool enabled) public onlyOwner {
        stakingEnabled = enabled;
        
        emit StakingEnabled(enabled);
    }

    // @dev Function to enable or disable unstaking
    function setUnstakingEnabled(bool enabled) public onlyOwner {
        unstakingEnabled = enabled;
        
        emit UnstakingEnabled(enabled);
    }
}