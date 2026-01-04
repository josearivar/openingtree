# Attribution and Licensing

This project is a fork of [OpeningTree](https://github.com/openingtree/openingtree) with added Stockfish engine integration.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**, the same license as the original OpeningTree project.

## Third-Party Components

### OpeningTree
- **Source:** https://github.com/openingtree/openingtree
- **License:** GPL-3.0
- **Description:** The base chess opening explorer application

### Lichess
- **Source:** https://github.com/lichess-org/lila
- **License:** AGPL-3.0
- **Description:** The evaluation bar design and winning chances algorithm were inspired by Lichess's computer evaluation (ceval) module. The implementation was rewritten for this project.

### Stockfish.js
- **Source:** https://github.com/nmrugg/stockfish.js
- **License:** GPL-3.0
- **Description:** WebAssembly port of the Stockfish chess engine (version 17.1) used for in-browser analysis

### Stockfish
- **Source:** https://github.com/official-stockfish/Stockfish
- **License:** GPL-3.0
- **Description:** The original Stockfish chess engine

## Stockfish Integration Features

The following features were added in this fork:

1. **Evaluation Bar** - A vertical bar showing the current position's evaluation, positioned next to the chessboard (similar to Lichess)
2. **Top Move Suggestions** - Display of the top 3 (configurable) best moves with their evaluations in algebraic notation
3. **Interactive Analysis** - Click on suggested moves to play them, hover to highlight on the board
4. **Board Flip Support** - Evaluation bar correctly flips with board orientation

## Authors

- Original OpeningTree: [OpeningTree Contributors](https://github.com/openingtree/openingtree/graphs/contributors)
- Stockfish Integration: Added via Manus AI assistance
