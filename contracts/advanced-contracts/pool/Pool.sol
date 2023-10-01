// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Pool Contract
 * @notice This contract allows administrators and depositors to manage the pool by depositing and withdrawing tokens
 * @dev Berke (pzzaworks) - pzza.works
 */
contract Pool is AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant DEPOSITOR = keccak256("DEPOSITOR");
    bytes32 public constant WITHDRAWER = keccak256("WITHDRAWER");

    address private immutable tokenAddress;

    bool public depositingEnabled;
    uint256 public poolBalance;

    event DepositingEnabled(bool enabled);
    event Deposited(address indexed depositor, uint256 amount, uint256 poolBalance);
    event Withdrawn(address indexed receiver, uint256 amount, uint256 poolBalance);
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    receive() external payable {}
    fallback() external payable {}
    
    /**
     * @notice Constructor function
     * @param initialTokenAddress The token contract address
     */
    constructor(address initialTokenAddress) {
        _setRoleAdmin(ADMIN, ADMIN);
        _setRoleAdmin(DEPOSITOR, ADMIN);
        _setRoleAdmin(WITHDRAWER, ADMIN);
        _grantRole(ADMIN, msg.sender);
        
        tokenAddress = initialTokenAddress;
        depositingEnabled = true;
    }

    /**
     * @notice Deposit tokens into the contract
     * @param amount The amount of tokens to deposit
     */
    function deposit(uint256 amount) external returns (bool) {
        require(hasRole(ADMIN, msg.sender) || hasRole(DEPOSITOR, msg.sender), "Only administrators and authorized depositors are allowed to deposit tokens");
        require(depositingEnabled, "Depositing is currently disabled");
        require(amount > 0, "Deposit amount must be greater than zero");

        IERC20 token = IERC20(tokenAddress);
        
        uint256 balance = token.balanceOf(msg.sender); 
        require(balance >= amount, "Token balance is insufficient for the desired deposit");

        poolBalance += amount;

        emit Deposited(msg.sender, amount, poolBalance);

        bool depositedSuccessfully = token.transferFrom(msg.sender, address(this), amount);
        return depositedSuccessfully;
    }

    /**
     * @notice Withdraw tokens from the contract
     * @param receiver The address to receive the tokens
     * @param amount The amount of tokens to withdraw
     */
    function withdraw(address receiver, uint256 amount) external returns (bool) {
        require(hasRole(ADMIN, msg.sender) || hasRole(WITHDRAWER, msg.sender), "Only administrators and authorized withdrawers are allowed to withdraw tokens");
        require(receiver != address(0), "Withdraw address cannot be the zero address");
        require(amount > 0, "Withdraw amount must be greater than zero");

        IERC20 token = IERC20(tokenAddress);

        uint256 balance = token.balanceOf(address(this)); 
        require(balance >= amount && poolBalance >= amount, "Insufficient tokens to withdraw");

        poolBalance -= amount;

        emit Withdrawn(receiver, amount, poolBalance);

        bool withdrawnSuccessfully = token.transfer(receiver, amount);
        return withdrawnSuccessfully;
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
        require(tokenToWithdrawAddress != tokenAddress, "Cannot withdraw the pool tokens");

        IERC20 tokenToWithdraw = IERC20(tokenToWithdrawAddress);
        
        uint256 balance = tokenToWithdraw.balanceOf(address(this)); 
        require(balance > 0, "Insufficient tokens to withdraw");

        emit TokensWithdrawn(tokenToWithdrawAddress, msg.sender, balance);

        bool tokensWithdrawnSuccessfully = tokenToWithdraw.transfer(msg.sender, balance);
        require(tokensWithdrawnSuccessfully, "Withdraw tokens failed");
    }

    /**
     * @notice Set the depositing enabled or disabled
     * @param enabled True to enable depositing, false to disable
     */
    function setDepositingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set depositing enabled or disabled");

        depositingEnabled = enabled;
        
        emit DepositingEnabled(enabled);
    }
}