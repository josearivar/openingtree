import React from 'react';
import { 
    Box, 
    Typography, 
    LinearProgress, 
    IconButton,
    Tooltip,
    Switch,
    FormControlLabel,
    Slider,
    Paper
} from '@material-ui/core';
import { PlayArrow, Stop, Settings } from '@material-ui/icons';
import { getStockfishEngine } from '../../app/StockfishEngine';
import StockfishEngine from '../../app/StockfishEngine';
import { chessLogic } from '../../app/chess/ChessLogic';
import './StockfishAnalysis.css';

export default class StockfishAnalysis extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isEngineReady: false,
            isAnalyzing: false,
            evaluation: null,
            topMoves: [],
            depth: 0,
            showSettings: false,
            analysisDepth: 20,
            multiPV: 3,
            error: null
        };
        this.engine = null;
        this.analysisResults = new Map(); // Store results by multipv
    }

    componentDidMount() {
        this.initEngine();
    }

    componentDidUpdate(prevProps) {
        // Re-analyze when FEN changes
        if (prevProps.fen !== this.props.fen && this.state.isAnalyzing) {
            this.startAnalysis();
        }
    }

    componentWillUnmount() {
        if (this.engine) {
            this.engine.stop();
        }
    }

    async initEngine() {
        try {
            this.engine = getStockfishEngine();
            await this.engine.init();
            this.setState({ isEngineReady: true });
        } catch (error) {
            console.error('Failed to initialize Stockfish:', error);
            this.setState({ error: 'Failed to load Stockfish engine' });
        }
    }

    startAnalysis = () => {
        if (!this.engine || !this.state.isEngineReady) {
            return;
        }

        this.analysisResults.clear();
        this.setState({ 
            isAnalyzing: true, 
            topMoves: [],
            evaluation: null,
            depth: 0 
        });

        this.engine.setMultiPV(this.state.multiPV);
        this.engine.analyzeInfinite(this.props.fen, this.handleAnalysisUpdate);
    }

    stopAnalysis = () => {
        if (this.engine) {
            this.engine.stop();
        }
        this.setState({ isAnalyzing: false });
    }

    toggleAnalysis = () => {
        if (this.state.isAnalyzing) {
            this.stopAnalysis();
        } else {
            this.startAnalysis();
        }
    }

    handleAnalysisUpdate = (result) => {
        // Store result by multipv index
        this.analysisResults.set(result.multipv, result);

        // Get current turn from FEN
        const chess = chessLogic(this.props.variant, this.props.fen);
        const turn = chess.turn();

        // Convert all stored results to display format
        const topMoves = [];
        for (let i = 1; i <= this.state.multiPV; i++) {
            const res = this.analysisResults.get(i);
            if (res && res.pv.length > 0) {
                const moveInfo = StockfishEngine.uciToMove(res.pv[0], chess);
                topMoves.push({
                    rank: i,
                    move: moveInfo,
                    score: res.score,
                    scoreType: res.scoreType,
                    depth: res.depth,
                    pv: res.pv,
                    formattedScore: StockfishEngine.formatScore(res.score, res.scoreType, turn)
                });
            }
        }

        // Get the best line's evaluation for the main display
        const bestResult = this.analysisResults.get(1);
        let evaluation = null;
        if (bestResult) {
            evaluation = {
                score: bestResult.score,
                scoreType: bestResult.scoreType,
                formatted: StockfishEngine.formatScore(bestResult.score, bestResult.scoreType, turn),
                barPercent: StockfishEngine.getEvalBarPercent(bestResult.score, bestResult.scoreType, turn)
            };
        }

        this.setState({
            topMoves: topMoves,
            evaluation: evaluation,
            depth: bestResult ? bestResult.depth : 0
        });

        // Notify parent about top moves for arrow display
        if (this.props.onAnalysisUpdate) {
            this.props.onAnalysisUpdate(topMoves);
        }
    }

    handleDepthChange = (event, newValue) => {
        this.setState({ analysisDepth: newValue });
        if (this.engine) {
            this.engine.setDepth(newValue);
        }
    }

    handleMultiPVChange = (event, newValue) => {
        this.setState({ multiPV: newValue }, () => {
            if (this.state.isAnalyzing) {
                // Restart analysis with new multiPV
                this.startAnalysis();
            }
        });
    }

    toggleSettings = () => {
        this.setState({ showSettings: !this.state.showSettings });
    }

    handleMoveClick = (move) => {
        if (this.props.onMove && move.move) {
            this.props.onMove(move.move.from, move.move.to);
        }
    }

    handleMoveHover = (move) => {
        if (this.props.highlightArrow && move.move) {
            this.props.highlightArrow({
                orig: move.move.from,
                dest: move.move.to,
                san: move.move.san
            });
        }
    }

    handleMoveLeave = () => {
        if (this.props.highlightArrow) {
            this.props.highlightArrow(null);
        }
    }

    renderEvalBar() {
        const { evaluation } = this.state;
        const percent = evaluation ? evaluation.barPercent : 50;
        
        return (
            <div className="eval-bar-container">
                <div className="eval-bar">
                    <div 
                        className="eval-bar-white" 
                        style={{ height: `${percent}%` }}
                    />
                    <div 
                        className="eval-bar-black" 
                        style={{ height: `${100 - percent}%` }}
                    />
                </div>
                <div className="eval-score">
                    {evaluation ? evaluation.formatted : '0.00'}
                </div>
            </div>
        );
    }

    renderTopMoves() {
        const { topMoves } = this.state;
        
        if (topMoves.length === 0) {
            return (
                <div className="no-analysis">
                    {this.state.isAnalyzing ? 'Analyzing...' : 'Click play to start analysis'}
                </div>
            );
        }

        return (
            <div className="top-moves-list">
                {topMoves.map((move, index) => (
                    <div 
                        key={index}
                        className={`top-move-item ${index === 0 ? 'best-move' : ''}`}
                        onClick={() => this.handleMoveClick(move)}
                        onMouseEnter={() => this.handleMoveHover(move)}
                        onMouseLeave={() => this.handleMoveLeave()}
                    >
                        <span className="move-rank">{move.rank}</span>
                        <span className="move-san">{move.move ? move.move.san : move.pv[0]}</span>
                        <span className={`move-score ${this.getScoreClass(move)}`}>
                            {move.formattedScore}
                        </span>
                        <span className="move-depth">d{move.depth}</span>
                    </div>
                ))}
            </div>
        );
    }

    getScoreClass(move) {
        if (move.scoreType === 'mate') {
            return move.score > 0 ? 'score-winning' : 'score-losing';
        }
        const score = move.score;
        if (score > 100) return 'score-winning';
        if (score < -100) return 'score-losing';
        return 'score-equal';
    }

    renderSettings() {
        if (!this.state.showSettings) return null;

        return (
            <Paper className="analysis-settings" elevation={2}>
                <Typography variant="subtitle2" gutterBottom>
                    Analysis Settings
                </Typography>
                <div className="setting-item">
                    <Typography variant="body2">Lines: {this.state.multiPV}</Typography>
                    <Slider
                        value={this.state.multiPV}
                        onChange={this.handleMultiPVChange}
                        min={1}
                        max={5}
                        step={1}
                        marks
                        valueLabelDisplay="auto"
                    />
                </div>
            </Paper>
        );
    }

    render() {
        const { isEngineReady, isAnalyzing, depth, error } = this.state;

        if (error) {
            return (
                <div className="stockfish-analysis error">
                    <Typography color="error">{error}</Typography>
                </div>
            );
        }

        return (
            <div className="stockfish-analysis">
                <div className="analysis-header">
                    <div className="analysis-title">
                        <Typography variant="h6">Stockfish 17</Typography>
                        {isAnalyzing && (
                            <Typography variant="caption" className="depth-indicator">
                                Depth: {depth}
                            </Typography>
                        )}
                    </div>
                    <div className="analysis-controls">
                        <Tooltip title={isAnalyzing ? "Stop" : "Analyze"}>
                            <span>
                                <IconButton 
                                    onClick={this.toggleAnalysis}
                                    disabled={!isEngineReady}
                                    color={isAnalyzing ? "secondary" : "primary"}
                                    size="small"
                                >
                                    {isAnalyzing ? <Stop /> : <PlayArrow />}
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Settings">
                            <IconButton 
                                onClick={this.toggleSettings}
                                size="small"
                            >
                                <Settings />
                            </IconButton>
                        </Tooltip>
                    </div>
                </div>

                {this.renderSettings()}

                <div className="analysis-content">
                    {this.renderEvalBar()}
                    <div className="analysis-moves">
                        {this.renderTopMoves()}
                    </div>
                </div>

                {!isEngineReady && (
                    <div className="loading-engine">
                        <Typography variant="body2">Loading Stockfish...</Typography>
                        <LinearProgress />
                    </div>
                )}
            </div>
        );
    }
}
