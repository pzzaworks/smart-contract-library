// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Lock Contract
 * @notice This contract enables the admin to lock tokens in the pool, preventing any transfers or usage during 
 *         the lock period and users can claim their tokens once the lock period has ended
 * @dev Berke (pzzaworks) - pzza.works
 */
contract Lock is AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");

    address private immutable tokenAddress;

    struct LockedToken {        
        uint256 date;
        uint256 amount; 
        bool locked;    
        bool claimed;   
    }

    uint256 public totalLockedTokenAmount;
    bool public claimingEnabled;

    mapping(address => LockedToken) private lockedTokens;

    event ClaimingEnabled(bool enabled);
    event Locked(address indexed claimer, uint256 date, uint256 amount, uint256 totalLockedTokenAmount);
    event Unlocked(address indexed claimer, uint256 date, uint256 amount, uint256 totalLockedTokenAmount);
    event Claimed(address indexed claimer, uint256 date, uint256 amount, uint256 totalLockedTokenAmount);
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    receive() external payable {}
    fallback() external payable {}

    /**
     * @dev Constructor function that initializes the Lock contract
     * @param initialTokenAddress The address of the ERC20 token contract
     */
    constructor(address initialTokenAddress) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);

        tokenAddress = initialTokenAddress;   
        claimingEnabled = true;
    }    

    /**
     * @notice Lock tokens for a specified address
     * @param claimer The address to lock tokens for
     * @param amount The amount of tokens to lock
     */
    function lock(address claimer, uint256 amount) public payable {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to lock tokens");
        require(amount > 0, "Lock amount must be greater than zero");
        require(claimer != address(0), "Claimer address cannot be the zero address");
        require(!lockedTokens[claimer].locked, "Claimer address tokens are already locked");
        require(lockedTokens[claimer].amount == 0, "Claimer address has already locked tokens");

        IERC20 token = IERC20(tokenAddress);

        uint256 balance = token.balanceOf(address(msg.sender)); 
        require(balance >= amount, "This address does not have enough tokens");

        totalLockedTokenAmount += amount;

        lockedTokens[claimer] = LockedToken({                
            date: block.timestamp,
            amount: amount,
            locked: true,
            claimed: false
        });

        emit Locked(claimer, block.timestamp, amount, totalLockedTokenAmount);

        bool lockedSuccessfully = token.transferFrom(msg.sender, address(this), amount);
        require(lockedSuccessfully, "Lock failed");
    }    
    
    /**
    * @notice Unlock tokens for a specified address
    * @param claimer The address to unlock tokens for
    */
    function unlock(address claimer) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to unlock tokens");
        require(claimer != address(0), "Claimer address cannot be the zero address");
        require(lockedTokens[claimer].locked, "Claimer address tokens are not locked");
        require(lockedTokens[claimer].amount > 0, "Claimer address has zero locked tokens");

        lockedTokens[claimer].locked = false;

        emit Unlocked(claimer, block.timestamp, lockedTokens[claimer].amount, totalLockedTokenAmount);
    }

    /**
    * @notice Claim locked tokens
    */
    function claim() public {
        require(claimingEnabled, "Claiming is currently disabled");
        require(!lockedTokens[msg.sender].claimed, "Claimer address already claimed tokens");
        require(!lockedTokens[msg.sender].locked, "Claimer address tokens are not unlocked yet");
        require(lockedTokens[msg.sender].amount > 0, "Claimer address has zero locked tokens");

        lockedTokens[msg.sender].claimed = true;
        uint256 tokenAmount = lockedTokens[msg.sender].amount;
        lockedTokens[msg.sender].amount = 0;
        totalLockedTokenAmount -= tokenAmount;

        emit Claimed(msg.sender, block.timestamp, tokenAmount, totalLockedTokenAmount);
        
        IERC20 token = IERC20(tokenAddress);

        bool claimedSuccessfully = token.transfer(msg.sender, tokenAmount);
        require(claimedSuccessfully, "Claim failed");
    }

    /**
     * @notice Withdraw native tokens (ETH) from the contract
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
        require(tokenToWithdrawAddress != tokenAddress, "Cannot withdraw the locked tokens");

        IERC20 tokenToWithdraw = IERC20(tokenToWithdrawAddress);
        
        uint256 balance = tokenToWithdraw.balanceOf(address(this)); 
        require(balance > 0, "Insufficient tokens to withdraw");

        emit TokensWithdrawn(tokenToWithdrawAddress, msg.sender, balance);

        bool tokensWithdrawnSuccessfully = tokenToWithdraw.transfer(msg.sender, balance);
        require(tokensWithdrawnSuccessfully, "Withdraw tokens failed");
    }

    /**
     * @notice Set whether claiming is enabled or disabled
     * @param enabled True to enable claiming, false to disable it
     */
    function setClaimingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable claiming");

        claimingEnabled = enabled;
        
        emit ClaimingEnabled(enabled);
    }

    /**
     * @notice Get the locked token for the specified user
     * @param user The address of the user
     * @return The locked token for the user
     */
    function getLockedToken(address user) public view returns (LockedToken memory) {
        return lockedTokens[user];
    }
}