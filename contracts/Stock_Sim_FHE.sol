pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract StockSimFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 30;
    bool public paused = false;
    uint256 public currentBatchId = 0;
    bool public batchOpen = false;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Encrypted state for the simulation
    mapping(uint256 => euint32) public encryptedStockPrice;
    mapping(uint256 => euint32) public encryptedPlayerBalance;
    mapping(uint256 => euint32) public encryptedPlayerStockHolding;
    mapping(uint256 => euint32) public encryptedNewsImpact;

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSecondsChanged(uint256 oldCooldown, uint256 newCooldown);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event NewsSubmitted(uint256 indexed batchId, address indexed provider);
    event TradeSubmitted(uint256 indexed batchId, address indexed player);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId, uint256 stockPrice, uint256 playerBalance, uint256 playerStockHolding, uint256 newsImpact);

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSecondsChanged(oldCooldown, newCooldown);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert Paused(); // Already unpaused
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert InvalidBatch();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitNews(
        euint32 encryptedImpact
    ) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        lastSubmissionTime[msg.sender] = block.timestamp;

        encryptedNewsImpact[currentBatchId] = encryptedImpact;

        emit NewsSubmitted(currentBatchId, msg.sender);
    }

    function submitTrade(
        euint32 encryptedPlayerBalanceUpdate,
        euint32 encryptedPlayerStockHoldingUpdate
    ) external whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        lastSubmissionTime[msg.sender] = block.timestamp;

        encryptedPlayerBalance[currentBatchId] = encryptedPlayerBalanceUpdate;
        encryptedPlayerStockHolding[currentBatchId] = encryptedPlayerStockHoldingUpdate;

        emit TradeSubmitted(currentBatchId, msg.sender);
    }

    function requestBatchDecryption() external whenNotPaused checkDecryptionCooldown {
        if (!batchOpen) revert BatchNotOpen(); // Ensure batch is closed or can be decrypted

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 stockPrice = encryptedStockPrice[currentBatchId];
        euint32 playerBalance = encryptedPlayerBalance[currentBatchId];
        euint32 playerStockHolding = encryptedPlayerStockHolding[currentBatchId];
        euint32 newsImpact = encryptedNewsImpact[currentBatchId];

        bytes32[] memory cts = new bytes32[](4);
        cts[0] = stockPrice.toBytes32();
        cts[1] = playerBalance.toBytes32();
        cts[2] = playerStockHolding.toBytes32();
        cts[3] = newsImpact.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild ciphertexts from current storage in the same order
        uint256 batchId = decryptionContexts[requestId].batchId;
        euint32 stockPrice = encryptedStockPrice[batchId];
        euint32 playerBalance = encryptedPlayerBalance[batchId];
        euint32 playerStockHolding = encryptedPlayerStockHolding[batchId];
        euint32 newsImpact = encryptedNewsImpact[batchId];

        bytes32[] memory currentCts = new bytes32[](4);
        currentCts[0] = stockPrice.toBytes32();
        currentCts[1] = playerBalance.toBytes32();
        currentCts[2] = playerStockHolding.toBytes32();
        currentCts[3] = newsImpact.toBytes32();

        bytes32 currentHash = _hashCiphertexts(currentCts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // Decode cleartexts in the same order
        uint256 stockPriceCleartext = abi.decode(cleartexts[0:32], (uint256));
        uint256 playerBalanceCleartext = abi.decode(cleartexts[32:64], (uint256));
        uint256 playerStockHoldingCleartext = abi.decode(cleartexts[64:96], (uint256));
        uint256 newsImpactCleartext = abi.decode(cleartexts[96:128], (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, stockPriceCleartext, playerBalanceCleartext, playerStockHoldingCleartext, newsImpactCleartext);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 storageVar, uint256 plainValue) internal {
        if (!storageVar.isInitialized()) {
            storageVar = FHE.asEuint32(plainValue);
        }
    }

    function _requireInitialized(euint32 storageVar) internal view {
        if (!storageVar.isInitialized()) revert("NotInitialized");
    }
}