// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import ERC721, Counters, Access Control, MerkleProof, and Strings from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ERC721Whitelist is ERC721, AccessControl {
    // @dev Use Strings library for uint256 and Counters library for tokenIdCounter
    using Strings for uint256;
    using Counters for Counters.Counter;
    
    // @dev Declare tokenIdCounter as a private variable of type Counters.Counter
    Counters.Counter private tokenIdCounter;

    // @dev Declare a constant variable for the admin role using the keccak256 hash function
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // @dev Define the base URI for token metadata
    string public baseURI = "ipfs://.../"; 

    // @dev Define the hidden URI for token metadata
    string public constant HIDDEN_URI = "ipfs://.../hidden.json";

    // @dev Set the minting price for tokens
    uint256 public mintPrice = 0.01 ether;

    // @dev Enable/disable minting
    bool public mintingEnabled = false;

    // @dev Enable/disable whitelist minting
    bool public whitelistMintingEnabled = false;

    // @dev Reveal/hide NFTs
    bool public nftsRevealed = false;

    // @dev Set the maximum token supply
    uint256 public constant MAX_SUPPLY = 10000;

    // @dev Set the maximum number of tokens that can be minted in a single transaction
    uint256 public maxMintAmountPerTx = 100;

    // @dev Set the maximum number of tokens that can be minted by a single address
    uint256 public maxMintAmountPerAddress = 10;

    // @dev Keep track of the number of tokens that have been minted by each address
    mapping(address => uint256) private addressMintAmount;

    // @dev A cryptographic hash computed from a list of data, used to verify address eligibility for minting
    bytes32 public merkleRoot;

    // @dev Set the team wallet address
    address public constant TEAM_WALLET = 0x0000000000000000000000000000000000000000;

    // @dev Set the community wallet address
    address public constant COMMUNITY_WALLET = 0x0000000000000000000000000000000000000000;

    // @dev Event to notify when minting is enabled/disabled
    event MintingEnabled(bool enabled);

    // @dev Event to notify when whitelist minting is enabled/disabled
    event WhitelistMintingEnabled(bool enabled);

    // @dev Event that is emitted when the visibility of the NFTs is changed
    event NFTVisibilityChanged(bool revealed);

    // @dev Event that is emitted when the base URI for token metadata is changed
    event BaseURIChanged(string newBaseURI);

    // @dev Event emitted when the maximum number of tokens that can be minted in a single transaction is changed
    event MaxMintAmountPerTxChanged(uint256 amount);

    // @dev Event emitted when the maximum number of tokens that can be minted by a single address is changed
    event MaxMintAmountPerAddressChanged(uint256 amount);

    // @dev Event emitted when the merkle root is set
    event MerkleRootChanged(bytes32 merkleRoot);

    // @dev Event to notify when the mint price is updated
    event MintPriceUpdated(uint256 price);

    // @dev Event emitted when NFTs are minted
    event NFTMinted(address indexed buyer, uint256 amount);

    // @dev Event emitted when the contract balance is withdrawn
    event Withdrawn(uint256 amount, address teamWallet, address communityWallet, address owner);

    // @dev Constructor that initializes the contract with a name and symbol for the NFT Collection and assigns admin role
    constructor(string memory name, string memory symbol, bytes32 initialMerkleRoot) ERC721(name, symbol) {
        _setRoleAdmin(ADMIN, ADMIN);
        _grantRole(ADMIN, msg.sender);
        
        merkleRoot = initialMerkleRoot;
    }

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

    function leaf(address newAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(newAddress));
    }

    function verify(bytes32 newLeaf, bytes32[] memory newMerkleProof) internal view returns (bool) {
        return MerkleProof.verify(newMerkleProof, merkleRoot, newLeaf);
    }

    // @dev Function to mint NFTs
    function mint(uint256 amount, bytes32[] calldata merkleProof) public payable {
        // @dev Ensure that minting is enabled and the transaction is from the original sender
        require(mintingEnabled, "Minting is currently disabled");
        
        // @dev Ensure that the correct amount of Ether is sent to purchase the NFTs
        require(amount > 0, "Not enough amount");
        require(msg.value >= mintPrice * amount, "Insufficient funds");

        // @dev Verify address eligibility using merkle proof if whitelist minting is enabled
        if(whitelistMintingEnabled) {
            require(verify(leaf(msg.sender), merkleProof), "Address is not in the whitelist or wrong merkle proof");
        }

        // @dev Ensure that the maximum supply limit is not exceeded
        uint256 currentSupply = tokenIdCounter.current();
        require(currentSupply + amount <= MAX_SUPPLY, "Max supply limit exceeded");

        // @dev Ensure that the maximum number of tokens that can be minted in a single transaction is not exceeded
        require(amount <= maxMintAmountPerTx, "Max mint amount per transaction exceeded");

        // @dev Ensure that the maximum number of tokens that can be minted by a single address is not exceeded
        uint256 currentAddressMintAmount = addressMintAmount[msg.sender];
        require(currentAddressMintAmount + amount <= maxMintAmountPerAddress, "Max mint amount per address exceeded");

        // @dev Emit the NFTMinted event
        emit NFTMinted(msg.sender, amount);

        // @dev Mint the specified number of NFTs and increment the token counter
        for(uint256 i = 0; i < amount; i++) {
            // @dev Increment the number of tokens that have been minted by the address
            addressMintAmount[msg.sender]++;

            // @dev Increment the token counter and mint a new token
            tokenIdCounter.increment();
            _safeMint(msg.sender, tokenIdCounter.current());
        }
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
    function setMintingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set minting enabled");
        
        mintingEnabled = enabled;
        
        emit MintingEnabled(enabled);
    }

    // @dev Function to set the whitelist minting enabled status
    function setWhitelistMintingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set whitelist minting enabled");
        
        whitelistMintingEnabled = enabled;
        
        emit WhitelistMintingEnabled(enabled);
    }

    // @dev Function to reveal or hide the NFTs
    function setNFTVisibility(bool revealed) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set NFT visibility");
        
        nftsRevealed = revealed;
        
        emit NFTVisibilityChanged(revealed);
    }

    // @dev Function to set the base URI for token metadata
    function setBaseURI(string memory newBaseURI) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set base uri");
        
        baseURI = newBaseURI;
        
        emit BaseURIChanged(newBaseURI);
    }

    // @dev Function to set the maximum number of tokens that can be minted in a single transaction
    function setMaxMintAmountPerTx(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per transaction");
        
        maxMintAmountPerTx = amount;

        emit MaxMintAmountPerTxChanged(amount);
    }

    // @dev Function to set the maximum number of tokens that can be minted by a single address
    function setMaxMintAmountPerAddress(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set max mint amount per address");
        
        maxMintAmountPerAddress = amount;

        emit MaxMintAmountPerAddressChanged(amount);
    }

    // @dev Function to set the merkle root
    function setMerkleRoot(bytes32 newMerkleRoot) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set merkle root");

        merkleRoot = newMerkleRoot;
        
        emit MerkleRootChanged(newMerkleRoot);
    }

    // @dev Function to set the mint price
    function setMintPrice(uint256 price) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set mint price");

        mintPrice = price;
        
        emit MintPriceUpdated(price);
    }

    // @dev Function to get the array of token IDs owned by a specific address within a certain range of IDs
    function tokensOfOwner(address owner, uint startId, uint endId) external view returns(uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);

        // @dev If the token count is 0, return an empty array
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