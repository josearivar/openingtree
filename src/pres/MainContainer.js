import React from 'react'
import Chessground from 'react-chessground'
import 'react-chessground/dist/styles/chessground.css'
import { OAuth2AuthCodePKCE } from '@bity/oauth2-auth-code-pkce';

import {
  Button,
  Col,
  Collapse,
  Container,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row
} from 'reactstrap'

import {
  Checkbox,
  FormControlLabel,
  Snackbar,
  TextField
} from '@material-ui/core'

import * as Constants from '../app/Constants'
import OpeningGraph from '../app/OpeningGraph'
import { chessLogic } from '../app/chess/ChessLogic'
import cookieManager from '../app/CookieManager'
import { handleDarkMode } from '../pres/DarkMode';
import UserProfile, { USER_PROFILE_NEW_USER } from '../app/UserProfile'
import {initializeAnalytics} from '../app/Analytics'

import Navigator from './Navigator'
import GlobalHeader from './GlobalHeader'
import ControlsContainer from './ControlsContainer'
import { addStateManagement } from './StateManagement'
import SnackbarContentWrapper from './SnackbarContentWrapper'

// Import Stockfish components
import { EngineAnalysis, EvalBar, PvLines } from './stockfish'

export default class MainContainer extends React.Component {

  constructor(props){
    super(props)
  
    let urlVariant = new URLSearchParams(window.location.search).get("variant")
    let selectedVariant = urlVariant || Constants.VARIANT_STANDARD
    this.chess = chessLogic(selectedVariant)
    addStateManagement(this)
    this.state = {
        resize:0,
        fen: this.chess.fen(),
        lastMove: null,
        gamesProcessed:0,
        openingGraph:new OpeningGraph(selectedVariant),
        settings:{
          playerName:'',
          orientation:Constants.PLAYER_COLOR_WHITE,
          playerColor:'',
          movesSettings:this.getMovesSettingsFromCookie(),
          darkMode: this.getDarkModeSettingFromCookie()
        },
        message:'',
        downloadingGames:false,
        feedbackOpen:false,
        diagnosticsDataOpen:false,
        variant:selectedVariant,
        update:0,//increase count to force update the component
        highlightedMove:null,
        engineHighlightedMove: null, // For engine move highlighting
        engineEnabled: false,
        engineEvaluation: null,
        engineDepth: 0,
        engineAnalyzing: false,
        enginePvLines: [],
        engineFen: null
      }
    this.chessboardWidth = this.getChessboardWidth()

    this.initializeOauth()

    this.forBrushes = ['blue','paleGrey', 'paleGreen', 'green']
    this.againstBrushes = ['blue','paleRed', 'paleRed', 'red']
    this.engineBrush = 'yellow' // Brush for engine suggested moves
    window.addEventListener('resize', this.handleResize.bind(this))
    let userProfile = UserProfile.getUserProfile()
    initializeAnalytics(userProfile.userTypeDesc, this.state.settings.darkMode?"dark":"light", 
      this.state.settings.movesSettings.openingBookType)

  }

  initializeOauth() {
    let clientUrl = (() => {
      const url = new URL(window.location.href);
      url.search = '';
      return `${url.href}?source=lichess`;
    })();
    this.oauth = new OAuth2AuthCodePKCE({
      authorizationUrl: `${Constants.LICHESS_HOST}/oauth`,
      tokenUrl: `${Constants.LICHESS_HOST}/api/token`,
      clientId: Constants.LICHESS_CLIENT_ID,
      scopes: [],
      redirectUrl: clientUrl,
      onAccessTokenExpiry: refreshAccessToken => refreshAccessToken(),
      onInvalidGrant: _retry => {},
    })

    this.oauth.isReturningFromAuthServer().then( (hasAuthCode) => {
      if (hasAuthCode) {
        return this.oauth.getAccessToken()
      }
      return ""
    }).then( (accessToken)=> {
      if(!accessToken) {
        return
      }
      cookieManager.setLichessAccessToken(accessToken.token.value)
      console.log("access token", accessToken)
      window.location.replace(clientUrl)      
    }).catch((error) => {
      console.log("error", error)
    })
      
    

  }
  handleResize() {
    this.setState({resize:this.state.resize+1})
    this.chessboardWidth = this.getChessboardWidth()
  }

  getMovesSettingsFromCookie() {
    let { movesSettings } = cookieManager.getSettingsCookie() || {};

    if (!movesSettings || !movesSettings.openingBookType) {
      // default settings
      movesSettings = {
          openingBookType:Constants.OPENING_BOOK_TYPE_LICHESS,
          openingBookRating:Constants.ALL_BOOK_RATINGS,
          openingBookTimeControls: [
            Constants.TIME_CONTROL_BULLET,
            Constants.TIME_CONTROL_BLITZ,
            Constants.TIME_CONTROL_RAPID,
            Constants.TIME_CONTROL_CLASSICAL,
            Constants.TIME_CONTROL_CORRESPONDENCE,
          ],
          openingBookScoreIndicator:false,
          openingBookWinsIndicator:UserProfile.getUserProfile().userType>USER_PROFILE_NEW_USER
        }
    }
    return movesSettings;
  }

