// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import ERC721, Counters, Ownable, and Strings from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ERC721Basic is ERC721, Ownable {
    // @dev Use Strings library for uint256 and Counters library for tokenIdCounter
    using Strings for uint256;
    using Counters for Counters.Counter;
    
    // @dev Declare tokenIdCounter as a private variable of type Counters.Counter
    Counters.Counter private tokenIdCounter;

    // @dev Define the base URI for token metadata
    string public baseURI = "ipfs://.../"; 

    // @dev Define the hidden URI for token metadata
    string public constant HIDDEN_URI = "ipfs://.../hidden.json";

    // @dev Set the minting price for tokens
    uint256 public mintPrice = 0.01 ether;

    // @dev Enable/disable minting
    bool public mintingEnabled = false;

    // @dev Reveal/hide NFTs
    bool public nftsRevealed = false;

    // @dev Set the maximum token supply
    uint256 public constant MAX_SUPPLY = 10000;

    // @dev Set the team wallet address
    address public constant TEAM_WALLET = 0x0000000000000000000000000000000000000000;

    // @dev Set the community wallet address
    address public constant COMMUNITY_WALLET = 0x0000000000000000000000000000000000000000;

    // @dev Event to notify when minting is enabled/disabled
    event MintingEnabled(bool enabled);

    // @dev Event that is emitted when the visibility of the NFTs is changed
    event NFTVisibilityChanged(bool revealed);

    // @dev Event that is emitted when the base URI for token metadata is changed
    event BaseURIChanged(string newBaseURI);

    // @dev Event to notify when the mint price is updated
    event MintPriceUpdated(uint256 price);

    // @dev Event emitted when NFTs are minted
    event NFTMinted(address indexed buyer, uint256 amount);

    // @dev Event emitted when the contract balance is withdrawn
    event Withdrawn(uint256 amount, address teamWallet, address communityWallet, address owner);

    // @dev Constructor that initializes the contract with a name and symbol for the NFT Collection
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    // @dev Override the _baseURI function to return the base URI
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    // @dev Override the tokenURI function to return the URI for a specific token ID
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId) && tokenId >= 1 && tokenId <= MAX_SUPPLY, "Token doesn't exist");

        // @dev If NFTs are currently hidden, return a default hidden URI
        if(!nftsRevealed) {
            return HIDDEN_URI;
        }

        // @dev Get the current base URI and concatenate it with the token ID and file extension to form the token URI
        string memory currentBaseURI = _baseURI();
        return bytes(currentBaseURI).length > 0 ? string(abi.encodePacked(currentBaseURI, tokenId.toString(), ".json")) : "";
    }

    // @dev Function to mint NFTs
    function mint(uint256 amount) public payable {
        // @dev Ensure that minting is enabled and the transaction is from the original sender
        require(mintingEnabled, "Minting is currently disabled");

        // @dev Ensure that the correct amount of Ether is sent to purchase the NFTs
        require(amount > 0, "Not enough amount");
        require(msg.value >= mintPrice * amount, "Insufficient funds");

        // @dev Ensure that the maximum supply limit is not exceeded
        uint256 currentSupply = tokenIdCounter.current();
        require(currentSupply + amount <= MAX_SUPPLY, "Max supply limit exceeded");

        // @dev Emit the NFTMinted event
        emit NFTMinted(msg.sender, amount);

        // @dev Mint the specified number of NFTs and increment the token counter
        for(uint256 i = 0; i < amount; i++) {
            tokenIdCounter.increment();
            _safeMint(msg.sender, tokenIdCounter.current());
        }
    }

    // @dev Function to withdraw the contract balance
    function withdraw() public payable onlyOwner {
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
    function setMintingEnabled(bool enabled) public onlyOwner {
        mintingEnabled = enabled;
        
        emit MintingEnabled(enabled);
    }

    // @dev Function to reveal or hide the NFTs
    function setNFTVisibility(bool revealed) public onlyOwner {
        nftsRevealed = revealed;
        
        emit NFTVisibilityChanged(revealed);
    }

    // @dev Function to set the base URI for token metadata
    function setBaseURI(string memory newBaseURI) public onlyOwner {
        baseURI = newBaseURI;
        
        emit BaseURIChanged(newBaseURI);
    }

    // @dev Function to set the mint price
    function setMintPrice(uint256 price) public onlyOwner {
        mintPrice = price;
        
        emit MintPriceUpdated(price);
    }

    // @dev Function to get the array of token IDs owned by a specific address within a certain range of IDs
    function tokensOfOwner(address owner, uint startId, uint endId) external view returns(uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);

        // @dev If the token count is 0, return an empty array.
        if(tokenCount == 0) {
            return new uint256[](0);
        } else {
            // @dev Initialize an array to store the token IDs and a variable to keep track of the index
            uint256[] memory result = new uint256[](tokenCount);
            uint256 index = 0;

            // @dev Iterate through the range of token IDs and check if the current ID is owned by the given address
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

    // @dev Function to get the total number of tokens minted
    function totalSupply() public view returns (uint) {
        return tokenIdCounter.current();
    }
}