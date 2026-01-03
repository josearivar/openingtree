# OpeningTree with Stockfish Analysis

This is a fork of [OpeningTree](https://github.com/openingtree/openingtree) with integrated **Stockfish 17** chess engine analysis.

## New Features

- **Real-time Stockfish 17 Analysis** - NNUE-powered evaluation running in your browser
- **Evaluation Bar** - Visual display of position balance
- **Top 3 Best Moves** - See the engine's recommended moves with scores
- **Move Arrows** - Colored arrows on the board showing suggested moves
- **Click to Play** - Click any suggested move to play it on the board
- **Configurable Lines** - Adjust the number of analysis lines (1-5)

## Screenshot

The Analysis tab shows real-time engine evaluation with best moves displayed on the board.

## Original Project

This project is based on [OpeningTree](https://github.com/openingtree/openingtree) - Code for [openingtree.com](https://www.openingtree.com). It downloads chess games in form of a PGN from any source, applies specified filters and constructs an opening tree. The tree is visualized on a chessboard. It also shows win percentages and other statistics with different moves.

### Architecture diagram
This does not correlate one to one with the code modules but the interactions at a high level are depicted accurately.

![Architecture Diagram](/docs/images/architecture.png)

## Run locally
```
yarn
yarn start
```
Starts a server on port `3000`

Note: You may need to set `NODE_OPTIONS=--openssl-legacy-provider` for older Node.js compatibility.

## Build for production
```
yarn build
```

## Deploy to GitHub Pages
```
yarn deploy
```

## License

This project is licensed under the **GNU General Public License v3.0** (GPL-3.0), the same license as the original OpeningTree project.

- Original project: [openingtree/openingtree](https://github.com/openingtree/openingtree)
- Original authors: See [Contributors](https://github.com/openingtree/openingtree/graphs/contributors)

See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpeningTree](https://github.com/openingtree/openingtree) - The original project this fork is based on
- [Stockfish](https://stockfishchess.org/) - The powerful open-source chess engine
- [stockfish.js](https://github.com/nicfab/stockfish.js) - WebAssembly port of Stockfish for browsers
