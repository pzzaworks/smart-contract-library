// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import ERC20 and Ownable from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Basic is ERC20, Ownable {
    // @dev Enable/disable minting
    bool public mintingEnabled = false;

    // @dev Set the maximum token supply
    uint256 private constant MAX_SUPPLY = 1*(10**6)*(10**6);
    
    // @dev Event to notify when minting is enabled/disabled
    event MintingEnabled(bool enabled);

    // @dev Event emitted when tokens are minted
    event TokensMinted(address indexed minter, address indexed receiver, uint256 amount);
    
    // @dev Constructor that initializes the contract with a name and symbol for the token
    constructor() ERC20("Token Name", "TokenSymbol") {}

    // @dev Function to mint tokens
    function mint(address receiver, uint256 amount) public onlyOwner {
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

    // @dev Function to set the minting enabled status
    function setMintingEnabled(bool enabled) public onlyOwner {
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