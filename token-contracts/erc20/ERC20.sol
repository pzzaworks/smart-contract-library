// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import ERC20 and AccessControl from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract ERC20Contract is ERC20, AccessControl {
    // @dev Declare a constant variable for the admin role using the keccak256 hash function
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // @dev Declare a constant variable for the minter role using the keccak256 hash function
    bytes32 public constant MINTER = keccak256("MINTER");

    // @dev Enable/disable minting
    bool public mintingEnabled = false;

    // @dev Set the maximum token supply
    uint256 private constant MAX_SUPPLY = 1*(10**6)*(10**6);
    
    // @dev Event to notify when minting is enabled/disabled
    event MintingEnabled(bool enabled);

    // @dev Event emitted when tokens are minted
    event TokensMinted(address indexed minter, address indexed receiver, uint256 amount);

    // @dev Event emitted when tokens are withdrawn
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);

    // @dev Event emitted when native tokens (e.g., Ether) are withdrawn
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    // @dev Function to receive Ether
    receive() external payable {}

    // @dev Function to receive Ether when no other function matches the called function signature
    fallback() external payable {}
    
    // @dev Constructor that initializes the contract with a name and symbol for the token
    constructor(address minter) ERC20("Token Name", "TokenSymbol") {
      _setRoleAdmin(ADMIN, ADMIN);
      _setRoleAdmin(MINTER, ADMIN);
      
      _grantRole(ADMIN, msg.sender);
      _grantRole(MINTER, minter);
    }

    // @dev Function to mint tokens
    function mint(address receiver, uint256 amount) public {
        require(hasRole(ADMIN, msg.sender) || hasRole(MINTER, msg.sender), "Only administrators and authorized minters are allowed to mint tokens");

        // @dev Ensure that minting is enabled and the transaction is from the original sender
        require(mintingEnabled, "Minting is currently disabled");

        // @dev Ensure that the receiver address is not the zero address
        require(receiver != address(0), "Mint address cannot be the zero address");

        // @dev Ensure that the correct amount
        require(amount > 0, "Mint amount must be greater than zero");

        // @dev Ensure that the maximum supply limit is not exceeded
        uint256 totalSupply = totalSupply();
        uint256 newSupply = totalSupply + amount;
        require(newSupply <= MAX_SUPPLY, "Maximum token supply exceeded");

        // @dev Emit the TokensMinted event
        emit TokensMinted(msg.sender, receiver, amount);

        // @dev Mint the specified number of tokens
        _mint(receiver, amount);
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

        // @dev Emit an event indicating the withdrawal of tokens
        emit TokensWithdrawn(address(tokenToWithdraw), msg.sender, balance);

        // @dev Ensure the withdrawal was successful
        bool success = tokenToWithdraw.transfer(msg.sender, balance);
        require(success, "Withdraw failed");
    }

    // @dev Function to set the minting enabled status
    function setMintingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set minting enabled or disabled");

        mintingEnabled = enabled;
        
        emit MintingEnabled(enabled);
    }
    
    // @dev Function to retrieve the number of decimal places for the token
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    // @dev Function to retrieve the maximum supply of the token
    function maxSupply() external pure returns (uint256) {
        return MAX_SUPPLY;
    }
}