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
    
    // PV lines storage
    this.pvLines = [];
    
    // UCI initialization state
    this.uciOk = false;
    
    this.init();
  }

  init() {
    try {
      // The stockfish.js file from nmrugg/stockfish.js is designed to be used directly as a worker
      // It expects the WASM file to be in the same directory with the same name (but .wasm extension)
      // We need to pass the WASM location via URL hash
      const wasmPath = window.location.origin + '/stockfish/stockfish.wasm';
      const workerUrl = window.location.origin + '/stockfish/stockfish.js#' + wasmPath;
      
      this.worker = new Worker(workerUrl);
      
      this.worker.onmessage = (e) => {
        this.handleMessage(e.data);
      };
      
      this.worker.onerror = (e) => {
        console.error('Stockfish worker error:', e);
        this.onError(e.message || 'Worker error');
      };
      
      // Send UCI command to initialize
      setTimeout(() => {
        this.send('uci');
      }, 100);
      
    } catch (err) {
      console.error('Failed to create Stockfish worker:', err);
      this.onError(err.message);
    }
  }

  handleMessage(line) {
    if (typeof line !== 'string') return;
    
    // Parse UCI responses
    if (line === 'uciok') {
      this.uciOk = true;
      // Set options
      this.send('setoption name MultiPV value ' + this.multiPv);
      this.send('setoption name UCI_AnalyseMode value true');
      this.send('isready');
    } else if (line === 'readyok') {
      this.isReady = true;
      this.onReady();
    } else if (line.startsWith('info ')) {
      this.parseInfo(line);
    } else if (line.startsWith('bestmove ')) {
      this.parseBestMove(line);
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
          depth = parseInt(parts[++i], 10);
          break;
        case 'seldepth':
          seldepth = parseInt(parts[++i], 10);
          break;
        case 'multipv':
          multiPv = parseInt(parts[++i], 10);
          break;
        case 'score':
          scoreType = parts[++i];
          score = parseInt(parts[++i], 10);
          break;
        case 'nodes':
          nodes = parseInt(parts[++i], 10);
          break;
        case 'nps':
          nps = parseInt(parts[++i], 10);
          break;
        case 'time':
          time = parseInt(parts[++i], 10);
          break;
        case 'pv':
          pv = parts.slice(i + 1);
          i = parts.length;
          break;
        default:
          break;
      }
    }
    
    // Only process if we have meaningful data
    if (depth > 0 && pv.length > 0) {
      const evalData = {
        depth,
        seldepth,
        multiPv,
        score: scoreType === 'mate' ? { mate: score } : { cp: score },
        pv,
        nodes,
        nps,
        time,
        fen: this.currentFen
      };
      
      // Store PV line
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
      this.worker.postMessage(cmd);
    }
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
    this.pvLines = [];
    
    // Update MultiPV if changed
    const multiPv = options.multiPv || this.multiPv;
    if (multiPv !== this.multiPv) {
      this.multiPv = multiPv;
      this.send('setoption name MultiPV value ' + this.multiPv);
    }
    
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
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
  }
}

export default StockfishEngine;
