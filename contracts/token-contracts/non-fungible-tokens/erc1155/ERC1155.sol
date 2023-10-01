// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ERC1155 Token Contract
 * @notice This contract is used to manage and mint ERC1155 tokens 
 * @dev Berke (pzzaworks) - pzza.works
 */
contract ERC1155Contract is ERC1155, AccessControl {
    using Strings for uint256;
    
    string public constant name = "NFT Name";
    string public constant symbol = "NFTSymbol";

    bytes32 public constant ADMIN = keccak256("ADMIN");
    
    string public constant BASE_URI = "ipfs://.../"; 
    string public constant CONSTRUCTOR_URI = "ipfs://.../{id}.json";
    string public constant HIDDEN_URI = "ipfs://.../hidden.json";

    uint256[3] private mintPrices;

    bool[3] private mintingsEnabled;
    bool public nftsRevealed;
    
    uint8 public constant TOKEN_COUNT = 3;
    uint256[3] private maxSupplies;
    uint256[3] private tokenSupplies;
    uint256[3] private maxMintAmountsPerTx;
    uint256[3] private maxMintAmountsPerAddress;

    mapping(address => mapping(uint256 => uint256)) private addressMintAmounts;

    address public immutable teamWallet;
    address public immutable communityWallet;

    event MintingEnabled(uint256 tokenId, bool enabled);
    event NFTVisibilityChanged(bool revealed);
    event BaseURIChanged(string newBaseURI);
    event MaxMintAmountPerTxChanged(uint256 tokenId, uint256 amount);
    event MaxMintAmountPerAddressChanged(uint256 tokenId, uint256 amount);
    event MintPriceUpdated(uint256 tokenId, uint256 price);
    event NFTMinted(uint256 tokenId, address indexed minter, uint256 amount);
    event Withdrawn(uint256 amount, address teamWallet, address communityWallet, address owner);

    /**
     * @notice Contract constructor
     * @param initialTeamWallet The initial team wallet address
     * @param initialCommunityWallet The initial community wallet address
     * @param initialMintPrices The initial mint prices for each token
     * @param initialMintingsEnabled The initial minting enabled status for each token
     * @param initialMaxSupplies The initial maximum supplies for each token
     * @param initialMaxMintAmountsPerTx The initial maximum mint amount per transaction for each token
     * @param initialMaxMintAmountsPerAddress The initial maximum mint amount per address for each token
     */
    constructor(
        address initialTeamWallet, 
        address initialCommunityWallet,
        uint256[3] memory initialMintPrices,
        bool[3] memory initialMintingsEnabled,
        uint256[3] memory initialMaxSupplies,
        uint256[3] memory initialMaxMintAmountsPerTx,
        uint256[3] memory initialMaxMintAmountsPerAddress
    ) ERC1155(CONSTRUCTOR_URI) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);

        teamWallet = initialTeamWallet;
        communityWallet = initialCommunityWallet;

        mintPrices = initialMintPrices;
        mintingsEnabled = initialMintingsEnabled;
        nftsRevealed = true;
        
        tokenSupplies = [0, 0, 0];
        maxSupplies = initialMaxSupplies;
        maxMintAmountsPerTx = initialMaxMintAmountsPerTx;
        maxMintAmountsPerAddress = initialMaxMintAmountsPerAddress;
    }

    /**
     * @notice Mint new tokens
     * @param tokenId The ID of the token to mint
     * @param amount The amount of tokens to mint
     */
    function mint(uint256 tokenId, uint256 amount) public payable {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        uint256 currentTokenId = tokenId - 1;

        require(mintingsEnabled[currentTokenId], "Minting is currently disabled");

        require(amount > 0, "Not enough amount");
        require(msg.value >= mintPrices[currentTokenId] * amount, "Insufficient funds");

        uint256 currentSupply = tokenSupplies[currentTokenId];
        require(currentSupply + amount <= maxSupplies[currentTokenId], "Max supply limit exceeded");

        require(amount <= maxMintAmountsPerTx[currentTokenId], "Max mint amount per transaction exceeded");

        uint256 currentAddressMintAmount = addressMintAmounts[msg.sender][currentTokenId];
        require(currentAddressMintAmount + amount <= maxMintAmountsPerAddress[currentTokenId], "Max mint amount per address exceeded");

        emit NFTMinted(tokenId, msg.sender, amount);

        addressMintAmounts[msg.sender][currentTokenId]++;
        tokenSupplies[currentTokenId] += amount;
        
        _mint(msg.sender, tokenId, amount, "");
    }

    /**
     * @notice Withdraw funds from the contract
     */
    function withdraw() public payable {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw");

        uint256 balance = address(this).balance;
        require(balance > 0, "Not enough balance");

        emit Withdrawn(balance, teamWallet, communityWallet, msg.sender);

        (bool successTeamWallet, ) = payable(teamWallet).call{value: ((balance * 50) / 100)}("");
        require(successTeamWallet, "Transfer failed.");

        (bool successCommunityWallet, ) = payable(communityWallet).call{value: ((balance * 50) / 100)}("");
        require(successCommunityWallet, "Transfer failed.");

        (bool successOwner, ) = payable(msg.sender).call{value: (address(this).balance)}("");
        require(successOwner, "Transfer failed.");
    }

    /**
     * @notice Set the minting enabled or disabled for a token
     * @param tokenId The ID of the token
     * @param enabled Whether minting is enabled or disabled
     */
    function setMintingEnabled(uint256 tokenId, bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set minting enabled or disabled");
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        uint256 currentTokenId = tokenId - 1;
        mintingsEnabled[currentTokenId] = enabled;
        
        emit MintingEnabled(tokenId, enabled);
    }

    /**
     * @notice Set the visibility of NFTs
     * @param revealed Whether NFTs are revealed or hidden
     */
    function setNFTVisibility(bool revealed) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set NFTs revealed or hidden");

        nftsRevealed = revealed;
        
        emit NFTVisibilityChanged(revealed);
    }

    /**
     * @notice Set the maximum mint amount per transaction for a token
     * @param tokenId The ID of the token
     * @param amount The maximum mint amount per transaction
     */
    function setMaxMintAmountPerTx(uint256 tokenId, uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per transaction");
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        uint256 currentTokenId = tokenId - 1;
        maxMintAmountsPerTx[currentTokenId] = amount;

        emit MaxMintAmountPerTxChanged(tokenId, amount);
    }

    /**
     * @notice Set the maximum mint amount per address for a token
     * @param tokenId The ID of the token
     * @param amount The maximum mint amount per address
     */
    function setMaxMintAmountPerAddress(uint256 tokenId, uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per address");
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        uint256 currentTokenId = tokenId - 1;
        maxMintAmountsPerAddress[currentTokenId] = amount;

        emit MaxMintAmountPerAddressChanged(tokenId, amount);
    }

    /**
     * @notice Set the mint price for a token
     * @param tokenId The ID of the token
     * @param price The mint price
     */
    function setMintPrice(uint256 tokenId, uint256 price) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set mint price");
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        uint256 currentTokenId = tokenId - 1;
        mintPrices[currentTokenId] = price;
        
        emit MintPriceUpdated(tokenId, price);
    }

    /**
     * @notice Get the mint price for a specific token
     * @param tokenId The ID of the token
     * @return The mint price
     */
    function mintPrice(uint256 tokenId) public view returns (uint256) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");
        
        uint256 currentTokenId = tokenId - 1;

        return mintPrices[currentTokenId];
    }

    /**
     * @notice Check if minting is enabled for a specific token
     * @param tokenId The ID of the token
     * @return Whether minting is enabled
     */
    function mintingEnabled(uint256 tokenId) public view returns (bool) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");
        
        uint256 currentTokenId = tokenId - 1;

        return mintingsEnabled[currentTokenId];
    }

    /**
     * @notice Get the mint amount for a specific address and token
     * @param user The address of the user
     * @param tokenId The ID of the token
     * @return The mint amount
     */
    function addressMintAmount(address user, uint256 tokenId) public view returns (uint256) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");
        
        uint256 currentTokenId = tokenId - 1;

        return addressMintAmounts[user][currentTokenId];
    }

    /**
     * @notice Get the maximum supply for a specific token
     * @param tokenId The ID of the token
     * @return The maximum supply
     */
    function maxSupply(uint256 tokenId) public view returns (uint256) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");
        
        uint256 currentTokenId = tokenId - 1;

        return maxSupplies[currentTokenId];
    }

    /**
     * @notice Get the maximum mint amount per transaction for a specific token
     * @param tokenId The ID of the token
     * @return The maximum mint amount per transaction
     */
    function maxMintAmountPerTx(uint256 tokenId) public view returns (uint256) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");
        
        uint256 currentTokenId = tokenId - 1;

        return maxMintAmountsPerTx[currentTokenId];
    }

    /**
     * @notice Get the maximum mint amount per address for a specific token
     * @param tokenId The ID of the token
     * @return The maximum mint amount per address
     */
    function maxMintAmountPerAddress(uint256 tokenId) public view returns (uint256) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        uint256 currentTokenId = tokenId - 1;

        return maxMintAmountsPerAddress[currentTokenId];
    }

    /**
     * @notice Check if the contract supports a specific interface
     * @param interfaceId The interface ID
     * @return Whether the contract supports the interface
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool){
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Get the URI for a token
     * @param tokenId The ID of the token
     * @return The URI of the token
     */
    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");

        if(!nftsRevealed) {
            return HIDDEN_URI;
        }

        return bytes(BASE_URI).length > 0 ? string(abi.encodePacked(BASE_URI, tokenId.toString(), ".json")) : "";
    }

    /**
     * @notice Get the supply of a token
     * @param tokenId The ID of the token
     * @return The supply of the token
     */
    function tokenSupply(uint256 tokenId) public view returns (uint) {
        require(tokenId > 0 && tokenId <= TOKEN_COUNT, "Token does not exist");
        
        uint256 currentTokenId = tokenId - 1;

        return tokenSupplies[currentTokenId];
    }

    /**
     * @notice Get the total supply of all tokens
     * @return The total supply of all tokens
     */
    function totalSupply() public view returns (uint) {
        uint256 currentTotalSupply = 0;

        for (uint256 i = 0; i < TOKEN_COUNT; i++) {
            currentTotalSupply = currentTotalSupply + tokenSupplies[i];
        }

        return currentTotalSupply;
    }
}