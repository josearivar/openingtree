import React, { useMemo } from 'react';
import Chess from 'chess.js';
import { formatScore, povChances } from '../../app/stockfish/winningChances';
import './PvLines.css';

/**
 * Convert a sequence of UCI moves to SAN notation
 * @param {Array} uciMoves - Array of UCI moves (e.g., ["e2e4", "e7e5"])
 * @param {string} fen - Starting FEN position
 * @returns {Array} Array of SAN moves
 */
const convertPvToSan = (uciMoves, fen) => {
  if (!uciMoves || uciMoves.length === 0) {
    return uciMoves || [];
  }
  
  if (!fen) {
    return uciMoves;
  }
  
  const sanMoves = [];
  
  try {
    // Create a new chess instance with the current position
    const tempChess = new Chess(fen);
    
    for (const uci of uciMoves) {
      if (!uci || uci.length < 4) {
        sanMoves.push(uci);
        continue;
      }
      
      try {
        const move = tempChess.move({
          from: uci.substring(0, 2),
          to: uci.substring(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined
        });
        
        if (move) {
          sanMoves.push(move.san);
        } else {
          // If move fails, fall back to UCI
          sanMoves.push(uci);
          break; // Stop converting as position is now invalid
        }
      } catch (e) {
        // If conversion fails, use UCI notation
        sanMoves.push(uci);
        break;
      }
    }
    
    return sanMoves;
  } catch (e) {
    // If anything fails, return original UCI moves
    console.warn('Error converting PV to SAN:', e);
    return uciMoves;
  }
};

/**
 * PvLine Component - Single principal variation line
 */
const PvLine = ({ 
  pvData, 
  index, 
  turnColor, 
  onMoveClick, 
  onMoveHover,
  fen,
  isHighlighted 
}) => {
  const { score, pv, depth } = pvData;
  const scoreText = formatScore(score);
  
  // Determine if this is a good or bad line based on turn color
  const chances = povChances(turnColor, score);
  const isGood = chances > 0.1;
  const isBad = chances < -0.1;
  
  // Convert UCI moves to SAN notation
  const displayMoves = useMemo(() => {
    const uciMoves = pv.slice(0, 10);
    return convertPvToSan(uciMoves, fen);
  }, [pv, fen]);
  
  return (
    <div 
      className={`pv-line ${isHighlighted ? 'highlighted' : ''} ${isGood ? 'good' : ''} ${isBad ? 'bad' : ''}`}
      onMouseEnter={() => onMoveHover && onMoveHover(pv[0])}
      onMouseLeave={() => onMoveHover && onMoveHover(null)}
    >
      <div className="pv-line-rank">
        {index + 1}
      </div>
      <div 
        className={`pv-line-score ${score.mate !== undefined ? 'mate' : ''}`}
        title={`Depth: ${depth}`}
      >
        {scoreText}
      </div>
      <div className="pv-line-moves">
        {displayMoves.map((move, i) => (
          <span 
            key={i}
            className={`pv-move ${i === 0 ? 'best-move' : ''}`}
            onClick={() => onMoveClick && onMoveClick(pv.slice(0, i + 1))}
            title={`Click to play ${move}`}
          >
            {move}
          </span>
        ))}
        {pv.length > 10 && <span className="pv-more">...</span>}
      </div>
    </div>
  );
};

/**
 * PvLines Component
 * Displays multiple principal variation lines from engine analysis
 * 
 * @param {Object} props
 * @param {Array} props.pvLines - Array of PV line data
 * @param {string} props.turnColor - 'white' or 'black'
 * @param {number} props.depth - Current search depth
 * @param {boolean} props.isAnalyzing - Whether engine is analyzing
 * @param {Function} props.onMoveClick - Callback when a move is clicked
 * @param {Function} props.onMoveHover - Callback when hovering over a move
 * @param {Object} props.chess - chess.js instance (used to get current FEN)
 */
const PvLines = ({ 
  pvLines = [], 
  turnColor = 'white',
  depth = 0,
  isAnalyzing = false,
  onMoveClick,
  onMoveHover,
  chess,
  highlightedMove
}) => {
  // Get current FEN from chess instance
  const currentFen = useMemo(() => {
    if (chess && typeof chess.fen === 'function') {
      return chess.fen();
    }
    return null;
  }, [chess]);
  
  if (!pvLines || pvLines.length === 0) {
    return (
      <div className="pv-lines empty">
        <div className="pv-lines-placeholder">
          {isAnalyzing ? (
            <>
              <span className="analyzing-spinner" />
              <span>Analyzing position...</span>
            </>
          ) : (
            <span>Enable analysis to see engine suggestions</span>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="pv-lines">
      <div className="pv-lines-header">
        <span className="pv-lines-title">Engine Analysis</span>
        <span className="pv-lines-depth">
          Depth: {depth}
          {isAnalyzing && <span className="analyzing-dot" />}
        </span>
      </div>
      <div className="pv-lines-list">
        {pvLines.map((pvData, index) => (
          <PvLine
            key={index}
            pvData={pvData}
            index={index}
            turnColor={turnColor}
            onMoveClick={onMoveClick}
            onMoveHover={onMoveHover}
            fen={currentFen || pvData.fen}
            isHighlighted={highlightedMove === pvData.pv[0]}
          />
        ))}
      </div>
    </div>
  );
};

export default PvLines;
