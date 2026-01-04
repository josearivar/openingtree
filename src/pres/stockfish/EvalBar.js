import React from 'react';
import { formatScore, getEvalBarPercent } from '../../app/stockfish/winningChances';
import './EvalBar.css';

/**
 * EvalBar Component
 * Displays a vertical evaluation bar similar to Lichess's analysis board
 * 
 * The bar visually flips when the board orientation changes:
 * - White orientation: White at bottom, Black at top
 * - Black orientation: Black at bottom, White at top
 * 
 * However, the score ALWAYS remains from White's perspective:
 * - Positive scores (+0.5) = White is better
 * - Negative scores (-0.5) = Black is better
 * 
 * @param {Object} props
 * @param {Object} props.score - Score object with cp or mate property (always from White's perspective)
 * @param {string} props.orientation - 'white' or 'black' (board orientation)
 * @param {number} props.depth - Current search depth
 * @param {boolean} props.isAnalyzing - Whether engine is currently analyzing
 * @param {number} props.height - Height of the eval bar in pixels
 */
const EvalBar = ({ 
  score, 
  orientation = 'white', 
  depth = 0, 
  isAnalyzing = false,
  height = 400 
}) => {
  // Calculate the percentage for white (score is always from White's perspective)
  // whitePercent > 50 means White is winning, < 50 means Black is winning
  const whitePercent = score ? getEvalBarPercent(score) : 50;
  const blackPercent = 100 - whitePercent;
  
  // Format the score for display (always from White's perspective)
  const scoreText = score ? formatScore(score) : '0.0';
  
  // Determine which color is winning based on the score
  const isWhiteWinning = whitePercent > 50;
  const isBlackWinning = whitePercent < 50;
  const isEqual = whitePercent === 50;
  
  // When board is flipped (black orientation), the bar should visually flip
  const isFlipped = orientation === 'black';
  
  // Determine where to show the score text (on the winning side)
  const showScoreOnWhite = isWhiteWinning || isEqual;
  const showScoreOnBlack = isBlackWinning;
  
  // Build the bar sections - order determines visual position (first = top)
  // When NOT flipped (white orientation): Black on top, White on bottom
  // When flipped (black orientation): White on top, Black on bottom
  const topSection = isFlipped ? (
    <div 
      className="eval-bar-section eval-bar-section-white"
      style={{ height: `${whitePercent}%` }}
    >
      {showScoreOnWhite && (
        <span className="eval-bar-score eval-bar-score-white">
          {scoreText}
        </span>
      )}
    </div>
  ) : (
    <div 
      className="eval-bar-section eval-bar-section-black"
      style={{ height: `${blackPercent}%` }}
    >
      {showScoreOnBlack && (
        <span className="eval-bar-score eval-bar-score-black">
          {scoreText}
        </span>
      )}
    </div>
  );
  
  const bottomSection = isFlipped ? (
    <div 
      className="eval-bar-section eval-bar-section-black"
      style={{ height: `${blackPercent}%` }}
    >
      {showScoreOnBlack && (
        <span className="eval-bar-score eval-bar-score-black">
          {scoreText}
        </span>
      )}
    </div>
  ) : (
    <div 
      className="eval-bar-section eval-bar-section-white"
      style={{ height: `${whitePercent}%` }}
    >
      {showScoreOnWhite && (
        <span className="eval-bar-score eval-bar-score-white">
          {scoreText}
        </span>
      )}
    </div>
  );
  
  return (
    <div 
      className={`eval-bar ${isAnalyzing ? 'analyzing' : ''} ${isFlipped ? 'flipped' : ''}`}
      style={{ height: `${height}px` }}
      title={`Evaluation: ${scoreText} (depth ${depth})`}
    >
      <div className="eval-bar-fill">
        {topSection}
        {bottomSection}
      </div>
      
      {/* Tick marks */}
      <div className="eval-bar-ticks">
        <div className="eval-bar-tick" style={{ top: '12.5%' }} />
        <div className="eval-bar-tick" style={{ top: '25%' }} />
        <div className="eval-bar-tick eval-bar-tick-major" style={{ top: '37.5%' }} />
        <div className="eval-bar-tick eval-bar-tick-zero" style={{ top: '50%' }} />
        <div className="eval-bar-tick eval-bar-tick-major" style={{ top: '62.5%' }} />
        <div className="eval-bar-tick" style={{ top: '75%' }} />
        <div className="eval-bar-tick" style={{ top: '87.5%' }} />
      </div>
      
      {/* Analyzing indicator */}
      {isAnalyzing && (
        <div className="eval-bar-analyzing">
          <div className="eval-bar-analyzing-dot" />
        </div>
      )}
    </div>
  );
};

export default EvalBar;
