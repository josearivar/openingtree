import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StockfishEngine } from '../../app/stockfish/StockfishEngine';
import PvLines from './PvLines';
import './EngineAnalysis.css';

/**
 * EngineAnalysis Component
 * Main component that integrates Stockfish engine with evaluation display
 * 
 * @param {Object} props
 * @param {string} props.fen - Current position FEN
 * @param {string} props.orientation - Board orientation ('white' or 'black')
 * @param {string} props.turnColor - Whose turn it is ('white' or 'black')
 * @param {Function} props.onMove - Callback when a move is clicked in PV lines
 * @param {Function} props.onHighlightMove - Callback to highlight a move on the board
 * @param {Function} props.onStateChange - Callback for engine state changes (enabled, evaluation, depth, analyzing)
 * @param {Object} props.chess - chess.js instance for move conversion
 * @param {number} props.boardHeight - Height of the chessboard for eval bar sizing
 */
const EngineAnalysis = ({
  fen,
  orientation = 'white',
  turnColor = 'white',
  onMove,
  onHighlightMove,
  onStateChange,
  chess,
  boardHeight = 400
}) => {
  const [engine, setEngine] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [pvLines, setPvLines] = useState([]);
  const [depth, setDepth] = useState(0);
  const [error, setError] = useState(null);
  const [highlightedMove, setHighlightedMove] = useState(null);
  const [multiPv, setMultiPv] = useState(3);
  const [targetDepth, setTargetDepth] = useState(20);
  
  const lastFenRef = useRef(null);
  
  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        enabled,
        evaluation,
        depth,
        analyzing: isAnalyzing
      });
    }
  }, [enabled, evaluation, depth, isAnalyzing, onStateChange]);
  
  // Initialize engine
  useEffect(() => {
    const sf = new StockfishEngine({
      multiPv: multiPv,
      depth: targetDepth,
      onReady: () => {
        console.log('Stockfish engine ready');
        setIsReady(true);
        setError(null);
      },
      onEvaluation: (evalData) => {
        setDepth(evalData.depth);
        setPvLines(evalData.pvLines);
        
        // Set main evaluation from first PV line
        if (evalData.pvLines.length > 0) {
          setEvaluation(evalData.pvLines[0].score);
        }
      },
      onBestMove: (data) => {
        setIsAnalyzing(false);
        setPvLines(data.pvLines);
      },
      onError: (msg) => {
        console.error('Stockfish error:', msg);
        setError(msg);
        setIsAnalyzing(false);
      }
    });
    
    setEngine(sf);
    
    return () => {
      sf.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Update multiPv when changed
  useEffect(() => {
    if (engine && isReady) {
      engine.setMultiPv(multiPv);
    }
  }, [engine, isReady, multiPv]);
  
  // Analyze position when FEN changes
  useEffect(() => {
    if (!engine || !isReady || !enabled || !fen) return;
    
    // Don't re-analyze the same position
    if (fen === lastFenRef.current) return;
    lastFenRef.current = fen;
    
    // Reset state for new position
    setEvaluation(null);
    setPvLines([]);
    setDepth(0);
    setIsAnalyzing(true);
    
    // Start analysis
    engine.analyze(fen, {
      depth: targetDepth,
      multiPv: multiPv
    });
  }, [engine, isReady, enabled, fen, targetDepth, multiPv]);
  
  // Stop analysis when disabled
  useEffect(() => {
    if (!enabled && engine) {
      engine.stop();
      setIsAnalyzing(false);
    }
  }, [enabled, engine]);
  
  // Handle move click in PV lines
  const handleMoveClick = useCallback((moves) => {
    if (onMove && moves.length > 0) {
      // Play the first move
      const move = moves[0];
      onMove({
        from: move.substring(0, 2),
        to: move.substring(2, 4),
        promotion: move.length > 4 ? move[4] : undefined
      });
    }
  }, [onMove]);
  
  // Handle move hover for board highlighting
  const handleMoveHover = useCallback((uci) => {
    setHighlightedMove(uci);
    if (onHighlightMove) {
      if (uci) {
        onHighlightMove({
          from: uci.substring(0, 2),
          to: uci.substring(2, 4)
        });
      } else {
        onHighlightMove(null);
      }
    }
  }, [onHighlightMove]);
  
  // Toggle analysis
  const toggleAnalysis = useCallback(() => {
    setEnabled(prev => !prev);
  }, []);
  
  // Go deeper
  const goDeeper = useCallback(() => {
    if (engine && isReady && fen) {
      setTargetDepth(prev => Math.min(prev + 5, 40));
      lastFenRef.current = null; // Force re-analysis
    }
  }, [engine, isReady, fen]);
  
  return (
    <div className="engine-analysis">
      {/* Controls */}
      <div className="engine-controls">
        <label className="engine-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={toggleAnalysis}
            disabled={!isReady}
          />
          <span className="toggle-slider" />
          <span className="toggle-label">
            {isReady ? 'Engine' : 'Loading...'}
          </span>
        </label>
        
        {enabled && isReady && (
          <>
            <select
              className="engine-multipv"
              value={multiPv}
              onChange={(e) => setMultiPv(parseInt(e.target.value, 10))}
              title="Number of lines to show"
            >
              <option value={1}>1 line</option>
              <option value={2}>2 lines</option>
              <option value={3}>3 lines</option>
              <option value={5}>5 lines</option>
            </select>
            
            <button
              className="engine-deeper"
              onClick={goDeeper}
              disabled={isAnalyzing || targetDepth >= 40}
              title="Analyze deeper"
            >
              Go deeper
            </button>
            
            <span className="engine-depth">
              Depth: {depth}
            </span>
          </>
        )}
      </div>
      
      {/* Error display */}
      {error && (
        <div className="engine-error">
          <span>Engine error: {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {/* PV Lines display */}
      {enabled && (
        <div className="engine-display">
          <div className="engine-pv-container">
            <PvLines
              pvLines={pvLines}
              turnColor={turnColor}
              depth={depth}
              isAnalyzing={isAnalyzing}
              onMoveClick={handleMoveClick}
              onMoveHover={handleMoveHover}
              chess={chess}
              highlightedMove={highlightedMove}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EngineAnalysis;
