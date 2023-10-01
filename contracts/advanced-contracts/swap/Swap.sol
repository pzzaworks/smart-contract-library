// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IPool {
    function deposit(uint256 amount) external returns (bool);
    function withdraw(address receiver, uint256 amount) external returns (bool);
}

/**
 * @title Swap Contract
 * @notice This contract allows users to swap tokens
 * @dev Berke (pzzaworks) - pzza.works
 */
contract Swap is AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");

    mapping(address => address) private tokenPoolAddresses;
    mapping(address => mapping(address => uint256)) private tokenRatios;

    address public immutable royaltyFeeWalletAddress;
    uint256 public royaltyFeePercentage;

    bool public swapEnabled;

    event SwapEnabled(bool enabled);
    event TokenPoolAddressChanged(address indexed tokenAddress, address indexed tokenPoolAddress);
    event RoyaltyFeePercentageChanged(uint256 royaltyFeePercentage);
    event TokenRatioChanged(address indexed tokenOneAddress, address indexed tokenTwoAddress, uint256 tokenRatio);
    event Swapped(address indexed caller, uint256 date, address indexed tokenOneAddress, address indexed tokenTwoAddress, uint256 tokenOneAmount, uint256 tokenTwoAmount, uint256 royaltyFeeAmount);
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    receive() external payable {}
    fallback() external payable {}

    /**
     * @notice Contract constructor
     * @param initialRoyaltyFeeWalletAddress The address of the royalty fee pool contract
     * @param initialRoyaltyFeePercentage The initial royalty fee percentage
     */
    constructor(address initialRoyaltyFeeWalletAddress, uint256 initialRoyaltyFeePercentage) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);

        royaltyFeeWalletAddress = initialRoyaltyFeeWalletAddress;
        royaltyFeePercentage = initialRoyaltyFeePercentage;
        swapEnabled = true;
    }

    /**
     * @notice Swaps tokens between two ERC20 tokens
     * @param tokenOneAddress The first ERC20 token address
     * @param tokenOneDecimals The first ERC20 token decimals
     * @param tokenTwoAddress The second ERC20 token address
     * @param tokenOneAmount The amount of tokenOne to swap
     */
    function swapTokens(address tokenOneAddress, uint256 tokenOneDecimals, address tokenTwoAddress, uint256 tokenOneAmount) public {
        require(swapEnabled, "Swapping is currently disabled");

        IERC20 tokenOne = IERC20(tokenOneAddress);
        IPool tokenOnePool = IPool(tokenPoolAddresses[tokenOneAddress]);
        IPool tokenTwoPool = IPool(tokenPoolAddresses[tokenTwoAddress]);

        require(tokenOneAddress != tokenTwoAddress, "Tokens must be different");
        require(tokenOneAmount > 0, "Not enough token one amount");
        require(tokenOne.balanceOf(msg.sender) >= tokenOneAmount, "This address does not have enough tokens");

        uint256 tokenRatio = tokenRatios[tokenOneAddress][tokenTwoAddress];
        uint256 tokenTwoAmount = (tokenOneAmount * tokenRatio) / (10 ** tokenOneDecimals);

        uint256 royaltyFeeAmount = (tokenTwoAmount * royaltyFeePercentage) / (100 * (10 ** tokenOneDecimals));
        tokenTwoAmount = tokenTwoAmount - royaltyFeeAmount;

        require(tokenOne.balanceOf(address(tokenOnePool)) >= tokenTwoAmount, "The token one pool has not enough tokens to exchange");

        emit Swapped(msg.sender, block.timestamp, tokenOneAddress, tokenTwoAddress, tokenOneAmount, tokenTwoAmount, royaltyFeeAmount);

        uint256 tokenOneDepositAmount = tokenOneAmount - royaltyFeeAmount;

        bool tokenOneTransferedSuccessfully = tokenOne.transferFrom(msg.sender, address(this), tokenOneAmount);
        require(tokenOneTransferedSuccessfully, "Token one transfer failed");

        bool tokenOneDepositedSuccessfully = tokenOnePool.deposit(tokenOneDepositAmount);
        require(tokenOneDepositedSuccessfully, "Token one deposit failed");

        bool royaltyFeeTransferedSuccessfully = tokenOne.transfer(royaltyFeeWalletAddress, royaltyFeeAmount);
        require(royaltyFeeTransferedSuccessfully, "Royalty fee transfer failed");

        bool tokenTwoWithdrawnSuccessfully = tokenTwoPool.withdraw(msg.sender, tokenTwoAmount);
        require(tokenTwoWithdrawnSuccessfully, "Token two withdraw failed");
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

        IERC20 tokenToWithdraw = IERC20(tokenToWithdrawAddress);
        
        uint256 balance = tokenToWithdraw.balanceOf(address(this)); 
        require(balance > 0, "Insufficient tokens to withdraw");

        emit TokensWithdrawn(tokenToWithdrawAddress, msg.sender, balance);

        bool tokensWithdrawnSuccessfully = tokenToWithdraw.transfer(msg.sender, balance);
        require(tokensWithdrawnSuccessfully, "Withdraw tokens failed");
    }

    /**
     * @notice Sets the swapEnabled flag to enable or disable token swapping
     * @param enabled The flag to enable or disable token swapping
     */
    function setSwapEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set swap enabled or disabled");

        swapEnabled = enabled;
        
        emit SwapEnabled(enabled);
    }
    
    /**
     * @notice Set the address of the token pool
     * @param tokenAddress The address of the token
     * @param tokenPoolAddress The address of the token pool
     */
    function setTokenPoolAddress(address tokenAddress, address tokenPoolAddress) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set the token pool address");

        tokenPoolAddresses[tokenAddress] = tokenPoolAddress;

        IERC20 token = IERC20(tokenAddress);
        
        emit TokenPoolAddressChanged(tokenAddress, tokenPoolAddress);

        bool tokenPoolAddressApprovedSuccessfully = token.approve(tokenPoolAddress, type(uint256).max);
        require(tokenPoolAddressApprovedSuccessfully, "Token pool address approval failed");
    }

    /**
     * @notice Sets the royalty fee percentage
     * @param newRoyaltyFeePercentage The new royalty fee percentage
     */
    function setRoyaltyFeePercentage(uint256 newRoyaltyFeePercentage) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set the royalty fee percentage");

        royaltyFeePercentage = newRoyaltyFeePercentage;
        
        emit RoyaltyFeePercentageChanged(newRoyaltyFeePercentage);
    }

    /**
     * @notice Sets the token ratio between two tokens
     * @param tokenOneAddress The address of the first token
     * @param tokenTwoAddress The address of the second token
     * @param tokenRatio The token ratio between the two tokens
     */
    function setTokenRatio(address tokenOneAddress, address tokenTwoAddress, uint256 tokenRatio) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set the token ratio");

        tokenRatios[tokenOneAddress][tokenTwoAddress] = tokenRatio;
        
        emit TokenRatioChanged(tokenOneAddress, tokenTwoAddress, tokenRatio);
    }

    /**
     * @notice Get the token ratio between two tokens
     * @param tokenOneAddress The address of the first token
     * @param tokenTwoAddress The address of the second token
     * @return The token ratio between the two tokens
     */
    function getTokenRatio(address tokenOneAddress, address tokenTwoAddress) public view returns (uint256) {
        return tokenRatios[tokenOneAddress][tokenTwoAddress];
    }

    /**
     * @notice Get the address of the token pool
     * @param tokenAddress The address of the token
     * @return The address of the token pool
     */
    function getTokenPoolAddress(address tokenAddress) public view returns (address) {
        return tokenPoolAddresses[tokenAddress];
    }
}