/**
 * StockfishEngine - A wrapper for the Stockfish chess engine
 * Provides UCI protocol communication and evaluation parsing
 * Based on Lichess's ceval implementation
 */

export class StockfishEngine {
  constructor(options = {}) {
    this.worker = null;
    this.isReady = false;
    this.isSearching = false;
    this.onEvaluation = options.onEvaluation || (() => {});
    this.onBestMove = options.onBestMove || (() => {});
    this.onReady = options.onReady || (() => {});
    this.onError = options.onError || (() => {});
    
    this.currentEval = null;
    this.multiPv = options.multiPv || 3;
    this.depth = options.depth || 20;
    this.currentFen = null;
    this.isWhiteTurn = true; // Track whose turn it is
    
    // PV lines storage
    this.pvLines = [];
    
    // UCI initialization state
    this.uciOk = false;
    
    // Error recovery
    this.restartCount = 0;
    this.maxRestarts = 3;
    this.lastError = null;
    
    this.init();
  }

  init() {
    try {
      // The stockfish.js file from nmrugg/stockfish.js is designed to be used directly as a worker
      // It expects the WASM file to be in the same directory with the same name (but .wasm extension)
      // We need to pass the WASM location via URL hash
      // Use process.env.PUBLIC_URL to handle GitHub Pages subdirectory deployment
      const basePath = process.env.PUBLIC_URL || '';
      const wasmPath = window.location.origin + basePath + '/stockfish/stockfish.wasm';
      const workerUrl = window.location.origin + basePath + '/stockfish/stockfish.js#' + wasmPath;
      
      this.worker = new Worker(workerUrl);
      
      this.worker.onmessage = (e) => {
        this.handleMessage(e.data);
      };
      
      this.worker.onerror = (e) => {
        console.error('Stockfish worker error:', e);
        this.handleWorkerError(e.message || 'Worker error');
      };
      
      // Send UCI command to initialize
      setTimeout(() => {
        this.send('uci');
      }, 100);
      
    } catch (err) {
      console.error('Failed to create Stockfish worker:', err);
      this.handleWorkerError(err.message);
    }
  }

  /**
   * Handle worker errors with automatic restart capability
   */
  handleWorkerError(errorMessage) {
    this.lastError = errorMessage;
    this.isSearching = false;
    
    // Check if this is a recoverable error (like index out of bounds)
    const isRecoverable = 
      errorMessage.includes('index out of bounds') ||
      errorMessage.includes('RuntimeError') ||
      errorMessage.includes('memory');
    
    if (isRecoverable && this.restartCount < this.maxRestarts) {
      console.log(`Stockfish error (attempt ${this.restartCount + 1}/${this.maxRestarts}), restarting...`);
      this.restartCount++;
      
      // Destroy current worker
      if (this.worker) {
        try {
          this.worker.terminate();
        } catch (e) {
          // Ignore termination errors
        }
        this.worker = null;
      }
      
      // Reset state
      this.isReady = false;
      this.uciOk = false;
      
      // Restart after a short delay
      setTimeout(() => {
        this.init();
        
        // Re-analyze current position after restart
        if (this.currentFen && this.isReady) {
          setTimeout(() => {
            this.analyze(this.currentFen, { depth: this.depth, multiPv: this.multiPv });
          }, 500);
        }
      }, 1000);
    } else {
      // Non-recoverable error or max restarts reached
      this.onError(errorMessage);
    }
  }

  handleMessage(line) {
    if (typeof line !== 'string') return;
    
    // Reset restart count on successful communication
    if (this.restartCount > 0 && (line === 'readyok' || line.startsWith('info '))) {
      this.restartCount = 0;
    }
    
    // Parse UCI responses
    if (line === 'uciok') {
      this.uciOk = true;
      // Set options
      this.send('setoption name MultiPV value ' + this.multiPv);
      this.send('setoption name UCI_AnalyseMode value true');
      // Use smaller hash for stability
      this.send('setoption name Hash value 16');
      this.send('isready');
    } else if (line === 'readyok') {
      this.isReady = true;
      this.onReady();
    } else if (line.startsWith('info ')) {
      try {
        this.parseInfo(line);
      } catch (e) {
        console.warn('Error parsing info line:', e);
        // Don't propagate parsing errors
      }
    } else if (line.startsWith('bestmove ')) {
      try {
        this.parseBestMove(line);
      } catch (e) {
        console.warn('Error parsing bestmove:', e);
        this.isSearching = false;
      }
    }
  }

  /**
   * Normalize score to always be from White's perspective
   * Stockfish reports scores from the side to move's perspective
   * @param {Object} score - Score object with cp or mate property
   * @returns {Object} Normalized score from White's perspective
   */
  normalizeScore(score) {
    if (this.isWhiteTurn) {
      // White to move - score is already from White's perspective
      return score;
    } else {
      // Black to move - negate the score to get White's perspective
      if (score.mate !== undefined) {
        return { mate: -score.mate };
      } else {
        return { cp: -(score.cp || 0) };
      }
    }
  }

