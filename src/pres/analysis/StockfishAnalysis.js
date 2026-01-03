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
    Paper,
    Snackbar
} from '@material-ui/core';
import { PlayArrow, Stop, Settings, Refresh } from '@material-ui/icons';
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
            error: null,
            engineState: 'uninitialized',
            showError: false,
            errorMessage: ''
        };
        this.engine = null;
        this.analysisResults = new Map(); // Store results by multipv
        this.lastFen = null; // Track last analyzed FEN
        this.mounted = false;
        
        // Bind methods
        this.startAnalysis = this.startAnalysis.bind(this);
        this.stopAnalysis = this.stopAnalysis.bind(this);
        this.toggleAnalysis = this.toggleAnalysis.bind(this);
        this.handleAnalysisUpdate = this.handleAnalysisUpdate.bind(this);
        this.handleDepthChange = this.handleDepthChange.bind(this);
        this.handleMultiPVChange = this.handleMultiPVChange.bind(this);
        this.toggleSettings = this.toggleSettings.bind(this);
        this.handleMoveClick = this.handleMoveClick.bind(this);
        this.handleMoveHover = this.handleMoveHover.bind(this);
        this.handleMoveLeave = this.handleMoveLeave.bind(this);
        this.handleCloseError = this.handleCloseError.bind(this);
        this.retryInit = this.retryInit.bind(this);
    }

    componentDidMount() {
        this.mounted = true;
        this.initEngine();
    }

    componentDidUpdate(prevProps) {
        // Re-analyze when FEN changes and we're analyzing
        if (prevProps.fen !== this.props.fen && this.state.isAnalyzing) {
            // Clear previous results when position changes
            this.analysisResults.clear();
            this.setState({ 
                topMoves: [],
                depth: 0 
            });
            this.startAnalysis();
        }
    }

    componentWillUnmount() {
        this.mounted = false;
        if (this.engine) {
            this.engine.stop();
        }
    }

    safeSetState(state, callback) {
        if (this.mounted) {
            this.setState(state, callback);
        }
    }

    async initEngine() {
        try {
            this.engine = getStockfishEngine();
            await this.engine.init();
            if (this.mounted) {
                this.setState({ 
                    isEngineReady: true,
                    engineState: this.engine.getState()
                });
            }
        } catch (error) {
            console.error('Failed to initialize Stockfish:', error);
            if (this.mounted) {
                this.setState({ 
                    error: 'Failed to load Stockfish engine. Click refresh to retry.',
                    showError: true,
                    errorMessage: 'Engine initialization failed'
                });
            }
        }
    }

    async retryInit() {
        this.setState({ 
            error: null, 
            isEngineReady: false,
            showError: false 
        });
        await this.initEngine();
    }

    startAnalysis() {
        if (!this.engine || !this.state.isEngineReady) {
            this.setState({
                showError: true,
                errorMessage: 'Engine not ready. Please wait or refresh.'
            });
            return;
        }

        // Check if engine is in a valid state
        const engineState = this.engine.getState();
        if (engineState === 'error') {
            this.setState({
                showError: true,
                errorMessage: 'Engine error. Attempting recovery...'
            });
            this.retryInit();
            return;
        }

        this.lastFen = this.props.fen;
        this.analysisResults.clear();
        this.safeSetState({ 
            isAnalyzing: true, 
            topMoves: [],
            evaluation: null,
            depth: 0,
            engineState: 'analyzing'
        });

        this.engine.setMultiPV(this.state.multiPV);
        this.engine.analyzeInfinite(this.props.fen, this.handleAnalysisUpdate);
    }

    stopAnalysis() {
        if (this.engine) {
            this.engine.stop();
        }
        this.safeSetState({ 
            isAnalyzing: false,
            engineState: this.engine ? this.engine.getState() : 'ready'
        });
    }

    toggleAnalysis() {
        if (this.state.isAnalyzing) {
            this.stopAnalysis();
        } else {
            this.startAnalysis();
        }
    }

    handleAnalysisUpdate(result) {
        // Ignore results if component is unmounted or FEN has changed
        if (!this.mounted || this.props.fen !== this.lastFen) {
            return;
        }

        // Store result by multipv index
        this.analysisResults.set(result.multipv, result);

        // Get current turn from FEN
        let chess;
        try {
            chess = chessLogic(this.props.variant, this.props.fen);
        } catch (e) {
            console.error('Error creating chess instance:', e);
            return;
        }
        
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

        this.safeSetState({
            topMoves: topMoves,
            evaluation: evaluation,
            depth: bestResult ? bestResult.depth : 0,
            engineState: this.engine ? this.engine.getState() : 'unknown'
        });

        // Notify parent about top moves for arrow display
        if (this.props.onAnalysisUpdate) {
            this.props.onAnalysisUpdate(topMoves);
        }
    }

    handleDepthChange(event, newValue) {
        this.setState({ analysisDepth: newValue });
        if (this.engine) {
            this.engine.setDepth(newValue);
        }
    }

    handleMultiPVChange(event, newValue) {
        this.setState({ multiPV: newValue }, () => {
            if (this.state.isAnalyzing) {
                // Clear results and restart analysis with new multiPV
                this.analysisResults.clear();
                this.startAnalysis();
            }
        });
    }

    toggleSettings() {
        this.setState({ showSettings: !this.state.showSettings });
    }

    handleMoveClick(move) {
        if (this.props.onMove && move.move) {
            this.props.onMove(move.move.from, move.move.to);
        }
    }

    handleMoveHover(move) {
        if (this.props.highlightArrow && move.move) {
            this.props.highlightArrow({
                orig: move.move.from,
                dest: move.move.to,
                san: move.move.san
            });
        }
    }

    handleMoveLeave() {
        if (this.props.highlightArrow) {
            this.props.highlightArrow(null);
        }
    }

    handleCloseError() {
        this.setState({ showError: false });
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
        const { topMoves, isAnalyzing, depth } = this.state;
        
        if (topMoves.length === 0) {
            return (
                <div className="no-analysis">
                    {isAnalyzing ? (
                        depth === 0 ? 'Starting analysis...' : 'Analyzing...'
                    ) : (
                        'Click play to start analysis'
                    )}
                </div>
            );
        }

        return (
            <div className="top-moves-list">
                {topMoves.map((move, index) => (
                    <div 
                        key={`${move.rank}-${move.pv[0]}`}
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
        const { isEngineReady, isAnalyzing, depth, error, showError, errorMessage } = this.state;

        if (error) {
            return (
                <div className="stockfish-analysis error">
                    <Typography color="error">{error}</Typography>
                    <Tooltip title="Retry initialization">
                        <IconButton 
                            onClick={this.retryInit}
                            color="primary"
                            size="small"
                        >
                            <Refresh />
                        </IconButton>
                    </Tooltip>
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

                <Snackbar
                    open={showError}
                    autoHideDuration={4000}
                    onClose={this.handleCloseError}
                    message={errorMessage}
                />
            </div>
        );
    }
}
