import React from 'react';
import { formatScore, povChances } from '../../app/stockfish/winningChances';
import './PvLines.css';

/**
 * Convert UCI move to SAN notation
 * This is a simplified version - for full accuracy, use chess.js
 * @param {string} uci - UCI move (e.g., "e2e4")
 * @param {Object} chess - chess.js instance (optional)
 * @returns {string} SAN notation or UCI if conversion fails
 */
const uciToSan = (uci, chess) => {
  if (!chess) return uci;
  
  try {
    // Make a copy of the chess instance to avoid modifying the original
    const tempChess = new chess.constructor(chess.fen());
    const move = tempChess.move({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined
    });
    return move ? move.san : uci;
  } catch (e) {
    return uci;
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
  chess,
  isHighlighted 
}) => {
  const { score, pv, depth } = pvData;
  const scoreText = formatScore(score);
  
  // Determine if this is a good or bad line based on turn color
  const chances = povChances(turnColor, score);
  const isGood = chances > 0.1;
  const isBad = chances < -0.1;
  
  // Convert first few moves to SAN
  const displayMoves = pv.slice(0, 8).map((uci, i) => {
    // For now, just display UCI - full SAN conversion would require chess.js integration
    return uci;
  });
  
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
        {pv.length > 8 && <span className="pv-more">...</span>}
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
 * @param {Object} props.chess - chess.js instance for move conversion
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
            chess={chess}
            isHighlighted={highlightedMove === pvData.pv[0]}
          />
        ))}
      </div>
    </div>
  );
};

export default PvLines;
