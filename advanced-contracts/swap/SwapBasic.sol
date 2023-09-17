// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

// @dev: Berke (pzzaworks) - pzza.works

// @dev Import IERC20 and Ownable from OpenZeppelin contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// @dev Interface for the Swap Pool contract
interface ISwapPool {
    function withdraw(IERC20 token, address receiver, uint256 amount) external;
}

// @dev Interface for the Royalty Fee Pool contract
interface IRoyaltyFeePool {
    function deposit(address sender, uint256 amount) external;
}

contract SwapBasic is Ownable {
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

    // @dev Function to enable or disable swapping
    function setSwapEnabled(bool enabled) public onlyOwner {
        swapEnabled = enabled;
        
        emit SwapEnabled(enabled);
    }

    // @dev Function to set the royalty fee percentage
    function setRoyaltyFeePercentage(uint256 newRoyaltyFeePercentage) public onlyOwner {
        royaltyFeePercentage = newRoyaltyFeePercentage;
        
        emit RoyaltyFeePercentageChanged(newRoyaltyFeePercentage);
    }

    // @dev Function to set the swap ratios
    function setSwapRatios(address tokenOneAddress, address tokenTwoAddress, uint256 swapRatio) public onlyOwner {
        swapRatios[tokenOneAddress][tokenTwoAddress] = swapRatio;
        
        emit SwapRatiosChanged(tokenOneAddress, tokenTwoAddress, swapRatio);
    }
}