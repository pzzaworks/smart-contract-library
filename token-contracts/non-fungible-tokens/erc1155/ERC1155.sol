// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import ERC1155, Access Control, and Strings from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ERC1155Contract is ERC1155, AccessControl {
    // @dev Use Strings library for uint256
    using Strings for uint256;
    
    // @dev The name of the NFT
    string public constant name = "NFT Name";

    // @dev The symbol representing the NFT
    string public constant symbol = "NFTSymbol";

    // @dev Declare a constant variable for the admin role using the keccak256 hash function
    bytes32 public constant ADMIN = keccak256("ADMIN");
    
    // @dev Define the base URI for token metadata
    string public baseURI = "ipfs://.../"; 

    // @dev Define the constructor URI for token metadata
    string public constant CONSTRUCTOR_URI = "ipfs://.../{id}.json";
    
    // @dev Define the hidden URI for token metadata
    string public constant HIDDEN_URI = "ipfs://.../hidden.json";

    // @dev Set the minting prices for tokens
    uint256[3] public mintPrices = [0.01 ether, 0.01 ether, 0.01 ether];

    // @dev Enable/disable minting
    bool[3] public mintingEnabled = [false, false, false];

    // @dev Reveal/hide NFTs
    bool public nftsRevealed = false;

    // @dev Set the maximum token supplies
    uint256[3] public maxSupplies = [10000, 10000, 10000];

    // @dev Set the total token supplies
    uint256[3] private tokenSupplies = [0, 0, 0];

    // @dev Set the maximum number of tokens that can be minted in a single transaction
    uint256[3] public maxMintAmountPerTx = [100, 100, 100];

    // @dev Set the maximum number of tokens that can be minted by a single address
    uint256[3] public maxMintAmountPerAddress = [10, 10, 10];

    // @dev Keep track of the number of tokens that have been minted by each address
    mapping(address => mapping(uint256 => uint256)) private addressMintAmount;

    // @dev Set the team wallet address
    address public constant TEAM_WALLET = 0x0000000000000000000000000000000000000000;

    // @dev Set the community wallet address
    address public constant COMMUNITY_WALLET = 0x0000000000000000000000000000000000000000;

    // @dev Event to notify when minting is enabled/disabled
    event MintingEnabled(uint256 tokenId, bool enabled);

    // @dev Event that is emitted when the visibility of the NFTs is changed
    event NFTVisibilityChanged(bool revealed);

    // @dev Event that is emitted when the base URI for token metadata is changed
    event BaseURIChanged(string newBaseURI);

    // @dev Event emitted when the maximum number of tokens that can be minted in a single transaction is changed
    event MaxMintAmountPerTxChanged(uint256 tokenId, uint256 amount);

    // @dev Event emitted when the maximum number of tokens that can be minted by a single address is changed
    event MaxMintAmountPerAddressChanged(uint256 tokenId, uint256 amount);

    // @dev Event to notify when the mint price is updated
    event MintPriceUpdated(uint256 tokenId, uint256 price);

    // @dev Event emitted when NFTs are minted
    event NFTMinted(uint256 tokenId, address indexed buyer, uint256 amount);

    // @dev Event emitted when the contract balance is withdrawn
    event Withdrawn(uint256 amount, address teamWallet, address communityWallet, address owner);

    // @dev Constructor that initializes the contract
    constructor() ERC1155(CONSTRUCTOR_URI) {
      _setRoleAdmin(ADMIN, ADMIN);
      _grantRole(ADMIN, msg.sender);
    }
    
    // @dev Override the supportsInterface function to ensure that the contract properly implements the required ERC1155 and AccessControl interfaces
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool){
        return super.supportsInterface(interfaceId);
    }

    // @dev Override the uri function to return the URI for a specific token ID
    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");

        // @dev If NFTs are currently hidden, return a default hidden URI
        if(!nftsRevealed) {
            return HIDDEN_URI;
        }

        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString(), ".json")) : "";
    }

    // @dev Function to mint NFTs
    function mint(uint256 tokenId, uint256 amount) public payable {
        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");

        // Subtract 1 from the tokenId to convert it to the index in the maxSupplies array
        uint256 currentTokenId = tokenId - 1;

        // @dev Ensure that minting is enabled and the transaction is from the original sender
        require(mintingEnabled[currentTokenId], "Minting is currently disabled");

        // @dev Ensure that the correct amount of Ether is sent to purchase the NFTs
        require(amount > 0, "Not enough amount");
        require(msg.value >= mintPrices[currentTokenId] * amount, "Insufficient funds");

        // @dev Ensure that the maximum supply limit is not exceeded
        uint256 currentSupply = tokenSupplies[currentTokenId];
        require(currentSupply + amount <= maxSupplies[currentTokenId], "Max supply limit exceeded");

        // @dev Ensure that the maximum number of tokens that can be minted in a single transaction is not exceeded
        require(amount <= maxMintAmountPerTx[currentTokenId], "Max mint amount per transaction exceeded");

        // @dev Ensure that the maximum number of tokens that can be minted by a single address is not exceeded
        uint256 currentAddressMintAmount = addressMintAmount[msg.sender][currentTokenId];
        require(currentAddressMintAmount + amount <= maxMintAmountPerAddress[currentTokenId], "Max mint amount per address exceeded");

        // @dev Emit the NFTMinted event
        emit NFTMinted(tokenId, msg.sender, amount);

        // @dev Increment the number of tokens that have been minted by the address
        addressMintAmount[msg.sender][currentTokenId]++;

        // @dev Mint the specified number of NFTs
        tokenSupplies[currentTokenId]++;
        _mint(msg.sender, tokenId, amount, '');
    }

    // @dev Function to withdraw the contract balance
    function withdraw() public payable {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw");

        // @dev Get the current contract balance and ensure that it is greater than 0
        uint256 balance = address(this).balance;
        require(balance > 0, "Not enough balance");

        // @dev Emit the Withdrawn event
        emit Withdrawn(balance, TEAM_WALLET, COMMUNITY_WALLET, msg.sender);

        // @dev Transfer 50% of the contract balance to the team wallet and the other 50% to the community wallet
        (bool successTeamWallet, ) = payable(TEAM_WALLET).call{value: ((balance * 50) / 100)}("");
        require(successTeamWallet, "Transfer failed.");

        (bool successCommunityWallet, ) = payable(COMMUNITY_WALLET).call{value: ((balance * 50) / 100)}("");
        require(successCommunityWallet, "Transfer failed.");

        // @dev Transfer the remaining balance to the contract owner
        (bool successOwner, ) = payable(msg.sender).call{value: (address(this).balance)}("");
        require(successOwner, "Transfer failed.");
    }

    // @dev Function to set the minting enabled status
    function setMintingEnabled(uint256 tokenId, bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set minting enabled or disabled");

        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");

        // Subtract 1 from the tokenId to convert it to the index in the maxSupplies array
        uint256 currentTokenId = tokenId - 1;

        mintingEnabled[currentTokenId] = enabled;
        
        emit MintingEnabled(tokenId, enabled);
    }

    // @dev Function to reveal or hide the NFTs
    function setNFTVisibility(bool revealed) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set NFTs revealed or hidden");

        nftsRevealed = revealed;
        
        emit NFTVisibilityChanged(revealed);
    }

    // @dev Function to set the base URI for token metadata
    function setBaseURI(string memory newBaseURI) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set base URI");

        baseURI = newBaseURI;
        
        emit BaseURIChanged(newBaseURI);
    }

    // @dev Function to set the maximum number of tokens that can be minted in a single transaction
    function setMaxMintAmountPerTx(uint256 tokenId, uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per transaction");

        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");

        // Subtract 1 from the tokenId to convert it to the index in the maxSupplies array
        uint256 currentTokenId = tokenId - 1;

        maxMintAmountPerTx[currentTokenId] = amount;

        emit MaxMintAmountPerTxChanged(tokenId, amount);
    }

    // @dev Function to set the maximum number of tokens that can be minted by a single address
    function setMaxMintAmountPerAddress(uint256 tokenId, uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per address");

        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");

        // Subtract 1 from the tokenId to convert it to the index in the maxSupplies array
        uint256 currentTokenId = tokenId - 1;

        maxMintAmountPerAddress[currentTokenId] = amount;

        emit MaxMintAmountPerAddressChanged(tokenId, amount);
    }

    // @dev Function to set the mint price
    function setMintPrice(uint256 tokenId, uint256 price) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set mint price");

        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");

        // Subtract 1 from the tokenId to convert it to the index in the maxSupplies array
        uint256 currentTokenId = tokenId - 1;

        mintPrices[currentTokenId] = price;
        
        emit MintPriceUpdated(tokenId, price);
    }
    
    // @dev Function to get the supply of tokens for a specific tokenId
    function tokenSupply(uint256 tokenId) public view returns (uint) {
        // Ensure that the tokenId is within the valid range
        require(tokenId > 0 && tokenId <= maxSupplies.length, "Token doesn't exist");
        
        // Subtract 1 from the tokenId to convert it to the index in the maxSupplies array
        uint256 currentTokenId = tokenId - 1;

        return tokenSupplies[currentTokenId];
    }

    // @dev Function to get the total number of tokens minted
    function totalSupply() public view returns (uint) {
        uint256 currentTotalSupply = 0;

        for (uint256 i = 0; i < tokenSupplies.length; i++) {
            currentTotalSupply = currentTotalSupply + tokenSupplies[i];
        }

        return currentTotalSupply;
    }
}