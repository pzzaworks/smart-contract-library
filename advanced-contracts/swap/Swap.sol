// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import IERC20 and AccessControl from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

// @dev Interface for the Swap Pool contract
interface ISwapPool {
    function withdraw(IERC20 token, address receiver, uint256 amount) external;
}

// @dev Interface for the Royalty Fee Pool contract
interface IRoyaltyFeePool {
    function deposit(address sender, uint256 amount) external;
}

contract Swap is AccessControl {
    // @dev Declare a constant variable for the admin role using the keccak256 hash function
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // @dev Swap Pool contract interface
    ISwapPool immutable private swapPool;

    // @dev Royalty Fee Pool contract interface
    IRoyaltyFeePool immutable private royaltyFeePool;

    // @dev Royalty fee percentage for swapping tokens
    uint256 public royaltyFeePercentage;

    // @dev Mapping to store swap ratios between token pairs
    mapping(address => mapping(address => uint256)) private swapRatios;

    // @dev Enable/disable swapping
    bool public swapEnabled = false;

    // @dev Event emitted when swapping is enabled or disabled
    event SwapEnabled(bool enabled);

    // @dev Event emitted when the royalty fee percentage is changed
    event RoyaltyFeePercentageChanged(uint256 newRoyaltyFeePercentage);

    // @dev Event emitted when the swap ratios between token pairs are changed
    event SwapRatiosChanged(address tokenOneAddress, address tokenTwoAddress, uint256 swapRatio);

    // @dev Event emitted when tokens are swapped
    event Swapped(address indexed staker, uint256 date, address tokenOne, address tokenTwo, uint256 tokenOneAmount, uint256 tokenTwoAmount, bool swapTokenOneToTwouint256);
    
    // @dev Event emitted when tokens are withdrawn
    event TokensWithdrawn(address indexed token, address indexed receiver, uint256 amount);

    // @dev Event emitted when native tokens (e.g., Ether) are withdrawn
    event NativeTokensWithdrawn(address indexed receiver, uint256 amount);
    
    // @dev Function to receive Ether
    receive() external payable {}

    // @dev Function to receive Ether when no other function matches the called function signature
    fallback() external payable {}

    // @dev Constructor function that sets the swap pool contract, royalty fee pool contract and initial royalty fee percentage for the pool
    constructor(ISwapPool swapPoolContract, IRoyaltyFeePool royaltyFeePoolContract, uint256 initialRoyaltyFeePercentage) {
        swapPool = swapPoolContract;
        royaltyFeePool = royaltyFeePoolContract;
        royaltyFeePercentage = initialRoyaltyFeePercentage;
    }

    // @dev Function to swap tokens
    function swapTokens(IERC20 tokenOne, IERC20 tokenTwo, uint256 tokenOneAmount, uint256 tokenTwoAmount, bool swapTokenOneToTwo) public {
        // @dev Check if swapping is currently enabled
        require(swapEnabled, "Swapping is currently disabled");
        
        // @dev Require that the token addresses are different
        require(address(tokenOne) != address(tokenTwo), "Tokens must be different");

        // @dev Create an instance of the IERC20 interface for the swap token
        IERC20 swapToken = tokenOne;

        // @dev Initialize the swap token amount to 0
        uint256 swapTokenAmount = 0;

        // @dev Set swap ratio to 1                     
        uint256 swapRatio = 1;

        // @dev Based on if the swapToken is tokenOne or tokenTwo, we either use tokenOne or tokenTwo as the swap address
        if(swapTokenOneToTwo) {
            // @dev Ensure the tokenOne amount  of msg.sender is greater than zero
            require(tokenOneAmount > 0, "Not enough amount");

            // @dev Ensure the tokenOne balance of msg.sender is greater than or equal to the tokenOne amount 
            require(tokenOne.balanceOf(msg.sender) >= tokenOneAmount, "This address doesnt have enough tokens");
            
            // @dev Set the tokenOne address as the swap address
            swapToken = tokenOne;

            // @dev Get the swapTokenAmount from the ratio
            swapRatio = swapRatios[address(tokenOne)][address(tokenTwo)];

            // @dev Get the swapTokenAmount from tokenOneAmount and tokenTwoAmount
            swapTokenAmount = tokenOneAmount / swapRatio;
        } else {
            // @dev Ensure the tokenTwo amount of msg.sender is greater than zero
            require(tokenTwoAmount > 0, "Not enough amount");

            // @dev Ensure the tokenTwo balance of msg.sender is greater than or equal to the tokenTwo amount
            require(tokenTwo.balanceOf(msg.sender) >= tokenTwoAmount, "This address doesnt have enough tokens");

            // @dev Set the tokenTwo address as the swap address
            swapToken = tokenTwo;

            // @dev Get the swapTokenAmount from the ratio
            swapRatio = swapRatios[address(tokenTwo)][address(tokenOne)];

            // @dev Get the swapTokenAmount from tokenOneAmount and tokenTwoAmount
            swapTokenAmount = tokenTwoAmount / swapRatio;
        }

        // @dev Get the royalty fee amount
        uint256 royaltyFeeAmount = ((swapTokenAmount * royaltyFeePercentage) / 100);

        // @dev Set the swapTokenAmount
        uint256 swapAmount = swapTokenAmount - royaltyFeeAmount;

        // @dev Ensure the swap amount is greater than zero
        require(swapAmount > 0, "Not enough swap amount");

        // @dev Ensure the swap pool has got enough tokens to exchange
        require(swapToken.balanceOf(address(swapPool)) >= swapAmount, "The swap pool has not got enough tokens to exchange");

        // @dev Emit the event `Swapped`
        emit Swapped(msg.sender, block.timestamp, address(tokenOne), address(tokenTwo), tokenOneAmount, tokenTwoAmount, swapTokenOneToTwo);
        
        // @dev Transfer royaltyFeeAmount to msg.sender via the royaltyFeePool
        royaltyFeePool.deposit(msg.sender, swapAmount);

        // @dev Check if the transfer was successful
        bool successSwapTokenTransfer = swapToken.transferFrom(msg.sender, address(this), swapAmount);
        require(successSwapTokenTransfer, "Swapping failed");

        // @dev Withdraw swap amount of swapToken from the swapPool
        swapPool.withdraw(swapToken, msg.sender, swapTokenAmount);
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

    // @dev Function to enable or disable swapping
    function setSwapEnabled(bool enabled) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to swap tokens");

        swapEnabled = enabled;
        
        emit SwapEnabled(enabled);
    }

    // @dev Function to set the royalty fee percentage
    function setRoyaltyFeePercentage(uint256 newRoyaltyFeePercentage) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set the royalty fee percentage");

        royaltyFeePercentage = newRoyaltyFeePercentage;
        
        emit RoyaltyFeePercentageChanged(newRoyaltyFeePercentage);
    }

    // @dev Function to set the swap ratios
    function setSwapRatios(address tokenOneAddress, address tokenTwoAddress, uint256 swapRatio) public {
        require(hasRole(ADMIN, msg.sender), "Only administrators are allowed to set the swap ratios");

        swapRatios[tokenOneAddress][tokenTwoAddress] = swapRatio;
        
        emit SwapRatiosChanged(tokenOneAddress, tokenTwoAddress, swapRatio);
    }
}