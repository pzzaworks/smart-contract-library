// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ERC721 Token Contract
 * @notice This contract is used to manage and mint ERC721 tokens 
 * @dev Berke (pzzaworks) - pzza.works
 */
contract ERC721Contract is ERC721, AccessControl {
    using Strings for uint256;
    using Counters for Counters.Counter;
    
    Counters.Counter private tokenIdCounter;

    bytes32 public constant ADMIN = keccak256("ADMIN");

    string public constant BASE_URI = "ipfs://.../"; 
    string public constant HIDDEN_URI = "ipfs://.../hidden.json";

    uint256 public constant MAX_SUPPLY = 1*(10**3);

    uint256 public mintPrice;

    bool public mintingEnabled;
    bool public nftsRevealed;

    uint256 public maxMintAmountPerTx;
    uint256 public maxMintAmountPerAddress;
    mapping(address => uint256) private addressMintAmount;

    address public immutable teamWallet;
    address public immutable communityWallet;

    event MintingEnabled(bool enabled);
    event NFTVisibilityChanged(bool revealed);
    event MaxMintAmountPerTxChanged(uint256 amount);
    event MaxMintAmountPerAddressChanged(uint256 amount);
    event MintPriceUpdated(uint256 price);
    event NFTMinted(address indexed minter, uint256 firstTokenId, uint256 lastTokenId, uint256 amount);
    event Withdrawn(uint256 amount, address teamWallet, address communityWallet, address owner);

    /**
     * @notice Contract constructor
     * @param name The name of the NFT contract
     * @param symbol The symbol of the NFT contract
     * @param initialTeamWallet The initial team wallet address
     * @param initialCommunityWallet The initial community wallet address
     * @param initialMintPrice The initial mint price
     * @param initialMaxMintAmountPerTx The initial maximum mint amount per transaction
     * @param initialMaxMintAmountPerAddress The initial maximum mint amount per address
     */
    constructor(
        string memory name, 
        string memory symbol, 
        address initialTeamWallet, 
        address initialCommunityWallet,
        uint256 initialMintPrice, 
        uint256 initialMaxMintAmountPerTx, 
        uint256 initialMaxMintAmountPerAddress 
    ) ERC721(name, symbol) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);

        teamWallet = initialTeamWallet;
        communityWallet = initialCommunityWallet;
        
        mintingEnabled = true;
        nftsRevealed = true;

        mintPrice = initialMintPrice;
        maxMintAmountPerTx = initialMaxMintAmountPerTx;
        maxMintAmountPerAddress = initialMaxMintAmountPerAddress;
    }

    /**
     * @notice Mint NFT tokens
     * @param amount The number of tokens to mint
     */
    function mint(uint256 amount) public payable {
        require(mintingEnabled, "Minting is currently disabled");

        require(amount > 0, "Not enough amount");
        require(msg.value >= mintPrice * amount, "Insufficient funds");

        uint256 currentSupply = tokenIdCounter.current();
        require(currentSupply + amount <= MAX_SUPPLY, "Max supply limit exceeded");

        require(amount <= maxMintAmountPerTx, "Max mint amount per transaction exceeded");

        uint256 currentAddressMintAmount = addressMintAmount[msg.sender];
        require(currentAddressMintAmount + amount <= maxMintAmountPerAddress, "Max mint amount per address exceeded");

        uint256 firstTokenId = currentSupply + 1;
        uint256 lastTokenId = currentSupply + amount;

        emit NFTMinted(msg.sender, firstTokenId, lastTokenId, amount);

        for(uint256 i = firstTokenId; i <= lastTokenId; i++) {
            tokenIdCounter.increment();
        }

        addressMintAmount[msg.sender] += amount;

        for(uint256 i = firstTokenId; i <= lastTokenId; i++) {
            _safeMint(msg.sender, i);
        }
    }

    /**
     * @notice Withdraw the contract balance to the designated wallets
     */
    function withdraw() public payable {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to withdraw");

        uint256 balance = address(this).balance;
        require(balance > 0, "Not enough balance");

        emit Withdrawn(balance, teamWallet, communityWallet, msg.sender);

        (bool withdrawnTeamWalletSuccessfully, ) = payable(teamWallet).call{value: ((balance * 50) / 100)}("");
        require(withdrawnTeamWalletSuccessfully, "Withdraw tokens to team wallet failed");

        (bool withdrawnCommunityWalletSuccessfully, ) = payable(communityWallet).call{value: ((balance * 50) / 100)}("");
        require(withdrawnCommunityWalletSuccessfully, "Withdraw tokens to community wallet failed");

        (bool withdrawnOwnerSuccessfully, ) = payable(msg.sender).call{value: (address(this).balance)}("");
        require(withdrawnOwnerSuccessfully, "Withdraw tokens to owner failed");
    }

    /**
     * @notice Set the minting enabled or disabled
     * @param enabled The new value for mintingEnabled
     */
    function setMintingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set minting enabled or disabled");

        mintingEnabled = enabled;
        
        emit MintingEnabled(enabled);
    }

    /**
     * @notice Set the visibility of the NFTs
     * @param revealed The new value for nftsRevealed
     */
    function setNFTVisibility(bool revealed) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set NFTs revealed or hidden");

        nftsRevealed = revealed;
        
        emit NFTVisibilityChanged(revealed);
    }

    /**
     * @notice Set the maximum mint amount per transaction
     * @param amount The new value for maxMintAmountPerTx
     */
    function setMaxMintAmountPerTx(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per transaction");

        maxMintAmountPerTx = amount;

        emit MaxMintAmountPerTxChanged(amount);
    }

    /**
     * @notice Set the maximum mint amount per address
     * @param amount The new value for maxMintAmountPerAddress
     */
    function setMaxMintAmountPerAddress(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per address");

        maxMintAmountPerAddress = amount;

        emit MaxMintAmountPerAddressChanged(amount);
    }

    /**
     * @notice Set the mint price
     * @param price The new value for mintPrice
     */
    function setMintPrice(uint256 price) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set mint price");

        mintPrice = price;
        
        emit MintPriceUpdated(price);
    }

    /**
     * @notice Internal function to get the base URI
     */
    function _baseURI() internal pure override returns (string memory) {
        return BASE_URI;
    }

    /**
     * @notice Get the token URI for a given tokenId
     * @param tokenId The ID of the token
     * @return The token URI
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId) && tokenId >= 1 && tokenId <= MAX_SUPPLY, "Token does not exist");

        if(!nftsRevealed) {
            return HIDDEN_URI;
        }

        string memory currentBaseURI = _baseURI();
        return bytes(currentBaseURI).length > 0 ? string(abi.encodePacked(currentBaseURI, tokenId.toString(), ".json")) : "";
    }

    /**
     * @notice Get the list of tokens owned by a specific address within a given range of token IDs
     * @param owner The address of the owner
     * @param startId The starting token ID
     * @param endId The ending token ID
     * @return An array of token IDs
     */
    function tokensOfOwner(address owner, uint startId, uint endId) external view returns(uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);

        if(tokenCount == 0) {
            return new uint256[](0);
        } else {
            uint256[] memory result = new uint256[](tokenCount);
            uint256 index = 0;

            for(uint256 tokenId = startId; tokenId < endId; tokenId++) {
                if(index == tokenCount) break;

                if(ownerOf(tokenId) == owner) {
                    result[index] = tokenId;
                    index++;
                }
            }
            return result;
        }
    }

    /**
     * @notice Check if a contract supports a specific interface
     * @param interfaceId The interface ID to check
     * @return True if the contract supports the interface, false otherwise
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
        
    /**
     * @notice Get the total supply of NFT tokens
     * @return The total supply of NFT tokens
     */
    function totalSupply() public view returns (uint) {
        return tokenIdCounter.current();
    }
}