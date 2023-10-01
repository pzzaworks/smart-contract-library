// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title Airdrop Contract
 * @notice This contract enables the admin to distribute tokens from the airdrop pool based on a Merkle root and proof.
 *         The airdropped tokens can be claimed by eligible users after providing a valid Merkle proof.
 * @dev Berke (pzzaworks) - pzza.works
 */
contract Airdrop is AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant DEPOSITOR = keccak256("DEPOSITOR");

    address private immutable tokenAddress;

    bytes32 public immutable merkleRoot;
    uint256 public immutable airdropAmountPerAddress;
    uint256 public totalAirdropAmount;
    uint256 public airdropPoolBalance;

    bool public claimingEnabled;
    bool public depositingEnabled;

    mapping(address => bool) public claimed;

    event ClaimingEnabled(bool enabled);
    event DepositingEnabled(bool enabled);
    event AirdropAmountPerAddressChanged(uint256 amount);
    event Deposited(address indexed depositor, uint256 amount, uint256 airdropPoolBalance);
    event Claimed(address indexed receiver, uint256 date, uint256 airdropPoolBalance);
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    receive() external payable {}
    fallback() external payable {}

    /**
     * @notice Constructor for initializing the contract
     * @param initialTokenAddress The ERC20 token contract address
     * @param depositor The address of the depositor
     * @param initialMerkleRoot The initial merkle root value
     * @param initialAirdropAmountPerAddress The initial airdrop amount per address
     */
    constructor(address initialTokenAddress, address depositor, bytes32 initialMerkleRoot, uint256 initialAirdropAmountPerAddress) {
        _setRoleAdmin(ADMIN, ADMIN);
        _setRoleAdmin(DEPOSITOR, ADMIN);
      
        _grantRole(ADMIN, msg.sender);
        _grantRole(DEPOSITOR, depositor);

        tokenAddress = initialTokenAddress;  
        merkleRoot = initialMerkleRoot; 
        airdropAmountPerAddress = initialAirdropAmountPerAddress;
        depositingEnabled = true;
        claimingEnabled = true;
    }
    
    /**
     * @notice Deposit tokens into the airdrop pool
     * @param amount The amount of tokens to deposit
     */
    function deposit(uint256 amount) public {
        require(hasRole(ADMIN, msg.sender) || hasRole(DEPOSITOR, msg.sender), "Only administrators and authorized depositors are allowed to deposit tokens");
        require(depositingEnabled, "Depositing is currently disabled");
        require(amount > 0, "Deposit amount must be greater than zero");

        IERC20 token = IERC20(tokenAddress);

        uint256 balance = token.balanceOf(address(msg.sender)); 
        require(balance >= amount, "Insufficient token balance, need more tokens to perform this deposit");

        totalAirdropAmount += amount;
        airdropPoolBalance += amount;
            
        emit Deposited(msg.sender, amount, airdropPoolBalance);

        bool depositedSuccessfully = token.transferFrom(msg.sender, address(this), amount);
        require(depositedSuccessfully, "Deposit failed");
    }
    
    /**
     * @notice Claim tokens from the airdrop pool
     * @param proof The Merkle proof for verifying the address in the airdrop list
     */
    function claim(bytes32[] calldata proof) public {
        require(claimingEnabled, "Claiming is currently disabled");
        require(!claimed[msg.sender], "This address already claimed airdrop before");

        IERC20 token = IERC20(tokenAddress);

        uint256 balance = token.balanceOf(address(this)); 
        require(balance >= airdropAmountPerAddress && airdropPoolBalance >= airdropAmountPerAddress, "Unable to claim airdrop, insufficient tokens in the airdrop pool");
        
        bool isAddressInTheAirdropList = checkAirdropEligibility(msg.sender, proof);
        require(isAddressInTheAirdropList, "You are not eligible for this airdrop");

        claimed[msg.sender] = true;
        airdropPoolBalance -= airdropAmountPerAddress;
            
        emit Claimed(msg.sender, block.timestamp, airdropPoolBalance);

        bool claimedSuccessfully = token.transfer(msg.sender, airdropAmountPerAddress);
        require(claimedSuccessfully, "Claiming failed");
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
        require(tokenToWithdrawAddress != tokenAddress, "Cannot withdraw the airdrop tokens");

        IERC20 tokenToWithdraw = IERC20(tokenToWithdrawAddress);
        
        uint256 balance = tokenToWithdraw.balanceOf(address(this)); 
        require(balance > 0, "Insufficient tokens to withdraw");

        emit TokensWithdrawn(tokenToWithdrawAddress, msg.sender, balance);

        bool tokensWithdrawnSuccessfully = tokenToWithdraw.transfer(msg.sender, balance);
        require(tokensWithdrawnSuccessfully, "Withdraw tokens failed");
    }

    /**
     * @notice Check the eligibility of an address for the airdrop
     * @param userAddress The address to check
     * @param proof The Merkle proof
     * @return True if the address is eligible for the airdrop, false otherwise
     */
    function checkAirdropEligibility(address userAddress, bytes32[] calldata proof) public view returns (bool) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(userAddress, airdropAmountPerAddress))));
        bool isAddressInTheAirdropList = MerkleProof.verify(proof, merkleRoot, leaf);

        return isAddressInTheAirdropList;
    }

    /**
     * @notice Enable or disable claiming
     * @param enabled A boolean indicating whether claiming is enabled or disabled
     */
    function setClaimingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable claiming");

        claimingEnabled = enabled;
        
        emit ClaimingEnabled(enabled);
    }

    /**
     * @notice Enable or disable depositing
     * @param enabled A boolean indicating whether depositing is enabled or disabled
     */
    function setDepositingEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are authorized to enable or disable depositing");

        depositingEnabled = enabled;
        
        emit DepositingEnabled(enabled);
    }
}