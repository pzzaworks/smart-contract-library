// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import IERC20, AccessControl and MerkleProof from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract Airdrop is AccessControl {
    // @dev Declare a constant variable for the admin role using the keccak256 hash function
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // @dev Declare a constant variable for the depositor role using the keccak256 hash function
    bytes32 public constant DEPOSITOR = keccak256("DEPOSITOR");

    // @dev Token contract interface
    IERC20 private immutable token;

    // @dev Immutable variable representing the merkle root
    bytes32 public immutable merkleRoot;

    // @dev Total amount of tokens allocated for airdrop
    uint256 public totalAirdropAmount;

    // @dev Balance of tokens in the airdrop pool
    uint256 public airdropPoolBalance;

    // @dev Amount of tokens allocated per address in the airdrop
    uint256 public airdropAmountPerAddress;

    // @dev Flag indicating if claiming of airdrop is enabled
    bool public claimingEnabled;

    // @dev Flag indicating if depositing to the airdrop pool is enabled
    bool public depositingEnabled;

    // @dev Mapping to track if an address has claimed their airdrop tokens
    mapping(address => bool) public claimed;

    // @dev Event emitted when claiming is enabled or disabled
    event ClaimingEnabled(bool enabled);

    // @dev Event emitted when depositing is enabled or disabled
    event DepositingEnabled(bool enabled);

    // @dev Event emitted when the airdrop amount per address is changed
    event AirdropAmountPerAddressChanged(uint256 amount);

    // @dev Event emitted when tokens are deposited into the pool
    event Deposited(address indexed depositor, uint256 amount, uint256 airdropPoolBalance);
    
    // @dev Event emitted when tokens are claimed from the pool
    event Claimed(address indexed receiver, uint256 date, uint256 airdropPoolBalance);

    // @dev Event emitted when tokens are withdrawn
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);

    // @dev Event emitted when native tokens (e.g., Ether) are withdrawn
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    // @dev Function to receive Ether
    receive() external payable {}

    // @dev Function to receive Ether when no other function matches the called function signature
    fallback() external payable {}

    // @dev Constructor function that sets the token contract, initial merkle root, initial airdrop amount per address for the pool
    constructor(IERC20 tokenContract, address depositor, bytes32 initialMerkleRoot, uint256 initialAirdropAmountPerAddress) {
        _setRoleAdmin(ADMIN, ADMIN);
        _setRoleAdmin(DEPOSITOR, ADMIN);
      
        _grantRole(ADMIN, msg.sender);
        _grantRole(DEPOSITOR, depositor);

        token = tokenContract;  
        merkleRoot = initialMerkleRoot; 
        airdropAmountPerAddress = initialAirdropAmountPerAddress;
    }

    // @dev Function to deposit tokens into the pool
    function deposit(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender) || hasRole(DEPOSITOR, msg.sender), "Only administrators and authorized depositors are allowed to deposit tokens");

        // @dev Check if depositing is enabled
        require(depositingEnabled, "Depositing is currently disabled");

        // @dev Check if the deposit amount is greater than zero
        require(amount > 0, "Deposit amount must be greater than zero");
        
        // @dev Check if the depositor has sufficient tokens
        uint256 balance = token.balanceOf(address(msg.sender)); 
        require(balance >= amount, "Insufficient token balance, need more tokens to perform this deposit");

        // @dev Increase the total airdrop amount by the deposited amount
        totalAirdropAmount += amount;
        
        // @dev Increase the pool balance by the deposited amount
        airdropPoolBalance += amount;
            
        // @dev Emit an event indicating the tokens have been deposited
        emit Deposited(msg.sender, amount, airdropPoolBalance);

        // @dev Transfer the tokens from the depositor to the pool
        bool success = token.transferFrom(msg.sender, address(this), amount);
        require(success, "Deposit failed");
    }

    // @dev Function to claim tokens from the pool
    function claim(bytes32[] calldata proof) public {
        // @dev Check if claiming is enabled
        require(claimingEnabled, "Claiming is currently disabled");

        // @dev Check if claiming is msg.sender address already claimed airdrop before
        require(!claimed[msg.sender], "This address already claimed airdrop before");
        
        // @dev Check if there are sufficient tokens in the pool and pool balance to perform the claiming
        uint256 balance = token.balanceOf(address(this)); 
        require(balance >= airdropAmountPerAddress && airdropPoolBalance >= airdropAmountPerAddress, "Unable to claim airdrop, insufficient tokens in the airdrop pool");
        
        // @dev Calculate the leaf value by hashing the sender's address and airdrop amount per address
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, airdropAmountPerAddress));

        // @dev Verify if the address is in the airdrop list using the provided Merkle proof
        bool isAddressInTheAirdropList = MerkleProof.verify(proof, merkleRoot, leaf);

        // @dev Check if the address is eligible for the airdrop
        require(isAddressInTheAirdropList, "You are not eligible for this airdrop");

        // @dev Set the claimed status for the sender's address to true
        claimed[msg.sender] = true;

        // @dev Decrease the pool balance by the claimed amount
        airdropPoolBalance -= airdropAmountPerAddress;
            
        // @dev Emit an event indicating the tokens have been claimed
        emit Claimed(msg.sender, block.timestamp, airdropPoolBalance);

        // @dev Transfer the tokens from the pool to the receiver
        bool success = token.transfer(msg.sender, airdropAmountPerAddress);
        require(success, "Claiming failed");
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

        if(address(tokenToWithdraw) == address(token)) {
            totalAirdropAmount = 0;
            airdropPoolBalance = 0;
        }

        // @dev Emit an event indicating the withdrawal of tokens
        emit TokensWithdrawn(address(tokenToWithdraw), msg.sender, balance);

        // @dev Ensure the withdrawal was successful
        bool success = tokenToWithdraw.transfer(msg.sender, balance);
        require(success, "Withdraw failed");
    }

    // @dev Function to set airdrop amount per address
    function setAirdropAmountPerAddress(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to set airdrop amount per address");

        airdropAmountPerAddress = amount;
        
        emit AirdropAmountPerAddressChanged(amount);
    }

    // @dev Function to enable or disable claiming
    function setClaimingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable claiming");

        claimingEnabled = enabled;
        
        emit ClaimingEnabled(enabled);
    }

    // @dev Function to enable or disable depositing
    function setDepositingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable depositing");

        depositingEnabled = enabled;
        
        emit DepositingEnabled(enabled);
    }
}