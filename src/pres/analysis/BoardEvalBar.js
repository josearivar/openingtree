import React from 'react';
import './BoardEvalBar.css';

/**
 * Lichess-style evaluation bar component
 * Displays next to the chess board showing the current position evaluation
 */
export default class BoardEvalBar extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            whitePercent: 50,
            displayScore: '0.00',
            isMate: false
        };
    }

    componentDidUpdate(prevProps) {
        if (prevProps.evaluation !== this.props.evaluation) {
            this.updateEvaluation();
        }
    }

    componentDidMount() {
        this.updateEvaluation();
    }

    updateEvaluation() {
        const { evaluation } = this.props;
        
        if (!evaluation) {
            this.setState({
                whitePercent: 50,
                displayScore: '0.00',
                isMate: false
            });
            return;
        }

        const { score, scoreType, turn } = evaluation;
        
        // Adjust score based on whose turn it is (Stockfish gives score from current player's perspective)
        const adjustedScore = turn === 'b' ? -score : score;
        
        let whitePercent;
        let displayScore;
        let isMate = false;

        if (scoreType === 'mate') {
            isMate = true;
            const mateIn = turn === 'b' ? -score : score;
            whitePercent = mateIn > 0 ? 100 : 0;
            displayScore = mateIn > 0 ? `M${Math.abs(mateIn)}` : `-M${Math.abs(mateIn)}`;
        } else {
            // Convert centipawns to percentage using sigmoid function
            const maxScore = 1000; // 10 pawns
            const clampedScore = Math.max(-maxScore, Math.min(maxScore, adjustedScore));
            whitePercent = 50 + (50 * (2 / (1 + Math.exp(-clampedScore / 200)) - 1));
            whitePercent = Math.max(0, Math.min(100, whitePercent));
            
            // Format display score
            const pawns = adjustedScore / 100;
            if (pawns >= 0) {
                displayScore = `+${pawns.toFixed(1)}`;
            } else {
                displayScore = pawns.toFixed(1);
            }
        }

        this.setState({
            whitePercent,
            displayScore,
            isMate
        });
    }

    render() {
        const { height, isAnalyzing, flipped } = this.props;
        const { whitePercent, displayScore, isMate } = this.state;
        
        // When board is flipped, we need to flip the bar too
        const actualWhitePercent = flipped ? (100 - whitePercent) : whitePercent;
        const blackPercent = 100 - actualWhitePercent;

        // Determine score color class
        let scoreClass = 'score-equal';
        if (whitePercent > 55) scoreClass = 'score-white';
        else if (whitePercent < 45) scoreClass = 'score-black';

        return (
            <div 
                className={`board-eval-bar ${isAnalyzing ? 'analyzing' : ''}`}
                style={{ height: height }}
            >
                <div className="eval-bar-track">
                    <div 
                        className="eval-bar-white"
                        style={{ height: `${actualWhitePercent}%` }}
                    />
                    <div 
                        className="eval-bar-black"
                        style={{ height: `${blackPercent}%` }}
                    />
                    {/* Score indicator positioned at the split point */}
                    <div 
                        className={`eval-bar-score ${scoreClass} ${isMate ? 'mate' : ''}`}
                        style={{ 
                            bottom: `${actualWhitePercent}%`,
                            transform: 'translateY(50%)'
                        }}
                    >
                        {displayScore}
                    </div>
                </div>
            </div>
        );
    }
}

BoardEvalBar.defaultProps = {
    height: 400,
    evaluation: null,
    isAnalyzing: false,
    flipped: false
};
