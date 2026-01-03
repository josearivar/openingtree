/**
 * Stockfish Engine Wrapper
 * Handles communication with Stockfish 17 via Web Worker
 * With robust state management for rapid position changes
 */

class StockfishEngine {
    constructor() {
        this.worker = null;
        this.isReady = false;
        this.currentFen = null;
        this.analysisCallback = null;
        this.depth = 20; // Default depth
        this.multiPV = 3; // Number of lines to analyze (top 3 moves)
        this.isAnalyzing = false;
        this.pendingAnalysis = null;
        this.analysisId = 0; // Unique ID for each analysis request
        this.currentAnalysisId = 0; // ID of the currently running analysis
        this.debounceTimer = null;
        this.debounceDelay = 50; // ms to wait before starting new analysis
        this.lastActivityTime = Date.now();
        this.healthCheckInterval = null;
        this.waitingForReady = false;
    }

    /**
     * Initialize the Stockfish engine
     */
    init() {
        return new Promise((resolve, reject) => {
            if (this.isReady && this.worker) {
                resolve();
                return;
            }

            // Clean up any existing worker
            this.cleanup();

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
                    this.isReady = false;
                    // Try to recover
                    this.scheduleRecovery();
                };

                // Initialize UCI
                this.sendCommand('uci');
                
                // Wait for uciok
                const checkReady = setInterval(() => {
                    if (this.isReady) {
                        clearInterval(checkReady);
                        // Set options
                        this.sendCommand('setoption name MultiPV value ' + this.multiPV);
                        this.sendCommand('isready');
                        // Start health check
                        this.startHealthCheck();
                        resolve();
                    }
                }, 100);

                // Timeout after 15 seconds
                setTimeout(() => {
                    if (!this.isReady) {
                        clearInterval(checkReady);
                        reject(new Error('Stockfish initialization timeout'));
                    }
                }, 15000);

            } catch (error) {
                console.error('Failed to initialize Stockfish:', error);
                reject(error);
            }
        });
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
        this.isReady = false;
        this.isAnalyzing = false;
        this.pendingAnalysis = null;
        this.waitingForReady = false;
    }

    /**
     * Start health check to detect stalled engine
     */
    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(() => {
            // If we're analyzing and haven't received any message in 10 seconds, something is wrong
            if (this.isAnalyzing && (Date.now() - this.lastActivityTime > 10000)) {
                console.warn('Stockfish appears stalled, attempting recovery...');
                this.recoverEngine();
            }
        }, 5000);
    }

    /**
     * Schedule engine recovery
     */
    scheduleRecovery() {
        setTimeout(() => {
            this.recoverEngine();
        }, 1000);
    }

    /**
     * Recover the engine by reinitializing
     */
    async recoverEngine() {
        console.log('Recovering Stockfish engine...');
        const wasAnalyzing = this.isAnalyzing;
        const lastFen = this.currentFen;
        const lastCallback = this.analysisCallback;
        
        this.cleanup();
        
        try {
            await this.init();
            console.log('Stockfish engine recovered');
            
            // Resume analysis if we were analyzing before
            if (wasAnalyzing && lastFen && lastCallback) {
                this.analyzeInfinite(lastFen, lastCallback);
            }
        } catch (error) {
            console.error('Failed to recover Stockfish engine:', error);
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
                    this.handleMessage(line);
                }
            });
            return;
        }

        if (message === 'uciok') {
            this.isReady = true;
        }

        if (message === 'readyok') {
            this.waitingForReady = false;
            // Engine is ready for new commands
            // If there's a pending analysis, start it now
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

        // Parse analysis info - check for score and pv
        if (message.startsWith('info') && message.includes(' pv ') && message.includes(' score ')) {
            this.parseInfo(message);
        }

        // Best move found - analysis complete for this depth
        if (message.startsWith('bestmove')) {
            this.isAnalyzing = false;
        }
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
        if (this.analysisCallback && result.pv.length > 0 && result.depth > 0) {
            this.analysisCallback(result);
        }
    }

    /**
     * Internal method to start analysis
     */
    _doAnalyze(fen, callback) {
        this.currentFen = fen;
        this.analysisCallback = callback;
        this.isAnalyzing = true;
        this.lastActivityTime = Date.now();

        // Send ucinewgame to clear any stale state
        this.sendCommand('ucinewgame');
        // Set up new position
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
        this.isAnalyzing = true;
        this.lastActivityTime = Date.now();

        // Send ucinewgame to clear any stale state
        this.sendCommand('ucinewgame');
        // Set up new position
        this.sendCommand('position fen ' + fen);
        // Start infinite analysis
        this.sendCommand('go infinite');
    }

    /**
     * Start analysis for a given FEN position with debouncing
     */
    analyze(fen, callback, depth = null) {
        if (!this.worker || !this.isReady) {
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
        if (!this.worker || !this.isReady) {
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
    _startAnalysis(fen, callback, infinite, id) {
        // Check if this is still the latest request
        if (id !== this.analysisId) {
            return;
        }

        // Stop any current analysis first
        this.sendCommand('stop');
        
        // Queue the analysis to start after stop is processed
        this.pendingAnalysis = { fen, callback, infinite, id };
        this.waitingForReady = true;
        this.sendCommand('isready');

        // Safety timeout - if we don't get readyok in 2 seconds, try recovery
        setTimeout(() => {
            if (this.waitingForReady && this.pendingAnalysis && this.pendingAnalysis.id === id) {
                console.warn('Timeout waiting for readyok, attempting recovery...');
                this.recoverEngine();
            }
        }, 2000);
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
        this.sendCommand('stop');
        this.isAnalyzing = false;
    }

    /**
     * Set the number of lines to analyze
     */
    setMultiPV(n) {
        this.multiPV = n;
        if (this.isReady) {
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