  parseInfo(line) {
    // Parse UCI info line
    const parts = line.split(' ');
    let depth = 0;
    let seldepth = 0;
    let multiPv = 1;
    let score = null;
    let scoreType = 'cp';
    let pv = [];
    let nodes = 0;
    let nps = 0;
    let time = 0;
    
    for (let i = 1; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':
          depth = parseInt(parts[++i], 10) || 0;
          break;
        case 'seldepth':
          seldepth = parseInt(parts[++i], 10) || 0;
          break;
        case 'multipv':
          multiPv = parseInt(parts[++i], 10) || 1;
          break;
        case 'score':
          scoreType = parts[++i];
          score = parseInt(parts[++i], 10) || 0;
          break;
        case 'nodes':
          nodes = parseInt(parts[++i], 10) || 0;
          break;
        case 'nps':
          nps = parseInt(parts[++i], 10) || 0;
          break;
        case 'time':
          time = parseInt(parts[++i], 10) || 0;
          break;
        case 'pv':
          pv = parts.slice(i + 1).filter(m => m && m.length >= 4);
          i = parts.length;
          break;
        default:
          break;
      }
    }
    
    // Only process if we have meaningful data
    if (depth > 0 && pv.length > 0) {
      // Create raw score object
      const rawScore = scoreType === 'mate' ? { mate: score } : { cp: score };
      
      // Normalize score to White's perspective
      const normalizedScore = this.normalizeScore(rawScore);
      
      const evalData = {
        depth,
        seldepth,
        multiPv,
        score: normalizedScore,
        pv,
        nodes,
        nps,
        time,
        fen: this.currentFen
      };
      
      // Store PV line (ensure array is large enough)
      while (this.pvLines.length < multiPv) {
        this.pvLines.push(null);
      }
      this.pvLines[multiPv - 1] = evalData;
      
      // Emit evaluation update
      this.onEvaluation({
        depth,
        pvLines: [...this.pvLines].filter(Boolean),
        fen: this.currentFen
      });
    }
  }

  parseBestMove(line) {
    const parts = line.split(' ');
    const bestMove = parts[1];
    let ponder = null;
    
    if (parts[2] === 'ponder') {
      ponder = parts[3];
    }
    
    this.isSearching = false;
    this.onBestMove({
      bestMove,
      ponder,
      pvLines: [...this.pvLines].filter(Boolean),
      fen: this.currentFen
    });
  }

  send(cmd) {
    if (this.worker) {
      try {
        this.worker.postMessage(cmd);
      } catch (e) {
        console.warn('Error sending command to Stockfish:', e);
        this.handleWorkerError(e.message);
      }
    }
  }

  /**
   * Determine whose turn it is from a FEN string
   * @param {string} fen - FEN string
   * @returns {boolean} True if it's White's turn
   */
  isWhiteToMove(fen) {
    const parts = fen.split(' ');
    return parts.length < 2 || parts[1] === 'w';
  }

  /**
   * Start analysis of a position
   * @param {string} fen - FEN string of the position
   * @param {Object} options - Analysis options
   */
  analyze(fen, options = {}) {
    if (!this.isReady) {
      console.warn('Stockfish not ready yet');
      return;
    }
    
    // Stop any current search
    if (this.isSearching) {
      this.stop();
    }
    
    this.currentFen = fen;
    this.isWhiteTurn = this.isWhiteToMove(fen);
    this.pvLines = [];
    
    // Update MultiPV if changed
    const multiPv = options.multiPv || this.multiPv;
    if (multiPv !== this.multiPv) {
      this.multiPv = multiPv;
      this.send('setoption name MultiPV value ' + this.multiPv);
    }
    
    // Clear hash to prevent memory issues
    this.send('ucinewgame');
    
    // Wait for ready before setting position
    this.send('isready');
    
    // Set position
    this.send('position fen ' + fen);
    
    // Start search
    const depth = options.depth || this.depth;
    const movetime = options.movetime;
    
    this.isSearching = true;
    
    if (movetime) {
      this.send('go movetime ' + movetime);
    } else {
      this.send('go depth ' + depth);
    }
  }

  /**
   * Stop current analysis
   */
  stop() {
    if (this.isSearching) {
      this.send('stop');
      this.isSearching = false;
    }
  }

  /**
   * Set the number of principal variations to calculate
   * @param {number} multiPv - Number of PV lines (1-5)
   */
  setMultiPv(multiPv) {
    this.multiPv = Math.max(1, Math.min(5, multiPv));
    if (this.isReady) {
      this.send('setoption name MultiPV value ' + this.multiPv);
    }
  }

  /**
   * Destroy the engine and release resources
   */
  destroy() {
    this.stop();
    if (this.worker) {
      this.send('quit');
      try {
        this.worker.terminate();
      } catch (e) {
        // Ignore termination errors
      }
      this.worker = null;
    }
    this.isReady = false;
  }
}

export default StockfishEngine;
