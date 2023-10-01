// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ERC20 Token Contract
 * @notice This contract is used to manage ERC20 tokens and admin to distribute tokens and manage their minting based on role-based access control
 * @dev Berke (pzzaworks) - pzza.works
 */
contract ERC20Contract is ERC20, AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant MINTER = keccak256("MINTER");

    bool public mintingEnabled;

    uint256 private constant MAX_SUPPLY = 1*(10**6)*(10**6);
    
    event MintingEnabled(bool enabled);
    event WithdrawingEnabled(bool enabled);
    event TokensMinted(address indexed minter, address indexed receiver, uint256 amount);
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    receive() external payable {}
    fallback() external payable {}
    
    /**
     * @notice Constructor function for initializing the contract
     */
    constructor() ERC20("Token Name", "TokenSymbol") {
      _setRoleAdmin(ADMIN, ADMIN);
      _setRoleAdmin(MINTER, ADMIN);
      _grantRole(ADMIN, msg.sender);

      mintingEnabled = true;
    }

    /**
     * @notice Mint new tokens
     * @param receiver The address to receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address receiver, uint256 amount) public {
        require(hasRole(ADMIN, msg.sender) || hasRole(MINTER, msg.sender), "Only administrators and authorized minters are allowed to mint tokens");
        require(mintingEnabled, "Minting is currently disabled");
        require(receiver != address(0), "Mint address cannot be the zero address");
        require(amount > 0, "Mint amount must be greater than zero");

        uint256 totalSupply = totalSupply();
        uint256 newSupply = totalSupply + amount;
        require(newSupply <= MAX_SUPPLY, "Maximum token supply exceeded");

        emit TokensMinted(msg.sender, receiver, amount);

        _mint(receiver, amount);
    }

    /**
     * @notice Withdraw native tokens (ETH) from the contract
     */
    function withdrawNativeTokens() public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw native tokens");

        uint256 balance = address(this).balance;
        require(balance > 0, "Insufficient tokens to withdraw");

        emit NativeTokensWithdrawn(msg.sender, balance);
    
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Withdraw failed");
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
     * @notice Sets the minting enabled flag.
     * @param enabled The value to set for mintingEnabled
     */
    function setMintingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set minting enabled or disabled");

        mintingEnabled = enabled;
        
        emit MintingEnabled(enabled);
    }
    
    /**
     * @notice Returns the number of decimal places for the token.
     * @return The number of decimal places (always 6 in this case)
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    /**
     * @notice Returns the maximum supply of the token.
     * @return The maximum supply
     */
    function maxSupply() external pure returns (uint256) {
        return MAX_SUPPLY;
    }
}