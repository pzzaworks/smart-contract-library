// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import IERC20 and AccessControl from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Lock is AccessControl {
    // @dev Declare a constant variable for the admin role using the keccak256 hash function
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // @dev Token contract interface
    IERC20 immutable private token;

    // @dev Struct representing a locked token
    struct LockedToken {        
        uint256 date;
        uint256 amount; 
        bool locked;    
        bool claimed;   
    }

    // @dev Total amount of locked tokens
    uint256 public totalLockedTokenAmount;

    // @dev Enable/disable locking
    bool public lockingEnabled = false;

    // @dev Enable/disable unlocking
    bool public unlockingEnabled = false;

    // @dev Enable/disable claiming
    bool public claimingEnabled = false;

    // @dev Mapping to store locked tokens for each address
    mapping(address => LockedToken) public lockedTokens;

    // @dev Event emitted when locking is enabled or disabled
    event LockingEnabled(bool enabled);

    // @dev Event emitted when unlocking is enabled or disabled
    event UnlockingEnabled(bool enabled);

    // @dev Event emitted when claiming is enabled or disabled
    event ClaimingEnabled(bool enabled);

    // @dev Event emitted when tokens are locked
    event Locked(address indexed claimer, uint256 date, uint256 amount, uint256 totalLockedTokenAmount);
    
    // @dev Event emitted when tokens are unlocked
    event Unlocked(address indexed claimer, uint256 date, uint256 amount, uint256 totalLockedTokenAmount);
    
    // @dev Event emitted when tokens are claimed
    event Claimed(address indexed claimer, uint256 date, uint256 amount, uint256 totalLockedTokenAmount);

    // @dev Event emitted when tokens are withdrawn
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);

    // @dev Event emitted when native tokens (e.g., Ether) are withdrawn
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    // @dev Function to receive Ether
    receive() external payable {}

    // @dev Function to receive Ether when no other function matches the called function signature
    fallback() external payable {}

    // @dev Constructor function that sets the token contract for the pool
    constructor(IERC20 tokenContract) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);

        token = tokenContract;   
    }    

    // @dev Function to lock tokens 
    function lock(address claimer, uint256 amount) public payable {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to lock tokens");

        // @dev Check if locking is enabled
        require(lockingEnabled, "Locking is currently disabled");

        // @dev Check if the lock amount is greater than zero
        require(amount > 0, "Lock amount must be greater than zero");

        // @dev Check if the claimer address is not the zero address
        require(claimer != address(0), "Claimer address cannot be the zero address");

        // @dev Check if the claimer address tokens are not already locked
        require(!lockedTokens[claimer].locked, "Claimer address tokens are already locked");

        // @dev Check if the claimer address has not already locked tokens
        require(lockedTokens[claimer].amount == 0, "Claimer address has already locked tokens");

        // @dev Check if there are sufficient tokens in the pool and pool balance to perform the claiming
        uint256 balance = token.balanceOf(address(msg.sender)); 
        require(balance >= amount, "This address doesnt have enough tokens");

        // @dev Decrease the pool balance by the total locked token amount
        totalLockedTokenAmount += amount;

        // @dev Store locked token information for the claimer address
        lockedTokens[claimer] = LockedToken({                
            date: block.timestamp,
            amount: amount,
            locked: true,
            claimed: false
        });

        // @dev Emit an event indicating the tokens have been locked
        emit Locked(claimer, block.timestamp, amount, totalLockedTokenAmount);

        // @dev Transfer the tokens from the receiver to the pool
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Lock failed");
    }    

    // @dev Function to unlock tokens 
    function unlock(address claimer) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to unlock tokens");

        // @dev Check if unlocking is enabled
        require(unlockingEnabled, "Unlocking is currently disabled");

        // @dev Check if the claimer address is not the zero address
        require(claimer != address(0), "Claimer address cannot be the zero address");

        // @dev Check if the claimer address tokens are locked
        require(lockedTokens[claimer].locked, "Claimer address tokens are not locked");

        // @dev Check if the claimer address has more than zero locked tokens
        require(lockedTokens[claimer].amount > 0, "Claimer address has zero locked tokens");

        // @dev Sets the locked status of the claimer's tokens to false
        lockedTokens[claimer].locked = false;

        // @dev Emit an event indicating the tokens have been unlocked
        emit Unlocked(claimer, block.timestamp, lockedTokens[claimer].amount, totalLockedTokenAmount);
    }

    // @dev Function to claim tokens from the pool
    function claim() public {
        // @dev Check if claiming is enabled
        require(claimingEnabled, "Claiming is currently disabled");

        // @dev Check if the claimer address has already claimed tokens
        require(!lockedTokens[msg.sender].claimed, "Claimer address already claimed tokens");

        // @dev Check if the claimer address tokens are locked
        require(lockedTokens[msg.sender].locked, "Claimer address tokens are not locked");

        // @dev Check if the claimer address has a non-zero amount of locked tokens
        require(lockedTokens[msg.sender].amount > 0, "Claimer address has zero locked tokens");

        // @dev Set the claimed status for the claimer address to true
        lockedTokens[msg.sender].claimed = true;

        // @dev Retrieve the token amount for the claimer address
        uint256 tokenAmount = lockedTokens[msg.sender].amount;

        // @dev Set the locked token amount for the claimer address to zero
        lockedTokens[msg.sender].amount = 0;

        // @dev Decrease the total locked token amount by the claimed amount
        totalLockedTokenAmount -= tokenAmount;

        // @dev Emit an event indicating the tokens have been claimed
        emit Claimed(msg.sender, block.timestamp, tokenAmount, totalLockedTokenAmount);

        // @dev Transfer the tokens from the pool to the receiver
        bool success = token.transfer(msg.sender, tokenAmount);
        require(success, "Claim failed");
    }

    // @dev Function to withdraw native tokens (e.g., Ether) from the contract
    function withdrawNativeTokens() public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw native tokens");

        // @dev Ensure that there are tokens available to withdraw
        uint256 balance = address(this).balance;
        require(balance > 0, "Insufficient tokens to withdraw");

        // @dev Emit an event indicating the withdrawal of native tokens
        emit NativeTokensWithdrawn(msg.sender, balance);
    
        // @dev Ensure the withdrawal was successful
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Withdraw failed");
    }
    
    // @dev Function to withdraw tokens from the contract
    function withdrawTokens(IERC20 tokenToWithdraw) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw tokens");

        // @dev Ensure the token contract address is valid
        require(address(tokenToWithdraw) != address(0), "Token contract address cannot be the zero address");

        // @dev Ensure that there are tokens available to withdraw
        uint256 balance = tokenToWithdraw.balanceOf(address(this)); 
        require(balance > 0, "Insufficient tokens to withdraw");
        
        // @dev Check if the token to withdraw is not the same as the staked token
        require(address(tokenToWithdraw) != address(token), "Invalid token to withdraw");

        // @dev Emit an event indicating the withdrawal of tokens
        emit TokensWithdrawn(address(tokenToWithdraw), msg.sender, balance);

        // @dev Ensure the withdrawal was successful
        bool success = tokenToWithdraw.transfer(msg.sender, balance);
        require(success, "Withdraw failed");
    }

    // @dev Function to enable or disable claiming
    function setClaimingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable claiming");

        claimingEnabled = enabled;
        
        emit ClaimingEnabled(enabled);
    }

    // @dev Function to enable or disable locking
    function setLockingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable locking");

        lockingEnabled = enabled;
        
        emit LockingEnabled(enabled);
    }

    // @dev Function to enable or disable unlocking
    function setUnlockingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable unlocking");

        unlockingEnabled = enabled;
        
        emit UnlockingEnabled(enabled);
    }
}