import React from 'react';
import { formatScore, getEvalBarPercent } from '../../app/stockfish/winningChances';
import './EvalBar.css';

/**
 * EvalBar Component
 * Displays a vertical evaluation bar similar to Lichess's analysis board
 * 
 * @param {Object} props
 * @param {Object} props.score - Score object with cp or mate property
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
  // Calculate the percentage for white
  const whitePercent = score ? getEvalBarPercent(score) : 50;
  
  // If board is flipped (black orientation), we need to flip the bar visually
  const displayPercent = orientation === 'white' ? whitePercent : (100 - whitePercent);
  
  // Format the score for display
  const scoreText = score ? formatScore(score) : '0.0';
  
  // Determine which color is winning for styling
  const isWhiteWinning = whitePercent > 50;
  const isBlackWinning = whitePercent < 50;
  const isEqual = whitePercent === 50;
  
  return (
    <div 
      className={`eval-bar ${isAnalyzing ? 'analyzing' : ''}`}
      style={{ height: `${height}px` }}
      title={`Evaluation: ${scoreText} (depth ${depth})`}
    >
      {/* Black portion (top when white orientation) */}
      <div 
        className="eval-bar-black"
        style={{ height: `${100 - displayPercent}%` }}
      >
        {orientation === 'white' && isBlackWinning && (
          <span className="eval-bar-score eval-bar-score-black">
            {scoreText}
          </span>
        )}
        {orientation === 'black' && isWhiteWinning && (
          <span className="eval-bar-score eval-bar-score-black">
            {scoreText}
          </span>
        )}
      </div>
      
      {/* White portion (bottom when white orientation) */}
      <div 
        className="eval-bar-white"
        style={{ height: `${displayPercent}%` }}
      >
        {orientation === 'white' && (isWhiteWinning || isEqual) && (
          <span className="eval-bar-score eval-bar-score-white">
            {scoreText}
          </span>
        )}
        {orientation === 'black' && (isBlackWinning || isEqual) && (
          <span className="eval-bar-score eval-bar-score-white">
            {scoreText}
          </span>
        )}
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