  getDarkModeSettingFromCookie () {
    const darkModeCookie = cookieManager.getDarkModeCookie();
    if(darkModeCookie === undefined){
      return true// default value
    }
    return darkModeCookie === 'true';
  }

  // Handle engine move highlighting
  handleEngineHighlight = (move) => {
    this.setState({ engineHighlightedMove: move })
  }

  // Handle engine move click - play the move
  handleEngineMove = (move) => {
    if (move && move.from && move.to) {
      this.onMove(move.from, move.to)
    }
  }

  // Handle engine state updates
  handleEngineStateChange = (state) => {
    this.setState({
      engineEnabled: state.enabled,
      engineEvaluation: state.evaluation,
      engineDepth: state.depth,
      engineAnalyzing: state.analyzing,
      enginePvLines: state.pvLines || [],
      engineFen: state.fen || this.state.fen
    })
  }

  // Handle PV line move click
  handlePvMoveClick = (moves) => {
    if (moves && moves.length > 0) {
      const move = moves[0];
      this.onMove(move.substring(0, 2), move.substring(2, 4));
    }
  }

  // Handle PV line move hover
  handlePvMoveHover = (uci) => {
    if (uci) {
      this.setState({
        engineHighlightedMove: {
          from: uci.substring(0, 2),
          to: uci.substring(2, 4)
        }
      });
    } else {
      this.setState({ engineHighlightedMove: null });
    }
  }

  // Get auto shapes including engine highlighted move
  getAutoShapesWithEngine(playerMoves, highlightedMove, engineHighlightedMove) {
    let shapes = this.autoShapes(playerMoves, highlightedMove)
    
    // Add engine highlighted move if present
    if (engineHighlightedMove && engineHighlightedMove.from && engineHighlightedMove.to) {
      shapes = shapes.filter(shape => 
        !(shape.orig === engineHighlightedMove.from && shape.dest === engineHighlightedMove.to)
      )
      shapes.unshift({
        orig: engineHighlightedMove.from,
        dest: engineHighlightedMove.to,
        brush: this.engineBrush
      })
    }
    
    return shapes
  }

