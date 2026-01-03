/**
 * Stockfish Engine Wrapper
 * Handles communication with Stockfish 17 via Web Worker
 * With robust state management for rapid position changes
 * 
 * Improvements:
 * - Proper UCI protocol handling with command queue
 * - Wait for bestmove after stop before sending new commands
 * - Reduced use of ucinewgame (only for truly new games)
 * - Better timeout handling with exponential backoff
 * - Improved error recovery and state management
 */

// Engine states for proper state machine management
const EngineState = {
    UNINITIALIZED: 'uninitialized',
    INITIALIZING: 'initializing',
    READY: 'ready',
    ANALYZING: 'analyzing',
    STOPPING: 'stopping',
    ERROR: 'error'
};

class StockfishEngine {
    constructor() {
        this.worker = null;
        this.state = EngineState.UNINITIALIZED;
        this.currentFen = null;
        this.analysisCallback = null;
        this.depth = 20; // Default depth
        this.multiPV = 3; // Number of lines to analyze (top 3 moves)
        this.pendingAnalysis = null;
        this.analysisId = 0; // Unique ID for each analysis request
        this.currentAnalysisId = 0; // ID of the currently running analysis
        this.debounceTimer = null;
        this.debounceDelay = 100; // ms to wait before starting new analysis (increased for stability)
        this.lastActivityTime = Date.now();
        this.healthCheckInterval = null;
        this.commandQueue = [];
        this.isProcessingQueue = false;
        this.initPromise = null;
        this.initResolve = null;
        this.initReject = null;
        this.readyPromise = null;
        this.readyResolve = null;
        this.stopPromise = null;
        this.stopResolve = null;
        this.recoveryAttempts = 0;
        this.maxRecoveryAttempts = 3;
        this.lastFenForGame = null; // Track if we're in a new game
        this.messageBuffer = ''; // Buffer for incomplete messages
    }

