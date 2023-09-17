// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import IERC20 and Ownable from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PoolBasic is Ownable {
    // @dev Enable/disable depositing
    bool public depositingEnabled = false;

    // @dev Enable/disable withdrawing
    bool public withdrawingEnabled = false;

    // @dev Set the pool balance
    uint256 public poolBalance;

    // @dev Token contract interface
    IERC20 immutable private token;

    // @dev Event emitted when depositing is enabled or disabled
    event DepositingEnabled(bool enabled);

    // @dev Event emitted when withdrawing is enabled or disabled
    event WithdrawingEnabled(bool enabled);

    // @dev Event emitted when tokens are deposited into the pool
    event Deposited(address indexed depositor, uint256 amount, uint256 poolBalance);

    // @dev Event emitted when tokens are withdrawn from the pool
    event Withdrawn(address indexed receiver, uint256 amount, uint256 poolBalance);

    // @dev Constructor function that sets the token contract for the pool
    constructor(IERC20 tokenContract) {
        token = tokenContract;
    }

    // @dev Function to deposit tokens into the pool
    function deposit(uint256 amount) public {
        // @dev Check if depositing is enabled
        require(depositingEnabled, "Depositing is currently disabled");

        // @dev Check if the deposit amount is greater than zero
        require(amount > 0, "Deposit amount must be greater than zero");
        
        // @dev Check if the depositor has sufficient tokens
        uint256 balance = token.balanceOf(msg.sender); 
        require(balance >= amount, "Token balance is insufficient for the desired deposit");

        // @dev Increase the pool balance by the deposited amount
        poolBalance += amount;

        // @dev Emit an event indicating the tokens have been deposited
        emit Deposited(msg.sender, amount, poolBalance);

        // @dev Transfer the tokens from the depositor to the pool
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Deposit failed");
    }

    // @dev Function to withdraw tokens from the pool
    function withdraw(address receiver, uint256 amount) public onlyOwner {
        // @dev Check if withdrawing is enabled
        require(withdrawingEnabled, "Withdrawing is currently disabled");
    
        // @dev Check if the receiver address is not the zero address
        require(receiver != address(0), "Withdraw address cannot be the zero address");

        // @dev Check if the withdraw amount is greater than zero
        require(amount > 0, "Withdraw amount must be greater than zero");

        // @dev Check if there are sufficient tokens in the pool and poolBalance to perform the withdrawal
        uint256 balance = token.balanceOf(address(this)); 
        require(balance >= amount && poolBalance >= amount, "Insufficient tokens to withdraw");

        // @dev Decrease the pool balance by the withdrawn amount
        poolBalance -= amount;

        // @dev Emit an event indicating the tokens have been withdrawn
        emit Withdrawn(receiver, amount, poolBalance);

        // @dev Transfer the tokens from the pool to the receiver
        bool success = token.transfer(receiver, amount);
        require(success, "Withdraw failed");
    }

    // @dev Function to enable or disable depositing
    function setDepositingEnabled(bool enabled) public onlyOwner {
        depositingEnabled = enabled;
        
        emit DepositingEnabled(enabled);
    }
    
    // @dev Function to enable or disable withdrawing
    function setWithdrawingEnabled(bool enabled) public onlyOwner {
        withdrawingEnabled = enabled;
        
        emit WithdrawingEnabled(enabled);
    }
}