  render() {
    let lastMoveArray = this.state.lastMove ? [this.state.lastMove.from, this.state.lastMove.to] : null
    let snackBarOpen = Boolean(this.state.message)

    let playerMoves = this.getPlayerMoves()
    let bookMoves = this.getBookMoves()
    this.mergePlayerAndBookMoves(playerMoves, bookMoves)

    // Get board height as number for eval bar
    const boardHeightNum = parseInt(this.chessboardWidth, 10) || 400

    return <div className="rootView">
      <GlobalHeader settings={this.state.settings} 
                    settingsChange={this.settingsChange.bind(this)}
                    toggleFeedback = {this.toggleFeedback(false)}/>
      <Container className="mainContainer">
        <Row>
          <Col lg={{order:0, size:2}} xs={{order:2}}>
            <Navigator fen = {this.state.fen} move={this.state.lastMove}
              onChange ={this.navigateTo.bind(this)}
              variant = {this.state.variant} />
          </Col>
          <Col lg="6">
            {/* Engine Analysis Controls (toggle, multiPV, depth) */}
            <EngineAnalysis
              fen={this.state.fen}
              orientation={this.orientation()}
              turnColor={this.turnColor()}
              onMove={this.handleEngineMove}
              onHighlightMove={this.handleEngineHighlight}
              onStateChange={this.handleEngineStateChange}
              chess={this.chess}
              boardHeight={boardHeightNum}
              showPvLines={false}
            />
            
            {/* Board with Eval Bar - Lichess style layout */}
            <div className="board-eval-wrapper" style={{ 
              display: 'flex', 
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: '4px'
            }}>
              {/* Evaluation Bar - positioned to the left of the board */}
              {this.state.engineEnabled && (
                <EvalBar
                  score={this.state.engineEvaluation}
                  orientation={this.orientation()}
                  depth={this.state.engineDepth}
                  isAnalyzing={this.state.engineAnalyzing}
                  height={boardHeightNum}
                />
              )}
              
              {/* Chessboard */}
              <div className="chessboard-container">
                <Chessground key={this.state.resize}
                  height={this.chessboardWidth}
                  width={this.chessboardWidth}
                  orientation={this.orientation()}
                  turnColor={this.turnColor()}
                  movable={this.calcMovable()}
                  lastMove={lastMoveArray}
                  fen={this.state.fen}
                  onMove={this.onMoveAction.bind(this)}
                  drawable ={{
                    enabled: true,
                    visible: true,
                    autoShapes: this.getAutoShapesWithEngine(
                      playerMoves, 
                      this.state.highlightedMove,
                      this.state.engineHighlightedMove
                    )
                  }}
                />
              </div>
            </div>
            
            {/* PV Lines - below the board */}
            {this.state.engineEnabled && (
              <div className="engine-pv-below-board" style={{ marginTop: '8px' }}>
                <PvLines
                  pvLines={this.state.enginePvLines}
                  turnColor={this.turnColor()}
                  depth={this.state.engineDepth}
                  isAnalyzing={this.state.engineAnalyzing}
                  onMoveClick={this.handlePvMoveClick}
                  onMoveHover={this.handlePvMoveHover}
                  fen={this.state.engineFen || this.state.fen}
                  highlightedMove={this.state.engineHighlightedMove ? 
                    this.state.engineHighlightedMove.from + this.state.engineHighlightedMove.to : null}
                />
              </div>
            )}
          </Col>
          <Col lg="4" className="paddingTop">
            <ControlsContainer fen={this.state.fen}
              resize ={this.state.resize}
              gamesProcessed={this.state.gamesProcessed}
              updateProcessedGames={this.updateProcessedGames.bind(this)}
              settingsChange={this.settingsChange.bind(this)}
              settings={this.state.settings}
              reset={this.reset.bind(this)}
              clear={this.clear.bind(this)}
              playerMoves={playerMoves}
              bookMoves={bookMoves}
              gameResults={this.gameResults()}
              onMove={this.onMove.bind(this)}
              turnColor={this.turnColor()}
              showError={this.showError.bind(this)}
              showInfo={this.showInfo.bind(this)}
              setDownloading={this.setDownloading.bind(this)}
              isDownloading={this.state.downloadingGames}
              openingGraph={this.state.openingGraph}
              importCallback={this.importGameState.bind(this)}
              variant={this.state.variant}
              variantChange={this.variantChange.bind(this)}
              forceFetchBookMoves={this.forceFetchBookMoves.bind(this)}
              highlightArrow={this.highlightArrow.bind(this)}
              oauthManager={this.oauth}
            />
          </Col>
        </Row>
      </Container>
      <Snackbar anchorOrigin={{ vertical:'bottom', horizontal:"left" }}
        open={snackBarOpen} autoHideDuration={6000}
        onClose={this.closeError.bind(this)}
      >
        <SnackbarContentWrapper
          onClose={this.closeError.bind(this)}
          variant={this.state.messageSeverity}
          message={this.state.message}
          subMessage={this.state.subMessage}
          showReportButton={this.state.messageSeverity==='error'}
          action={this.state.errorAction}
          actionText={this.state.errorActionText}
        />
      </Snackbar>

      <Modal isOpen={this.state.feedbackOpen} toggle={this.toggleFeedback(false)}>
        <ModalHeader toggle={this.toggleFeedback(false)}>
          Feedback
        </ModalHeader>
        <ModalBody>
          Your feedback is greatly appreciated. Reach out to me for feedback, suggestions, bug report or just a game of chess.
          <ul>
            <li>Email me: <a rel="noopener noreferrer" href={this.getEmailLink()} target="_blank">{Constants.OPENING_TREE_EMAIL}</a></li>
            <li>Message me on reddit <a rel="noopener noreferrer" href={this.getRedditLink()} target="_blank">u/{Constants.OPENING_TREE_REDDIT}</a></li>
            <li>Message me on lichess: <a rel="noopener noreferrer" href={`https://lichess.org/inbox/${Constants.OPENING_TREE_LICHESS}`} target="_blank">{Constants.OPENING_TREE_LICHESS}</a></li>
            <li>Message me on chess.com: <a rel="noopener noreferrer" href={`https://www.chess.com/messages/compose/${Constants.OPENING_TREE_CHESS_COM}`} target="_blank">{Constants.OPENING_TREE_CHESS_COM}</a></li>
            <li>Join my <a rel="noopener noreferrer" href={Constants.OPENING_TREE_DISCORD}target="_blank">discord server</a> to chat</li>
          </ul>
          <FormControlLabel
            control={
              <Checkbox
                checked={this.state.diagnosticsDataOpen}
                onChange={this.toggleDiagnosticsData}
                name="diagnostics"
                color="primary"
              />}
            label="Add diagnostics data to message"
          />
          <Collapse isOpen={this.state.diagnosticsDataOpen}>
            <TextField id="diagnosticsText" label="Click to copy." variant="outlined"
            className="fullWidth" value={this.getDiagnosticsValue()}
            rowsMax={4} onClick={this.copyDiagnostics} multiline />
          </Collapse>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={this.toggleFeedback(false)}>Done</Button>
        </ModalFooter>
      </Modal>
    </div>
  }

  componentDidMount() {
      handleDarkMode(this.state.settings.darkMode);
      
      // hack to fix https://github.com/openingtree/openingtree/issues/243
      // refreshing the chessboard after its initial render seems to fix this issue
      setImmediate(this.handleResize.bind(this))
  }
}