    /**
     * Initialize the Stockfish engine
     */
    init() {
        // Return existing promise if already initializing
        if (this.initPromise && this.state === EngineState.INITIALIZING) {
            return this.initPromise;
        }

        // Return resolved promise if already ready
        if (this.state === EngineState.READY && this.worker) {
            return Promise.resolve();
        }

        this.initPromise = new Promise((resolve, reject) => {
            this.initResolve = resolve;
            this.initReject = reject;

            // Clean up any existing worker
            this.cleanup();
            this.state = EngineState.INITIALIZING;

            try {
                // Use the stockfish 17 lite single-threaded version from public folder
                this.worker = new Worker('./stockfish-17.js');
                
                this.worker.onmessage = (event) => {
                    const data = typeof event === 'string' ? event : event.data;
                    this.lastActivityTime = Date.now();
                    this.handleMessage(data);
                };

                this.worker.onerror = (error) => {
                    console.error('Stockfish worker error:', error);
                    this.state = EngineState.ERROR;
                    if (this.initReject) {
                        this.initReject(error);
                        this.initReject = null;
                        this.initResolve = null;
                    }
                    // Try to recover
                    this.scheduleRecovery();
                };

                // Initialize UCI
                this.sendCommand('uci');
                
                // Timeout after 15 seconds
                setTimeout(() => {
                    if (this.state === EngineState.INITIALIZING) {
                        const error = new Error('Stockfish initialization timeout');
                        if (this.initReject) {
                            this.initReject(error);
                            this.initReject = null;
                            this.initResolve = null;
                        }
                        this.state = EngineState.ERROR;
                    }
                }, 15000);

            } catch (error) {
                console.error('Failed to initialize Stockfish:', error);
                this.state = EngineState.ERROR;
                reject(error);
            }
        });

        return this.initPromise;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.worker) {
            try {
                this.worker.terminate();
            } catch (e) {
                // Ignore termination errors
            }
            this.worker = null;
        }
        this.state = EngineState.UNINITIALIZED;
        this.pendingAnalysis = null;
        this.commandQueue = [];
        this.isProcessingQueue = false;
        this.readyPromise = null;
        this.readyResolve = null;
        this.stopPromise = null;
        this.stopResolve = null;
        this.messageBuffer = '';
    }

    /**
     * Start health check to detect stalled engine
     */
    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(() => {
            // If we're analyzing and haven't received any message in 15 seconds, something is wrong
            if (this.state === EngineState.ANALYZING && (Date.now() - this.lastActivityTime > 15000)) {
                console.warn('Stockfish appears stalled, attempting recovery...');
                this.recoverEngine();
            }
            // If we're stopping and haven't received bestmove in 5 seconds, force recovery
            if (this.state === EngineState.STOPPING && (Date.now() - this.lastActivityTime > 5000)) {
                console.warn('Stockfish stop timeout, forcing recovery...');
                this.forceStopComplete();
            }
        }, 5000);
    }

    /**
     * Force complete a stuck stop operation
     */
    forceStopComplete() {
        if (this.stopResolve) {
            this.stopResolve();
            this.stopResolve = null;
            this.stopPromise = null;
        }
        this.state = EngineState.READY;
        this.processPendingAnalysis();
    }

    /**
     * Schedule engine recovery with exponential backoff
     */
    scheduleRecovery() {
        if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
            console.error('Max recovery attempts reached, giving up');
            this.state = EngineState.ERROR;
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.recoveryAttempts), 10000);
        this.recoveryAttempts++;
        
        setTimeout(() => {
            this.recoverEngine();
        }, delay);
    }

    /**
     * Recover the engine by reinitializing
     */
    async recoverEngine() {
        console.log('Recovering Stockfish engine...');
        const wasAnalyzing = this.state === EngineState.ANALYZING;
        const lastFen = this.currentFen;
        const lastCallback = this.analysisCallback;
        
        this.cleanup();
        
        try {
            await this.init();
            console.log('Stockfish engine recovered');
            this.recoveryAttempts = 0; // Reset on successful recovery
            
            // Resume analysis if we were analyzing before
            if (wasAnalyzing && lastFen && lastCallback) {
                this.analyzeInfinite(lastFen, lastCallback);
            }
        } catch (error) {
            console.error('Failed to recover Stockfish engine:', error);
            this.scheduleRecovery();
        }
    }

    /**
     * Send a command to Stockfish
     */
    sendCommand(cmd) {
        if (this.worker) {
            try {
                this.worker.postMessage(cmd);
            } catch (e) {
                console.error('Error sending command to Stockfish:', e);
                this.scheduleRecovery();
            }
        }
    }

    /**
     * Handle messages from Stockfish
     */
    handleMessage(message) {
        if (!message) return;

        // Handle multi-line messages
        if (message.indexOf('\n') > -1) {
            const lines = message.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.handleSingleMessage(line.trim());
                }
            });
            return;
        }

        this.handleSingleMessage(message.trim());
    }

    /**
     * Handle a single message line from Stockfish
     */
    handleSingleMessage(message) {
        if (!message) return;

        // UCI initialization complete
        if (message === 'uciok') {
            // Set options after UCI is ready
            this.sendCommand('setoption name MultiPV value ' + this.multiPV);
            // Send isready to confirm engine is ready
            this.sendCommand('isready');
        }

        // Engine is ready
        if (message === 'readyok') {
            if (this.state === EngineState.INITIALIZING) {
                this.state = EngineState.READY;
                this.startHealthCheck();
                if (this.initResolve) {
                    this.initResolve();
                    this.initResolve = null;
                    this.initReject = null;
                }
            }
            
            // Resolve any pending ready promise
            if (this.readyResolve) {
                this.readyResolve();
                this.readyResolve = null;
                this.readyPromise = null;
            }

            // Process pending analysis if we were waiting for ready
            this.processPendingAnalysis();
        }

        // Parse analysis info - check for score and pv
        if (message.startsWith('info') && message.includes(' pv ') && message.includes(' score ')) {
            this.parseInfo(message);
        }

        // Best move found - analysis complete
        if (message.startsWith('bestmove')) {
            const wasAnalyzing = this.state === EngineState.ANALYZING;
            const wasStopping = this.state === EngineState.STOPPING;
            
            this.state = EngineState.READY;
            
            // Resolve stop promise if we were waiting for it
            if (wasStopping && this.stopResolve) {
                this.stopResolve();
                this.stopResolve = null;
                this.stopPromise = null;
            }

            // Process any pending analysis
            this.processPendingAnalysis();
        }
    }

    /**
     * Process pending analysis if conditions are met
     */
    processPendingAnalysis() {
        if (this.state !== EngineState.READY) {
            return;
        }

        if (this.pendingAnalysis) {
            const { fen, callback, infinite, id } = this.pendingAnalysis;
            this.pendingAnalysis = null;
            
            // Only start if this is still the latest request
            if (id === this.analysisId) {
                this.currentAnalysisId = id;
                if (infinite) {
                    this._doAnalyzeInfinite(fen, callback);
                } else {
                    this._doAnalyze(fen, callback);
                }
            }
        }
    }

    /**
     * Wait for engine to be ready
     */
    waitForReady() {
        if (this.state === EngineState.READY) {
            return Promise.resolve();
        }

        if (!this.readyPromise) {
            this.readyPromise = new Promise((resolve) => {
                this.readyResolve = resolve;
                this.sendCommand('isready');
                
                // Safety timeout
                setTimeout(() => {
                    if (this.readyResolve) {
                        console.warn('Ready timeout, resolving anyway');
                        this.readyResolve();
                        this.readyResolve = null;
                        this.readyPromise = null;
                    }
                }, 3000);
            });
        }

        return this.readyPromise;
    }

    /**
     * Stop current analysis and wait for completion
     */
    async stopAndWait() {
        if (this.state !== EngineState.ANALYZING) {
            return Promise.resolve();
        }

        if (!this.stopPromise) {
            this.stopPromise = new Promise((resolve) => {
                this.stopResolve = resolve;
                this.state = EngineState.STOPPING;
                this.sendCommand('stop');
                
                // Safety timeout - if we don't get bestmove in 3 seconds, resolve anyway
                setTimeout(() => {
                    if (this.stopResolve) {
                        console.warn('Stop timeout, forcing completion');
                        this.forceStopComplete();
                    }
                }, 3000);
            });
        }

        return this.stopPromise;
    }

    /**
     * Parse info string from Stockfish
     */
    parseInfo(info) {
        const result = {
            depth: 0,
            seldepth: 0,
            multipv: 1,
            score: null,
            scoreType: 'cp', // cp (centipawns) or mate
            pv: [],
            nodes: 0,
            nps: 0,
            time: 0
        };

        const parts = info.split(' ');
        
        for (let i = 0; i < parts.length; i++) {
            switch (parts[i]) {
                case 'depth':
                    result.depth = parseInt(parts[i + 1]) || 0;
                    break;
                case 'seldepth':
                    result.seldepth = parseInt(parts[i + 1]) || 0;
                    break;
                case 'multipv':
                    result.multipv = parseInt(parts[i + 1]) || 1;
                    break;
                case 'score':
                    result.scoreType = parts[i + 1];
                    result.score = parseInt(parts[i + 2]) || 0;
                    break;
                case 'nodes':
                    result.nodes = parseInt(parts[i + 1]) || 0;
                    break;
                case 'nps':
                    result.nps = parseInt(parts[i + 1]) || 0;
                    break;
                case 'time':
                    result.time = parseInt(parts[i + 1]) || 0;
                    break;
                case 'pv':
                    // Everything after 'pv' is the principal variation
                    result.pv = parts.slice(i + 1).filter(p => p && p.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(p));
                    i = parts.length; // Exit loop
                    break;
            }
        }

        // Only call callback if we have valid data and this is the current analysis
        if (this.analysisCallback && result.pv.length > 0 && result.depth > 0 && 
            this.currentAnalysisId === this.analysisId) {
            this.analysisCallback(result);
        }
    }

    /**
     * Internal method to start analysis
     */
    _doAnalyze(fen, callback) {
        this.currentFen = fen;
        this.analysisCallback = callback;
        this.state = EngineState.ANALYZING;
        this.lastActivityTime = Date.now();

        // Set up new position (no ucinewgame for same-game analysis)
        this.sendCommand('position fen ' + fen);
        // Start analysis
        this.sendCommand('go depth ' + this.depth);
    }

    /**
     * Internal method to start infinite analysis
     */
    _doAnalyzeInfinite(fen, callback) {
        this.currentFen = fen;
        this.analysisCallback = callback;
        this.state = EngineState.ANALYZING;
        this.lastActivityTime = Date.now();

        // Set up new position (no ucinewgame for same-game analysis)
        this.sendCommand('position fen ' + fen);
        // Start infinite analysis
        this.sendCommand('go infinite');
    }

    /**
     * Start analysis for a given FEN position with debouncing
     */
    analyze(fen, callback, depth = null) {
        if (!this.worker || this.state === EngineState.UNINITIALIZED || this.state === EngineState.ERROR) {
            console.error('Stockfish not ready');
            return;
        }

        if (depth) {
            this.depth = depth;
        }

        // Increment analysis ID to invalidate any pending analysis
        this.analysisId++;
        const currentId = this.analysisId;

        // Clear any existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce rapid position changes
        this.debounceTimer = setTimeout(() => {
            this._startAnalysis(fen, callback, false, currentId);
        }, this.debounceDelay);
    }

    /**
     * Start infinite analysis with debouncing
     */
    analyzeInfinite(fen, callback) {
        if (!this.worker || this.state === EngineState.UNINITIALIZED || this.state === EngineState.ERROR) {
            console.error('Stockfish not ready');
            return;
        }

        // Increment analysis ID to invalidate any pending analysis
        this.analysisId++;
        const currentId = this.analysisId;

        // Clear any existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce rapid position changes
        this.debounceTimer = setTimeout(() => {
            this._startAnalysis(fen, callback, true, currentId);
        }, this.debounceDelay);
    }

    /**
     * Internal method to start analysis after debounce
     */
    async _startAnalysis(fen, callback, infinite, id) {
        // Check if this is still the latest request
        if (id !== this.analysisId) {
            return;
        }

        // Queue the analysis
        this.pendingAnalysis = { fen, callback, infinite, id };

        // If currently analyzing, stop first and wait for completion
        if (this.state === EngineState.ANALYZING || this.state === EngineState.STOPPING) {
            await this.stopAndWait();
        }

        // If ready, process immediately
        if (this.state === EngineState.READY) {
            this.processPendingAnalysis();
        } else if (this.state === EngineState.INITIALIZING) {
            // Wait for initialization to complete
            await this.initPromise;
            this.processPendingAnalysis();
        }
    }

    /**
     * Stop current analysis
     */
    stop() {
        this.analysisId++; // Invalidate any pending analysis
        this.pendingAnalysis = null;
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        if (this.state === EngineState.ANALYZING) {
            this.state = EngineState.STOPPING;
            this.sendCommand('stop');
        }
    }

    /**
     * Signal start of a new game (clears hash, etc.)
     */
    newGame() {
        if (this.state === EngineState.READY) {
            this.sendCommand('ucinewgame');
            this.sendCommand('isready');
            this.lastFenForGame = null;
        }
    }

    /**
     * Set the number of lines to analyze
     */
    setMultiPV(n) {
        this.multiPV = n;
        if (this.state === EngineState.READY || this.state === EngineState.ANALYZING) {
            this.sendCommand('setoption name MultiPV value ' + n);
        }
    }

    /**
     * Set analysis depth
     */
    setDepth(depth) {
        this.depth = depth;
    }

    /**
     * Check if engine is ready
     */
    isReady() {
        return this.state === EngineState.READY || this.state === EngineState.ANALYZING;
    }

    /**
     * Check if engine is analyzing
     */
    isAnalyzing() {
        return this.state === EngineState.ANALYZING;
    }

    /**
     * Terminate the engine
     */
    terminate() {
        this.cleanup();
    }

    /**
     * Convert UCI move to algebraic notation
     * @param {string} uciMove - Move in UCI format (e.g., "e2e4")
     * @param {object} chess - chess.js instance
     * @returns {object} Move object with from, to, and san
     */
    static uciToMove(uciMove, chess) {
        if (!uciMove || uciMove.length < 4) return null;

        const from = uciMove.substring(0, 2);
        const to = uciMove.substring(2, 4);
        const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

        // Get the SAN notation
        try {
            const moves = chess.moves({ verbose: true });
            const move = moves.find(m => 
                m.from === from && 
                m.to === to && 
                (!promotion || m.promotion === promotion)
            );

            if (move) {
                return {
                    from: from,
                    to: to,
                    san: move.san,
                    promotion: promotion
                };
            }
        } catch (e) {
            console.error('Error converting UCI move:', e);
        }

        return {
            from: from,
            to: to,
            san: uciMove,
            promotion: promotion
        };
    }

    /**
     * Format score for display
     * @param {number} score - Score in centipawns or mate count
     * @param {string} scoreType - 'cp' for centipawns, 'mate' for mate
     * @param {string} turn - 'w' for white, 'b' for black
     * @returns {string} Formatted score string
     */
    static formatScore(score, scoreType, turn) {
        // Adjust score based on whose turn it is (Stockfish gives score from current player's perspective)
        const adjustedScore = turn === 'b' ? -score : score;

        if (scoreType === 'mate') {
            const mateIn = turn === 'b' ? -score : score;
            if (mateIn > 0) {
                return `M${mateIn}`;
            } else {
                return `M${mateIn}`;
            }
        }

        // Convert centipawns to pawns
        const pawns = adjustedScore / 100;
        if (pawns >= 0) {
            return `+${pawns.toFixed(2)}`;
        }
        return pawns.toFixed(2);
    }

    /**
     * Get evaluation bar percentage (0-100, 50 is equal)
     * @param {number} score - Score in centipawns
     * @param {string} scoreType - 'cp' or 'mate'
     * @param {string} turn - 'w' or 'b'
     * @returns {number} Percentage for white (0-100)
     */
    static getEvalBarPercent(score, scoreType, turn) {
        if (scoreType === 'mate') {
            const mateScore = turn === 'b' ? -score : score;
            return mateScore > 0 ? 100 : 0;
        }

        // Adjust for current turn
        const adjustedScore = turn === 'b' ? -score : score;
        
        // Use sigmoid-like function to map score to percentage
        // This gives a nice curve where small advantages show clearly
        // but extreme advantages don't dominate
        const maxScore = 1000; // 10 pawns
        const clampedScore = Math.max(-maxScore, Math.min(maxScore, adjustedScore));
        
        // Map to 0-100 range with sigmoid curve
        const percent = 50 + (50 * (2 / (1 + Math.exp(-clampedScore / 200)) - 1));
        
        return Math.max(0, Math.min(100, percent));
    }

    /**
     * Get the engine version
     */
    static getVersion() {
        return "Stockfish 17.1 (NNUE Lite)";
    }

    /**
     * Get current engine state (for debugging)
     */
    getState() {
        return this.state;
    }
}

// Singleton instance
let engineInstance = null;

export function getStockfishEngine() {
    if (!engineInstance) {
        engineInstance = new StockfishEngine();
    }
    return engineInstance;
}

export default StockfishEngine;
